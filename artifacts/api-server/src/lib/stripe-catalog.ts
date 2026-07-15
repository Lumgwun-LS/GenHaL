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
 *
 * Plan prices are now admin-editable (see subscription-plans.ts), so unlike
 * the old hardcoded-forever constants, the Stripe Price for a tier can go
 * stale after an admin edit. Stripe Prices are immutable once created, so
 * when the admin-configured price no longer matches the active Stripe
 * Price's `unit_amount`, we retire the old Price (clear its lookup_key,
 * mark inactive) and mint a new one under the same lookup_key. The catalog
 * cache is short-TTL (not permanent) so an admin's price edit is picked up
 * on the next checkout/portal request within seconds, not only after a
 * server restart.
 */
import Stripe from "stripe";
import type { SubscriptionPlan } from "./subscription-plans";

export interface TierPrice {
  tier: string;
  productId: string;
  priceId: string;
}

interface CacheEntry {
  promise: Promise<TierPrice[]>;
  cachedAt: number;
}

// In-memory cache, keyed by Stripe secret key so switching platform keys
// (e.g. test -> live) doesn't serve a stale catalog from the other account.
// Short TTL only — long enough to absorb bursty repeat calls (e.g. checkout
// immediately followed by a portal-config request) without hammering
// Stripe, short enough that an admin price edit shows up promptly.
const CATALOG_TTL_MS = 30_000;
const catalogCache = new Map<string, CacheEntry>();
const portalConfigCache = new Map<string, Promise<string>>();

function lookupKeyFor(tier: string): string {
  return `vendorhub_${tier}`;
}

const STRIPE_CURRENCY = "usd";

async function findOrCreateTierPrice(stripe: Stripe, plan: SubscriptionPlan): Promise<TierPrice> {
  const lookupKey = lookupKeyFor(plan.tier);
  const targetAmount = Math.round(plan.pricing.usd * 100);

  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const found = existing.data[0];

  if (found && found.unit_amount === targetAmount && found.currency === STRIPE_CURRENCY) {
    const productId = typeof found.product === "string" ? found.product : found.product.id;
    return { tier: plan.tier, productId, priceId: found.id };
  }

  let productId: string;
  if (found) {
    // The admin changed the price (or currency) for this tier — Prices are
    // immutable in Stripe, so retire the stale one (free its lookup_key so
    // the replacement can claim it) and mint a new Price under the same
    // product.
    productId = typeof found.product === "string" ? found.product : found.product.id;
    await stripe.prices.update(found.id, { lookup_key: "", active: false });
    await stripe.products.update(productId, {
      name: `VendorHub ${plan.name} Plan`,
      description: plan.description,
    });
  } else {
    const product = await stripe.products.create({
      name: `VendorHub ${plan.name} Plan`,
      description: plan.description,
      metadata: { tier: plan.tier },
    });
    productId = product.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    currency: STRIPE_CURRENCY,
    unit_amount: targetAmount,
    recurring: { interval: "month" },
    lookup_key: lookupKey,
    metadata: { tier: plan.tier },
  });

  return { tier: plan.tier, productId, priceId: price.id };
}

/** Returns the durable Product/Price for every subscription tier, creating (or repricing) them as needed. */
export async function ensureStripeCatalog(stripe: Stripe, stripeKey: string, plans: SubscriptionPlan[]): Promise<TierPrice[]> {
  const cached = catalogCache.get(stripeKey);
  if (cached && Date.now() - cached.cachedAt < CATALOG_TTL_MS) return cached.promise;

  const promise = Promise.all(plans.map((plan) => findOrCreateTierPrice(stripe, plan)));
  catalogCache.set(stripeKey, { promise, cachedAt: Date.now() });
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
 * prices in `catalog` — created fresh whenever the catalog's price set
 * changes (keyed by the sorted price ids), so a re-priced plan doesn't leave
 * vendors switching onto a retired Price via a stale portal configuration.
 */
export async function ensurePortalConfiguration(stripe: Stripe, stripeKey: string, catalog: TierPrice[]): Promise<string> {
  const cacheKey = `${stripeKey}:${catalog.map((c) => c.priceId).sort().join(",")}`;
  const cached = portalConfigCache.get(cacheKey);
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

  portalConfigCache.set(cacheKey, promise);
  try {
    return await promise;
  } catch (err) {
    portalConfigCache.delete(cacheKey);
    throw err;
  }
}
