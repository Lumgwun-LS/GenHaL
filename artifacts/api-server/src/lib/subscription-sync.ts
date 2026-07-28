/**
 * Shared logic for reconciling a vendor's subscription tier against Stripe,
 * in both directions: applying a missed upgrade, and catching a missed
 * cancellation/lapse that should have downgraded the vendor back to free.
 *
 * Used by:
 *  - the Stripe webhook handlers (checkout.session.completed for upgrades,
 *    customer.subscription.deleted / charge.refunded for downgrades), the
 *    normal path
 *  - the on-demand /subscription/sync endpoint, which reconciles directly
 *    against the Stripe API when a webhook was never delivered (extended
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
import { insertTierChangeNotification, sendSubscriptionCancelledEmail } from "./subscription-notifications";

const VALID_TIERS = ["starter", "pro", "enterprise"];
const TIER_RANK: Record<string, number> = { free: 0, basic: 0, starter: 1, pro: 2, connected: 3, enterprise: 4 };

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
  return applyVendorTierUpgradeInternal(
    vendorId,
    tier,
    { subscriptionProvider: "stripe", stripeSubscriptionId },
    source,
  );
}

export interface PaystackUpgradeFields {
  paystackCustomerCode?: string | null;
  paystackSubscriptionCode?: string | null;
  paystackEmailToken?: string | null;
}

/** PayPal analogue of applyVendorTierUpgrade — same idempotency/notification behavior. */
export async function applyVendorPayPalTierUpgrade(
  vendorId: number,
  tier: string,
  paypalSubscriptionId: string | null,
  source: string,
): Promise<ApplyUpgradeResult> {
  return applyVendorTierUpgradeInternal(
    vendorId,
    tier,
    { subscriptionProvider: "paypal", paypalSubscriptionId },
    source,
  );
}

/** Paystack analogue of applyVendorTierUpgrade — same idempotency/notification behavior. */
export async function applyVendorPaystackTierUpgrade(
  vendorId: number,
  tier: string,
  fields: PaystackUpgradeFields,
  source: string,
): Promise<ApplyUpgradeResult> {
  return applyVendorTierUpgradeInternal(
    vendorId,
    tier,
    { subscriptionProvider: "paystack", ...fields },
    source,
  );
}

interface UpgradeFields {
  subscriptionProvider: "stripe" | "paystack" | "paypal";
  stripeSubscriptionId?: string | null;
  paystackCustomerCode?: string | null;
  paystackSubscriptionCode?: string | null;
  paystackEmailToken?: string | null;
  paypalSubscriptionId?: string | null;
}

async function applyVendorTierUpgradeInternal(
  vendorId: number,
  tier: string,
  fields: UpgradeFields,
  source: string,
): Promise<ApplyUpgradeResult> {
  if (!VALID_TIERS.includes(tier)) {
    return { applied: false, reason: `invalid tier '${tier}'` };
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId)).limit(1);
  if (!vendor) {
    return { applied: false, reason: `vendor ${vendorId} not found` };
  }

  const subscriptionId =
    fields.stripeSubscriptionId ?? fields.paystackSubscriptionCode ?? fields.paypalSubscriptionId ?? null;
  const alreadyOnSubscription =
    fields.subscriptionProvider === "stripe"
      ? vendor.stripeSubscriptionId === subscriptionId
      : fields.subscriptionProvider === "paystack"
        ? vendor.paystackSubscriptionCode === subscriptionId
        : vendor.paypalSubscriptionId === subscriptionId;

  if (vendor.subscriptionTier === tier && (!subscriptionId || alreadyOnSubscription)) {
    return { applied: false, reason: "already up to date", tier };
  }

  const previousTier = vendor.subscriptionTier;

  const [updated] = await db
    .update(vendorsTable)
    .set({
      subscriptionTier: tier,
      subscriptionProvider: fields.subscriptionProvider,
      stripeSubscriptionId:
        fields.subscriptionProvider === "stripe" ? (fields.stripeSubscriptionId ?? vendor.stripeSubscriptionId) : vendor.stripeSubscriptionId,
      paystackCustomerCode: fields.paystackCustomerCode ?? vendor.paystackCustomerCode,
      paystackSubscriptionCode: fields.paystackSubscriptionCode ?? vendor.paystackSubscriptionCode,
      paystackEmailToken: fields.paystackEmailToken ?? vendor.paystackEmailToken,
      paypalSubscriptionId: fields.paypalSubscriptionId ?? vendor.paypalSubscriptionId,
      // Reset the metered-usage billing-period anchor on an actual tier
      // change so quotas start fresh from this upgrade rather than
      // whenever the vendor last signed up or changed tier before. A
      // subscription-id-only refresh at the same tier leaves it alone.
      ...(previousTier !== tier ? { currentPeriodStart: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(vendorsTable.id, vendorId))
    .returning({ id: vendorsTable.id, subscriptionTier: vendorsTable.subscriptionTier });

  const featureUnlocked = canAddPaymentKeys({ subscriptionTier: tier, verificationLevel: vendor.verificationLevel });
  console.info(
    `[subscription sync] source=${source} vendor=${vendorId} tier=${tier} provider=${fields.subscriptionProvider} subscription=${subscriptionId ?? "n/a"} featureUnlocked=${featureUnlocked}`,
  );

  // Record the tier change for the admin plan-change history whenever the
  // tier itself actually moved (a subscription-id-only refresh at the same
  // tier is not a plan change and shouldn't show up there).
  if (updated && previousTier !== tier) {
    await insertTierChangeNotification(
      vendorId,
      `Your plan was upgraded from ${previousTier} to ${tier}.`,
      previousTier,
      tier,
    );
  }

  return { applied: !!updated, tier };
}

/**
 * Drops a vendor back to the free tier when Stripe no longer shows an
 * active/trialing paid subscription for them, and fires the same in-app
 * notification + email a vendor gets from the cancellation/refund webhook
 * paths (see subscription-notifications.ts) — this is the reconciliation
 * equivalent of a `customer.subscription.deleted` webhook that never
 * arrived.
 */
export async function applyVendorTierDowngrade(vendor: Vendor, source: string): Promise<ApplyUpgradeResult> {
  const previousTier = vendor.subscriptionTier;

  const [updated] = await db
    .update(vendorsTable)
    .set({
      subscriptionTier: "free",
      stripeSubscriptionId: null,
      subscriptionProvider: null,
      paystackSubscriptionCode: null,
      paystackEmailToken: null,
      paypalSubscriptionId: null,
      currentPeriodStart: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(vendorsTable.id, vendor.id))
    .returning({ id: vendorsTable.id });

  if (!updated) {
    return { applied: false, reason: `vendor ${vendor.id} not found` };
  }

  console.info(
    `[subscription sync] source=${source} vendor=${vendor.id} tier=free (downgraded from ${previousTier}) — no active Stripe subscription found`,
  );

  await insertTierChangeNotification(
    vendor.id,
    `Your ${previousTier} subscription is no longer active, so your account has been moved back to the Free tier.`,
    previousTier,
    "free",
  );

  if (vendor.email) {
    await sendSubscriptionCancelledEmail(vendor.email, vendor.name, previousTier);
  }

  return { applied: true, tier: "free" };
}

export interface ReconcileResult {
  synced: boolean;
  reason?: string;
  currentTier: string;
}

/**
 * Reconciles a single vendor's tier directly against the Stripe API.
 * Applies any upgrade found via applyVendorTierUpgrade, or — if the vendor
 * is on a paid tier in our DB but Stripe shows no active/trialing
 * subscription — downgrades them back to free via applyVendorTierDowngrade,
 * mirroring what a customer.subscription.deleted webhook would have done had
 * it actually been delivered. Shared by:
 *  - POST /vendors/:id/subscription/sync (vendor/UI-triggered, source="manual-sync")
 *  - the periodic background job (source="scheduled-sync")
 *
 * No-op (synced: false) if the vendor has no stripeCustomerId yet, or is
 * already on the tier that matches what Stripe shows (free & no subscription,
 * or paid & matching active subscription).
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
    // No active/trialing subscription found on Stripe. If the vendor is
    // still sitting on a paid tier in our DB, this is the mirror image of a
    // missed upgrade: a cancellation/expiration webhook (customer.subscription.deleted,
    // charge.refunded, etc.) never arrived or was dropped, and the vendor has
    // kept paid features indefinitely. Reconcile downward too, not just up.
    if (vendor.subscriptionTier !== "free") {
      const downgrade = await applyVendorTierDowngrade(vendor, source);
      return {
        synced: downgrade.applied,
        reason: downgrade.applied ? "No active Stripe subscription found — downgraded to free." : downgrade.reason,
        currentTier: downgrade.applied ? "free" : vendor.subscriptionTier,
      };
    }
    return { synced: false, reason: "No paid subscription found on Stripe for this vendor.", currentTier: vendor.subscriptionTier };
  }

  const result = await applyVendorTierUpgrade(vendor.id, bestTier, bestSubscriptionId, source);

  return {
    synced: result.applied,
    reason: result.reason,
    currentTier: result.applied ? bestTier : vendor.subscriptionTier,
  };
}
