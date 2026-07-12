/**
 * Shared logic for applying a vendor subscription-tier upgrade.
 *
 * Used by:
 *  - the Stripe webhook handler (checkout.session.completed), the normal path
 *  - the on-demand /subscription/sync endpoint, which reconciles directly
 *    against the Stripe API when the webhook was never delivered (extended
 *    server downtime, dropped delivery attempts, etc.)
 *  - the periodic subscription-sync background job (subscription-sync-scheduler.ts),
 *    which runs the same reconciliation without waiting for a vendor to visit
 *    the billing page.
 */
import type Stripe from "stripe";
import { db } from "@workspace/db";
import { vendorsTable, type Vendor } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { canAddPaymentKeys } from "./vendor-keys";

const VALID_TIERS = ["starter", "pro", "enterprise"];
const TIER_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };

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

export interface ReconcileResult {
  synced: boolean;
  reason?: string;
  currentTier: string;
}

/**
 * Reconciles a single vendor's tier directly against the Stripe API and
 * applies any upgrade found via applyVendorTierUpgrade. Shared by:
 *  - POST /vendors/:id/subscription/sync (vendor/UI-triggered, source="manual-sync")
 *  - the periodic background job (source="scheduled-sync")
 *
 * No-op (synced: false) if the vendor has no stripeCustomerId yet, or no
 * active/trialing paid subscription is found on Stripe.
 */
export async function reconcileVendorSubscription(
  vendor: Vendor,
  stripe: Stripe,
  source: string,
): Promise<ReconcileResult> {
  if (!vendor.stripeCustomerId) {
    return { synced: false, reason: "No Stripe customer on file yet — nothing to sync.", currentTier: vendor.subscriptionTier };
  }

  let bestTier: string | null = null;
  let bestSubscriptionId: string | null = null;

  // 1) Look at the vendor's active/trialing subscriptions directly — this is
  //    authoritative and catches the case where the webhook never fired at
  //    all (checkout completed, subscription exists, DB was never told).
  const subscriptions = await stripe.subscriptions.list({
    customer: vendor.stripeCustomerId,
    status: "all",
    limit: 10,
  });

  for (const sub of subscriptions.data) {
    if (sub.status !== "active" && sub.status !== "trialing") continue;
    const tier = sub.metadata?.upgradeTier ?? sub.items.data[0]?.price?.metadata?.tier ?? null;
    if (!tier || !VALID_TIERS.includes(tier)) continue;
    if (!bestTier || (TIER_RANK[tier] ?? 0) > (TIER_RANK[bestTier] ?? 0)) {
      bestTier = tier;
      bestSubscriptionId = sub.id;
    }
  }

  // 2) Fall back to recent Checkout Sessions in case the subscription lookup
  //    above misses (e.g. session paid but subscription object metadata
  //    lagged) — covers a dropped webhook mid-flight. A paid session is only
  //    used to *locate* a subscription id; entitlement is decided by
  //    re-fetching that subscription and confirming it's still active or
  //    trialing right now. A historical paid session for a since-canceled
  //    subscription must never grant a tier.
  if (!bestTier) {
    const sessions = await stripe.checkout.sessions.list({
      customer: vendor.stripeCustomerId,
      limit: 10,
    });
    for (const session of sessions.data) {
      if (session.payment_status !== "paid" || session.status !== "complete") continue;
      const tier = session.metadata?.upgradeTier ?? null;
      const sessionVendorId = session.metadata?.upgradeVendorId ? parseInt(session.metadata.upgradeVendorId) : null;
      if (sessionVendorId !== vendor.id || !tier || !VALID_TIERS.includes(tier)) continue;

      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
      if (!subscriptionId) continue; // no subscription tied to this session — nothing to verify

      // Re-fetch live status; do not trust the session snapshot alone.
      const liveSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (liveSubscription.status !== "active" && liveSubscription.status !== "trialing") continue;

      if (!bestTier || (TIER_RANK[tier] ?? 0) > (TIER_RANK[bestTier] ?? 0)) {
        bestTier = tier;
        bestSubscriptionId = subscriptionId;
      }
    }
  }

  if (!bestTier) {
    return { synced: false, reason: "No paid subscription found on Stripe for this vendor.", currentTier: vendor.subscriptionTier };
  }

  const result = await applyVendorTierUpgrade(vendor.id, bestTier, bestSubscriptionId, source);

  return {
    synced: result.applied,
    reason: result.reason,
    currentTier: result.applied ? bestTier : vendor.subscriptionTier,
  };
}
