/**
 * Proactive vendor notifications when a platform payment gateway flips
 * from working to failing.
 *
 * When `recheckPlatformCredentials` detects a pass → fail transition for a
 * provider, this module finds every vendor who (a) has that provider enabled
 * and (b) has no other working gateway they can fall back to, then sends each
 * of them an in-app notification and an email.
 *
 * Uses `getPaymentMethodAvailability` (from vendor-keys.ts) for the "will
 * this actually work at checkout?" check — the same function used by the shop
 * link and the vendor Payment Settings page.
 */

import { db, vendorNotificationsTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Vendor } from "@workspace/db/schema";
import { GATEWAY_DEFS, type GatewayProvider } from "./platform-gateways";
import { getPaymentMethodAvailability } from "./vendor-keys";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { sendPushToVendor } from "./push";

/**
 * Maps each gateway provider to the vendorsTable column that records whether
 * the vendor has enabled it for their shop. PayPal is absent because it has no
 * vendor-level enable toggle — it's only used for platform subscription billing.
 */
const PROVIDER_ENABLED_COL: Partial<Record<GatewayProvider, keyof Vendor>> = {
  stripe: "stripeEnabled",
  paystack: "paystackEnabled",
  remita: "remitaEnabled",
  flutterwave: "flutterwaveEnabled",
  nomba: "nombaEnabled",
};

/** All providers that have a vendor-level enable toggle (i.e. appear in PROVIDER_ENABLED_COL). */
const TOGGLEABLE_PROVIDERS = Object.keys(PROVIDER_ENABLED_COL) as GatewayProvider[];

/**
 * Returns the subset of toggleable providers (other than `failingProvider`)
 * that the given vendor currently has enabled.
 */
function otherEnabledProviders(vendor: Vendor, failingProvider: GatewayProvider): GatewayProvider[] {
  return TOGGLEABLE_PROVIDERS.filter((p) => {
    if (p === failingProvider) return false;
    const col = PROVIDER_ENABLED_COL[p];
    if (!col) return false;
    return vendor[col] === true;
  });
}

/**
 * Sends the vendor an in-app notification and (if email is reachable) an email
 * telling them the specified gateway is no longer working.
 */
async function notifyVendor(vendor: Vendor, provider: GatewayProvider, failureReason: string | null): Promise<void> {
  const label = GATEWAY_DEFS[provider].label;
  const message =
    `Your ${label} payment gateway has stopped working` +
    (failureReason ? ` (${failureReason})` : "") +
    `. Customers cannot currently complete payments through ${label} on your shop. ` +
    `Please contact the platform administrator to resolve this.`;

  await db.insert(vendorNotificationsTable).values({
    vendorId: vendor.id,
    type: "payment_gateway_failure",
    message,
  });

  await sendPushToVendor(
    vendor.id,
    `${label} payments are down`,
    `Your ${label} gateway stopped working. Customers may be unable to pay.`,
    { provider },
    "payments",
  );

  const html = wrapVendorEmail({
    bodyHtml: `
      <h1 style="text-align: center; font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">
        ${escapeHtml(label)} payment gateway is down
      </h1>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        Hi ${escapeHtml(vendor.name)}, we detected that the <strong>${escapeHtml(label)}</strong>
        payment gateway on your shop has stopped working${failureReason ? ` — <em>${escapeHtml(failureReason)}</em>` : ""}.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        This is the only active payment method on your shop, so customers are currently
        <strong>unable to complete purchases</strong>. No action is needed on your end —
        this is a platform-level configuration issue that our team will need to fix.
        We'll notify you as soon as it's resolved.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        If you have questions, please reach out to platform support.
      </p>`,
  });

  const result = await sendEmail({
    to: vendor.email,
    subject: `Action needed: ${label} payments are down on your shop`,
    html,
  });

  if (result.status !== "sent") {
    console.warn(
      `[gateway-notifications] email to vendor ${vendor.id} (${vendor.email}) did not send — reason=${result.error}`,
    );
  }
}

/**
 * Called by `recheckPlatformCredentials` immediately after a pass → fail
 * transition is detected.
 *
 * Queries every vendor who has `provider` enabled, then filters to those
 * with no other working gateway (using `getPaymentMethodAvailability`, which
 * mirrors real checkout credential resolution). Notifies each affected vendor
 * in-app and by email.
 *
 * Returns the number of vendors notified.
 */
export async function notifyVendorsOfGatewayFailure(
  provider: GatewayProvider,
  failureReason: string | null,
): Promise<number> {
  const enabledCol = PROVIDER_ENABLED_COL[provider];
  if (!enabledCol) {
    // Provider has no per-vendor toggle (e.g. paypal) — nothing to do.
    return 0;
  }

  // All vendors who have this provider switched on.
  const vendors = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable[enabledCol] as Parameters<typeof eq>[0], true));

  let notified = 0;
  for (const vendor of vendors) {
    // Step 1: Is this provider actually unavailable for this specific vendor?
    // For Stripe/Paystack, a vendor may have their own test-passed key (or an
    // env fallback) that is still working even though the platform credential
    // just failed. If checkout still works for them, do not notify.
    const failingAvail = await getPaymentMethodAvailability(provider, vendor.id, vendor);
    if (failingAvail.available) {
      // Vendor's own key or env fallback keeps them working — no action needed.
      continue;
    }

    // Step 2: Do they have any other working gateway to fall back to?
    const others = otherEnabledProviders(vendor, provider);
    let hasWorkingAlternative = false;
    for (const other of others) {
      const avail = await getPaymentMethodAvailability(other, vendor.id, vendor);
      if (avail.available) {
        hasWorkingAlternative = true;
        break;
      }
    }

    // Only notify if the failing provider is truly down for this vendor AND
    // they have no other gateway that can accept payments.
    if (!hasWorkingAlternative) {
      try {
        await notifyVendor(vendor, provider, failureReason);
        notified++;
      } catch (err) {
        console.error(
          `[gateway-notifications] failed to notify vendor ${vendor.id} about ${provider} failure:`,
          err,
        );
      }
    }
  }

  if (notified > 0) {
    console.log(
      `[gateway-notifications] notified ${notified} vendor(s) that ${provider} is their only gateway and it just stopped working.`,
    );
  }

  return notified;
}
