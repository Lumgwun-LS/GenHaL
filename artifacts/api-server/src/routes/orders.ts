import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable } from "@workspace/db";
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

router.get("/orders/summary", async (req, res): Promise<void> => {
  const params = GetOrdersSummaryQueryParams.safeParse(req.query);
  let orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
  if (params.success && params.data.vendorId) {
    orders = orders.filter((o) => o.vendorId === params.data.vendorId);
  }
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
  const params = ListOrdersQueryParams.safeParse(req.query);
  let orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
  if (params.success) {
    if (params.data.vendorId) orders = orders.filter((o) => o.vendorId === params.data.vendorId);
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
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { items, ...orderData } = parsed.data;
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
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  res.json(GetOrderResponse.parse({ ...order, totalAmount: parseFloat(order.totalAmount), items: items.map(serializeItem) }));
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
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
