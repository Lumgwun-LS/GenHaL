/**
 * Resolves which Stripe / Paystack key to use for a given vendor.
 *
 * Priority:
 *   1. Vendor's own key (if stored, test-passed, and tier allows it)
 *   2. Platform key configured by an admin via the dashboard (DB)
 *   3. Platform key from env (legacy / dev fallback)
 *   4. Throws if none is available
 */
import { db } from "@workspace/db";
import { vendorPaymentCredentialsTable, platformPaymentCredentialsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "./encryption";
import { getPlatformCredentials, GATEWAY_DEFS, type GatewayProvider } from "./platform-gateways";

export interface TierCheckable {
  subscriptionTier: string;
  verificationLevel: string;
}

/** Returns true if the vendor's tier/level unlocks own-key payment routing. */
export function canAddPaymentKeys(vendor: TierCheckable): boolean {
  return (
    ["pro", "enterprise"].includes(vendor.subscriptionTier) ||
    ["verified", "premium"].includes(vendor.verificationLevel)
  );
}

export interface PaymentMethodAvailability {
  provider: GatewayProvider;
  available: boolean;
  /** Human-readable explanation of why it won't work right now; null when available. */
  reason: string | null;
}

/**
 * Determines whether a gateway a vendor has *enabled* will actually succeed
 * at checkout time — not just whether the toggle is on. Mirrors the exact
 * credential-resolution order used by resolveStripeKey/resolvePaystackKey
 * and the remita/flutterwave/nomba checkout handlers (vendor's own
 * test-passed key first, then platform-admin credentials, then the legacy
 * env-var fallback for stripe/paystack), so a "available" result here can
 * never turn into a 503 at checkout.
 */
export async function getPaymentMethodAvailability(
  provider: GatewayProvider,
  vendorId: number,
  vendor: TierCheckable,
): Promise<PaymentMethodAvailability> {
  const label = GATEWAY_DEFS[provider].label;

  if ((provider === "stripe" || provider === "paystack") && canAddPaymentKeys(vendor)) {
    const [creds] = await db
      .select()
      .from(vendorPaymentCredentialsTable)
      .where(eq(vendorPaymentCredentialsTable.vendorId, vendorId))
      .limit(1);
    const hasOwnKey = provider === "stripe" ? creds?.stripeSecretEncrypted : creds?.paystackSecretEncrypted;
    const ownTestPassed = provider === "stripe" ? creds?.stripeTestPassed : creds?.paystackTestPassed;
    if (hasOwnKey && ownTestPassed) return { provider, available: true, reason: null };
  }

  const [platformRow] = await db
    .select()
    .from(platformPaymentCredentialsTable)
    .where(eq(platformPaymentCredentialsTable.provider, provider))
    .limit(1);

  if (platformRow?.testPassed) return { provider, available: true, reason: null };

  if (platformRow) {
    return {
      provider,
      available: false,
      reason: platformRow.lastFailureReason
        ? `${label} credentials on the platform are currently failing: ${platformRow.lastFailureReason}`
        : `${label} credentials on file haven't passed verification yet.`,
    };
  }

  // Legacy env-var fallback (dev only) — there's no test result recorded for
  // it, so its mere presence is the best signal we have.
  if (provider === "stripe" || provider === "paystack") {
    const envKey = provider === "stripe" ? process.env.STRIPE_SECRET_KEY : process.env.PAYSTACK_SECRET_KEY;
    if (envKey) return { provider, available: true, reason: null };
  }

  if (provider === "paypal") {
    if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
      return { provider, available: true, reason: null };
    }
  }

  return { provider, available: false, reason: `${label} isn't configured on the platform yet.` };
}

/** Returns the Stripe secret key to use for a vendor, or throws if none available. */
export async function resolveStripeKey(
  vendorId: number,
  vendor: TierCheckable,
): Promise<string> {
  if (canAddPaymentKeys(vendor)) {
    const [creds] = await db
      .select()
      .from(vendorPaymentCredentialsTable)
      .where(eq(vendorPaymentCredentialsTable.vendorId, vendorId))
      .limit(1);

    if (creds?.stripeSecretEncrypted && creds.stripeTestPassed) {
      return decrypt(creds.stripeSecretEncrypted);
    }
  }

  const adminCreds = await getPlatformCredentials("stripe");
  if (adminCreds?.secretKey) return adminCreds.secretKey;

  const platformKey = process.env.STRIPE_SECRET_KEY;
  if (!platformKey) throw new Error("Stripe is not configured. Add a platform Stripe key in Admin \u2192 Payment Gateways.");
  return platformKey;
}

/** Returns the Squad secret key (platform-level only — no per-vendor key routing yet). */
export async function resolveSquadKey(): Promise<string> {
  const adminCreds = await getPlatformCredentials("squad" as GatewayProvider);
  if (adminCreds?.secretKey) return adminCreds.secretKey;
  const envKey = process.env.SQUAD_SECRET_KEY;
  if (!envKey) throw Object.assign(new Error("Squad is not configured. Add a Squad key in Admin → Payment Gateways."), { statusCode: 503 });
  return envKey;
}

/** Returns the Interswitch credentials (platform-level). */
export async function resolveInterswitchCreds(): Promise<{ clientId: string; secretKey: string; merchantCode: string; payItemId: string; env: string }> {
  const adminCreds = await getPlatformCredentials("interswitch" as GatewayProvider);
  if (adminCreds?.clientId && adminCreds?.secretKey) {
    return { clientId: adminCreds.clientId, secretKey: adminCreds.secretKey, merchantCode: adminCreds.merchantCode ?? "", payItemId: adminCreds.payItemId ?? "", env: adminCreds.env ?? "sandbox" };
  }
  const clientId     = process.env.INTERSWITCH_CLIENT_ID;
  const secretKey    = process.env.INTERSWITCH_SECRET_KEY;
  const merchantCode = process.env.INTERSWITCH_MERCHANT_CODE ?? "";
  const payItemId    = process.env.INTERSWITCH_PAY_ITEM_ID ?? "";
  const env          = process.env.INTERSWITCH_ENV ?? "sandbox";
  if (!clientId || !secretKey) throw Object.assign(new Error("Interswitch is not configured. Add credentials in Admin → Payment Gateways."), { statusCode: 503 });
  return { clientId, secretKey, merchantCode, payItemId, env };
}

/** Returns the Paystack secret key to use for a vendor, or throws if none available. */
export async function resolvePaystackKey(
  vendorId: number,
  vendor: TierCheckable,
): Promise<string> {
  if (canAddPaymentKeys(vendor)) {
    const [creds] = await db
      .select()
      .from(vendorPaymentCredentialsTable)
      .where(eq(vendorPaymentCredentialsTable.vendorId, vendorId))
      .limit(1);

    if (creds?.paystackSecretEncrypted && creds.paystackTestPassed) {
      return decrypt(creds.paystackSecretEncrypted);
    }
  }

  const adminCreds = await getPlatformCredentials("paystack");
  if (adminCreds?.secretKey) return adminCreds.secretKey;

  const platformKey = process.env.PAYSTACK_SECRET_KEY;
  if (!platformKey) throw new Error("Paystack is not configured. Add a platform Paystack key in Admin \u2192 Payment Gateways.");
  return platformKey;
}
