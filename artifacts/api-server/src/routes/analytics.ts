import { Router, type IRouter } from "express";
import { desc, and, gte, lte, eq as eqOp } from "drizzle-orm";
import { db, vendorsTable, ordersTable, leadsTable, postsTable, productsTable, emailCampaignsTable, orderItemsTable, paymentsTable, salesTable, expensesTable, investmentsTable, businessSwotReportsTable } from "@workspace/db";
import type { SwotReportData, ScoreDimension } from "@workspace/db";
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

// ── Business Intelligence: helpers ────────────────────────────────────────────

interface BusinessSnapshot {
  vendorId: number;
  generatedAt: string;
  revenue30d: number;
  prevRevenue30d: number;
  revenueGrowthPct: number;
  expenses30d: number;
  expenseRatio: number;
  totalProducts: number;
  outOfStockProducts: number;
  lowStockProducts: number;
  healthyStockProducts: number;
  orders30d: number;
  completedOrders30d: number;
  pendingOrders30d: number;
  orderCompletionRate: number;
  avgOrderValue30d: number;
  payments30d: number;
  paidPayments30d: number;
  paymentSuccessRate: number;
  totalLeads30d: number;
  qualifiedLeads30d: number;
  leadConversionRate: number;
  publishedPosts30d: number;
  scheduledPosts30d: number;
  platformBreakdown: Record<string, number>;
  topExpenseCategories: Array<{ category: string; amount: number }>;
}

function computeHealthScore(s: BusinessSnapshot): { score: number; breakdown: Record<string, ScoreDimension> } {
  const breakdown: Record<string, ScoreDimension> = {};

  // Revenue growth (15 pts)
  const gPct = s.revenueGrowthPct;
  const revScore = gPct >= 30 ? 15 : gPct >= 10 ? 12 : gPct >= 0 ? 8 : Math.max(0, 8 + (gPct / 50) * 8);
  breakdown.revenueGrowth = { score: Math.round(revScore), max: 15, label: "Revenue Growth" };

  // Expense efficiency (20 pts)
  const eRatio = s.revenue30d > 0 ? s.expenses30d / s.revenue30d : 0.5;
  const expScore = eRatio <= 0.4 ? 20 : eRatio <= 0.55 ? 16 : eRatio <= 0.7 ? 10 : eRatio <= 0.85 ? 5 : 0;
  breakdown.expenseRatio = { score: expScore, max: 20, label: "Expense Efficiency" };

  // Inventory health (15 pts)
  const invScore = s.totalProducts > 0 ? (s.healthyStockProducts / s.totalProducts) * 15 : 7.5;
  breakdown.inventoryHealth = { score: Math.round(invScore), max: 15, label: "Inventory Health" };

  // Lead conversion (15 pts)
  const leadScore = s.totalLeads30d > 0 ? Math.min(1, s.qualifiedLeads30d / s.totalLeads30d) * 15 : 7.5;
  breakdown.leadConversion = { score: Math.round(leadScore), max: 15, label: "Lead Conversion" };

  // Payment success (15 pts)
  breakdown.paymentSuccess = { score: Math.round(s.paymentSuccessRate * 15), max: 15, label: "Payment Success" };

  // Social activity (10 pts)
  const posts = s.publishedPosts30d;
  const socialScore = posts >= 15 ? 10 : posts >= 8 ? 8 : posts >= 3 ? 5 : posts >= 1 ? 2 : 0;
  breakdown.socialActivity = { score: socialScore, max: 10, label: "Social Activity" };

  // Order completion (10 pts)
  breakdown.orderCompletion = { score: Math.round(s.orderCompletionRate * 10), max: 10, label: "Order Completion" };

  const total = Object.values(breakdown).reduce((sum, d) => sum + d.score, 0);
  return { score: Math.min(100, Math.max(0, total)), breakdown };
}

async function buildBusinessSnapshot(vendorId: number): Promise<BusinessSnapshot> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [sales30d, prevSales30d, expenses30d, products, orders30d, payments30d, leads30d, posts30d] =
    await Promise.all([
      db.select().from(salesTable).where(and(eq(salesTable.vendorId, vendorId), gte(salesTable.saleDate, thirtyDaysAgo))),
      db.select().from(salesTable).where(and(eq(salesTable.vendorId, vendorId), gte(salesTable.saleDate, sixtyDaysAgo), lte(salesTable.saleDate, thirtyDaysAgo))),
      db.select().from(expensesTable).where(and(eq(expensesTable.vendorId, vendorId), gte(expensesTable.expenseDate, thirtyDaysAgo))),
      db.select().from(productsTable).where(eq(productsTable.vendorId, vendorId)),
      db.select().from(ordersTable).where(and(eq(ordersTable.vendorId, vendorId), gte(ordersTable.createdAt, thirtyDaysAgo))),
      db.select().from(paymentsTable).where(and(eq(paymentsTable.vendorId, vendorId), gte(paymentsTable.createdAt, thirtyDaysAgo))),
      db.select().from(leadsTable).where(and(eq(leadsTable.vendorId, vendorId), gte(leadsTable.createdAt, thirtyDaysAgo))),
      db.select().from(postsTable).where(and(eq(postsTable.vendorId, vendorId), gte(postsTable.createdAt, thirtyDaysAgo))),
    ]);

  const revenue30d = sales30d.reduce((s, r) => s + parseFloat(r.amount), 0);
  const prevRevenue30d = prevSales30d.reduce((s, r) => s + parseFloat(r.amount), 0);
  const revenueGrowthPct = prevRevenue30d > 0 ? ((revenue30d - prevRevenue30d) / prevRevenue30d) * 100 : 0;
  const expenses30dTotal = expenses30d.reduce((s, e) => s + parseFloat(e.amount), 0);
  const expenseRatio = revenue30d > 0 ? expenses30dTotal / revenue30d : 0;

  const outOfStock = products.filter((p) => (p.stockQuantity ?? 0) <= 0).length;
  const lowStock = products.filter((p) => (p.stockQuantity ?? 0) > 0 && (p.stockQuantity ?? 0) <= (p.lowStockThreshold ?? 0)).length;
  const healthyStock = products.filter((p) => (p.stockQuantity ?? 0) > (p.lowStockThreshold ?? 0)).length;

  const completedOrders = orders30d.filter((o) => o.status === "completed" || o.status === "delivered").length;
  const pendingOrders = orders30d.filter((o) => o.status === "pending" || o.status === "processing").length;
  const orderCompletionRate = orders30d.length > 0 ? completedOrders / orders30d.length : 0;
  const avgOrderValue30d = orders30d.length > 0
    ? orders30d.reduce((s, o) => s + parseFloat(o.totalAmount as string), 0) / orders30d.length : 0;

  const paidPayments = payments30d.filter((p) => p.status === "paid" || p.status === "completed").length;
  const paymentSuccessRate = payments30d.length > 0 ? paidPayments / payments30d.length : 1;

  const qualifiedLeads = leads30d.filter((l) =>
    ["qualified", "converted", "closed_won", "active"].includes(l.status ?? "")
  ).length;
  const leadConversionRate = leads30d.length > 0 ? qualifiedLeads / leads30d.length : 0;

  const publishedPosts = posts30d.filter((p) => p.status === "published").length;
  const scheduledPosts = posts30d.filter((p) => p.status === "scheduled").length;
  const platformBreakdown: Record<string, number> = {};
  for (const post of posts30d) {
    for (const platform of (post.platforms ?? [])) {
      platformBreakdown[platform] = (platformBreakdown[platform] ?? 0) + 1;
    }
  }

  const categoryMap: Record<string, number> = {};
  for (const e of expenses30d) {
    categoryMap[e.category] = (categoryMap[e.category] ?? 0) + parseFloat(e.amount);
  }
  const topExpenseCategories = Object.entries(categoryMap)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  return {
    vendorId,
    generatedAt: now.toISOString(),
    revenue30d,
    prevRevenue30d,
    revenueGrowthPct,
    expenses30d: expenses30dTotal,
    expenseRatio,
    totalProducts: products.length,
    outOfStockProducts: outOfStock,
    lowStockProducts: lowStock,
    healthyStockProducts: healthyStock,
    orders30d: orders30d.length,
    completedOrders30d: completedOrders,
    pendingOrders30d: pendingOrders,
    orderCompletionRate,
    avgOrderValue30d,
    payments30d: payments30d.length,
    paidPayments30d: paidPayments,
    paymentSuccessRate,
    totalLeads30d: leads30d.length,
    qualifiedLeads30d: qualifiedLeads,
    leadConversionRate,
    publishedPosts30d: publishedPosts,
    scheduledPosts30d: scheduledPosts,
    platformBreakdown,
    topExpenseCategories,
  };
}

// GET /analytics/business-snapshot — aggregate last 30-day metrics + health score
router.get("/analytics/business-snapshot", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const [vendor] = await db
    .select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId));
  if (!vendor) return res.status(404).json({ error: "Vendor not found" });

  const snapshot = await buildBusinessSnapshot(vendor.id);
  const { score, breakdown } = computeHealthScore(snapshot);
  return res.json({ snapshot, healthScore: score, scoreBreakdown: breakdown });
});

// POST /analytics/swot — generate SWOT via AI, save and return
router.post("/analytics/swot", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const [vendor] = await db
    .select({ id: vendorsTable.id, name: vendorsTable.name })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId));
  if (!vendor) return res.status(404).json({ error: "Vendor not found" });

  const snapshot = await buildBusinessSnapshot(vendor.id);
  const { score, breakdown } = computeHealthScore(snapshot);

  const topPlatforms = Object.entries(snapshot.platformBreakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([k, v]) => `${k}×${v}`)
    .join(", ");

  const prompt = `You are a strategic business analyst for a vendor on the Awa Biz Suite platform. Based on the following 30-day operational metrics, generate a SWOT analysis with exactly 3–4 bullet points per quadrant.

Business metrics (last 30 days):
- Revenue: $${snapshot.revenue30d.toFixed(2)} | Previous 30d: $${snapshot.prevRevenue30d.toFixed(2)} | MoM Growth: ${snapshot.revenueGrowthPct >= 0 ? "+" : ""}${snapshot.revenueGrowthPct.toFixed(1)}%
- Expenses: $${snapshot.expenses30d.toFixed(2)} | Expense ratio: ${(snapshot.expenseRatio * 100).toFixed(1)}% of revenue
- Inventory: ${snapshot.totalProducts} products | ${snapshot.outOfStockProducts} out-of-stock | ${snapshot.lowStockProducts} low-stock | ${snapshot.healthyStockProducts} healthy
- Orders: ${snapshot.orders30d} total | ${snapshot.completedOrders30d} completed | ${snapshot.pendingOrders30d} pending | Completion rate: ${(snapshot.orderCompletionRate * 100).toFixed(0)}% | Avg value: $${snapshot.avgOrderValue30d.toFixed(2)}
- Payments: ${snapshot.payments30d} transactions | ${snapshot.paidPayments30d} paid | Success rate: ${(snapshot.paymentSuccessRate * 100).toFixed(1)}%
- Leads: ${snapshot.totalLeads30d} new | ${snapshot.qualifiedLeads30d} qualified/converted | Conversion: ${(snapshot.leadConversionRate * 100).toFixed(1)}%
- Social posts: ${snapshot.publishedPosts30d} published | ${snapshot.scheduledPosts30d} scheduled | Platforms: ${topPlatforms || "none"}
- Top expense categories: ${snapshot.topExpenseCategories.map((c) => `${c.category} $${c.amount.toFixed(0)}`).join(" | ") || "none"}
- Health score: ${score}/100

Rules:
- Each point must cite at least one specific number from the data above.
- Be direct and specific — avoid generic business advice.
- For each point, optionally suggest ONE navigation link using a key from: sales, expenses, inventory, leads, social, analytics, finance, payments, orders, products.
- Return ONLY valid JSON, no markdown, no explanation.

JSON format:
{
  "strengths": [
    {"point": "...", "linkKey": "sales", "linkLabel": "View sales"}
  ],
  "weaknesses": [
    {"point": "...", "linkKey": "expenses", "linkLabel": "Review expenses"}
  ],
  "opportunities": [
    {"point": "..."}
  ],
  "threats": [
    {"point": "...", "linkKey": "inventory", "linkLabel": "Check inventory"}
  ]
}`;

  const openAiBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const openAiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "";

  const aiRes = await fetch(`${openAiBase}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1200,
    }),
  });

  if (!aiRes.ok) {
    const txt = await aiRes.text();
    console.error("OpenAI SWOT error:", txt);
    return res.status(502).json({ error: "AI generation failed. Please try again." });
  }

  const aiJson = await aiRes.json() as { choices: Array<{ message: { content: string } }> };
  const raw = aiJson.choices?.[0]?.message?.content ?? "{}";

  let swotReport: SwotReportData;
  try {
    const parsed = JSON.parse(raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim()) as SwotReportData;
    swotReport = {
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 4) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.slice(0, 4) : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.slice(0, 4) : [],
      threats: Array.isArray(parsed.threats) ? parsed.threats.slice(0, 4) : [],
    };
  } catch {
    return res.status(502).json({ error: "Failed to parse AI response. Please try again." });
  }

  const [saved] = await db
    .insert(businessSwotReportsTable)
    .values({
      vendorId: vendor.id,
      healthScore: String(score),
      scoreBreakdown: breakdown,
      swotReport,
      snapshotJson: snapshot as unknown as Record<string, unknown>,
    })
    .returning();

  return res.json({
    id: saved!.id,
    healthScore: saved!.healthScore,
    scoreBreakdown: saved!.scoreBreakdown,
    swotReport: saved!.swotReport,
    snapshotJson: saved!.snapshotJson,
    createdAt: saved!.createdAt,
  });
});

// GET /analytics/swot/history — last 10 reports
router.get("/analytics/swot/history", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const [vendor] = await db
    .select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId));
  if (!vendor) return res.status(404).json({ error: "Vendor not found" });

  const reports = await db
    .select()
    .from(businessSwotReportsTable)
    .where(eq(businessSwotReportsTable.vendorId, vendor.id))
    .orderBy(desc(businessSwotReportsTable.createdAt))
    .limit(10);

  return res.json({ reports });
});

// GET /analytics/swot/:id — single report (for PDF generation)
router.get("/analytics/swot/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const [vendor] = await db
    .select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId));
  if (!vendor) return res.status(404).json({ error: "Vendor not found" });

  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid report id" });

  const [report] = await db
    .select()
    .from(businessSwotReportsTable)
    .where(and(eq(businessSwotReportsTable.id, id), eq(businessSwotReportsTable.vendorId, vendor.id)));

  if (!report) return res.status(404).json({ error: "Report not found" });
  return res.json(report);
});

export default router;

