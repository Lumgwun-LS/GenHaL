/**
 * Resolves which Stripe / Paystack key to use for a given vendor.
 *
 * Priority:
 *   1. Vendor's own key (if stored, test-passed, and tier allows it)
 *   2. Platform key from env
 *   3. Throws if neither is available
 */
import { db } from "@workspace/db";
import { vendorPaymentCredentialsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "./encryption";

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

  const platformKey = process.env.STRIPE_SECRET_KEY;
  if (!platformKey) throw new Error("STRIPE_SECRET_KEY is not configured");
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

  const platformKey = process.env.PAYSTACK_SECRET_KEY;
  if (!platformKey) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return platformKey;
}
