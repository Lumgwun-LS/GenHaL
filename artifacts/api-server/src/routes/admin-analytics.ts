/**
 * Admin-only cross-platform analytics: vendor ("user") signups and payments,
 * broken down by demographic dimensions (gender, country, state, city) over
 * a selectable period (week | month | year | custom date range).
 *
 * GET /admin/analytics/demographics?period=week|month|year|custom&from=&to=
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, vendorsTable, paymentsTable } from "@workspace/db";
import { and, gte, lte } from "drizzle-orm";
import { resolveDateRange } from "../lib/date-range";

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

  res.json({
    range: { from: from.toISOString(), to: to.toISOString(), period },
    totalUsers: vendorsInRange.length,
    totalRevenue: paidPayments.reduce((s, p) => s + parseFloat(p.amount), 0),
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
  });
});

export default router;
