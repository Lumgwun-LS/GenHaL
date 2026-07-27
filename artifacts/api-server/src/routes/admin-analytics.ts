/**
 * Admin-only cross-platform analytics: vendor ("user") signups and payments,
 * broken down by demographic dimensions (gender, country, state, city) over
 * a selectable period (week | month | year | custom date range).
 *
 * GET /admin/analytics/demographics?period=week|month|year|custom&from=&to=
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, vendorsTable, paymentsTable, salesTable, expensesTable, investmentsTable, pageViewsTable, storeDeveloperAccountsTable, adminExportLogsTable, vendorOverageChargesTable, resourceUsageTable, aiGenerationsTable, vendorUploadsTable } from "@workspace/db";
import { and, gte, lte, sql, eq, isNotNull } from "drizzle-orm";
import { resolveDateRange } from "../lib/date-range";
import { computeFinanceOverview } from "../lib/finance-overview";
import { getExportBurstStatus, checkExportBurst } from "../lib/admin-export-burst";
import { getSiteContentBlock } from "../lib/site-content";

function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

const router = Router();

function bucketCount<T>(items: T[], keyFn: (item: T) => string | null | undefined): { key: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item) || "Unknown";
    map[key] = (map[key] ?? 0) + 1;
  }
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function bucketSum<T>(items: T[], keyFn: (item: T) => string | null | undefined, amountFn: (item: T) => number): { key: string; total: number; count: number }[] {
  const map: Record<string, { total: number; count: number }> = {};
  for (const item of items) {
    const key = keyFn(item) || "Unknown";
    if (!map[key]) map[key] = { total: 0, count: 0 };
    map[key]!.total += amountFn(item);
    map[key]!.count += 1;
  }
  return Object.entries(map)
    .map(([key, { total, count }]) => ({ key, total, count }))
    .sort((a, b) => b.total - a.total);
}

function dayKey(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

router.get("/admin/analytics/demographics", async (req, res): Promise<void> => {
  try {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const { from, to, period } = resolveDateRange(req.query as { period?: string; from?: string; to?: string });

  const [vendorsInRange, paidPaymentsInRange] = await Promise.all([
    db.select().from(vendorsTable).where(and(gte(vendorsTable.createdAt, from), lte(vendorsTable.createdAt, to))),
    db.select().from(paymentsTable).where(and(gte(paymentsTable.createdAt, from), lte(paymentsTable.createdAt, to))),
  ]);

  const paidPayments = paidPaymentsInRange.filter((p) => p.status === "paid");

  // Join payments to their vendor's demographic fields (payments themselves carry no demographics).
  const allVendors = await db.select().from(vendorsTable);
  const vendorById = new Map(allVendors.map((v) => [v.id, v]));
  const paymentsWithVendor = paidPayments.map((p) => ({ payment: p, vendor: vendorById.get(p.vendorId) ?? null }));

  const usersByGender = bucketCount(vendorsInRange, (v) => v.gender);
  const usersByCountry = bucketCount(vendorsInRange, (v) => v.country);
  const usersByState = bucketCount(vendorsInRange, (v) => v.state);
  const usersByCity = bucketCount(vendorsInRange, (v) => v.city);

  const paymentsByGender = bucketSum(paymentsWithVendor, (x) => x.vendor?.gender, (x) => parseFloat(x.payment.amount));
  const paymentsByCountry = bucketSum(paymentsWithVendor, (x) => x.vendor?.country, (x) => parseFloat(x.payment.amount));
  const paymentsByState = bucketSum(paymentsWithVendor, (x) => x.vendor?.state, (x) => parseFloat(x.payment.amount));
  const paymentsByCity = bucketSum(paymentsWithVendor, (x) => x.vendor?.city, (x) => parseFloat(x.payment.amount));

  // Signups + revenue over time, bucketed by day within the range.
  const signupsByDay: Record<string, number> = {};
  for (const v of vendorsInRange) {
    const key = dayKey(new Date(v.createdAt));
    signupsByDay[key] = (signupsByDay[key] ?? 0) + 1;
  }
  const revenueByDay: Record<string, number> = {};
  for (const p of paidPayments) {
    const key = dayKey(new Date(p.createdAt));
    revenueByDay[key] = (revenueByDay[key] ?? 0) + parseFloat(p.amount);
  }

  // App Store developer signups in range
  const developerSignupsInRange = await db
    .select()
    .from(storeDeveloperAccountsTable)
    .where(and(gte(storeDeveloperAccountsTable.createdAt, from), lte(storeDeveloperAccountsTable.createdAt, to)));

  // Visitor (page-view) stats in range
  const pageViewRows = await db
    .select()
    .from(pageViewsTable)
    .where(and(gte(pageViewsTable.createdAt, from), lte(pageViewsTable.createdAt, to)));

  const totalPageViews = pageViewRows.length;
  const uniqueSessions = new Set(pageViewRows.map((r) => r.sessionId).filter(Boolean)).size;
  const pageViewsByPlatform = bucketCount(pageViewRows, (r) => r.platform);
  const pageViewsByDay: Record<string, number> = {};
  const uniqueSessionsByDay: Record<string, Set<string>> = {};
  for (const r of pageViewRows) {
    const key = dayKey(new Date(r.createdAt));
    pageViewsByDay[key] = (pageViewsByDay[key] ?? 0) + 1;
    if (r.sessionId) {
      if (!uniqueSessionsByDay[key]) uniqueSessionsByDay[key] = new Set();
      uniqueSessionsByDay[key]!.add(r.sessionId);
    }
  }

  res.json({
    range: { from: from.toISOString(), to: to.toISOString(), period },
    totalUsers: vendorsInRange.length,
    totalDeveloperSignups: developerSignupsInRange.length,
    totalRevenue: paidPayments.reduce((s, p) => s + parseFloat(p.amount), 0),
    totalPageViews,
    uniqueSessions,
    pageViewsByPlatform,
    usersByGender,
    usersByCountry,
    usersByState,
    usersByCity,
    paymentsByGender,
    paymentsByCountry,
    paymentsByState,
    paymentsByCity,
    signupsOverTime: Object.entries(signupsByDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    revenueOverTime: Object.entries(revenueByDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount })),
    visitorsOverTime: Object.entries(pageViewsByDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, views]) => ({
      date,
      views,
      uniqueSessions: uniqueSessionsByDay[date]?.size ?? 0,
    })),
  });
  } catch (err) {
    console.error("GET /admin/analytics/demographics error:", err);
    res.status(500).json({ error: "Failed to load demographics analytics" });
  }
});

/**
 * GET /admin/analytics/finance-rollup?period=week|month|year|custom&from=&to=&breakdown=true
 *
 * Company-wide rollup of the same 5 finance views exposed per-vendor by
 * GET /analytics/finance-overview (revenue trend, P&L, expense breakdown,
 * investment ROI, cash-flow forecast), aggregated across every vendor.
 * Reuses computeFinanceOverview so the two endpoints never drift apart.
 * Pass breakdown=true to also include a per-vendor summary table.
 */
router.get("/admin/analytics/finance-rollup", async (req, res): Promise<void> => {
  try {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const { from, to, period } = resolveDateRange(req.query as { period?: string; from?: string; to?: string });
  const includeBreakdown = req.query.breakdown === "true";

  const [allSales, allExpenses, allInvestments, allVendors] = await Promise.all([
    db.select().from(salesTable).where(and(gte(salesTable.saleDate, from), lte(salesTable.saleDate, to))),
    db.select().from(expensesTable).where(and(gte(expensesTable.expenseDate, from), lte(expensesTable.expenseDate, to))),
    db.select().from(investmentsTable),
    db.select().from(vendorsTable),
  ]);

  const overview = computeFinanceOverview(allSales, allExpenses, allInvestments, from, to);

  let byVendor: {
    vendorId: number;
    vendorName: string;
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    totalInvested: number;
    totalCurrentValue: number;
    overallRoiPercent: number;
  }[] | undefined;

  if (includeBreakdown) {
    const vendorNameById = new Map(allVendors.map((v) => [v.id, v.name]));
    const vendorIds = new Set<number>([...allSales.map((s) => s.vendorId), ...allExpenses.map((e) => e.vendorId), ...allInvestments.map((i) => i.vendorId)]);
    byVendor = Array.from(vendorIds)
      .map((vendorId) => {
        const vendorOverview = computeFinanceOverview(
          allSales.filter((s) => s.vendorId === vendorId),
          allExpenses.filter((e) => e.vendorId === vendorId),
          allInvestments.filter((i) => i.vendorId === vendorId),
          from,
          to,
        );
        return {
          vendorId,
          vendorName: vendorNameById.get(vendorId) ?? "Unknown vendor",
          totalRevenue: vendorOverview.profitAndLoss.totalRevenue,
          totalExpenses: vendorOverview.profitAndLoss.totalExpenses,
          netProfit: vendorOverview.profitAndLoss.netProfit,
          totalInvested: vendorOverview.investmentRoi.totalInvested,
          totalCurrentValue: vendorOverview.investmentRoi.totalCurrentValue,
          overallRoiPercent: vendorOverview.investmentRoi.overallRoiPercent,
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  res.json({
    range: { from: from.toISOString(), to: to.toISOString(), period },
    ...overview,
    ...(byVendor ? { byVendor } : {}),
  });
  } catch (err) {
    console.error("GET /admin/analytics/finance-rollup error:", err);
    res.status(500).json({ error: "Failed to load finance rollup" });
  }
});

/**
 * GET /admin/analytics/finance-rollup/export?period=week|month|year|custom&from=&to=
 *
 * Downloads the finance rollup as a CSV. Always includes aggregate totals
 * (one header row + one summary row) plus a per-vendor breakdown section.
 * Reuses the same export-logging and burst-alert infrastructure as the
 * vendor-list export so all admin data downloads count toward the same
 * rate-limit window.
 */
router.get("/admin/analytics/finance-rollup/export", async (req, res): Promise<void> => {
  try {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const burstStatus = await getExportBurstStatus(userId);
  if (burstStatus.blocked) {
    res.status(429).json({
      error:
        "Exports from this account are paused after unusually frequent downloads. Ask another admin to review and clear the flag in the Admin Panel's Export History before exporting again.",
      count: burstStatus.count,
      threshold: burstStatus.threshold,
      windowMinutes: burstStatus.windowMinutes,
    });
    return;
  }

  const { from, to, period } = resolveDateRange(req.query as { period?: string; from?: string; to?: string });
  const filterTier = typeof req.query.tier === "string" && req.query.tier ? req.query.tier : null;
  const filterIndustry = typeof req.query.industry === "string" && req.query.industry ? req.query.industry.trim().toLowerCase() : null;

  const [allSales, allExpenses, allInvestments, allVendors] = await Promise.all([
    db.select().from(salesTable).where(and(gte(salesTable.saleDate, from), lte(salesTable.saleDate, to))),
    db.select().from(expensesTable).where(and(gte(expensesTable.expenseDate, from), lte(expensesTable.expenseDate, to))),
    db.select().from(investmentsTable),
    db.select().from(vendorsTable),
  ]);

  // Apply tier / industry filters to the vendor set so both the per-vendor
  // breakdown and the aggregate totals reflect the same filtered cohort.
  const filteredVendors = allVendors.filter((v) => {
    if (filterTier && v.subscriptionTier !== filterTier) return false;
    if (filterIndustry && (v.industry ?? "").toLowerCase() !== filterIndustry) return false;
    return true;
  });
  const filteredVendorIds = new Set(filteredVendors.map((v) => v.id));

  const filteredSales = allSales.filter((s) => filteredVendorIds.has(s.vendorId));
  const filteredExpenses = allExpenses.filter((e) => filteredVendorIds.has(e.vendorId));
  const filteredInvestments = allInvestments.filter((i) => filteredVendorIds.has(i.vendorId));

  const overview = computeFinanceOverview(filteredSales, filteredExpenses, filteredInvestments, from, to);
  const vendorNameById = new Map(allVendors.map((v) => [v.id, v.name]));
  const vendorIds = Array.from(new Set<number>([...filteredSales.map((s) => s.vendorId), ...filteredExpenses.map((e) => e.vendorId), ...filteredInvestments.map((i) => i.vendorId)]));

  const byVendor = vendorIds.map((vendorId) => {
    const vendorOverview = computeFinanceOverview(
      allSales.filter((s) => s.vendorId === vendorId),
      allExpenses.filter((e) => e.vendorId === vendorId),
      allInvestments.filter((i) => i.vendorId === vendorId),
      from,
      to,
    );
    return {
      vendorId,
      vendorName: vendorNameById.get(vendorId) ?? "Unknown vendor",
      totalRevenue: vendorOverview.profitAndLoss.totalRevenue,
      totalExpenses: vendorOverview.profitAndLoss.totalExpenses,
      netProfit: vendorOverview.profitAndLoss.netProfit,
      totalInvested: vendorOverview.investmentRoi.totalInvested,
      totalCurrentValue: vendorOverview.investmentRoi.totalCurrentValue,
      overallRoiPercent: vendorOverview.investmentRoi.overallRoiPercent,
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);

  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    // Prevent CSV formula injection: prefix formula-starting chars with a single quote
    const safe = /^[=+\-@|\t]/.test(s) ? `'${s}` : s;
    if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  }

  const rangeLabel = `${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}`;
  const filename = `finance-rollup-${rangeLabel}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  // ── Section 1: Platform aggregate totals ────────────────────────────────
  res.write("# Platform Aggregate Totals\r\n");
  res.write("Period From,Period To,Total Revenue,Total Expenses,Net Profit,Total Invested,Total Current Value,Overall ROI %\r\n");
  res.write([
    from.toISOString().slice(0, 10),
    to.toISOString().slice(0, 10),
    overview.profitAndLoss.totalRevenue.toFixed(2),
    overview.profitAndLoss.totalExpenses.toFixed(2),
    overview.profitAndLoss.netProfit.toFixed(2),
    overview.investmentRoi.totalInvested.toFixed(2),
    overview.investmentRoi.totalCurrentValue.toFixed(2),
    overview.investmentRoi.overallRoiPercent.toFixed(2),
  ].map(csvCell).join(",") + "\r\n");

  // ── Section 2: Per-vendor breakdown ─────────────────────────────────────
  res.write("\r\n# Per-Vendor Breakdown\r\n");
  res.write("Vendor ID,Vendor Name,Total Revenue,Total Expenses,Net Profit,Total Invested,Total Current Value,Overall ROI %\r\n");

  for (const v of byVendor) {
    res.write([
      v.vendorId,
      v.vendorName,
      v.totalRevenue.toFixed(2),
      v.totalExpenses.toFixed(2),
      v.netProfit.toFixed(2),
      v.totalInvested.toFixed(2),
      v.totalCurrentValue.toFixed(2),
      v.overallRoiPercent.toFixed(2),
    ].map(csvCell).join(",") + "\r\n");
  }

  // ── Section 3: Revenue trend ─────────────────────────────────────────────
  res.write("\r\n# Daily Revenue Trend\r\n");
  res.write("Date,Revenue\r\n");
  for (const row of overview.revenueTrend) {
    res.write([row.date, row.revenue.toFixed(2)].map(csvCell).join(",") + "\r\n");
  }

  // ── Section 4: Expense breakdown by category ─────────────────────────────
  res.write("\r\n# Expense Breakdown by Category\r\n");
  res.write("Category,Total\r\n");
  for (const row of overview.expenseByCategory) {
    res.write([row.category, row.total.toFixed(2)].map(csvCell).join(",") + "\r\n");
  }

  res.end();

  const totalRows = 1 + byVendor.length + overview.revenueTrend.length + overview.expenseByCategory.length;
  await db.insert(adminExportLogsTable).values({
    adminUserId: userId,
    filters: JSON.stringify({
      type: "finance-rollup",
      period: req.query.period,
      from: from.toISOString(),
      to: to.toISOString(),
      ...(filterTier ? { tier: filterTier } : {}),
      ...(filterIndustry ? { industry: filterIndustry } : {}),
    }),
    rowCount: totalRows,
  });

  await checkExportBurst(userId);
  } catch (err) {
    console.error("GET /admin/analytics/finance-rollup/export error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to export finance rollup" });
  }
});

/**
 * GET /admin/analytics/revenue-intelligence?period=week|month|year
 *
 * Platform-level revenue, cost, and profit breakdown for the admin.
 * Returns subscription revenue, overage revenue, gateway splits, country
 * splits, tier splits, daily trend, plus MRR/ARR estimates and net profit
 * after admin-configured operating costs (Replit + other).
 */
router.get("/admin/analytics/revenue-intelligence", async (req, res): Promise<void> => {
  try {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const { from, to, period } = resolveDateRange(req.query as { period?: string; from?: string; to?: string });

  const [payments, vendors, overageCharges, platformCostsRaw, plansRaw] = await Promise.all([
    db.select().from(paymentsTable).where(and(gte(paymentsTable.createdAt, from), lte(paymentsTable.createdAt, to))),
    db.select().from(vendorsTable),
    db.select().from(vendorOverageChargesTable).where(and(gte(vendorOverageChargesTable.createdAt, from), lte(vendorOverageChargesTable.createdAt, to))),
    getSiteContentBlock("admin.platformCosts"),
    getSiteContentBlock("billing.subscriptionPlans"),
  ]);

  const platformCosts = platformCostsRaw as { replitMonthlyCostUsd: number; otherMonthlyCostUsd: number; notes: string };
  const plans = (plansRaw as { plans: { tier: string; pricing: { usd: number; ngn: number }; name: string }[] }).plans ?? [];

  const planPriceByTier: Record<string, { usd: number; ngn: number }> = {};
  for (const p of plans) planPriceByTier[p.tier] = p.pricing;

  const paidPayments = payments.filter((p) => p.status === "paid");
  const vendorById = new Map(vendors.map((v) => [v.id, v]));

  // ── Revenue helpers ───────────────────────────────────────────────────────
  const totalSubscriptionRevenue = paidPayments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const totalOverageRevenue = overageCharges.reduce((s, o) => s + parseFloat(o.totalUsd), 0);
  const totalGrossRevenue = totalSubscriptionRevenue + totalOverageRevenue;

  // Operating costs: scale monthly cost to the selected period
  const msInRange = to.getTime() - from.getTime();
  const monthsInRange = msInRange / (1000 * 60 * 60 * 24 * 30.44);
  const totalCosts = (platformCosts.replitMonthlyCostUsd + platformCosts.otherMonthlyCostUsd) * monthsInRange;
  const netProfit = totalGrossRevenue - totalCosts;
  const profitMargin = totalGrossRevenue > 0 ? (netProfit / totalGrossRevenue) * 100 : 0;

  // ── MRR estimate from currently active subscriptions ─────────────────────
  const payingVendors = vendors.filter((v) => v.subscriptionTier !== "free");
  let mrrUsd = 0;
  for (const v of payingVendors) {
    const price = planPriceByTier[v.subscriptionTier];
    if (price) mrrUsd += price.usd;
  }
  const arrUsd = mrrUsd * 12;

  // ── Revenue by gateway ────────────────────────────────────────────────────
  const gatewayMap: Record<string, { revenue: number; count: number }> = {};
  for (const p of paidPayments) {
    const key = p.provider ?? "unknown";
    if (!gatewayMap[key]) gatewayMap[key] = { revenue: 0, count: 0 };
    gatewayMap[key]!.revenue += parseFloat(p.amount);
    gatewayMap[key]!.count += 1;
  }
  const byGateway = Object.entries(gatewayMap)
    .map(([gateway, { revenue, count }]) => ({ gateway, revenue, count }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Revenue by tier ───────────────────────────────────────────────────────
  const tierMap: Record<string, { revenue: number; count: number }> = {};
  for (const p of paidPayments) {
    const vendor = vendorById.get(p.vendorId);
    const tier = vendor?.subscriptionTier ?? "unknown";
    if (!tierMap[tier]) tierMap[tier] = { revenue: 0, count: 0 };
    tierMap[tier]!.revenue += parseFloat(p.amount);
    tierMap[tier]!.count += 1;
  }
  const byTier = Object.entries(tierMap)
    .map(([tier, { revenue, count }]) => ({
      tier,
      revenue,
      count,
      priceUsd: planPriceByTier[tier]?.usd ?? 0,
      priceNgn: planPriceByTier[tier]?.ngn ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Revenue by country ────────────────────────────────────────────────────
  const countryMap: Record<string, { revenue: number; count: number; vendors: number }> = {};
  for (const p of paidPayments) {
    const vendor = vendorById.get(p.vendorId);
    const country = vendor?.country ?? "Unknown";
    if (!countryMap[country]) countryMap[country] = { revenue: 0, count: 0, vendors: 0 };
    countryMap[country]!.revenue += parseFloat(p.amount);
    countryMap[country]!.count += 1;
  }
  // Add vendor counts per country
  for (const v of vendors) {
    const country = v.country ?? "Unknown";
    if (!countryMap[country]) countryMap[country] = { revenue: 0, count: 0, vendors: 0 };
    countryMap[country]!.vendors += 1;
  }
  const byCountry = Object.entries(countryMap)
    .map(([country, { revenue, count, vendors: vendorCount }]) => ({ country, revenue, count, vendorCount }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15);

  // ── Revenue by currency ───────────────────────────────────────────────────
  const currencyMap: Record<string, number> = {};
  for (const p of paidPayments) {
    const cur = (p.currency ?? "USD").toUpperCase();
    currencyMap[cur] = (currencyMap[cur] ?? 0) + parseFloat(p.amount);
  }
  const byCurrency = Object.entries(currencyMap)
    .map(([currency, revenue]) => ({ currency, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Daily revenue trend ───────────────────────────────────────────────────
  const trendMap: Record<string, number> = {};
  for (const p of paidPayments) {
    const key = dayKey(new Date(p.createdAt));
    trendMap[key] = (trendMap[key] ?? 0) + parseFloat(p.amount);
  }
  const trend = Object.entries(trendMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }));

  // ── Weekly / Monthly / Yearly rollup buckets ──────────────────────────────
  function weekKey(d: Date): string {
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    return monday.toISOString().split("T")[0]!;
  }
  function monthKeyFn(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function yearKey(d: Date): string {
    return String(d.getFullYear());
  }

  function rollup(keyFn: (d: Date) => string): { label: string; revenue: number }[] {
    const map: Record<string, number> = {};
    for (const p of paidPayments) {
      const k = keyFn(new Date(p.createdAt));
      map[k] = (map[k] ?? 0) + parseFloat(p.amount);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([label, revenue]) => ({ label, revenue }));
  }

  const weeklyTotals  = rollup(weekKey);
  const monthlyTotals = rollup(monthKeyFn);
  const yearlyTotals  = rollup(yearKey);

  // ── Tier distribution (all vendors, not just in range) ───────────────────
  const tierDistMap: Record<string, number> = {};
  for (const v of vendors) {
    const t = v.subscriptionTier ?? "free";
    tierDistMap[t] = (tierDistMap[t] ?? 0) + 1;
  }
  const tierDistribution = Object.entries(tierDistMap)
    .map(([tier, count]) => ({
      tier,
      count,
      priceUsd: planPriceByTier[tier]?.usd ?? 0,
      priceNgn: planPriceByTier[tier]?.ngn ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  res.json({
    range: { from: from.toISOString(), to: to.toISOString(), period },
    summary: {
      totalSubscriptionRevenue,
      totalOverageRevenue,
      totalGrossRevenue,
      totalCosts,
      netProfit,
      profitMarginPct: profitMargin,
      mrrUsd,
      arrUsd,
      totalVendors: vendors.length,
      payingVendors: payingVendors.length,
      freeVendors: vendors.filter((v) => v.subscriptionTier === "free").length,
      replitMonthlyCostUsd: platformCosts.replitMonthlyCostUsd,
      otherMonthlyCostUsd:  platformCosts.otherMonthlyCostUsd,
      platformCostNotes:    platformCosts.notes,
    },
    byGateway,
    byTier,
    byCountry,
    byCurrency,
    tierDistribution,
    trend,
    weeklyTotals,
    monthlyTotals,
    yearlyTotals,
    plans: plans.map((p) => ({ tier: p.tier, name: p.name, priceUsd: p.pricing.usd, priceNgn: p.pricing.ngn })),
  });
  } catch (err) {
    console.error("GET /admin/analytics/revenue-intelligence error:", err);
    res.status(500).json({ error: "Failed to load revenue intelligence" });
  }
});

/**
 * GET /admin/analytics/platform-financials
 *
 * Unified view of Replit/infrastructure charges vs platform revenue,
 * with full filter support: period, custom date range, country, resource type.
 *
 * Query params:
 *   period=week|month|year|custom  (default: month)
 *   from=YYYY-MM-DD               (when period=custom)
 *   to=YYYY-MM-DD                 (when period=custom)
 *   country=Nigeria               (optional – filter revenue by vendor country)
 *   resource=aiImages|aiVideos|... (optional – focus on one resource)
 */
router.get("/admin/analytics/platform-financials", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

    const { from, to, period } = resolveDateRange(req.query as { period?: string; from?: string; to?: string });
    const countryFilter = typeof req.query.country === "string" && req.query.country ? req.query.country : null;
    const resourceFilter = typeof req.query.resource === "string" && req.query.resource ? req.query.resource : null;

    // ── Provider cost rates (mirrors admin-infrastructure-billing.ts) ─────────
    const PROVIDER_COST_PER_UNIT: Record<string, number> = {
      aiImages:     0.04,
      aiVideos:     0.20,
      aiCaptions:   0.002,
      voiceMinutes: 0.018,
      sms:          0.0075,
      email:        0.0001,
    };
    const RESOURCE_LABELS: Record<string, string> = {
      aiImages: "AI Images", aiVideos: "AI Videos", aiCaptions: "AI Captions",
      voiceMinutes: "Voice Minutes", sms: "SMS", email: "Email",
    };
    // Fixed monthly infrastructure costs
    const FIXED_INFRA = {
      fixedVm:   20.00,   // Standard + Nano VMs
      workspace: 25.00,   // Replit Core
      database:  0.011,   // ~0.5 GiB PostgreSQL
    };
    const EGRESS_PER_GIB = 0.10;
    const STORAGE_PER_GIB = 0.023;
    // Scale fixed costs to selected period
    const msInRange = to.getTime() - from.getTime();
    const msPerMonth = 1000 * 60 * 60 * 24 * 30.44;
    const monthsInRange = msInRange / msPerMonth;

    // ── Parallel data fetch ───────────────────────────────────────────────────
    const [
      vendors,
      allPayments,
      overageCharges,
      usageRows,
      aiGenRows,
      uploadsRow,
      platformCostsRaw,
      plansRaw,
    ] = await Promise.all([
      db.select().from(vendorsTable),
      db.select().from(paymentsTable).where(and(gte(paymentsTable.createdAt, from), lte(paymentsTable.createdAt, to))),
      db.select().from(vendorOverageChargesTable).where(and(gte(vendorOverageChargesTable.createdAt, from), lte(vendorOverageChargesTable.createdAt, to))),
      db.select({
        resource: resourceUsageTable.resource,
        periodStart: resourceUsageTable.periodStart,
        vendorId: resourceUsageTable.vendorId,
        used: sql<number>`coalesce(sum(${resourceUsageTable.used}),0)::float`,
      }).from(resourceUsageTable)
        .where(and(gte(resourceUsageTable.periodStart, from), lte(resourceUsageTable.periodStart, to)))
        .groupBy(resourceUsageTable.resource, resourceUsageTable.periodStart, resourceUsageTable.vendorId),
      db.select({ type: aiGenerationsTable.type, count: sql<number>`count(*)::int` })
        .from(aiGenerationsTable)
        .where(sql`${aiGenerationsTable.mediaDeletedAt} is null`)
        .groupBy(aiGenerationsTable.type),
      db.select({ count: sql<number>`count(*)::int` }).from(vendorUploadsTable)
        .where(sql`${vendorUploadsTable.mediaDeletedAt} is null`),
      getSiteContentBlock("admin.platformCosts"),
      getSiteContentBlock("billing.subscriptionPlans"),
    ]);

    const platformCosts = platformCostsRaw as { replitMonthlyCostUsd?: number; otherMonthlyCostUsd?: number; notes?: string };
    const plans = ((plansRaw as { plans?: { tier: string; pricing: { usd: number; ngn: number } }[] })?.plans) ?? [];
    const planPriceByTier: Record<string, { usd: number }> = {};
    for (const p of plans) planPriceByTier[p.tier] = { usd: p.pricing.usd };

    const paidPayments = allPayments.filter(p => p.status === "paid");
    const vendorById = new Map(vendors.map(v => [v.id, v]));

    // Apply country filter to revenue calculations
    const filteredPayments = countryFilter
      ? paidPayments.filter(p => (vendorById.get(p.vendorId)?.country ?? "Unknown") === countryFilter)
      : paidPayments;

    // ── Revenue aggregation ───────────────────────────────────────────────────
    const totalSubscriptionRevenue = filteredPayments.reduce((s, p) => s + parseFloat(p.amount), 0);
    const totalOverageRevenue = overageCharges.reduce((s, o) => s + parseFloat(o.totalUsd), 0);
    const totalGrossRevenue = totalSubscriptionRevenue + totalOverageRevenue;

    // ── Resource cost aggregation ─────────────────────────────────────────────
    const resourceTotals: Record<string, { units: number; costUsd: number }> = {};
    for (const row of usageRows) {
      if (resourceFilter && row.resource !== resourceFilter) continue;
      const costPerUnit = PROVIDER_COST_PER_UNIT[row.resource] ?? 0;
      if (!resourceTotals[row.resource]) resourceTotals[row.resource] = { units: 0, costUsd: 0 };
      resourceTotals[row.resource]!.units += row.used;
      resourceTotals[row.resource]!.costUsd += row.used * costPerUnit;
    }

    const totalExternalApiCosts = Object.values(resourceTotals).reduce((s, r) => s + r.costUsd, 0);

    // Infra costs scaled to period
    const storageGib = aiGenRows.reduce((s, r) => s + (r.type === "video" ? 15 : 0.5) * r.count, 0) / 1024;
    const egressGib = Object.values(resourceTotals).reduce((s, r) => s + r.units, 0) * 5000 / (1024 ** 3);
    const objStorageCost = storageGib * STORAGE_PER_GIB;
    const egressCost = egressGib * EGRESS_PER_GIB;

    // Use admin-configured monthly cost if set, otherwise use our computed estimate
    const adminConfiguredCost = platformCosts.replitMonthlyCostUsd ?? 0;
    const computedFixedMonthly = FIXED_INFRA.fixedVm + FIXED_INFRA.workspace + FIXED_INFRA.database;
    const fixedCostForPeriod = (adminConfiguredCost > 0 ? adminConfiguredCost : computedFixedMonthly) * monthsInRange;
    const totalInfrastructureCosts = +(fixedCostForPeriod + objStorageCost + egressCost).toFixed(2);
    const totalCosts = +(totalInfrastructureCosts + totalExternalApiCosts).toFixed(2);

    const netProfit = +(totalGrossRevenue - totalCosts).toFixed(2);
    const profitMarginPct = totalGrossRevenue > 0 ? +((netProfit / totalGrossRevenue) * 100).toFixed(1) : 0;

    // ── MRR ───────────────────────────────────────────────────────────────────
    const payingVendors = vendors.filter(v => v.subscriptionTier !== "free");
    const mrrUsd = payingVendors.reduce((s, v) => s + (planPriceByTier[v.subscriptionTier]?.usd ?? 0), 0);

    // ── Resource cost detail rows ─────────────────────────────────────────────
    // Also compute per-resource overage revenue
    const overageByResource: Record<string, number> = {};
    for (const o of overageCharges) {
      overageByResource[o.resource] = (overageByResource[o.resource] ?? 0) + parseFloat(o.totalUsd);
    }
    const resourceCosts = Object.entries(PROVIDER_COST_PER_UNIT).map(([resource, costPerUnit]) => ({
      resource,
      label: RESOURCE_LABELS[resource] ?? resource,
      units: +(resourceTotals[resource]?.units ?? 0).toFixed(2),
      costUsd: +(resourceTotals[resource]?.costUsd ?? 0).toFixed(4),
      overageRevenueUsd: +(overageByResource[resource] ?? 0).toFixed(2),
      costPerUnit,
    }));

    // ── Revenue by country ────────────────────────────────────────────────────
    const countryMap: Record<string, { revenue: number; count: number; vendorCount: number }> = {};
    for (const p of filteredPayments) {
      const country = vendorById.get(p.vendorId)?.country ?? "Unknown";
      if (!countryMap[country]) countryMap[country] = { revenue: 0, count: 0, vendorCount: 0 };
      countryMap[country]!.revenue += parseFloat(p.amount);
      countryMap[country]!.count += 1;
    }
    for (const v of vendors) {
      const country = v.country ?? "Unknown";
      if (!countryMap[country]) countryMap[country] = { revenue: 0, count: 0, vendorCount: 0 };
      countryMap[country]!.vendorCount += 1;
    }
    const revenueByCountry = Object.entries(countryMap)
      .map(([country, d]) => ({ country, revenue: +d.revenue.toFixed(2), count: d.count, vendorCount: d.vendorCount }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);

    // ── Revenue by gateway ────────────────────────────────────────────────────
    const gatewayMap: Record<string, { revenue: number; count: number }> = {};
    for (const p of filteredPayments) {
      const key = p.provider ?? "unknown";
      if (!gatewayMap[key]) gatewayMap[key] = { revenue: 0, count: 0 };
      gatewayMap[key]!.revenue += parseFloat(p.amount);
      gatewayMap[key]!.count += 1;
    }
    const revenueByGateway = Object.entries(gatewayMap)
      .map(([gateway, d]) => ({ gateway, revenue: +d.revenue.toFixed(2), count: d.count }))
      .sort((a, b) => b.revenue - a.revenue);

    // ── Revenue by tier ───────────────────────────────────────────────────────
    const tierMap: Record<string, { revenue: number; count: number }> = {};
    for (const p of filteredPayments) {
      const tier = vendorById.get(p.vendorId)?.subscriptionTier ?? "unknown";
      if (!tierMap[tier]) tierMap[tier] = { revenue: 0, count: 0 };
      tierMap[tier]!.revenue += parseFloat(p.amount);
      tierMap[tier]!.count += 1;
    }
    const revenueByTier = Object.entries(tierMap)
      .map(([tier, d]) => ({ tier, revenue: +d.revenue.toFixed(2), count: d.count }))
      .sort((a, b) => b.revenue - a.revenue);

    // ── Time series (daily revenue + daily resource cost) ─────────────────────
    const dayKey = (d: Date) => d.toISOString().split("T")[0]!;
    const weekKey = (d: Date) => {
      const day = d.getDay();
      const mon = new Date(d); mon.setDate(d.getDate() - ((day + 6) % 7));
      return mon.toISOString().split("T")[0]!;
    };
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const yearKey = (d: Date) => String(d.getFullYear());

    // Daily revenue
    const dailyRevMap: Record<string, number> = {};
    for (const p of filteredPayments) {
      const k = dayKey(new Date(p.createdAt));
      dailyRevMap[k] = (dailyRevMap[k] ?? 0) + parseFloat(p.amount);
    }
    // Daily resource cost (from periodStart-bucketed usage)
    const dailyCostMap: Record<string, number> = {};
    for (const row of usageRows) {
      if (resourceFilter && row.resource !== resourceFilter) continue;
      const costPerUnit = PROVIDER_COST_PER_UNIT[row.resource] ?? 0;
      const k = dayKey(new Date(row.periodStart));
      dailyCostMap[k] = (dailyCostMap[k] ?? 0) + row.used * costPerUnit;
    }
    // Prorate daily fixed infra cost
    const totalDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
    const dailyFixedCost = fixedCostForPeriod / totalDays;

    // Build sorted set of all dates in range with data
    const allDates = new Set([...Object.keys(dailyRevMap), ...Object.keys(dailyCostMap)]);
    const timeSeries = Array.from(allDates)
      .sort()
      .map(date => ({
        date,
        revenue: +(dailyRevMap[date] ?? 0).toFixed(2),
        resourceCostUsd: +(dailyCostMap[date] ?? 0).toFixed(4),
        infraCostUsd: +dailyFixedCost.toFixed(4),
        totalCostUsd: +((dailyCostMap[date] ?? 0) + dailyFixedCost).toFixed(4),
      }));

    // ── Bucketed rollups ──────────────────────────────────────────────────────
    function rollup(keyFn: (d: Date) => string): { label: string; revenue: number; costUsd: number }[] {
      const map: Record<string, { rev: number; cost: number }> = {};
      for (const p of filteredPayments) {
        const k = keyFn(new Date(p.createdAt)); if (!map[k]) map[k] = { rev: 0, cost: 0 };
        map[k]!.rev += parseFloat(p.amount);
      }
      for (const row of usageRows) {
        if (resourceFilter && row.resource !== resourceFilter) continue;
        const k = keyFn(new Date(row.periodStart)); if (!map[k]) map[k] = { rev: 0, cost: 0 };
        map[k]!.cost += row.used * (PROVIDER_COST_PER_UNIT[row.resource] ?? 0);
      }
      return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
        .map(([label, { rev, cost }]) => ({ label, revenue: +rev.toFixed(2), costUsd: +cost.toFixed(4) }));
    }

    const weeklyTotals  = rollup(weekKey);
    const monthlyTotals = rollup(monthKey);
    const yearlyTotals  = rollup(yearKey);

    // ── Country list for filter dropdown ─────────────────────────────────────
    const allCountries = Array.from(new Set(vendors.map(v => v.country).filter(Boolean))).sort();

    res.json({
      range: { from: from.toISOString(), to: to.toISOString(), period },
      filters: { country: countryFilter, resource: resourceFilter },
      summary: {
        totalInfrastructureCosts: +totalInfrastructureCosts.toFixed(2),
        totalExternalApiCosts:    +totalExternalApiCosts.toFixed(2),
        totalCosts,
        totalSubscriptionRevenue: +totalSubscriptionRevenue.toFixed(2),
        totalOverageRevenue:      +totalOverageRevenue.toFixed(2),
        totalGrossRevenue:        +totalGrossRevenue.toFixed(2),
        netProfit,
        profitMarginPct,
        mrrUsd:        +mrrUsd.toFixed(2),
        arrUsd:        +(mrrUsd * 12).toFixed(2),
        totalVendors:  vendors.length,
        payingVendors: payingVendors.length,
        freeVendors:   vendors.length - payingVendors.length,
        replitInfraBreakdown: {
          fixedVm:      +(FIXED_INFRA.fixedVm * monthsInRange).toFixed(2),
          workspace:    +(FIXED_INFRA.workspace * monthsInRange).toFixed(2),
          database:     +(FIXED_INFRA.database * monthsInRange).toFixed(4),
          objectStorage: +objStorageCost.toFixed(4),
          egress:       +egressCost.toFixed(4),
        },
      },
      resourceCosts,
      revenueByCountry,
      revenueByGateway,
      revenueByTier,
      timeSeries,
      weeklyTotals,
      monthlyTotals,
      yearlyTotals,
      allCountries,
    });
  } catch (err) {
    console.error("GET /admin/analytics/platform-financials error:", err);
    res.status(500).json({ error: "Failed to load platform financials" });
  }
});

export default router;
