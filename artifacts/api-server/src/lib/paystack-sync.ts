/**
 * Paystack analogue of subscription-sync.ts's reconcileVendorSubscription —
 * reconciles a vendor's tier directly against the Paystack API when a
 * webhook was missed. Mirrors the Stripe reconciliation in both directions
 * (catches a missed upgrade and a missed cancellation/lapse).
 */
import type { Vendor } from "@workspace/db/schema";
import { getSubscriptionPlans } from "./subscription-plans";
import { ensurePaystackCatalog } from "./paystack-catalog";
import { applyVendorPaystackTierUpgrade, applyVendorTierDowngrade } from "./subscription-sync";
import type { ReconcileResult } from "./subscription-sync";

const PAYSTACK_BASE = "https://api.paystack.co";

interface PaystackSubscriptionRecord {
  status: string; // active|non-renewing|attention|completed|cancelled
  subscription_code: string;
  email_token: string;
  customer: { customer_code: string };
  plan: { plan_code: string };
}

async function fetchSubscription(secretKey: string, code: string): Promise<PaystackSubscriptionRecord | null> {
  const response = await fetch(`${PAYSTACK_BASE}/subscription/${code}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = (await response.json()) as { status: boolean; data?: PaystackSubscriptionRecord };
  return data.status ? (data.data ?? null) : null;
}

/**
 * Reconciles a single vendor's tier directly against Paystack. No-op if the
 * vendor has never subscribed via Paystack (no paystackSubscriptionCode).
 */
export async function reconcileVendorPaystackSubscription(
  vendor: Vendor,
  secretKey: string,
  source: string,
): Promise<ReconcileResult> {
  if (!vendor.paystackSubscriptionCode) {
    return { synced: false, reason: "No Paystack subscription on file yet — nothing to sync.", currentTier: vendor.subscriptionTier };
  }

  const subscription = await fetchSubscription(secretKey, vendor.paystackSubscriptionCode);

  const activeStatuses = ["active", "non-renewing", "attention"];
  if (subscription && activeStatuses.includes(subscription.status)) {
    const plans = await getSubscriptionPlans();
    const catalog = await ensurePaystackCatalog(secretKey, plans);
    const catalogEntry = catalog.find((c) => c.planCode === subscription.plan.plan_code);
    if (!catalogEntry) {
      return { synced: false, reason: "Active Paystack subscription found, but its plan doesn't match a known tier.", currentTier: vendor.subscriptionTier };
    }
    const result = await applyVendorPaystackTierUpgrade(
      vendor.id,
      catalogEntry.tier,
      {
        paystackCustomerCode: subscription.customer.customer_code,
        paystackSubscriptionCode: subscription.subscription_code,
        paystackEmailToken: subscription.email_token,
      },
      source,
    );
    return {
      synced: result.applied,
      reason: result.reason,
      currentTier: result.applied ? catalogEntry.tier : vendor.subscriptionTier,
    };
  }

  // Subscription no longer exists / is cancelled / completed on Paystack's side
  // but the vendor is still sitting on a paid tier in our DB — a missed
  // subscription.disable webhook. Downgrade, mirroring the Stripe path.
  if (vendor.subscriptionTier !== "free") {
    const downgrade = await applyVendorTierDowngrade(vendor, source);
    return {
      synced: downgrade.applied,
      reason: downgrade.applied ? "Paystack subscription is no longer active — downgraded to free." : downgrade.reason,
      currentTier: downgrade.applied ? "free" : vendor.subscriptionTier,
    };
  }

  return { synced: false, reason: "No paid Paystack subscription found for this vendor.", currentTier: vendor.subscriptionTier };
}
