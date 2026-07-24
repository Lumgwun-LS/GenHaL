/**
 * Infrastructure Billing — admin panel endpoints.
 *
 * GET /admin/infrastructure-billing/overview
 *   Returns Replit's published rate card, our 5× customer rates, and
 *   estimated platform costs for the current calendar month.
 *
 * GET /admin/infrastructure-billing/vendor-bills?month=YYYY-MM
 *   Returns per-vendor resource consumption and the calculated bill we
 *   should charge them (5× of our underlying cost for those resources).
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  db,
  vendorsTable,
  resourceUsageTable,
  vendorOverageChargesTable,
  paymentsTable,
  vendorUploadsTable,
  aiGenerationsTable,
} from "@workspace/db";
import { and, gte, lte, eq, sql, desc } from "drizzle-orm";

function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

// ── Replit published infrastructure rates (2025) ─────────────────────────────
export const REPLIT_RATES = {
  // Managed VM compute (our API Server runs on Standard, web on Nano)
  reservedVmStandardPerMonth:  13.00,  // 1 vCPU / 2 GiB RAM
  reservedVmNanoPerMonth:       7.00,  // 0.5 vCPU / 1 GiB RAM
  autoscaleGibHour:             0.0576, // $0.000016/GiB·s × 3 600
  // Networking & storage
  egressPerGib:                 0.10,
  objectStoragePerGibMonth:     0.023,
  postgresPerGibMonth:          0.022,
  // Workspace plan (Replit Core)
  coreWorkspacePerMonth:        25.00,
};

// ── External API costs per resource unit (what we actually pay providers) ─────
export const PROVIDER_COST_PER_UNIT: Record<string, number> = {
  aiImages:      0.04,    // OpenAI DALL-E 3 @ 1 024×1 024
  aiVideos:      0.20,    // ElevenLabs music + ffmpeg compute
  aiCaptions:    0.002,   // GPT-4o-mini (~1 000 tokens)
  voiceMinutes:  0.018,   // Twilio outbound $0.013 + ElevenLabs TTS $0.005
  sms:           0.0075,  // Twilio SMS outbound
  email:         0.0001,  // SMTP / Brevo (own credentials)
};

const MARKUP = 5; // 500% = 5×

// Our rates charged to vendors = provider cost × 5
export const OUR_RATES_PER_UNIT: Record<string, number> = Object.fromEntries(
  Object.entries(PROVIDER_COST_PER_UNIT).map(([k, v]) => [k, +(v * MARKUP).toFixed(4)])
);

// Infra rates also marked up
export const OUR_INFRA_RATES = {
  objectStoragePerGibMonth: +(REPLIT_RATES.objectStoragePerGibMonth * MARKUP).toFixed(4),
  egressPerGib:             +(REPLIT_RATES.egressPerGib             * MARKUP).toFixed(4),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthBounds(month: string | undefined): { start: Date; end: Date; label: string } {
  const now = new Date();
  const [year, mon] = month
    ? [parseInt(month.split("-")[0]!), parseInt(month.split("-")[1]!)]
    : [now.getFullYear(), now.getMonth() + 1];
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end   = new Date(Date.UTC(year, mon,     1)); // exclusive
  const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { start, end, label };
}

// Rough size estimate per media type (bytes)
const AVG_SIZE: Record<string, number> = {
  image:   500_000,   // ~500 KB
  video: 15_000_000,  // ~15 MB
};

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/infrastructure-billing/overview
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/infrastructure-billing/overview", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId)        { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const { start, end, label } = monthBounds(req.query.month as string | undefined);

  // ── Count vendors ──────────────────────────────────────────────────────────
  const [vendorRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(vendorsTable);
  const totalVendors = vendorRow?.total ?? 0;

  const [activeRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vendorsTable)
    .where(sql`${vendorsTable.subscriptionTier} != 'free'`);
  const paidVendors = activeRow?.count ?? 0;

  // ── Object-storage estimate ────────────────────────────────────────────────
  // Count non-deleted AI generations by type
  const aiGenRows = await db
    .select({
      type:  aiGenerationsTable.type,
      count: sql<number>`count(*)::int`,
    })
    .from(aiGenerationsTable)
    .where(sql`${aiGenerationsTable.mediaDeletedAt} is null`)
    .groupBy(aiGenerationsTable.type);

  const [uploadsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vendorUploadsTable)
    .where(sql`${vendorUploadsTable.mediaDeletedAt} is null`);
  const uploadCount = uploadsRow?.count ?? 0;

  let storageBytes = 0;
  for (const r of aiGenRows) {
    const size = r.type === "video" ? AVG_SIZE.video : AVG_SIZE.image;
    storageBytes += size * r.count;
  }
  storageBytes += uploadCount * AVG_SIZE.image; // uploads are mostly images

  const storageGib = storageBytes / (1024 ** 3);

  // ── Resource usage this month across all vendors ───────────────────────────
  const usageRows = await db
    .select({
      resource: resourceUsageTable.resource,
      total:    sql<number>`coalesce(sum(${resourceUsageTable.used}),0)::float`,
    })
    .from(resourceUsageTable)
    .where(
      and(
        gte(resourceUsageTable.periodStart, start),
        lte(resourceUsageTable.periodStart, end),
      )
    )
    .groupBy(resourceUsageTable.resource);

  const usageByResource: Record<string, number> = {};
  for (const r of usageRows) usageByResource[r.resource] = r.total;

  // ── External API cost this month ───────────────────────────────────────────
  let externalApiCost = 0;
  for (const [resource, costPerUnit] of Object.entries(PROVIDER_COST_PER_UNIT)) {
    externalApiCost += (usageByResource[resource] ?? 0) * costPerUnit;
  }

  // ── Fixed infrastructure costs (this month) ───────────────────────────────
  // API Server Standard + vendor-hub Nano + Replit Core workspace
  const fixedVmCost     = REPLIT_RATES.reservedVmStandardPerMonth + REPLIT_RATES.reservedVmNanoPerMonth;
  const workspaceCost   = REPLIT_RATES.coreWorkspacePerMonth;
  const dbStorageCost   = 0.5 * REPLIT_RATES.postgresPerGibMonth; // ~0.5 GiB estimated
  const objStorageCost  = storageGib * REPLIT_RATES.objectStoragePerGibMonth;

  // Egress: rough estimate from API usage volume (avg 5 KB per resource unit served)
  const totalResourceUnits = Object.values(usageByResource).reduce((s, v) => s + v, 0);
  const egressGib = (totalResourceUnits * 5_000) / (1024 ** 3);
  const egressCost = egressGib * REPLIT_RATES.egressPerGib;

  const totalReplitCost = fixedVmCost + workspaceCost + dbStorageCost + objStorageCost + egressCost + externalApiCost;

  // ── Overage charges collected this month ──────────────────────────────────
  const [overageRow] = await db
    .select({ total: sql<number>`coalesce(sum(${vendorOverageChargesTable.totalUsd}),0)::float` })
    .from(vendorOverageChargesTable)
    .where(
      and(
        gte(vendorOverageChargesTable.periodStart, start),
        lte(vendorOverageChargesTable.periodStart, end),
      )
    );
  const overageCollected = overageRow?.total ?? 0;

  // ── Subscription revenue this month ───────────────────────────────────────
  const [subRow] = await db
    .select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)::float` })
    .from(paymentsTable)
    .where(
      and(
        gte(paymentsTable.createdAt, start),
        lte(paymentsTable.createdAt, end),
        eq(paymentsTable.status, "paid"),
      )
    );
  const subscriptionRevenue = subRow?.total ?? 0;

  res.json({
    period: { start: start.toISOString(), end: end.toISOString(), label },
    totalVendors,
    paidVendors,
    replitRates: REPLIT_RATES,
    providerCosts: PROVIDER_COST_PER_UNIT,
    ourRatesPerUnit: OUR_RATES_PER_UNIT,
    ourInfraRates: OUR_INFRA_RATES,
    markup: MARKUP,
    estimatedReplitCosts: {
      fixedVm:     +fixedVmCost.toFixed(2),
      workspace:   +workspaceCost.toFixed(2),
      database:    +dbStorageCost.toFixed(4),
      objectStorage: +objStorageCost.toFixed(4),
      egress:      +egressCost.toFixed(4),
      externalApis: +externalApiCost.toFixed(4),
      total:       +totalReplitCost.toFixed(2),
    },
    platformUsage: {
      storageGib:          +storageGib.toFixed(4),
      egressGib:           +egressGib.toFixed(4),
      aiGenerationsByType: Object.fromEntries(aiGenRows.map(r => [r.type, r.count])),
      uploadsCount:        uploadCount,
      usageByResource,
    },
    revenue: {
      subscriptions:    +subscriptionRevenue.toFixed(2),
      overage:          +overageCollected.toFixed(2),
      total:            +(subscriptionRevenue + overageCollected).toFixed(2),
    },
    projectedBillableRevenue: +(totalReplitCost * MARKUP).toFixed(2),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/infrastructure-billing/vendor-bills?month=YYYY-MM
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/infrastructure-billing/vendor-bills", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId)        { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const { start, end, label } = monthBounds(req.query.month as string | undefined);

  // All vendors
  const vendors = await db
    .select({
      id:               vendorsTable.id,
      businessName:     vendorsTable.name,
      subscriptionTier: vendorsTable.subscriptionTier,
      currentPeriodStart: vendorsTable.currentPeriodStart,
    })
    .from(vendorsTable)
    .orderBy(vendorsTable.name);

  // Resource usage this month, grouped by vendor + resource
  const usageRows = await db
    .select({
      vendorId: resourceUsageTable.vendorId,
      resource: resourceUsageTable.resource,
      used:     sql<number>`coalesce(sum(${resourceUsageTable.used}),0)::float`,
    })
    .from(resourceUsageTable)
    .where(
      and(
        gte(resourceUsageTable.periodStart, start),
        lte(resourceUsageTable.periodStart, end),
      )
    )
    .groupBy(resourceUsageTable.vendorId, resourceUsageTable.resource);

  // Overage charges collected per vendor
  const overageRows = await db
    .select({
      vendorId: vendorOverageChargesTable.vendorId,
      total:    sql<number>`coalesce(sum(${vendorOverageChargesTable.totalUsd}),0)::float`,
    })
    .from(vendorOverageChargesTable)
    .where(
      and(
        gte(vendorOverageChargesTable.periodStart, start),
        lte(vendorOverageChargesTable.periodStart, end),
      )
    )
    .groupBy(vendorOverageChargesTable.vendorId);

  // Payments collected per vendor
  const paymentRows = await db
    .select({
      vendorId: paymentsTable.vendorId,
      total:    sql<number>`coalesce(sum(${paymentsTable.amount}),0)::float`,
    })
    .from(paymentsTable)
    .where(
      and(
        gte(paymentsTable.createdAt, start),
        lte(paymentsTable.createdAt, end),
        eq(paymentsTable.status, "paid"),
      )
    )
    .groupBy(paymentsTable.vendorId);

  // Build lookup maps
  const usageMap: Record<number, Record<string, number>> = {};
  for (const r of usageRows) {
    if (!usageMap[r.vendorId]) usageMap[r.vendorId] = {};
    usageMap[r.vendorId]![r.resource] = r.used;
  }
  const overageMap: Record<number, number> = {};
  for (const r of overageRows) overageMap[r.vendorId] = r.total;
  const paymentMap: Record<number, number> = {};
  for (const r of paymentRows) paymentMap[r.vendorId] = r.total;

  // Compose per-vendor bill
  const bills = vendors.map((v) => {
    const usage = usageMap[v.id] ?? {};

    // Cost at our provider rates (what it costs US to serve them)
    let ourCostToServe = 0;
    for (const [resource, costPerUnit] of Object.entries(PROVIDER_COST_PER_UNIT)) {
      ourCostToServe += (usage[resource] ?? 0) * costPerUnit;
    }

    // What we bill them (5× our cost)
    let billableAmount = 0;
    const lineItems: Record<string, { units: number; unitRate: number; subtotal: number }> = {};
    for (const [resource, ratePerUnit] of Object.entries(OUR_RATES_PER_UNIT)) {
      const units = usage[resource] ?? 0;
      if (units > 0) {
        const subtotal = +(units * ratePerUnit).toFixed(4);
        lineItems[resource] = { units: +units.toFixed(4), unitRate: ratePerUnit, subtotal };
        billableAmount += subtotal;
      }
    }
    billableAmount = +billableAmount.toFixed(2);

    const subscriptionRevenue = paymentMap[v.id] ?? 0;
    const overageRevenue      = overageMap[v.id]  ?? 0;
    const totalRevenue        = +(subscriptionRevenue + overageRevenue).toFixed(2);
    const netMargin           = +(totalRevenue - ourCostToServe).toFixed(2);
    const marginPct           = ourCostToServe > 0
      ? +((netMargin / ourCostToServe) * 100).toFixed(1)
      : totalRevenue > 0 ? 100 : 0;

    return {
      vendorId:         v.id,
      businessName:     v.businessName,
      tier:             v.subscriptionTier,
      usage,
      lineItems,
      ourCostToServe:   +ourCostToServe.toFixed(4),
      billableAmount,
      subscriptionRevenue: +subscriptionRevenue.toFixed(2),
      overageRevenue:   +overageRevenue.toFixed(2),
      totalRevenue,
      netMargin,
      marginPct,
    };
  });

  res.json({ period: { start: start.toISOString(), end: end.toISOString(), label }, bills });
});

export default router;
