import { Router, type IRouter } from "express";
import { desc, and, gte, lte, eq as eqOp } from "drizzle-orm";
import { db, vendorsTable, ordersTable, leadsTable, postsTable, productsTable, emailCampaignsTable, orderItemsTable, paymentsTable, salesTable, expensesTable, investmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { resolveDateRange } from "../lib/date-range";
import { computeFinanceOverview } from "../lib/finance-overview";
import {
  GetAnalyticsOverviewQueryParams,
  GetSalesAnalyticsQueryParams,
  GetSocialAnalyticsQueryParams,
  GetAnalyticsOverviewResponse,
  GetSalesAnalyticsResponse,
  GetSocialAnalyticsResponse,
  GetFinanceOverviewAnalyticsResponse,
} from "@workspace/api-zod";

function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

const router: IRouter = Router();

router.get("/analytics/overview", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const admin = isAdmin(userId);
  const params = GetAnalyticsOverviewQueryParams.safeParse(req.query);
  const requestedVendorId = params.success ? params.data.vendorId ?? null : null;

  // Non-admins: resolve their own vendor and scope everything to it.
  let effectiveVendorId = requestedVendorId;
  if (!admin) {
    const [myVendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
    effectiveVendorId = myVendor?.id ?? null;
  }

  const [allVendors, allOrders, allLeads, allPosts, allProducts] = await Promise.all([
    admin ? db.select().from(vendorsTable) : Promise.resolve([]),
    db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)),
    db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt)),
    db.select().from(postsTable).orderBy(desc(postsTable.createdAt)),
    db.select().from(productsTable),
  ]);

  const orders = effectiveVendorId ? allOrders.filter((o) => o.vendorId === effectiveVendorId) : allOrders;
  const leads = effectiveVendorId ? allLeads.filter((l) => l.vendorId === effectiveVendorId) : allLeads;
  const posts = effectiveVendorId ? allPosts.filter((p) => p.vendorId === effectiveVendorId) : allPosts;
  const products = effectiveVendorId ? allProducts.filter((p) => p.vendorId === effectiveVendorId) : allProducts;

  const totalRevenue = orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + parseFloat(o.totalAmount), 0);
  const pendingOrders = orders.filter((o) => o.status === "pending").length;
  const lowStockAlerts = products.filter((p) => p.stockQuantity <= p.lowStockThreshold).length;

  const recentActivity = [
    ...orders.slice(0, 3).map((o) => ({
      type: "order",
      description: `New order from ${o.customerName} — $${parseFloat(o.totalAmount).toFixed(2)}`,
      timestamp: o.createdAt.toISOString(),
    })),
    ...leads.slice(0, 2).map((l) => ({
      type: "lead",
      description: `New lead: ${l.name}${l.company ? ` at ${l.company}` : ""}`,
      timestamp: l.createdAt.toISOString(),
    })),
    ...posts.slice(0, 2).map((p) => ({
      type: "post",
      description: `Post ${p.status}: ${p.caption.slice(0, 50)}...`,
      timestamp: p.createdAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);

  res.json(GetAnalyticsOverviewResponse.parse({
    totalVendors: allVendors.length,
    totalRevenue,
    totalOrders: orders.length,
    totalLeads: leads.length,
    totalPosts: posts.length,
    pendingOrders,
    lowStockAlerts,
    recentActivity,
  }));
});

router.get("/analytics/sales", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const admin = isAdmin(userId);
  const params = GetSalesAnalyticsQueryParams.safeParse(req.query);
  const requestedVendorId = params.success ? params.data.vendorId ?? null : null;

  // Non-admins always see only their own vendor's data.
  let effectiveVendorId = requestedVendorId;
  if (!admin) {
    const [myVendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
    effectiveVendorId = myVendor?.id ?? null;
  }

  let orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
  if (effectiveVendorId) {
    orders = orders.filter((o) => o.vendorId === effectiveVendorId);
  }

  // Revenue by day (last 30 days)
  const dayMap: Record<string, { revenue: number; orders: number }> = {};
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  for (const o of orders.filter((o) => new Date(o.createdAt) > thirtyDaysAgo)) {
    const day = o.createdAt.toISOString().split("T")[0]!;
    if (!dayMap[day]) dayMap[day] = { revenue: 0, orders: 0 };
    if (o.status !== "cancelled") dayMap[day]!.revenue += parseFloat(o.totalAmount);
    dayMap[day]!.orders++;
  }
  const revenueByDay = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { revenue, orders }]) => ({ date, revenue, orders }));

  // Revenue by vendor
  const vendorMap: Record<number, { vendorName: string; revenue: number }> = {};
  const vendors = await db.select().from(vendorsTable);
  for (const v of vendors) vendorMap[v.id] = { vendorName: v.name, revenue: 0 };
  for (const o of orders.filter(o => o.status !== "cancelled")) {
    if (vendorMap[o.vendorId]) vendorMap[o.vendorId]!.revenue += parseFloat(o.totalAmount);
  }
  // Cross-vendor breakdown is admin-only.
  const revenueByVendor = admin
    ? Object.entries(vendorMap)
        .map(([vendorId, { vendorName, revenue }]) => ({ vendorId: parseInt(vendorId), vendorName, revenue }))
        .filter((v) => v.revenue > 0)
    : [];

  // Top products (simulated since we'd need joins)
  const allItems = await db.select().from(orderItemsTable);
  const productMap: Record<string, { name: string; revenue: number; unitsSold: number }> = {};
  for (const item of allItems) {
    const key = `${item.productId}`;
    if (!productMap[key]) productMap[key] = { name: item.productName, revenue: 0, unitsSold: 0 };
    productMap[key]!.revenue += parseFloat(item.totalPrice);
    productMap[key]!.unitsSold += item.quantity;
  }
  const topProducts = Object.entries(productMap)
    .map(([productId, { name, revenue, unitsSold }]) => ({ productId: parseInt(productId), name, revenue, unitsSold }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const totalOrders = orders.length;
  const completedOrders = orders.filter((o) => o.status === "completed").length;
  const conversionRate = totalOrders > 0 ? completedOrders / totalOrders : 0;

  res.json(GetSalesAnalyticsResponse.parse({ revenueByDay, topProducts, revenueByVendor, conversionRate }));
});

router.get("/analytics/social", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const admin = isAdmin(userId);
  const params = GetSocialAnalyticsQueryParams.safeParse(req.query);
  const requestedVendorId = params.success ? params.data.vendorId ?? null : null;

  // Non-admins always see only their own vendor's posts.
  let effectiveVendorId = requestedVendorId;
  if (!admin) {
    const [myVendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
    effectiveVendorId = myVendor?.id ?? null;
  }

  let posts = await db.select().from(postsTable).orderBy(desc(postsTable.createdAt));
  if (effectiveVendorId) {
    posts = posts.filter((p) => p.vendorId === effectiveVendorId);
  }

  const platformMap: Record<string, number> = {};
  const statusMap: Record<string, number> = {};
  for (const post of posts) {
    for (const platform of post.platforms) {
      platformMap[platform] = (platformMap[platform] ?? 0) + 1;
    }
    statusMap[post.status] = (statusMap[post.status] ?? 0) + 1;
  }
  const postsByPlatform = Object.entries(platformMap).map(([platform, count]) => ({ platform, count }));
  const postsByStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));
  const recentPosts = posts.slice(0, 5).map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
  }));

  res.json(GetSocialAnalyticsResponse.parse({ postsByPlatform, postsByStatus, recentPosts, totalEngagement: 0 }));
});

/**
 * GET /analytics/vendor-performance?vendorId=&period=week|month|year|custom&from=&to=
 * Own-store performance for a single vendor over a selectable period —
 * revenue, orders, and distinct customers, bucketed by day.
 */
router.get("/analytics/vendor-performance", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendorId = Number(req.query.vendorId);
  if (isNaN(vendorId)) { res.status(400).json({ error: "vendorId is required" }); return; }

  const [vendor] = await db.select().from(vendorsTable).where(eqOp(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (vendor.clerkUserId !== userId && !isAdmin(userId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { from, to, period } = resolveDateRange(req.query as { period?: string; from?: string; to?: string });

  const [orders, payments] = await Promise.all([
    db.select().from(ordersTable).where(and(eqOp(ordersTable.vendorId, vendorId), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to))),
    db.select().from(paymentsTable).where(and(eqOp(paymentsTable.vendorId, vendorId), gte(paymentsTable.createdAt, from), lte(paymentsTable.createdAt, to))),
  ]);

  const paidPayments = payments.filter((p) => p.status === "paid");
  const revenueByDay: Record<string, number> = {};
  for (const p of paidPayments) {
    const key = p.createdAt.toISOString().split("T")[0]!;
    revenueByDay[key] = (revenueByDay[key] ?? 0) + parseFloat(p.amount);
  }
  const ordersByDay: Record<string, number> = {};
  for (const o of orders) {
    const key = o.createdAt.toISOString().split("T")[0]!;
    ordersByDay[key] = (ordersByDay[key] ?? 0) + 1;
  }

  const uniqueCustomers = new Set(orders.map((o) => o.customerEmail)).size;
  const totalRevenue = paidPayments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const completedOrders = orders.filter((o) => o.status === "completed").length;

  res.json({
    range: { from: from.toISOString(), to: to.toISOString(), period },
    totalRevenue,
    totalOrders: orders.length,
    completedOrders,
    uniqueCustomers,
    averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
    revenueOverTime: Object.entries(revenueByDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount })),
    ordersOverTime: Object.entries(ordersByDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
  });
});

/**
 * GET /analytics/finance-overview?vendorId=&period=week|month|year|custom&from=&to=
 * Combines the sales ledger, expenses, and investments into the 5 requested
 * views: revenue trend, profit & loss, expense breakdown by category,
 * investment ROI, and a simple linear-trend cash-flow forecast.
 */
router.get("/analytics/finance-overview", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendorId = Number(req.query.vendorId);
  if (isNaN(vendorId)) { res.status(400).json({ error: "vendorId is required" }); return; }

  const [vendor] = await db.select().from(vendorsTable).where(eqOp(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (vendor.clerkUserId !== userId && !isAdmin(userId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { from, to, period } = resolveDateRange(req.query as { period?: string; from?: string; to?: string });

  const [sales, expenses, investments] = await Promise.all([
    db.select().from(salesTable).where(and(eqOp(salesTable.vendorId, vendorId), gte(salesTable.saleDate, from), lte(salesTable.saleDate, to))),
    db.select().from(expensesTable).where(and(eqOp(expensesTable.vendorId, vendorId), gte(expensesTable.expenseDate, from), lte(expensesTable.expenseDate, to))),
    db.select().from(investmentsTable).where(eqOp(investmentsTable.vendorId, vendorId)),
  ]);

  const overview = computeFinanceOverview(sales, expenses, investments, from, to);

  res.json(GetFinanceOverviewAnalyticsResponse.parse({
    range: { from: from.toISOString(), to: to.toISOString(), period },
    ...overview,
  }));
});

export default router;
