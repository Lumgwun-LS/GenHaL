/**
 * Shared logic for applying a vendor subscription-tier upgrade.
 *
 * Used by:
 *  - the Stripe webhook handler (checkout.session.completed), the normal path
 *  - the on-demand /subscription/sync endpoint, which reconciles directly
 *    against the Stripe API when the webhook was never delivered (extended
 *    server downtime, dropped delivery attempts, etc.)
 */
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { canAddPaymentKeys } from "./vendor-keys";

const VALID_TIERS = ["starter", "pro", "enterprise"];

export interface ApplyUpgradeResult {
  applied: boolean;
  reason?: string;
  tier?: string;
}

/**
 * Applies `tier` to `vendorId` if it represents a real upgrade (or at least a
 * change) and isn't already reflected. Idempotent-ish: re-applying the same
 * tier + subscription id is a no-op write, safe to call repeatedly.
 */
export async function applyVendorTierUpgrade(
  vendorId: number,
  tier: string,
  stripeSubscriptionId: string | null,
  source: string,
): Promise<ApplyUpgradeResult> {
  if (!VALID_TIERS.includes(tier)) {
    return { applied: false, reason: `invalid tier '${tier}'` };
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId)).limit(1);
  if (!vendor) {
    return { applied: false, reason: `vendor ${vendorId} not found` };
  }

  if (vendor.subscriptionTier === tier && (!stripeSubscriptionId || vendor.stripeSubscriptionId === stripeSubscriptionId)) {
    return { applied: false, reason: "already up to date", tier };
  }

  const [updated] = await db
    .update(vendorsTable)
    .set({
      subscriptionTier: tier,
      stripeSubscriptionId: stripeSubscriptionId ?? vendor.stripeSubscriptionId,
      updatedAt: new Date(),
    })
    .where(eq(vendorsTable.id, vendorId))
    .returning({ id: vendorsTable.id, subscriptionTier: vendorsTable.subscriptionTier });

  const featureUnlocked = canAddPaymentKeys({ subscriptionTier: tier, verificationLevel: vendor.verificationLevel });
  console.info(
    `[subscription sync] source=${source} vendor=${vendorId} tier=${tier} subscription=${stripeSubscriptionId ?? "n/a"} featureUnlocked=${featureUnlocked}`,
  );

  return { applied: !!updated, tier };
}
