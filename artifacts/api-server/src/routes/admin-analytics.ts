/**
 * Admin-only cross-platform analytics: vendor ("user") signups and payments,
 * broken down by demographic dimensions (gender, country, state, city) over
 * a selectable period (week | month | year | custom date range).
 *
 * GET /admin/analytics/demographics?period=week|month|year|custom&from=&to=
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, vendorsTable, paymentsTable, salesTable, expensesTable, investmentsTable, pageViewsTable, storeDeveloperAccountsTable } from "@workspace/db";
import { and, gte, lte, sql } from "drizzle-orm";
import { resolveDateRange } from "../lib/date-range";
import { computeFinanceOverview } from "../lib/finance-overview";

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

export default router;
