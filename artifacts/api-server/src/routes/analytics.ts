import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, vendorsTable, ordersTable, leadsTable, postsTable, productsTable, emailCampaignsTable, orderItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetAnalyticsOverviewQueryParams,
  GetSalesAnalyticsQueryParams,
  GetSocialAnalyticsQueryParams,
  GetAnalyticsOverviewResponse,
  GetSalesAnalyticsResponse,
  GetSocialAnalyticsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/analytics/overview", async (req, res): Promise<void> => {
  const params = GetAnalyticsOverviewQueryParams.safeParse(req.query);
  const vendorId = params.success ? params.data.vendorId ?? null : null;

  const [allVendors, allOrders, allLeads, allPosts, allProducts] = await Promise.all([
    db.select().from(vendorsTable),
    db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)),
    db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt)),
    db.select().from(postsTable).orderBy(desc(postsTable.createdAt)),
    db.select().from(productsTable),
  ]);

  const orders = vendorId ? allOrders.filter((o) => o.vendorId === vendorId) : allOrders;
  const leads = vendorId ? allLeads.filter((l) => l.vendorId === vendorId) : allLeads;
  const posts = vendorId ? allPosts.filter((p) => p.vendorId === vendorId) : allPosts;
  const products = vendorId ? allProducts.filter((p) => p.vendorId === vendorId) : allProducts;

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
  const params = GetSalesAnalyticsQueryParams.safeParse(req.query);
  let orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
  if (params.success && params.data.vendorId) {
    orders = orders.filter((o) => o.vendorId === params.data.vendorId);
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
  const revenueByVendor = Object.entries(vendorMap)
    .map(([vendorId, { vendorName, revenue }]) => ({ vendorId: parseInt(vendorId), vendorName, revenue }))
    .filter((v) => v.revenue > 0);

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
  const params = GetSocialAnalyticsQueryParams.safeParse(req.query);
  let posts = await db.select().from(postsTable).orderBy(desc(postsTable.createdAt));
  if (params.success && params.data.vendorId) {
    posts = posts.filter((p) => p.vendorId === params.data.vendorId);
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
    scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
  }));

  res.json(GetSocialAnalyticsResponse.parse({ postsByPlatform, postsByStatus, recentPosts, totalEngagement: 0 }));
});

export default router;
