import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, productsTable, vendorsTable } from "@workspace/db";
import {
  ListOrdersQueryParams,
  CreateOrderBody,
  GetOrdersSummaryQueryParams,
  GetOrderParams,
  UpdateOrderParams,
  UpdateOrderBody,
  ListOrdersResponse,
  CreateOrderResponse,
  GetOrdersSummaryResponse,
  GetOrderResponse,
  UpdateOrderResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Resolve the calling Clerk user to their vendor row (or confirm admin).
 * Identity is always derived server-side — never trusted from request fields.
 */
async function resolveAuthedVendor(req: import("express").Request): Promise<{ vendorId: number | null; isAdmin: boolean }> {
  const { userId } = getAuth(req);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

router.get("/orders/summary", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = GetOrdersSummaryQueryParams.safeParse(req.query);

  // Non-admins are always scoped to their own vendor. Admins may filter by vendorId.
  const dbVendorId: number | null =
    !authed.isAdmin ? authed.vendorId
    : (params.success && params.data.vendorId) ? params.data.vendorId : null;

  let orders = await db
    .select()
    .from(ordersTable)
    .where(dbVendorId !== null ? eq(ordersTable.vendorId, dbVendorId) : undefined)
    .orderBy(desc(ordersTable.createdAt));

  const totalOrders = orders.length;
  const totalRevenue = orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + parseFloat(o.totalAmount), 0);
  const pendingOrders = orders.filter((o) => o.status === "pending").length;
  const completedOrders = orders.filter((o) => o.status === "completed").length;

  // Revenue by day (last 30 days)
  const dayMap: Record<string, { revenue: number; orders: number }> = {};
  for (const o of orders) {
    const day = new Date(o.createdAt).toISOString().split("T")[0]!;
    if (!dayMap[day]) dayMap[day] = { revenue: 0, orders: 0 };
    if (o.status !== "cancelled") dayMap[day]!.revenue += parseFloat(o.totalAmount);
    dayMap[day]!.orders++;
  }
  const revenueByPeriod = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([period, { revenue, orders }]) => ({ period, revenue, orders }));

  res.json(GetOrdersSummaryResponse.parse({ totalOrders, totalRevenue, pendingOrders, completedOrders, revenueByPeriod }));
});

router.get("/orders", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = ListOrdersQueryParams.safeParse(req.query);

  // Non-admins are always scoped to their own vendor at DB level — never a full table scan.
  const dbVendorId: number | null =
    !authed.isAdmin ? authed.vendorId
    : (params.success && params.data.vendorId) ? params.data.vendorId : null;

  let orders = await db
    .select()
    .from(ordersTable)
    .where(dbVendorId !== null ? eq(ordersTable.vendorId, dbVendorId) : undefined)
    .orderBy(desc(ordersTable.createdAt));

  // Remaining in-memory filters that can't be pushed down simply.
  if (params.success) {
    if (params.data.status) orders = orders.filter((o) => o.status === params.data.status);
    if (params.data.branchId) orders = orders.filter((o) => o.branchId === params.data.branchId);
    if (params.data.workerId) orders = orders.filter((o) => o.workerId === params.data.workerId);
    if (params.data.from) {
      const d = new Date(params.data.from);
      if (!isNaN(d.getTime())) orders = orders.filter((o) => new Date(o.createdAt) >= d);
    }
    if (params.data.to) {
      const d = new Date(params.data.to);
      if (!isNaN(d.getTime())) orders = orders.filter((o) => new Date(o.createdAt) <= d);
    }
    if (params.data.search) {
      const s = params.data.search.toLowerCase();
      orders = orders.filter((o) => o.customerName.toLowerCase().includes(s) || o.customerEmail.toLowerCase().includes(s));
    }
  }
  const ordersWithItems = await Promise.all(
    orders.map(async (order) => {
      const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
      return { ...order, totalAmount: parseFloat(order.totalAmount), items: items.map(serializeItem) };
    }),
  );
  res.json(ListOrdersResponse.parse(ordersWithItems));
});

router.post("/orders", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { items, ...orderData } = parsed.data;

  // Non-admins may only create orders for their own vendor.
  if (!authed.isAdmin && orderData.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You can only create orders for your own vendor." });
    return;
  }

  // Validate that every productId belongs to the order's vendor.
  // This prevents cross-vendor data corruption and ensures productNames are real.
  const productIds = items
    .map((item: any) => item.productId)
    .filter((id: any) => id != null) as number[];
  if (productIds.length > 0) {
    const ownedProducts = await db
      .select({ id: productsTable.id, name: productsTable.name })
      .from(productsTable)
      .where(and(
        inArray(productsTable.id, productIds),
        eq(productsTable.vendorId, orderData.vendorId),
      ));
    const ownedIds = new Set(ownedProducts.map((p) => p.id));
    const productNameMap = new Map(ownedProducts.map((p) => [p.id, p.name]));
    const invalid = productIds.filter((id) => !ownedIds.has(id));
    if (invalid.length > 0) {
      res.status(400).json({ error: `Product(s) not found or do not belong to this vendor: ${invalid.join(", ")}` });
      return;
    }
    const totalAmount = items.reduce((sum: number, item: any) => sum + item.quantity * item.unitPrice, 0);
    const [order] = await db.insert(ordersTable).values({ ...orderData, totalAmount: totalAmount.toString() }).returning();
    const insertedItems = await db.insert(orderItemsTable).values(
      items.map((item: any) => ({
        orderId: order!.id,
        productId: item.productId,
        productName: productNameMap.get(item.productId) ?? `Product #${item.productId}`,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        totalPrice: (item.quantity * item.unitPrice).toString(),
      })),
    ).returning();
    res.status(201).json(CreateOrderResponse.parse({
      ...order!,
      totalAmount: parseFloat(order!.totalAmount),
      items: insertedItems.map(serializeItem),
    }));
    return;
  }

  const totalAmount = items.reduce((sum: number, item: any) => sum + item.quantity * item.unitPrice, 0);
  const [order] = await db.insert(ordersTable).values({ ...orderData, totalAmount: totalAmount.toString() }).returning();
  const insertedItems = await db.insert(orderItemsTable).values(
    items.map((item: any) => ({
      orderId: order!.id,
      productId: item.productId,
      productName: `Product #${item.productId}`,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
      totalPrice: (item.quantity * item.unitPrice).toString(),
    })),
  ).returning();
  res.status(201).json(CreateOrderResponse.parse({
    ...order!,
    totalAmount: parseFloat(order!.totalAmount),
    items: insertedItems.map(serializeItem),
  }));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  // Ownership check: non-admins may only view their own vendor's orders.
  if (!authed.isAdmin && order.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  res.json(GetOrderResponse.parse({ ...order, totalAmount: parseFloat(order.totalAmount), items: items.map(serializeItem) }));
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = UpdateOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Check ownership before updating.
  const [existing] = await db.select({ vendorId: ordersTable.vendorId }).from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Order not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [order] = await db.update(ordersTable).set(parsed.data).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  res.json(UpdateOrderResponse.parse({ ...order, totalAmount: parseFloat(order.totalAmount), items: items.map(serializeItem) }));
});

function serializeItem(item: typeof orderItemsTable.$inferSelect) {
  return {
    ...item,
    unitPrice: parseFloat(item.unitPrice),
    totalPrice: parseFloat(item.totalPrice),
  };
}

export default router;
