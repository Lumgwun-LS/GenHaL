/**
 * Metered resource usage & quota enforcement.
 *
 * Billing period: vendors have no live-synced "subscription period end" from
 * Stripe/Paystack cheap enough to check on every metered action, so the
 * period is derived locally from `vendors.currentPeriodStart` — a rolling
 * 30-day window anchored to that timestamp. The anchor is reset to now()
 * whenever the vendor's tier actually changes (upgrade, downgrade,
 * cancellation — see subscription-sync.ts), which keeps it aligned with real
 * subscription lifecycle events rather than a fixed calendar day. Vendors who
 * never change tier (e.g. stay on Free) still get a rolling monthly reset
 * anchored to signup.
 *
 * Free tier has no admin-configured plan entry (billing.subscriptionPlans
 * only defines starter/pro/enterprise), so FREE_TIER_QUOTAS below is the
 * fixed fallback for everyone on "free". Voice/SMS both cost real money via
 * Twilio per use, so free tier gets 0 of those; AI features get a small
 * taste so the free tier still feels usable.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { resourceUsageTable, vendorsTable, type Vendor } from "@workspace/db/schema";
import { getSubscriptionPlan, type SubscriptionPlanQuotas } from "./subscription-plans";

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

const PERIOD_LENGTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Returns the start of the vendor's *current* billing period — a rolling
 * PERIOD_LENGTH_MS window anchored to `currentPeriodStart`, advanced however
 * many whole periods have elapsed since then. Never mutates the anchor
 * itself; that only changes on a real tier-change event.
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
  resource: ResourceKey;
  used: number;
  quota: number;
  remaining: number;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Checks whether `amount` more units of `resource` fit within the vendor's
 * remaining quota for the current period. Read-only, NOT atomic on its own —
 * this is only safe as an upfront non-committal gate (e.g. "does the vendor
 * have ANY voice-minute quota left before we launch a campaign"). For any
 * check that gates an actual unit of billable usage, use `consumeQuota`
 * instead, which checks-and-increments in one atomic step.
 */
export async function checkQuota(vendor: Vendor, resource: ResourceKey, amount: number): Promise<QuotaCheckResult> {
  const quotas = await getVendorQuotas(vendor);
  const quota = quotas[resource];
  const periodStart = getBillingPeriodStart(vendor);
  const used = await getUsedAmount(vendor.id, resource, periodStart);
  const remaining = Math.max(quota - used, 0);
  return {
    allowed: remaining >= amount,
    resource,
    used,
    quota,
    remaining,
    periodStart,
    periodEnd: getBillingPeriodEnd(periodStart),
  };
}

/** Human-readable message for a blocked request, suitable for a 402 response body. */
export function quotaExceededMessage(vendor: Pick<Vendor, "subscriptionTier">, result: QuotaCheckResult): string {
  const tierLabel = vendor.subscriptionTier === "free" ? "Free" : vendor.subscriptionTier;
  return `You've used ${result.used} of ${result.quota} ${RESOURCE_LABEL[result.resource]} included in your ${tierLabel} plan this period. Upgrade your plan for more.`;
}

/**
 * Atomically checks AND increments usage in one step, so concurrent requests
 * for the same vendor+resource+period can never both pass a stale read and
 * jointly overshoot the quota. Implemented as a Postgres transaction that
 * takes a session-scoped advisory lock keyed on (vendorId, resource,
 * periodStart) before reading — this serializes concurrent callers for the
 * same key without needing SERIALIZABLE isolation or row locks on a row that
 * may not exist yet.
 *
 * Only increments when the result is `allowed: true`. Callers that must
 * gate a not-yet-succeeded action (e.g. an AI generation that might fail)
 * should call this BEFORE the action and call `releaseQuota` to refund if
 * the action then fails.
 */
export async function consumeQuota(vendor: Vendor, resource: ResourceKey, amount: number): Promise<QuotaCheckResult> {
  return db.transaction((tx) => consumeQuotaTx(tx, vendor, resource, amount));
}

/**
 * Same atomic check-and-increment as `consumeQuota`, but runs inside a
 * caller-provided transaction (`tx`) instead of opening its own. Use this
 * when quota consumption must be all-or-nothing together with another write
 * in the same transaction — e.g. a campaign "send" endpoint that must claim
 * an idempotent draft->sent transition AND reserve quota atomically, so a
 * duplicate/retried send request can neither re-send nor re-charge quota.
 * drizzle-orm's node-postgres driver implements a nested `tx.transaction`
 * call as a SAVEPOINT, so this composes safely with an outer transaction.
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

  return tx.transaction(async (inner) => {
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

    if (remaining < amount) {
      return { allowed: false, resource, used, quota, remaining, periodStart, periodEnd };
    }

    await inner
      .insert(resourceUsageTable)
      .values({ vendorId: vendor.id, resource, periodStart, used: amount.toString() })
      .onConflictDoUpdate({
        target: [resourceUsageTable.vendorId, resourceUsageTable.resource, resourceUsageTable.periodStart],
        set: { used: sql`${resourceUsageTable.used} + ${amount}`, updatedAt: new Date() },
      });

    return { allowed: true, resource, used: used + amount, quota, remaining: remaining - amount, periodStart, periodEnd };
  });
}

/**
 * Refunds `amount` of previously-consumed quota (e.g. an AI generation that
 * was reserved via `consumeQuota` but then failed). Never drops usage below
 * zero. Same advisory-lock pattern as `consumeQuota` so a release racing a
 * concurrent consume can't corrupt the count.
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
 * amount Twilio's `TimeLimit` call parameter caps the call at (see
 * voice-caller.ts), so actual usage can never exceed the reservation. Once
 * the real duration is known (status callback), the unused portion of the
 * reservation is refunded via `releaseQuota`. This bounds worst-case
 * overshoot to "quota was available when this call started", never to
 * "however many calls happened to be in flight before usage caught up".
 */
export const VOICE_CALL_RESERVATION_MINUTES = 10;

/**
 * Directly increments usage without a prior quota check — used only for
 * post-hoc metering where the amount is unknowable ahead of time (voice call
 * duration, known only once Twilio's status callback reports it). Callers
 * MUST guarantee their own idempotency before calling this (see
 * voice-status-callback.ts's `metered_at` guard) since this function itself
 * has no way to detect a duplicate call.
 *
 * Pass `executor` (a `tx` from `db.transaction(...)`) when this increment
 * must succeed-or-fail atomically together with an idempotency claim made in
 * the same transaction — e.g. voice-status-callback.ts rolls back its
 * `metered_at` claim if this increment throws, so a failed attempt can be
 * safely retried instead of being permanently marked "already metered".
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
}

/** Vendor- and admin-facing usage-vs-quota summary for the current period. */
export async function getUsageSummary(vendor: Vendor): Promise<{
  periodStart: string;
  periodEnd: string;
  tier: string;
  usage: UsageSummaryEntry[];
}> {
  const quotas = await getVendorQuotas(vendor);
  const periodStart = getBillingPeriodStart(vendor);
  const periodEnd = getBillingPeriodEnd(periodStart);
  const usage = await Promise.all(RESOURCE_KEYS.map(async (resource) => {
    const used = await getUsedAmount(vendor.id, resource, periodStart);
    const quota = quotas[resource];
    return { resource, label: RESOURCE_LABEL[resource], used, quota, remaining: Math.max(quota - used, 0) };
  }));
  return { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), tier: vendor.subscriptionTier, usage };
}
