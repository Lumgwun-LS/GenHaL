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
