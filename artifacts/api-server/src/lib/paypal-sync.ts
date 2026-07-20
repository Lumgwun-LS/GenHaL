/**
 * PayPal analogue of paystack-sync.ts — reconciles a vendor's tier directly
 * against the PayPal API when a webhook was missed. Mirrors the Paystack
 * reconciliation in both directions: catches a missed upgrade (BILLING.SUBSCRIPTION.ACTIVATED
 * webhook dropped) and a missed cancellation/lapse.
 *
 * Provider-safety rule: a vendor whose subscriptionProvider is already
 * set to "stripe" or "paystack" is owned by a different billing provider
 * and must never be downgraded based on a potentially stale paypalSubscriptionId.
 */
import type { Vendor } from "@workspace/db/schema";
import { getPayPalAccessToken, paypalBaseUrl, ensurePayPalCatalog } from "./paypal-catalog";
import { applyVendorPayPalTierUpgrade, applyVendorTierDowngrade } from "./subscription-sync";
import type { ReconcileResult } from "./subscription-sync";
import { getSubscriptionPlans } from "./subscription-plans";

interface PayPalSubscriptionRecord {
  status: string; // APPROVAL_PENDING|APPROVED|ACTIVE|SUSPENDED|CANCELLED|EXPIRED
  id: string;
  plan_id: string;
}

async function fetchPayPalSubscription(
  clientId: string,
  clientSecret: string,
  mode: string,
  subscriptionId: string,
): Promise<PayPalSubscriptionRecord | null> {
  const token = await getPayPalAccessToken(clientId, clientSecret, mode);
  const base = paypalBaseUrl(mode);
  const res = await fetch(`${base}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`PayPal GET subscription failed (${res.status}): ${text}`);
  }
  return (await res.json()) as PayPalSubscriptionRecord;
}

/**
 * Reconciles a single vendor's tier directly against PayPal. No-op if the
 * vendor has never subscribed via PayPal (no paypalSubscriptionId).
 *
 * Provider-safety: if the vendor's subscriptionProvider is explicitly set to
 * "stripe" or "paystack" they are managed by a different billing provider and
 * we do not touch their tier — a stale paypalSubscriptionId must not cause an
 * incorrect downgrade.
 *
 * Upgrade path: if the PayPal subscription is ACTIVE and its plan maps to a
 * tier higher (or different) than the vendor's current tier, the vendor is
 * upgraded — catching a missed BILLING.SUBSCRIPTION.ACTIVATED webhook.
 *
 * Downgrade path: if the subscription is not ACTIVE (cancelled, suspended,
 * expired, or not found) and the vendor is on a paid tier that is managed by
 * PayPal, they are downgraded to free — catching a missed cancellation webhook.
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

  // Provider-safety guard: do not interfere with vendors whose billing is
  // owned by a different gateway. A stale paypalSubscriptionId on a Stripe
  // or Paystack vendor must never cause a downgrade.
  if (vendor.subscriptionProvider === "stripe" || vendor.subscriptionProvider === "paystack") {
    return {
      synced: false,
      reason: `Vendor is managed by ${vendor.subscriptionProvider} — skipping PayPal reconciliation.`,
      currentTier: vendor.subscriptionTier,
    };
  }

  const subscription = await fetchPayPalSubscription(clientId, clientSecret, mode, vendor.paypalSubscriptionId);

  if (subscription && subscription.status === "ACTIVE") {
    // Upgrade path: map the plan_id to a known tier via the catalog.
    const plans = await getSubscriptionPlans();
    const catalog = await ensurePayPalCatalog(clientId, clientSecret, mode, plans);
    const catalogEntry = catalog.find((c) => c.planId === subscription.plan_id);
    if (!catalogEntry) {
      return {
        synced: false,
        reason: "Active PayPal subscription found, but its plan doesn't match a known tier.",
        currentTier: vendor.subscriptionTier,
      };
    }
    const result = await applyVendorPayPalTierUpgrade(
      vendor.id,
      catalogEntry.tier,
      subscription.id,
      source,
    );
    return {
      synced: result.applied,
      reason: result.reason ?? (result.applied ? "PayPal subscription activated — tier upgraded." : "already up to date"),
      currentTier: result.applied ? catalogEntry.tier : vendor.subscriptionTier,
    };
  }

  // APPROVAL_PENDING / APPROVED are in-flight transitional states — the
  // subscriber has started checkout or approval but activation hasn't
  // completed yet. The BILLING.SUBSCRIPTION.ACTIVATED webhook will arrive
  // shortly. Downgrading here would revoke access mid-checkout, so we
  // treat these as a no-op and let the next tick re-evaluate.
  if (subscription && (subscription.status === "APPROVAL_PENDING" || subscription.status === "APPROVED")) {
    return {
      synced: false,
      reason: `PayPal subscription is in transitional state (${subscription.status}) — waiting for activation.`,
      currentTier: vendor.subscriptionTier,
    };
  }

  // Subscription is gone, cancelled, suspended, expired, or unreachable.
  // If the vendor is already on free, nothing to do.
  if (vendor.subscriptionTier === "free") {
    return {
      synced: false,
      reason: "No active PayPal subscription found, but vendor is already on the free tier.",
      currentTier: vendor.subscriptionTier,
    };
  }

  const statusLabel = subscription ? subscription.status : "not found";
  const downgrade = await applyVendorTierDowngrade(vendor, source);
  return {
    synced: downgrade.applied,
    reason: downgrade.applied
      ? `PayPal subscription is ${statusLabel} — downgraded to free.`
      : downgrade.reason,
    currentTier: downgrade.applied ? "free" : vendor.subscriptionTier,
  };
}
