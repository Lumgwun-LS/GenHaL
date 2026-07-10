/**
 * Stable Stripe Product/Price catalog for VendorHub subscription tiers.
 *
 * Subscription checkout used to create an ad-hoc `price_data` line item per
 * session. That works for charging vendors, but Stripe's Customer Portal
 * "update subscription" (plan-switching) feature requires real, durable
 * Price objects configured on a portal configuration — it cannot target
 * dynamically generated prices. This module finds-or-creates one Product +
 * Price per tier (keyed by a stable `lookup_key`) and a portal configuration
 * that lets vendors switch between them from inside the Customer Portal.
 *
 * Each Price carries `metadata.tier` so the `customer.subscription.updated`
 * webhook can read the new tier straight off the subscription item without a
 * second lookup.
 */
import Stripe from "stripe";
import { SUBSCRIPTION_PLANS } from "../routes/subscription-upgrade";

export interface TierPrice {
  tier: string;
  productId: string;
  priceId: string;
}

// In-memory cache, keyed by Stripe secret key so switching platform keys
// (e.g. test -> live) doesn't serve a stale catalog from the other account.
const catalogCache = new Map<string, Promise<TierPrice[]>>();
const portalConfigCache = new Map<string, Promise<string>>();

function lookupKeyFor(tier: string): string {
  return `vendorhub_${tier}`;
}

async function findOrCreateTierPrice(stripe: Stripe, plan: (typeof SUBSCRIPTION_PLANS)[number]): Promise<TierPrice> {
  const lookupKey = lookupKeyFor(plan.tier);

  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const found = existing.data[0];
  if (found) {
    const productId = typeof found.product === "string" ? found.product : found.product.id;
    return { tier: plan.tier, productId, priceId: found.id };
  }

  const product = await stripe.products.create({
    name: `VendorHub ${plan.name} Plan`,
    description: plan.description,
    metadata: { tier: plan.tier },
  });

  const price = await stripe.prices.create({
    product: product.id,
    currency: plan.currency,
    unit_amount: plan.price * 100,
    recurring: { interval: "month" },
    lookup_key: lookupKey,
    metadata: { tier: plan.tier },
  });

  return { tier: plan.tier, productId: product.id, priceId: price.id };
}

/** Returns the durable Product/Price for every subscription tier, creating them on first use. */
export async function ensureStripeCatalog(stripe: Stripe, stripeKey: string): Promise<TierPrice[]> {
  const cached = catalogCache.get(stripeKey);
  if (cached) return cached;

  const promise = Promise.all(SUBSCRIPTION_PLANS.map((plan) => findOrCreateTierPrice(stripe, plan)));
  catalogCache.set(stripeKey, promise);
  try {
    return await promise;
  } catch (err) {
    catalogCache.delete(stripeKey); // don't cache a failed attempt
    throw err;
  }
}

/**
 * Returns a Customer Portal configuration id that allows vendors to cancel,
 * update payment method, view invoice history, AND switch between the tier
 * prices in `catalog` — created once and reused via lookup by product set.
 */
export async function ensurePortalConfiguration(stripe: Stripe, stripeKey: string, catalog: TierPrice[]): Promise<string> {
  const cached = portalConfigCache.get(stripeKey);
  if (cached) return cached;

  const promise = (async () => {
    const products = catalog.map((c) => ({ product: c.productId, prices: [c.priceId] }));

    const config = await stripe.billingPortal.configurations.create({
      business_profile: { headline: "Manage your VendorHub subscription" },
      features: {
        customer_update: { enabled: true, allowed_updates: ["email", "address"] },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
        subscription_update: {
          enabled: true,
          default_allowed_updates: ["price"],
          products,
        },
      },
    });

    return config.id;
  })();

  portalConfigCache.set(stripeKey, promise);
  try {
    return await promise;
  } catch (err) {
    portalConfigCache.delete(stripeKey);
    throw err;
  }
}
