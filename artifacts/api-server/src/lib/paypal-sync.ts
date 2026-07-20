/**
 * PayPal analogue of paystack-sync.ts — reconciles a vendor's tier directly
 * against the PayPal Subscriptions API when a webhook was missed (e.g. the
 * vendor returns from the approval flow before BILLING.SUBSCRIPTION.ACTIVATED
 * has been delivered).
 *
 * Covers both directions:
 *  - ACTIVE subscription but vendor still on free → upgrade (missed ACTIVATED)
 *  - CANCELLED/EXPIRED/SUSPENDED subscription but vendor on paid → downgrade (missed CANCELLED)
 */
import type { Vendor } from "@workspace/db/schema";
import { getPayPalAccessToken, paypalBaseUrl } from "./paypal-catalog";
import { applyVendorTierDowngrade } from "./subscription-sync";
import type { ReconcileResult } from "./subscription-sync";
import { db, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { insertTierChangeNotification } from "./subscription-notifications";

// PayPal subscription statuses
// https://developer.paypal.com/docs/api/subscriptions/v1/#subscriptions_get
type PayPalSubscriptionStatus =
  | "APPROVAL_PENDING"
  | "APPROVED"
  | "ACTIVE"
  | "SUSPENDED"
  | "CANCELLED"
  | "EXPIRED";

interface PayPalSubscriptionResource {
  id: string;
  status: PayPalSubscriptionStatus;
  plan_id?: string;
  custom_id?: string; // JSON: { upgradeVendorId, upgradeTier }
}

async function fetchPayPalSubscription(
  clientId: string,
  clientSecret: string,
  mode: string,
  subscriptionId: string,
): Promise<PayPalSubscriptionResource | null> {
  const token = await getPayPalAccessToken(clientId, clientSecret, mode);
  const base = paypalBaseUrl(mode);
  const res = await fetch(`${base}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`PayPal GET subscription failed (${res.status}): ${text}`);
  }
  return (await res.json()) as PayPalSubscriptionResource;
}

/**
 * Reconciles a single vendor's tier directly against PayPal.
 * No-op if the vendor has never subscribed via PayPal (no paypalSubscriptionId).
 */
export async function reconcileVendorPayPalSubscription(
  vendor: Vendor,
  clientId: string,
  clientSecret: string,
  mode: string,
  source: string,
): Promise<ReconcileResult> {
  if (!vendor.paypalSubscriptionId) {
    return {
      synced: false,
      reason: "No PayPal subscription on file yet — nothing to sync.",
      currentTier: vendor.subscriptionTier,
    };
  }

  const subscription = await fetchPayPalSubscription(clientId, clientSecret, mode, vendor.paypalSubscriptionId);

  if (subscription?.status === "ACTIVE") {
    // Parse tier from the subscription's custom_id (set at subscription creation)
    let upgradeTier: string | null = null;
    try {
      if (subscription.custom_id) {
        const meta = JSON.parse(subscription.custom_id) as { upgradeTier?: string };
        upgradeTier = meta.upgradeTier ?? null;
      }
    } catch {
      // custom_id not parseable — can't determine tier
    }

    const VALID_TIERS = ["starter", "pro", "enterprise"];
    if (!upgradeTier || !VALID_TIERS.includes(upgradeTier)) {
      return {
        synced: false,
        reason: "PayPal subscription is ACTIVE but could not determine the target tier from subscription metadata.",
        currentTier: vendor.subscriptionTier,
      };
    }

    // Apply if tier doesn't match — covers both free→paid AND paid→paid upgrades
    // (e.g. starter→pro where ACTIVATED was missed).
    if (vendor.subscriptionTier === upgradeTier) {
      return {
        synced: true,
        reason: "PayPal subscription is active and tier is already up to date.",
        currentTier: vendor.subscriptionTier,
      };
    }

    // Apply the upgrade (mirrors the BILLING.SUBSCRIPTION.ACTIVATED webhook handler)
    const previousTier = vendor.subscriptionTier;
    const [updated] = await db
      .update(vendorsTable)
      .set({
        subscriptionTier: upgradeTier,
        paypalSubscriptionId: subscription.id,
        subscriptionProvider: "paypal",
        updatedAt: new Date(),
      })
      .where(eq(vendorsTable.id, vendor.id))
      .returning({ id: vendorsTable.id });

    if (!updated) {
      return {
        synced: false,
        reason: `Vendor ${vendor.id} not found during PayPal sync.`,
        currentTier: vendor.subscriptionTier,
      };
    }

    await insertTierChangeNotification(
      updated.id,
      `Your plan was updated from ${previousTier} to ${upgradeTier} via PayPal.`,
      previousTier,
      upgradeTier,
    );

    console.info(
      `[paypal sync] source=${source} vendor=${vendor.id} previousTier=${previousTier} tier=${upgradeTier} sub=${subscription.id} (missed ACTIVATED webhook recovered)`,
    );
    return { synced: true, currentTier: upgradeTier };
  }

  // Subscription is APPROVAL_PENDING or APPROVED — vendor hasn't finished the
  // PayPal approval flow yet. No tier change; just report the pending state.
  if (subscription?.status === "APPROVAL_PENDING" || subscription?.status === "APPROVED") {
    return {
      synced: false,
      reason: `PayPal subscription is ${subscription.status} — awaiting customer approval.`,
      currentTier: vendor.subscriptionTier,
    };
  }

  // Subscription is CANCELLED, EXPIRED, or SUSPENDED (or not found / 404)
  // but the vendor is still on a paid tier — a missed CANCELLED/EXPIRED webhook.
  //
  // Safety guard: only downgrade if we are the managing provider. If
  // subscriptionProvider is explicitly set to something else (e.g. "stripe"),
  // the vendor is billed by that provider and a stale/abandoned paypalSubscriptionId
  // should never trigger a downgrade.
  if (vendor.subscriptionTier !== "free") {
    const managedByOtherProvider =
      vendor.subscriptionProvider !== null &&
      vendor.subscriptionProvider !== undefined &&
      vendor.subscriptionProvider !== "paypal";

    if (managedByOtherProvider) {
      console.warn(
        `[paypal sync] source=${source} vendor=${vendor.id} — PayPal subscription ${subscription?.status ?? "not found"} but vendor is managed by ${vendor.subscriptionProvider}; skipping downgrade to avoid cross-provider misrouting`,
      );
      return {
        synced: false,
        reason: `PayPal subscription is ${subscription?.status ?? "not found"}, but vendor is managed by ${vendor.subscriptionProvider} — no change applied.`,
        currentTier: vendor.subscriptionTier,
      };
    }

    const downgrade = await applyVendorTierDowngrade(vendor, source);
    return {
      synced: downgrade.applied,
      reason: downgrade.applied
        ? `PayPal subscription is ${subscription?.status ?? "not found"} — downgraded to free.`
        : downgrade.reason,
      currentTier: downgrade.applied ? "free" : vendor.subscriptionTier,
    };
  }

  // Subscription inactive and vendor already free — nothing to do.
  return {
    synced: true,
    reason: `PayPal subscription is ${subscription?.status ?? "not found"} and vendor is already on the free tier.`,
    currentTier: "free",
  };
}
