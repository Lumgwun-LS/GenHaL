/**
 * Sales, Visits & Inventory Analytics routes.
 *
 * All routes require Clerk auth. Non-admins are scoped to their own vendor.
 *
 * GET /analytics/visits          — visit counts grouped by day/week/month
 * GET /analytics/top-products    — top products by revenue or order count
 * GET /analytics/inventory-health — all products with stock status
 * GET /analytics/summary         — 7-day totals + prior-7d deltas
 * GET /analytics/export/sales    — CSV export of orders
 * GET /analytics/export/inventory — CSV export of inventory
 */

import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, gte, lte, desc, sql, ilike, or } from "drizzle-orm";
import {
  db,
  vendorsTable,
  ordersTable,
  orderItemsTable,
  productsTable,
  embedVisitsTable,
  salesTable,
  paymentsTable,
} from "@workspace/db";

const router: IRouter = Router();
export default router;

function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",").map(s => s.trim()).filter(Boolean).includes(userId);
}

async function resolveVendorId(userId: string, requestedId?: number | null): Promise<number | null> {
  if (isAdmin(userId)) return requestedId ?? null;
  const [v] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return v?.id ?? null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dateKey(d: Date, groupBy: string): string {
  const iso = d.toISOString();
  if (groupBy === "month") return iso.slice(0, 7); // YYYY-MM
  if (groupBy === "week") {
    // ISO week start (Monday)
    const day = new Date(d);
    const dow = day.getUTCDay() || 7;
    day.setUTCDate(day.getUTCDate() - dow + 1);
    return day.toISOString().slice(0, 10);
  }
  return iso.slice(0, 10); // day
}

function defaultRange(period: string): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  if (period === "7d")  { from.setDate(from.getDate() - 7); }
  else if (period === "30d") { from.setDate(from.getDate() - 30); }
  else if (period === "3m")  { from.setMonth(from.getMonth() - 3); }
  else if (period === "12m") { from.setFullYear(from.getFullYear() - 1); }
  else { from.setDate(from.getDate() - 30); } // default 30d
  return { from, to };
}

// ── GET /analytics/visits ─────────────────────────────────────────────────────

router.get("/analytics/visits", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendorId = await resolveVendorId(userId, req.query.vendorId ? Number(req.query.vendorId) : null);
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }

  const groupBy = (req.query.groupBy as string) || "day";
  const { from: defaultFrom, to: defaultTo } = defaultRange((req.query.period as string) || "30d");
  const from = req.query.from ? new Date(req.query.from as string) : defaultFrom;
  const to   = req.query.to   ? new Date(req.query.to   as string) : defaultTo;

  const rows = await db
    .select({ visitedAt: embedVisitsTable.visitedAt, sessionId: embedVisitsTable.sessionId })
    .from(embedVisitsTable)
    .where(and(
      eq(embedVisitsTable.vendorId, vendorId),
      gte(embedVisitsTable.visitedAt, from),
      lte(embedVisitsTable.visitedAt, to),
    ));

  // Count unique sessions per bucket
  const bucketMap = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = dateKey(row.visitedAt, groupBy);
    if (!bucketMap.has(key)) bucketMap.set(key, new Set());
    bucketMap.get(key)!.add(row.sessionId ?? `anon-${row.visitedAt.getTime()}`);
  }

  const data = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sessions]) => ({ date, count: sessions.size }));

  // Total unique visitors in range
  const allSessions = new Set(rows.map(r => r.sessionId ?? `anon-${r.visitedAt.getTime()}`));

  res.json({ data, total: allSessions.size, from: from.toISOString(), to: to.toISOString(), groupBy });
});

// ── GET /analytics/top-products ───────────────────────────────────────────────

router.get("/analytics/top-products", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendorId = await resolveVendorId(userId, req.query.vendorId ? Number(req.query.vendorId) : null);
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }

  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  const { from: defaultFrom, to: defaultTo } = defaultRange("30d");
  const from = req.query.from ? new Date(req.query.from as string) : defaultFrom;
  const to   = req.query.to   ? new Date(req.query.to   as string) : defaultTo;

  // Join order_items → orders scoped to vendor + date range
  const items = await db
    .select({
      productId:   orderItemsTable.productId,
      productName: orderItemsTable.productName,
      totalPrice:  orderItemsTable.totalPrice,
      quantity:    orderItemsTable.quantity,
      orderStatus: ordersTable.status,
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(and(
      eq(ordersTable.vendorId, vendorId),
      gte(ordersTable.createdAt, from),
      lte(ordersTable.createdAt, to),
    ));

  const map = new Map<number, { name: string; revenue: number; orderCount: number; unitsSold: number }>();
  for (const item of items) {
    if (item.orderStatus === "cancelled") continue;
    const cur = map.get(item.productId) ?? { name: item.productName, revenue: 0, orderCount: 0, unitsSold: 0 };
    cur.revenue    += parseFloat(item.totalPrice as string);
    cur.orderCount += 1;
    cur.unitsSold  += item.quantity;
    map.set(item.productId, cur);
  }

  const products = Array.from(map.entries())
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);

  res.json({ products, from: from.toISOString(), to: to.toISOString() });
});

// ── GET /analytics/inventory-health ──────────────────────────────────────────

router.get("/analytics/inventory-health", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendorId = await resolveVendorId(userId, req.query.vendorId ? Number(req.query.vendorId) : null);
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }

  const rows = await db
    .select({
      id:                productsTable.id,
      name:              productsTable.name,
      stockQuantity:     productsTable.stockQuantity,
      lowStockThreshold: productsTable.lowStockThreshold,
      maxStock:          productsTable.maxStock,
      status:            productsTable.status,
      category:          productsTable.category,
      sku:               productsTable.sku,
    })
    .from(productsTable)
    .where(eq(productsTable.vendorId, vendorId));

  function stockStatus(qty: number, low: number): "ok" | "low" | "critical" | "out" {
    if (qty <= 0) return "out";
    if (qty <= Math.ceil(low * 0.5)) return "critical";
    if (qty <= low) return "low";
    return "ok";
  }

  const SORT_ORDER = { out: 0, critical: 1, low: 2, ok: 3 };

  const products = rows
    .map(p => ({
      id:                p.id,
      name:              p.name,
      sku:               p.sku,
      category:          p.category,
      stockQuantity:     p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold,
      maxStock:          p.maxStock ?? 0,
      active:            p.status === "active",
      stockStatus:       stockStatus(p.stockQuantity, p.lowStockThreshold),
    }))
    .sort((a, b) => SORT_ORDER[a.stockStatus] - SORT_ORDER[b.stockStatus]);

  const summary = {
    total:    products.length,
    ok:       products.filter(p => p.stockStatus === "ok").length,
    low:      products.filter(p => p.stockStatus === "low").length,
    critical: products.filter(p => p.stockStatus === "critical").length,
    out:      products.filter(p => p.stockStatus === "out").length,
  };

  res.json({ products, summary });
});

// ── GET /analytics/summary ────────────────────────────────────────────────────
// 7-day totals for Revenue, Orders, New Customers, Visits — each with prior-7d delta.

router.get("/analytics/summary", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendorId = await resolveVendorId(userId, req.query.vendorId ? Number(req.query.vendorId) : null);
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }

  const now     = new Date();
  const d7ago   = new Date(now.getTime() - 7  * 86400_000);
  const d14ago  = new Date(now.getTime() - 14 * 86400_000);

  const [
    recentOrders, prevOrders,
    recentPayments, prevPayments,
    recentVisits, prevVisits,
  ] = await Promise.all([
    db.select().from(ordersTable).where(and(eq(ordersTable.vendorId, vendorId), gte(ordersTable.createdAt, d7ago))),
    db.select().from(ordersTable).where(and(eq(ordersTable.vendorId, vendorId), gte(ordersTable.createdAt, d14ago), lte(ordersTable.createdAt, d7ago))),
    db.select({ amount: paymentsTable.amount }).from(paymentsTable)
      .where(and(eq(paymentsTable.vendorId, vendorId), eq(paymentsTable.status, "paid" as string), gte(paymentsTable.createdAt, d7ago))),
    db.select({ amount: paymentsTable.amount }).from(paymentsTable)
      .where(and(eq(paymentsTable.vendorId, vendorId), eq(paymentsTable.status, "paid" as string), gte(paymentsTable.createdAt, d14ago), lte(paymentsTable.createdAt, d7ago))),
    db.select({ sessionId: embedVisitsTable.sessionId }).from(embedVisitsTable)
      .where(and(eq(embedVisitsTable.vendorId, vendorId), gte(embedVisitsTable.visitedAt, d7ago))),
    db.select({ sessionId: embedVisitsTable.sessionId }).from(embedVisitsTable)
      .where(and(eq(embedVisitsTable.vendorId, vendorId), gte(embedVisitsTable.visitedAt, d14ago), lte(embedVisitsTable.visitedAt, d7ago))),
  ]);

  function pct(cur: number, prev: number): number {
    if (prev === 0) return cur > 0 ? 100 : 0;
    return parseFloat(((cur - prev) / prev * 100).toFixed(1));
  }

  const revenue   = recentPayments.reduce((s, p) => s + parseFloat(p.amount as string), 0);
  const prevRev   = prevPayments.reduce((s, p)   => s + parseFloat(p.amount as string), 0);
  const orders    = recentOrders.length;
  const prevOrd   = prevOrders.length;
  const customers = new Set(recentOrders.map(o => o.customerEmail)).size;
  const prevCust  = new Set(prevOrders.map(o => o.customerEmail)).size;
  const visits    = new Set(recentVisits.map((v, i) => v.sessionId ?? `anon-${i}`)).size;
  const prevVis   = new Set(prevVisits.map((v, i)  => v.sessionId ?? `anon-${i}`)).size;

  res.json({
    revenue:   { value: revenue,   prev: prevRev,  deltaPct: pct(revenue, prevRev) },
    orders:    { value: orders,    prev: prevOrd,  deltaPct: pct(orders, prevOrd) },
    customers: { value: customers, prev: prevCust, deltaPct: pct(customers, prevCust) },
    visits:    { value: visits,    prev: prevVis,  deltaPct: pct(visits, prevVis) },
  });
});

// ── GET /analytics/orders ─────────────────────────────────────────────────────
// Paginated, filterable orders list for the dashboard table.

router.get("/analytics/orders", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendorId = await resolveVendorId(userId, req.query.vendorId ? Number(req.query.vendorId) : null);
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }

  // Dates are optional — omitting both means "all time" (no date filter applied)
  const from = req.query.from ? new Date(req.query.from as string) : null;
  const to   = req.query.to   ? new Date(req.query.to   as string) : null;
  const customerName = (req.query.customerName as string) || "";
  const page  = Math.max(1, parseInt((req.query.page  as string) || "1",  10));
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "25", 10)));

  const conditions = [eq(ordersTable.vendorId, vendorId)];
  if (from) conditions.push(gte(ordersTable.createdAt, from));
  if (to)   conditions.push(lte(ordersTable.createdAt, to));
  if (customerName) {
    conditions.push(
      or(
        ilike(ordersTable.customerName, `%${customerName}%`),
        ilike(ordersTable.customerEmail, `%${customerName}%`),
      )!,
    );
  }

  const [rows, countRow] = await Promise.all([
    db.select({
      id:            ordersTable.id,
      createdAt:     ordersTable.createdAt,
      customerName:  ordersTable.customerName,
      customerEmail: ordersTable.customerEmail,
      status:        ordersTable.status,
      paymentStatus: ordersTable.paymentStatus,
      totalAmount:   ordersTable.totalAmount,
      currency:      ordersTable.currency,
      source:        ordersTable.source,
    })
    .from(ordersTable)
    .where(and(...conditions))
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit)
    .offset((page - 1) * limit),

    db.select({ count: sql<number>`count(*)::int` })
      .from(ordersTable)
      .where(and(...conditions)),
  ]);

  const total = countRow[0]?.count ?? 0;
  res.json({
    orders: rows.map(o => ({
      ...o,
      createdAt:   o.createdAt.toISOString(),
      totalAmount: String(o.totalAmount),
    })),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  });
});

// ── GET /analytics/export/sales ───────────────────────────────────────────────

router.get("/analytics/export/sales", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendorId = await resolveVendorId(userId, req.query.vendorId ? Number(req.query.vendorId) : null);
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }

  // Dates are optional — omitting both means "all time"
  const from = req.query.from ? new Date(req.query.from as string) : null;
  const to   = req.query.to   ? new Date(req.query.to   as string) : null;
  const customerNameFilter = (req.query.customerName as string) || "";

  const exportConditions = [eq(ordersTable.vendorId, vendorId)];
  if (from) exportConditions.push(gte(ordersTable.createdAt, from));
  if (to)   exportConditions.push(lte(ordersTable.createdAt, to));
  if (customerNameFilter) {
    exportConditions.push(
      or(
        ilike(ordersTable.customerName, `%${customerNameFilter}%`),
        ilike(ordersTable.customerEmail, `%${customerNameFilter}%`),
      )!,
    );
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(...exportConditions))
    .orderBy(desc(ordersTable.createdAt));

  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["ID", "Date", "Customer Name", "Customer Email", "Status", "Payment Status", "Amount", "Currency", "Source"];
  const rows   = orders.map(o => [
    o.id, o.createdAt.toISOString(), o.customerName, o.customerEmail,
    o.status, o.paymentStatus, o.totalAmount, o.currency, o.source ?? "dashboard",
  ].map(esc).join(","));

  const csv = [header.join(","), ...rows].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="sales-export-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
});

// ── GET /analytics/export/inventory ──────────────────────────────────────────

router.get("/analytics/export/inventory", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendorId = await resolveVendorId(userId, req.query.vendorId ? Number(req.query.vendorId) : null);
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }

  const rows = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.vendorId, vendorId))
    .orderBy(productsTable.name);

  function stockStatus(qty: number, low: number): string {
    if (qty <= 0) return "out";
    if (qty <= Math.ceil(low * 0.5)) return "critical";
    if (qty <= low) return "low";
    return "ok";
  }

  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["ID", "Name", "SKU", "Category", "Status", "Stock Qty", "Low Stock Threshold", "Max Stock", "Stock Status", "Price"];
  const csvRows = rows.map(p => [
    p.id, p.name, p.sku, p.category, p.status,
    p.stockQuantity, p.lowStockThreshold, p.maxStock,
    stockStatus(p.stockQuantity, p.lowStockThreshold), p.price,
  ].map(esc).join(","));

  const csv = [header.join(","), ...csvRows].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="inventory-export-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
});
