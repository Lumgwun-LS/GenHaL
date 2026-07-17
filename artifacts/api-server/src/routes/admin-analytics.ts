/**
 * Admin-only cross-platform analytics: vendor ("user") signups and payments,
 * broken down by demographic dimensions (gender, country, state, city) over
 * a selectable period (week | month | year | custom date range).
 *
 * GET /admin/analytics/demographics?period=week|month|year|custom&from=&to=
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, vendorsTable, paymentsTable, salesTable, expensesTable, investmentsTable, pageViewsTable, storeDeveloperAccountsTable, adminExportLogsTable } from "@workspace/db";
import { and, gte, lte, sql } from "drizzle-orm";
import { resolveDateRange } from "../lib/date-range";
import { computeFinanceOverview } from "../lib/finance-overview";
import { getExportBurstStatus, checkExportBurst } from "../lib/admin-export-burst";

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

  const [allSales, allExpenses, allInvestments, allVendors] = await Promise.all([
    db.select().from(salesTable).where(and(gte(salesTable.saleDate, from), lte(salesTable.saleDate, to))),
    db.select().from(expensesTable).where(and(gte(expensesTable.expenseDate, from), lte(expensesTable.expenseDate, to))),
    db.select().from(investmentsTable),
    db.select().from(vendorsTable),
  ]);

  const overview = computeFinanceOverview(allSales, allExpenses, allInvestments, from, to);
  const vendorNameById = new Map(allVendors.map((v) => [v.id, v.name]));
  const vendorIds = Array.from(new Set<number>([...allSales.map((s) => s.vendorId), ...allExpenses.map((e) => e.vendorId), ...allInvestments.map((i) => i.vendorId)]));

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
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
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
    filters: JSON.stringify({ type: "finance-rollup", period: req.query.period, from: from.toISOString(), to: to.toISOString() }),
    rowCount: totalRows,
  });

  await checkExportBurst(userId);
});

export default router;
