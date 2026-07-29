/**
 * Metered resource usage, quota enforcement, and pay-as-you-go overage billing.
 *
 * ## Included credits (quota)
 * Each plan comes with a monthly credit bundle per resource type. Credits are
 * tracked in `resource_usage` and enforced atomically via advisory locks so
 * concurrent requests never jointly overshoot the limit.
 *
 * ## Add-on credits (purchased capacity)
 * Vendors can proactively buy extra capacity for a specific resource via
 * POST /vendors/:id/addons/checkout. Purchased units are stored in
 * `vendor_addon_credits` and consumed (in FIFO order) after the base quota is
 * exhausted but before automatic pay-as-you-go overage kicks in. This gives
 * vendors a predictable-cost buffer before open-ended per-unit billing starts.
 *
 * ## Pay-as-you-go overage (paid plans only)
 * When a paid-tier vendor exhausts both included credits AND add-on credits,
 * usage continues but is recorded in `vendor_overage_charges` at the published
 * overage rate for that resource (admin-editable via billing.overageRates site-
 * content block). For vendors with a Stripe customer ID, a Stripe InvoiceItem
 * is created immediately and collected on the next invoice. For
 * Paystack/PayPal vendors the overage accumulates in the DB for manual or
 * end-of-period settlement by the admin.
 *
 * Free-tier vendors are hard-blocked when they hit their quota — they have no
 * payment method on file for overage collection unless they have active add-on
 * credits.
 *
 * ## Consumption order
 *   1. Base plan quota (resource_usage table, per billing period)
 *   2. Active add-on credits (vendor_addon_credits, FIFO by created_at)
 *   3. Auto-overage billing (paid plans only)
 *   4. Hard block (free plans with no add-on credits remaining)
 *
 * ## Billing period
 * Derived locally from `vendors.currentPeriodStart` — a rolling 30-day window
 * anchored to that timestamp, advanced automatically each full period. The
 * anchor resets only on real tier-change events (upgrade, downgrade,
 * cancellation) so it stays aligned with real subscription lifecycle events.
 */
import { and, eq, gt, sql, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  resourceUsageTable,
  vendorOverageChargesTable,
  vendorAddonCreditsTable,
  vendorsTable,
  type Vendor,
} from "@workspace/db/schema";
import { getSubscriptionPlan, type SubscriptionPlanQuotas } from "./subscription-plans";
import { resolveGatewayField, callWithPlatformStripe } from "./platform-gateways";
import { logger } from "./logger";
import { getSiteContentBlock } from "./site-content";

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
 * Fallback pay-as-you-go rates (USD per unit) — used when the admin has not
 * yet saved a billing.overageRates site-content block. The live rates are
 * admin-editable via the Site Editor and read via `getOverageRates()`.
 */
export const DEFAULT_OVERAGE_RATES: Record<ResourceKey, number> = {
  aiImages:      0.50,   // platform cost ≈ $0.19
  aiVideos:      1.00,   // platform cost ≈ $0.30
  aiCaptions:    0.05,   // platform cost ≈ $0.01
  voiceMinutes:  0.15,   // platform cost ≈ $0.06
  sms:           0.05,   // platform cost ≈ $0.01
  email:         0.01,   // platform cost ≈ $0.001
};

// Back-compat alias — callers that imported the hardcoded constant still work.
export const OVERAGE_RATES = DEFAULT_OVERAGE_RATES;

/** Returns admin-configured overage rates, falling back to defaults. */
export async function getOverageRates(): Promise<Record<ResourceKey, number>> {
  const block = (await getSiteContentBlock("billing.overageRates")) as Record<ResourceKey, number>;
  return block ?? DEFAULT_OVERAGE_RATES;
}

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

/**
 * Returns the effective subscription tier for a vendor, accounting for:
 *  1. Admin-assigned feature trials (featureTrialTier + featureTrialExpiresAt) —
 *     these take precedence and may elevate to any tier (starter/pro/enterprise).
 *  2. Legacy Stripe-trial flag (trialEndsAt) — free vendor with an active Stripe
 *     trial is treated as "starter".
 * The higher of the vendor's paid tier and any active trial tier is returned.
 */
export function getEffectiveTier(
  vendor: Pick<Vendor, "subscriptionTier" | "trialEndsAt" | "featureTrialTier" | "featureTrialExpiresAt">,
): string {
  const TIER_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };

  // Admin-granted feature trial — takes precedence over billing tier.
  if (
    vendor.featureTrialTier &&
    vendor.featureTrialExpiresAt instanceof Date &&
    vendor.featureTrialExpiresAt > new Date()
  ) {
    const trialRank = TIER_RANK[vendor.featureTrialTier] ?? 0;
    const subRank   = TIER_RANK[vendor.subscriptionTier] ?? 0;
    return trialRank > subRank ? vendor.featureTrialTier : vendor.subscriptionTier;
  }

  // Legacy Stripe-trial: free vendor on a paid trial is treated as starter.
  if (
    vendor.subscriptionTier === "free" &&
    vendor.trialEndsAt instanceof Date &&
    vendor.trialEndsAt > new Date()
  ) {
    return "starter";
  }

  return vendor.subscriptionTier;
}

/** Returns true when the vendor is on a paid plan (overage billing is possible). */
function isPaidTier(
  vendor: Pick<Vendor, "subscriptionTier" | "trialEndsAt" | "featureTrialTier" | "featureTrialExpiresAt">,
): boolean {
  return getEffectiveTier(vendor) !== "free";
}

/** Resolves the quota bundle for whatever tier the vendor is currently on. */
export async function getVendorQuotas(
  vendor: Pick<Vendor, "subscriptionTier" | "trialEndsAt" | "featureTrialTier" | "featureTrialExpiresAt">,
): Promise<SubscriptionPlanQuotas> {
  const effective = getEffectiveTier(vendor);
  if (effective === "free") return FREE_TIER_QUOTAS;
  const plan = await getSubscriptionPlan(effective);
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

/**
 * Returns the total remaining add-on credits for a vendor+resource.
 * Add-on credits are consumed in FIFO order within `consumeQuota`.
 */
export async function getAddonCreditsRemaining(vendorId: number, resource: ResourceKey): Promise<number> {
  const rows = await db
    .select({ unitsRemaining: vendorAddonCreditsTable.unitsRemaining })
    .from(vendorAddonCreditsTable)
    .where(and(
      eq(vendorAddonCreditsTable.vendorId, vendorId),
      eq(vendorAddonCreditsTable.resource, resource),
      eq(vendorAddonCreditsTable.status, "active"),
      gt(vendorAddonCreditsTable.unitsRemaining, "0"),
    ));
  return rows.reduce((sum, r) => sum + Number(r.unitsRemaining), 0);
}

/**
 * Atomically deducts `amount` from a vendor's active add-on credits (FIFO).
 * Returns an allocation array recording exactly which rows were decremented and
 * by how much, so the caller can pass it back to releaseQuota for precise
 * restoration on failure/cancellation.
 * Must be called inside a transaction with an advisory lock held.
 */
async function consumeAddonCreditsTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  vendorId: number,
  resource: ResourceKey,
  amount: number,
): Promise<AddonAllocation[]> {
  if (amount <= 0) return [];

  const rows = await tx
    .select({
      id: vendorAddonCreditsTable.id,
      unitsRemaining: vendorAddonCreditsTable.unitsRemaining,
    })
    .from(vendorAddonCreditsTable)
    .where(and(
      eq(vendorAddonCreditsTable.vendorId, vendorId),
      eq(vendorAddonCreditsTable.resource, resource),
      eq(vendorAddonCreditsTable.status, "active"),
      gt(vendorAddonCreditsTable.unitsRemaining, "0"),
    ))
    .orderBy(asc(vendorAddonCreditsTable.createdAt));

  const allocations: AddonAllocation[] = [];
  let remaining = amount;

  for (const row of rows) {
    if (remaining <= 0) break;
    const available = Number(row.unitsRemaining);
    const toConsume = Math.min(available, remaining);
    const newRemaining = available - toConsume;
    await tx
      .update(vendorAddonCreditsTable)
      .set({
        unitsRemaining: newRemaining.toString(),
        status: newRemaining <= 0 ? "exhausted" : "active",
        updatedAt: new Date(),
      })
      .where(eq(vendorAddonCreditsTable.id, row.id));
    allocations.push({ id: row.id, amount: toConsume });
    remaining -= toConsume;
  }

  return allocations;
}

/** Per-credit-bundle deduction recorded during a single consumeQuota call. */
export interface AddonAllocation {
  /** Primary key of the vendor_addon_credits row that was decremented. */
  id: number;
  /** Units taken from this row in this call. */
  amount: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  isOverage: boolean;       // true = allowed via pay-as-you-go, not from included credits or addon credits
  isAddon: boolean;         // true = consumed from purchased add-on credits
  resource: ResourceKey;
  used: number;
  quota: number;
  remaining: number;        // remaining included credits (0 when in overage or addon)
  addonRemaining: number;   // remaining add-on credit units after this call
  /** Exact per-row deductions made from vendor_addon_credits in this call.
   *  Pass back to releaseQuota so refunds restore the right rows precisely. */
  addonAllocations: ReadonlyArray<AddonAllocation>;
  overageUnits: number;     // units charged as overage this request (0 for normal usage or addon)
  overageUsd: number;       // USD cost of overage this request
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Read-only quota check — does NOT record any usage or consume addon credits.
 * Safe for pre-flight checks like "can this vendor even start a campaign?"
 * For gates that must actually record usage use `consumeQuota` instead.
 */
export async function checkQuota(vendor: Vendor, resource: ResourceKey, amount: number): Promise<QuotaCheckResult> {
  // Hard block: payment card failed — all metered resources suspended until invoice is paid.
  if (vendor.billingBlocked) {
    const periodStart = getBillingPeriodStart(vendor);
    const periodEnd   = getBillingPeriodEnd(periodStart);
    return { allowed: false, isOverage: false, isAddon: false, resource, used: 0, quota: 0, remaining: 0, addonRemaining: 0, addonAllocations: [], overageUnits: 0, overageUsd: 0, periodStart, periodEnd };
  }

  const quotas = await getVendorQuotas(vendor);
  const quota = quotas[resource];
  const periodStart = getBillingPeriodStart(vendor);
  const used = await getUsedAmount(vendor.id, resource, periodStart);
  const remaining = Math.max(quota - used, 0);
  const addonRemaining = await getAddonCreditsRemaining(vendor.id, resource);

  const rates = await getOverageRates();
  const rate = rates[resource];

  const periodEnd = getBillingPeriodEnd(periodStart);
  // checkQuota never mutates — addonAllocations is always empty here
  const noAllocations: ReadonlyArray<AddonAllocation> = [];

  // Can be fulfilled from base quota
  if (remaining >= amount) {
    return { allowed: true, isOverage: false, isAddon: false, resource, used, quota, remaining, addonRemaining, addonAllocations: noAllocations, overageUnits: 0, overageUsd: 0, periodStart, periodEnd };
  }

  // Partially or fully fulfillable from add-on credits
  const neededFromAddon = amount - remaining;
  if (addonRemaining >= neededFromAddon) {
    return { allowed: true, isOverage: false, isAddon: true, resource, used, quota, remaining, addonRemaining, addonAllocations: noAllocations, overageUnits: 0, overageUsd: 0, periodStart, periodEnd };
  }

  // Paid plan can go into overage — only the portion not covered by base or add-ons is overage
  if (isPaidTier(vendor)) {
    const overageUnits = amount - remaining - addonRemaining; // remaining + addonRemaining < amount here
    return { allowed: true, isOverage: true, isAddon: addonRemaining > 0, resource, used, quota, remaining, addonRemaining, addonAllocations: noAllocations, overageUnits, overageUsd: overageUnits * rate, periodStart, periodEnd };
  }

  // Free plan, no addon credits left — blocked
  return { allowed: false, isOverage: false, isAddon: false, resource, used, quota, remaining, addonRemaining, addonAllocations: noAllocations, overageUnits: 0, overageUsd: 0, periodStart, periodEnd };
}

/** Human-readable message for a hard block (free-tier vendors who hit quota). */
export function quotaExceededMessage(vendor: Pick<Vendor, "subscriptionTier" | "trialEndsAt" | "featureTrialTier" | "featureTrialExpiresAt">, result: QuotaCheckResult): string {
  const effective = getEffectiveTier(vendor);
  const tierLabel = effective === "free" ? "Free" : effective;
  return `You've used ${result.used} of ${result.quota} ${RESOURCE_LABEL[result.resource]} included in your ${tierLabel} plan this period. Upgrade your plan or purchase add-on capacity to continue.`;
}

/** Human-readable message for overage (paid-tier vendors charged beyond quota). */
export function quotaOverageMessage(result: QuotaCheckResult): string {
  return `You've used all included ${RESOURCE_LABEL[result.resource]} for this period. This usage will be billed at the pay-as-you-go overage rate.`;
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
  const rates = await getOverageRates();
  const rate = rates[resource];
  const totalUsd = amount * rate;

  let stripeInvoiceItemId: string | undefined;
  if (vendor.stripeCustomerId && vendor.stripeSubscriptionId) {
    try {
      const hasStripeKey = !!(await resolveGatewayField("stripe", "secretKey") || await resolveGatewayField("stripe", "fallbackSecretKey"));
      if (hasStripeKey) {
        const stripeCustomerId = vendor.stripeCustomerId as string;
        const invoiceItem = await callWithPlatformStripe((stripe) => stripe.invoiceItems.create({
          customer: stripeCustomerId,
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
 * who have exhausted their included credits, add-on credits are consumed first;
 * only if add-on credits are also exhausted does usage continue as overage.
 * Free-tier vendors without add-on credits are hard-blocked.
 *
 * Returns `allowed: true` in the normal (quota available), add-on credit, and
 * overage cases. Check `result.isAddon` and `result.isOverage` to know which.
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
  // Hard block: payment card failed — all metered resources suspended until invoice is paid.
  if (vendor.billingBlocked) {
    const periodStart = getBillingPeriodStart(vendor);
    const periodEnd   = getBillingPeriodEnd(periodStart);
    return { allowed: false, isOverage: false, isAddon: false, resource, used: 0, quota: 0, remaining: 0, addonRemaining: 0, addonAllocations: [], overageUnits: 0, overageUsd: 0, periodStart, periodEnd };
  }

  const quotas = await getVendorQuotas(vendor);
  const quota = quotas[resource];
  const periodStart = getBillingPeriodStart(vendor);
  const periodEnd = getBillingPeriodEnd(periodStart);
  const lockKey = `resource_usage:${vendor.id}:${resource}:${periodStart.toISOString()}`;

  // Key for serializing add-on credit mutations, period-independent.
  // Must be held by BOTH consume and release paths to prevent cross-period
  // races corrupting vendor_addon_credits row balances.
  const addonLockKey = `addon_credits:${vendor.id}:${resource}`;

  const result = await tx.transaction(async (inner) => {
    // Acquire BOTH locks inside one transaction so they are released atomically.
    // Period lock guards resource_usage; addon lock guards vendor_addon_credits.
    await inner.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    await inner.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${addonLockKey}))`);

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

    if (remaining >= amount) {
      // Normal credit consumption — stays within included quota
      await inner
        .insert(resourceUsageTable)
        .values({ vendorId: vendor.id, resource, periodStart, used: amount.toString() })
        .onConflictDoUpdate({
          target: [resourceUsageTable.vendorId, resourceUsageTable.resource, resourceUsageTable.periodStart],
          set: { used: sql`${resourceUsageTable.used} + ${amount}`, updatedAt: new Date() },
        });
      // Read addon credits for display purposes only — no addon was consumed
      const addonRemaining = await getAddonCreditsRemaining(vendor.id, resource);
      return {
        allowed: true, isOverage: false, isAddon: false,
        resource, used: used + amount, quota, remaining: remaining - amount,
        addonRemaining, addonAllocations: [] as AddonAllocation[],
        overageUnits: 0, overageUsd: 0, periodStart, periodEnd,
      };
    }

    // Base quota exhausted — compute how much is still needed
    const fromBase = remaining; // units that base quota can still cover (may be 0)
    const stillNeeded = amount - fromBase;

    // Read total available add-on credits BEFORE writing anything.
    // We must decide allow/block before making any mutations so that no paid
    // credits are lost when a request is going to be denied.
    const addonRows = await inner
      .select({
        id: vendorAddonCreditsTable.id,
        unitsRemaining: vendorAddonCreditsTable.unitsRemaining,
      })
      .from(vendorAddonCreditsTable)
      .where(and(
        eq(vendorAddonCreditsTable.vendorId, vendor.id),
        eq(vendorAddonCreditsTable.resource, resource),
        eq(vendorAddonCreditsTable.status, "active"),
        gt(vendorAddonCreditsTable.unitsRemaining, "0"),
      ))
      .orderBy(asc(vendorAddonCreditsTable.createdAt));

    const addonTotal = addonRows.reduce((s, r) => s + Number(r.unitsRemaining), 0);

    // Decide allow/block BEFORE any writes
    const addonCanCover = addonTotal >= stillNeeded;
    const paidCanOverage = isPaidTier(vendor);

    if (!addonCanCover && !paidCanOverage) {
      // Free plan with insufficient credits — hard block, no mutations at all
      return {
        allowed: false, isOverage: false, isAddon: false,
        resource, used, quota, remaining: 0,
        addonRemaining: addonTotal, addonAllocations: [] as AddonAllocation[],
        overageUnits: 0, overageUsd: 0, periodStart, periodEnd,
      };
    }

    // From here we know the request WILL be allowed — safe to write.

    // 1. Consume remaining base quota
    if (fromBase > 0) {
      await inner
        .insert(resourceUsageTable)
        .values({ vendorId: vendor.id, resource, periodStart, used: fromBase.toString() })
        .onConflictDoUpdate({
          target: [resourceUsageTable.vendorId, resourceUsageTable.resource, resourceUsageTable.periodStart],
          set: { used: sql`${resourceUsageTable.used} + ${fromBase}`, updatedAt: new Date() },
        });
    }

    // 2. Consume add-on credits (FIFO, up to stillNeeded).
    //    consumeAddonCreditsTx returns the exact per-row deductions so releaseQuota
    //    can restore precisely the same rows on failure/cancellation.
    const toConsumeFromAddon = Math.min(addonTotal, stillNeeded);
    let addonAllocations: AddonAllocation[] = [];
    if (toConsumeFromAddon > 0) {
      addonAllocations = await consumeAddonCreditsTx(
        inner as Parameters<Parameters<typeof db.transaction>[0]>[0],
        vendor.id,
        resource,
        toConsumeFromAddon,
      );
    }
    const addonConsumed = addonAllocations.reduce((s, a) => s + a.amount, 0);

    // Re-read remaining addon credits for the response
    const addonRemaining = Math.max(addonTotal - addonConsumed, 0);

    if (addonConsumed >= stillNeeded) {
      // Fully satisfied by base + add-on credits — no overage
      return {
        allowed: true, isOverage: false, isAddon: true,
        resource, used: used + fromBase, quota, remaining: 0,
        addonRemaining, addonAllocations,
        overageUnits: 0, overageUsd: 0, periodStart, periodEnd,
      };
    }

    // 3. Paid plan — remainder goes to overage
    const overageUnits = stillNeeded - addonConsumed;
    return {
      allowed: true, isOverage: true, isAddon: addonConsumed > 0,
      resource, used: used + fromBase, quota, remaining: 0,
      addonRemaining, addonAllocations,
      overageUnits, overageUsd: 0, // filled in below after reading rates (outside TX)
      periodStart, periodEnd,
    };
  });

  // Record overage outside the main TX (fire-and-forget; Stripe call can't be in a PG tx)
  if (result.isOverage && result.overageUnits > 0) {
    const rates = await getOverageRates();
    const overageUsd = result.overageUnits * rates[resource];
    (result as QuotaCheckResult).overageUsd = overageUsd;

    recordOverageCharge(vendor, resource, result.overageUnits, result.periodStart).catch((err) => {
      logger.error({ err, vendorId: vendor.id, resource }, "[overage] Failed to record overage charge");
    });
  }

  return result as QuotaCheckResult;
}

/**
 * Refunds `amount` of previously-consumed quota. Same advisory-lock pattern
 * as `consumeQuota` so a release racing a concurrent consume can't corrupt
 * the count.
 *
 * When the original consumption drew from add-on credits, pass the
 * `addonAllocations` array from the QuotaCheckResult so that those exact
 * credit rows are restored. For partial refunds (e.g. voice reservation
 * partially settled), addon credits are restored first (up to the total
 * originally allocated), then the remainder comes from base quota.
 */
export async function releaseQuota(
  vendorId: number,
  resource: ResourceKey,
  amount: number,
  periodStart: Date,
  executorOrAllocations?: Pick<typeof db, "transaction"> | ReadonlyArray<AddonAllocation>,
  legacyExecutor?: Pick<typeof db, "transaction">,
): Promise<void> {
  if (amount <= 0) return;

  // Overload resolution: accept the old 5-arg signature (executor only) and a
  // new 6-arg signature (allocations + executor).  Detect by checking whether
  // the 5th argument is an array.
  let addonAllocations: ReadonlyArray<AddonAllocation> = [];
  let executor: Pick<typeof db, "transaction"> = db;

  if (Array.isArray(executorOrAllocations)) {
    addonAllocations = executorOrAllocations as ReadonlyArray<AddonAllocation>;
    executor = legacyExecutor ?? db;
  } else if (executorOrAllocations != null) {
    executor = executorOrAllocations as Pick<typeof db, "transaction">;
  }

  const lockKey = `resource_usage:${vendorId}:${resource}:${periodStart.toISOString()}`;
  // Same addon lock as in consumeQuotaTx — period-independent, so a
  // cross-period voice refund cannot race a concurrent new consumption on the
  // same vendor_addon_credits rows.
  const addonLockKey = `addon_credits:${vendorId}:${resource}`;
  await executor.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    if (addonAllocations.length > 0) {
      // Only acquire the addon lock when we actually need to touch addon rows.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${addonLockKey}))`);
    }

    // Restore add-on credits first — they were consumed last (after base quota),
    // so a partial release should unwind the "top" of the stack first.
    // For each allocation record, restore min(releaseLeft, allocated) units.
    let releaseLeft = amount;
    for (const alloc of addonAllocations) {
      if (releaseLeft <= 0) break;
      const toRestore = Math.min(releaseLeft, alloc.amount);
      if (toRestore <= 0) continue;
      await tx
        .update(vendorAddonCreditsTable)
        .set({
          unitsRemaining: sql`${vendorAddonCreditsTable.unitsRemaining} + ${toRestore}`,
          // Re-activate an exhausted row that is receiving units back
          status: "active",
          updatedAt: new Date(),
        })
        .where(and(
          eq(vendorAddonCreditsTable.id, alloc.id),
          eq(vendorAddonCreditsTable.vendorId, vendorId),
        ));
      releaseLeft -= toRestore;
    }

    // Restore any remaining amount from base quota
    if (releaseLeft > 0) {
      await tx
        .update(resourceUsageTable)
        .set({ used: sql`GREATEST(${resourceUsageTable.used} - ${releaseLeft}, 0)`, updatedAt: new Date() })
        .where(and(
          eq(resourceUsageTable.vendorId, vendorId),
          eq(resourceUsageTable.resource, resource),
          eq(resourceUsageTable.periodStart, periodStart),
        ));
    }
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
  addonCredits: number;      // total active add-on credits remaining
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
  const rates = await getOverageRates();

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

    // Fetch total remaining add-on credits for this resource
    const addonCredits = await getAddonCreditsRemaining(vendor.id, resource);

    return {
      resource,
      label: RESOURCE_LABEL[resource],
      used,
      quota,
      remaining: Math.max(quota - used, 0),
      addonCredits,
      overageUnits,
      overageUsd,
      overageRate: rates[resource],
    };
  }));

  const totalOverageUsd = usage.reduce((sum, u) => sum + u.overageUsd, 0);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    tier: getEffectiveTier(vendor),
    overageEnabled: paid,
    totalOverageUsd,
    usage,
  };
}
