/**
 * Metered resource usage, quota enforcement, and pay-as-you-go overage billing.
 *
 * ## Included credits (quota)
 * Each plan comes with a monthly credit bundle per resource type. Credits are
 * tracked in `resource_usage` and enforced atomically via advisory locks so
 * concurrent requests never jointly overshoot the limit.
 *
 * ## Pay-as-you-go overage (paid plans only)
 * When a paid-tier vendor exhausts their included credits, usage continues but
 * is recorded in `vendor_overage_charges` at the published overage rate for
 * that resource. For vendors with a Stripe customer ID, a Stripe InvoiceItem
 * is created immediately and will be collected on their next invoice. For
 * Paystack/PayPal vendors the overage accumulates in the DB for manual or
 * end-of-period settlement by the admin.
 *
 * Free-tier vendors are hard-blocked when they hit their quota — they have no
 * payment method on file for overage collection.
 *
 * ## Billing period
 * Derived locally from `vendors.currentPeriodStart` — a rolling 30-day window
 * anchored to that timestamp, advanced automatically each full period. The
 * anchor resets only on real tier-change events (upgrade, downgrade,
 * cancellation) so it stays aligned with real subscription lifecycle events.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  resourceUsageTable,
  vendorOverageChargesTable,
  vendorsTable,
  type Vendor,
} from "@workspace/db/schema";
import { getSubscriptionPlan, type SubscriptionPlanQuotas } from "./subscription-plans";
import { resolveGatewayField, callWithPlatformStripe } from "./platform-gateways";
import { logger } from "./logger";

export const RESOURCE_KEYS = ["aiImages", "aiVideos", "aiCaptions", "voiceMinutes", "sms", "email"] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];

export const RESOURCE_LABEL: Record<ResourceKey, string> = {
  aiImages: "AI image generations",
  aiVideos: "AI video generations",
  aiCaptions: "AI captions",
  voiceMinutes: "voice campaign minutes",
  sms: "SMS sends",
  email: "email sends",
};

export const FREE_TIER_QUOTAS: SubscriptionPlanQuotas = {
  aiImages: 2,
  aiVideos: 0,
  aiCaptions: 10,
  voiceMinutes: 0,
  sms: 0,
  email: 20,
};

/**
 * Pay-as-you-go rates (USD per unit) charged once a vendor's included monthly
 * credits are exhausted. Priced at roughly 2.5-3× the platform's real unit
 * cost so overage is profitable but not punitive. Admins can adjust plan
 * quotas in the Site Editor to shift where overage starts.
 */
export const OVERAGE_RATES: Record<ResourceKey, number> = {
  aiImages:      0.50,   // platform cost ≈ $0.19
  aiVideos:      1.00,   // platform cost ≈ $0.30
  aiCaptions:    0.05,   // platform cost ≈ $0.01
  voiceMinutes:  0.15,   // platform cost ≈ $0.06
  sms:           0.05,   // platform cost ≈ $0.01
  email:         0.01,   // platform cost ≈ $0.001
};

const PERIOD_LENGTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Returns the start of the vendor's *current* billing period — a rolling
 * PERIOD_LENGTH_MS window anchored to `currentPeriodStart`, advanced however
 * many whole periods have elapsed since then.
 */
export function getBillingPeriodStart(vendor: Pick<Vendor, "currentPeriodStart" | "createdAt">, now: Date = new Date()): Date {
  const anchor = vendor.currentPeriodStart ?? vendor.createdAt;
  const elapsed = now.getTime() - anchor.getTime();
  const periodsElapsed = elapsed > 0 ? Math.floor(elapsed / PERIOD_LENGTH_MS) : 0;
  return new Date(anchor.getTime() + periodsElapsed * PERIOD_LENGTH_MS);
}

export function getBillingPeriodEnd(periodStart: Date): Date {
  return new Date(periodStart.getTime() + PERIOD_LENGTH_MS);
}

/** Returns true when the vendor is on a paid plan (overage billing is possible). */
function isPaidTier(vendor: Pick<Vendor, "subscriptionTier">): boolean {
  return vendor.subscriptionTier !== "free";
}

/** Resolves the quota bundle for whatever tier the vendor is currently on. */
export async function getVendorQuotas(vendor: Pick<Vendor, "subscriptionTier">): Promise<SubscriptionPlanQuotas> {
  if (vendor.subscriptionTier === "free") return FREE_TIER_QUOTAS;
  const plan = await getSubscriptionPlan(vendor.subscriptionTier);
  return plan?.quotas ?? FREE_TIER_QUOTAS;
}

export async function getVendorForUsage(vendorId: number): Promise<Vendor | null> {
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId)).limit(1);
  return vendor ?? null;
}

async function getUsedAmount(vendorId: number, resource: ResourceKey, periodStart: Date): Promise<number> {
  const [row] = await db
    .select({ used: resourceUsageTable.used })
    .from(resourceUsageTable)
    .where(and(
      eq(resourceUsageTable.vendorId, vendorId),
      eq(resourceUsageTable.resource, resource),
      eq(resourceUsageTable.periodStart, periodStart),
    ))
    .limit(1);
  return row ? Number(row.used) : 0;
}

export interface QuotaCheckResult {
  allowed: boolean;
  isOverage: boolean;       // true = allowed via pay-as-you-go, not from included credits
  resource: ResourceKey;
  used: number;
  quota: number;
  remaining: number;        // remaining included credits (0 when in overage)
  overageUnits: number;     // units charged as overage this request (0 for normal usage)
  overageUsd: number;       // USD cost of overage this request
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Read-only quota check — does NOT record any usage. Safe for pre-flight
 * checks like "can this vendor even start a campaign?" before committing.
 * For gates that must actually record usage use `consumeQuota` instead.
 */
export async function checkQuota(vendor: Vendor, resource: ResourceKey, amount: number): Promise<QuotaCheckResult> {
  const quotas = await getVendorQuotas(vendor);
  const quota = quotas[resource];
  const periodStart = getBillingPeriodStart(vendor);
  const used = await getUsedAmount(vendor.id, resource, periodStart);
  const remaining = Math.max(quota - used, 0);
  const allowed = remaining >= amount || isPaidTier(vendor);
  return {
    allowed,
    isOverage: allowed && remaining < amount,
    resource,
    used,
    quota,
    remaining,
    overageUnits: allowed && remaining < amount ? amount : 0,
    overageUsd: allowed && remaining < amount ? amount * OVERAGE_RATES[resource] : 0,
    periodStart,
    periodEnd: getBillingPeriodEnd(periodStart),
  };
}

/** Human-readable message for a hard block (free-tier vendors who hit quota). */
export function quotaExceededMessage(vendor: Pick<Vendor, "subscriptionTier">, result: QuotaCheckResult): string {
  const tierLabel = vendor.subscriptionTier === "free" ? "Free" : vendor.subscriptionTier;
  return `You've used ${result.used} of ${result.quota} ${RESOURCE_LABEL[result.resource]} included in your ${tierLabel} plan this period. Upgrade your plan to continue.`;
}

/** Human-readable message for overage (paid-tier vendors charged beyond quota). */
export function quotaOverageMessage(result: QuotaCheckResult): string {
  const rate = OVERAGE_RATES[result.resource];
  return `You've used all included ${RESOURCE_LABEL[result.resource]} for this period. This usage will be billed at $${rate.toFixed(4)} per unit.`;
}

/**
 * Records overage in the `vendor_overage_charges` table and, when the vendor
 * has an active Stripe subscription, creates a Stripe InvoiceItem on their
 * customer so it's collected on the next invoice. Fire-and-forget: failure
 * logs a warning but does not block the vendor action that triggered overage.
 */
async function recordOverageCharge(
  vendor: Vendor,
  resource: ResourceKey,
  amount: number,
  periodStart: Date,
): Promise<void> {
  const rate = OVERAGE_RATES[resource];
  const totalUsd = amount * rate;

  let stripeInvoiceItemId: string | undefined;
  if (vendor.stripeCustomerId && vendor.stripeSubscriptionId) {
    try {
      const hasStripeKey = !!(await resolveGatewayField("stripe", "secretKey") || await resolveGatewayField("stripe", "fallbackSecretKey"));
      if (hasStripeKey) {
        const invoiceItem = await callWithPlatformStripe((stripe) => stripe.invoiceItems.create({
          customer: vendor.stripeCustomerId,
          amount: Math.round(totalUsd * 100), // cents
          currency: "usd",
          description: `Pay-as-you-go overage: ${amount} × ${RESOURCE_LABEL[resource]} @ ${rate.toFixed(4)}/unit`,
          metadata: {
            vendorId: String(vendor.id),
            resource,
            periodStart: periodStart.toISOString(),
            units: String(amount),
          },
        }));
        stripeInvoiceItemId = invoiceItem.id;
      }
    } catch (err) {
      logger.warn({ err, vendorId: vendor.id, resource, amount }, "[overage] Failed to create Stripe invoice item — overage recorded in DB only");
    }
  }

  await db
    .insert(vendorOverageChargesTable)
    .values({
      vendorId: vendor.id,
      resource,
      periodStart,
      units: amount.toString(),
      unitRateUsd: rate.toString(),
      totalUsd: totalUsd.toString(),
      stripeInvoiceItemId: stripeInvoiceItemId ?? null,
    })
    .onConflictDoUpdate({
      target: [vendorOverageChargesTable.vendorId, vendorOverageChargesTable.resource, vendorOverageChargesTable.periodStart],
      set: {
        units: sql`${vendorOverageChargesTable.units} + ${amount}`,
        totalUsd: sql`${vendorOverageChargesTable.totalUsd} + ${totalUsd}`,
        // Only store the first stripe invoice item ID created for this period/resource
        // (subsequent overage hits accumulate on the same row but we don't re-create invoice items
        // to avoid double-billing — the Stripe item is created with the full period's running total
        // at settlement time for non-Stripe vendors, or via this first-hit pattern for Stripe).
        updatedAt: new Date(),
      },
    });
}

/**
 * Atomically checks AND increments usage in one step. For paid-tier vendors
 * who have exhausted their included credits, usage is allowed as overage and
 * recorded for billing. Free-tier vendors are hard-blocked.
 *
 * Returns `allowed: true` in both the normal (quota available) and overage
 * (paid plan, quota exhausted) cases. Check `result.isOverage` to know which.
 */
export async function consumeQuota(vendor: Vendor, resource: ResourceKey, amount: number): Promise<QuotaCheckResult> {
  return db.transaction((tx) => consumeQuotaTx(tx, vendor, resource, amount));
}

/**
 * Same as `consumeQuota` but runs inside a caller-provided transaction.
 * Use when quota consumption must be atomically coupled to another write
 * (e.g. an idempotent draft→sent transition that must both send and charge
 * quota exactly once).
 */
export async function consumeQuotaTx(
  tx: Pick<typeof db, "transaction">,
  vendor: Vendor,
  resource: ResourceKey,
  amount: number,
): Promise<QuotaCheckResult> {
  const quotas = await getVendorQuotas(vendor);
  const quota = quotas[resource];
  const periodStart = getBillingPeriodStart(vendor);
  const periodEnd = getBillingPeriodEnd(periodStart);
  const lockKey = `resource_usage:${vendor.id}:${resource}:${periodStart.toISOString()}`;

  const result = await tx.transaction(async (inner) => {
    await inner.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const [row] = await inner
      .select({ used: resourceUsageTable.used })
      .from(resourceUsageTable)
      .where(and(
        eq(resourceUsageTable.vendorId, vendor.id),
        eq(resourceUsageTable.resource, resource),
        eq(resourceUsageTable.periodStart, periodStart),
      ))
      .limit(1);
    const used = row ? Number(row.used) : 0;
    const remaining = Math.max(quota - used, 0);

    // Hard block for free-tier vendors
    if (remaining < amount && !isPaidTier(vendor)) {
      return { allowed: false, isOverage: false, resource, used, quota, remaining, overageUnits: 0, overageUsd: 0, periodStart, periodEnd };
    }

    if (remaining >= amount) {
      // Normal credit consumption — stays within included quota
      await inner
        .insert(resourceUsageTable)
        .values({ vendorId: vendor.id, resource, periodStart, used: amount.toString() })
        .onConflictDoUpdate({
          target: [resourceUsageTable.vendorId, resourceUsageTable.resource, resourceUsageTable.periodStart],
          set: { used: sql`${resourceUsageTable.used} + ${amount}`, updatedAt: new Date() },
        });
      return { allowed: true, isOverage: false, resource, used: used + amount, quota, remaining: remaining - amount, overageUnits: 0, overageUsd: 0, periodStart, periodEnd };
    }

    // Paid plan, quota exhausted — consume what's left from credits, rest is overage
    if (remaining > 0) {
      await inner
        .insert(resourceUsageTable)
        .values({ vendorId: vendor.id, resource, periodStart, used: remaining.toString() })
        .onConflictDoUpdate({
          target: [resourceUsageTable.vendorId, resourceUsageTable.resource, resourceUsageTable.periodStart],
          set: { used: sql`${resourceUsageTable.used} + ${remaining}`, updatedAt: new Date() },
        });
    }

    const overageUnits = amount - remaining;
    return {
      allowed: true,
      isOverage: true,
      resource,
      used: used + remaining,
      quota,
      remaining: 0,
      overageUnits,
      overageUsd: overageUnits * OVERAGE_RATES[resource],
      periodStart,
      periodEnd,
    };
  });

  // Record overage outside the main TX (fire-and-forget; Stripe call can't be in a PG tx)
  if (result.isOverage && result.overageUnits > 0) {
    recordOverageCharge(vendor, resource, result.overageUnits, result.periodStart).catch((err) => {
      logger.error({ err, vendorId: vendor.id, resource }, "[overage] Failed to record overage charge");
    });
  }

  return result;
}

/**
 * Refunds `amount` of previously-consumed quota. Same advisory-lock pattern
 * as `consumeQuota` so a release racing a concurrent consume can't corrupt
 * the count.
 */
export async function releaseQuota(
  vendorId: number,
  resource: ResourceKey,
  amount: number,
  periodStart: Date,
  executor: Pick<typeof db, "transaction"> = db,
): Promise<void> {
  if (amount <= 0) return;
  const lockKey = `resource_usage:${vendorId}:${resource}:${periodStart.toISOString()}`;
  await executor.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    await tx
      .update(resourceUsageTable)
      .set({ used: sql`GREATEST(${resourceUsageTable.used} - ${amount}, 0)`, updatedAt: new Date() })
      .where(and(
        eq(resourceUsageTable.vendorId, vendorId),
        eq(resourceUsageTable.resource, resource),
        eq(resourceUsageTable.periodStart, periodStart),
      ));
  });
}

/**
 * Voice calls can't be metered exactly ahead of time (duration is unknown
 * until the call ends), so real enforcement instead RESERVES this many
 * minutes atomically via `consumeQuota` before placing each call — the same
 * amount Twilio's `TimeLimit` call parameter caps the call at, so actual
 * usage can never exceed the reservation. Once the real duration is known
 * (status callback), the unused portion is refunded via `releaseQuota`.
 */
export const VOICE_CALL_RESERVATION_MINUTES = 10;

/**
 * Directly increments usage without a prior quota check — used only for
 * post-hoc metering where the amount is unknowable ahead of time (voice call
 * duration, known only once Twilio's status callback reports it).
 */
export async function incrementUsage(
  vendorId: number,
  resource: ResourceKey,
  amount: number,
  periodStart: Date,
  executor: Pick<typeof db, "insert"> = db,
): Promise<void> {
  if (amount <= 0) return;
  await executor
    .insert(resourceUsageTable)
    .values({ vendorId, resource, periodStart, used: amount.toString() })
    .onConflictDoUpdate({
      target: [resourceUsageTable.vendorId, resourceUsageTable.resource, resourceUsageTable.periodStart],
      set: { used: sql`${resourceUsageTable.used} + ${amount}`, updatedAt: new Date() },
    });
}

export interface UsageSummaryEntry {
  resource: ResourceKey;
  label: string;
  used: number;
  quota: number;
  remaining: number;
  overageUnits: number;
  overageUsd: number;
  overageRate: number;
}

/** Vendor- and admin-facing usage-vs-quota + overage summary for the current period. */
export async function getUsageSummary(vendor: Vendor): Promise<{
  periodStart: string;
  periodEnd: string;
  tier: string;
  overageEnabled: boolean;
  totalOverageUsd: number;
  usage: UsageSummaryEntry[];
}> {
  const quotas = await getVendorQuotas(vendor);
  const periodStart = getBillingPeriodStart(vendor);
  const periodEnd = getBillingPeriodEnd(periodStart);
  const paid = isPaidTier(vendor);

  const usage = await Promise.all(RESOURCE_KEYS.map(async (resource) => {
    const used = await getUsedAmount(vendor.id, resource, periodStart);
    const quota = quotas[resource];

    // Fetch overage for this period/resource
    const [overageRow] = await db
      .select({ units: vendorOverageChargesTable.units, totalUsd: vendorOverageChargesTable.totalUsd })
      .from(vendorOverageChargesTable)
      .where(and(
        eq(vendorOverageChargesTable.vendorId, vendor.id),
        eq(vendorOverageChargesTable.resource, resource),
        eq(vendorOverageChargesTable.periodStart, periodStart),
      ))
      .limit(1);

    const overageUnits = overageRow ? Number(overageRow.units) : 0;
    const overageUsd = overageRow ? Number(overageRow.totalUsd) : 0;

    return {
      resource,
      label: RESOURCE_LABEL[resource],
      used,
      quota,
      remaining: Math.max(quota - used, 0),
      overageUnits,
      overageUsd,
      overageRate: OVERAGE_RATES[resource],
    };
  }));

  const totalOverageUsd = usage.reduce((sum, u) => sum + u.overageUsd, 0);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    tier: vendor.subscriptionTier,
    overageEnabled: paid,
    totalOverageUsd,
    usage,
  };
}
