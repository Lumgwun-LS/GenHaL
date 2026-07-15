/**
 * Stable Paystack Plan catalog for VendorHub subscription tiers — the
 * Paystack analogue of stripe-catalog.ts.
 *
 * Unlike Stripe Prices, Paystack Plans are mutable (PUT /plan/:code can
 * change the amount directly), so there's no "retire and mint a new one"
 * dance — an admin price edit just updates the existing Plan in place. We
 * still cache the lookup (list + match by name) with a short TTL so a
 * checkout immediately followed by another doesn't repeatedly hit Paystack.
 */
import type { SubscriptionPlan } from "./subscription-plans";

const PAYSTACK_BASE = "https://api.paystack.co";
const CATALOG_TTL_MS = 30_000;

export interface PaystackTierPlan {
  tier: string;
  planCode: string;
  amount: number; // kobo
}

interface CacheEntry {
  promise: Promise<PaystackTierPlan[]>;
  cachedAt: number;
}

const catalogCache = new Map<string, CacheEntry>();

function planNameFor(plan: SubscriptionPlan): string {
  return `VendorHub ${plan.name} Plan (NGN)`;
}

async function paystackFetch<T>(secretKey: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json()) as { status: boolean; message: string; data?: unknown };
  if (!data.status) {
    throw new Error(`Paystack error (${path}): ${data.message}`);
  }
  return data.data as T;
}

interface PaystackPlanRecord {
  plan_code: string;
  name: string;
  amount: number;
  interval: string;
}

async function findOrCreateTierPlan(
  secretKey: string,
  plan: SubscriptionPlan,
  existingPlans: PaystackPlanRecord[],
): Promise<PaystackTierPlan> {
  const name = planNameFor(plan);
  const targetAmount = Math.round(plan.pricing.ngn * 100);
  const found = existingPlans.find((p) => p.name === name);

  if (found && found.amount === targetAmount) {
    return { tier: plan.tier, planCode: found.plan_code, amount: targetAmount };
  }

  if (found) {
    // Admin changed the NGN price — Paystack lets us update the plan amount in place.
    await paystackFetch(secretKey, `/plan/${found.plan_code}`, {
      method: "PUT",
      body: JSON.stringify({ name, amount: targetAmount, interval: "monthly" }),
    });
    return { tier: plan.tier, planCode: found.plan_code, amount: targetAmount };
  }

  const created = await paystackFetch<PaystackPlanRecord>(secretKey, "/plan", {
    method: "POST",
    body: JSON.stringify({ name, amount: targetAmount, interval: "monthly", currency: "NGN" }),
  });

  return { tier: plan.tier, planCode: created.plan_code, amount: targetAmount };
}

/** Returns the durable Paystack Plan for every subscription tier, creating (or repricing) them as needed. */
export async function ensurePaystackCatalog(secretKey: string, plans: SubscriptionPlan[]): Promise<PaystackTierPlan[]> {
  const cached = catalogCache.get(secretKey);
  if (cached && Date.now() - cached.cachedAt < CATALOG_TTL_MS) return cached.promise;

  const promise = (async () => {
    const list = await paystackFetch<PaystackPlanRecord[]>(secretKey, "/plan?perPage=100");
    return Promise.all(plans.map((plan) => findOrCreateTierPlan(secretKey, plan, list)));
  })();

  catalogCache.set(secretKey, { promise, cachedAt: Date.now() });
  try {
    return await promise;
  } catch (err) {
    catalogCache.delete(secretKey);
    throw err;
  }
}
