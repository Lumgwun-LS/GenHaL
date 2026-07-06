import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, inventoryTransactionsTable, productsTable } from "@workspace/db";
import {
  ListInventoryTransactionsQueryParams,
  CreateInventoryTransactionBody,
  GetInventorySummaryQueryParams,
  ListInventoryTransactionsResponse,
  CreateInventoryTransactionResponse,
  GetInventorySummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/inventory/summary", async (req, res): Promise<void> => {
  const params = GetInventorySummaryQueryParams.safeParse(req.query);
  let products = await db.select().from(productsTable);
  if (params.success && params.data.vendorId) {
    products = products.filter((p) => p.vendorId === params.data.vendorId);
  }
  const totalProducts = products.length;
  const totalValue = products.reduce((sum, p) => sum + parseFloat(p.price) * p.stockQuantity, 0);
  const lowStockCount = products.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= p.lowStockThreshold).length;
  const outOfStockCount = products.filter((p) => p.stockQuantity === 0).length;
  const categoryMap: Record<string, { count: number; value: number }> = {};
  for (const p of products) {
    const val = parseFloat(p.price) * p.stockQuantity;
    if (!categoryMap[p.category]) categoryMap[p.category] = { count: 0, value: 0 };
    categoryMap[p.category]!.count++;
    categoryMap[p.category]!.value += val;
  }
  const categories = Object.entries(categoryMap).map(([category, { count, value }]) => ({ category, count, value }));
  res.json(GetInventorySummaryResponse.parse({ totalProducts, totalValue, lowStockCount, outOfStockCount, categories }));
});

router.get("/inventory/transactions", async (req, res): Promise<void> => {
  const params = ListInventoryTransactionsQueryParams.safeParse(req.query);
  let txns = await db.select().from(inventoryTransactionsTable).orderBy(desc(inventoryTransactionsTable.createdAt));
  if (params.success) {
    if (params.data.productId) txns = txns.filter((t) => t.productId === params.data.productId);
    if (params.data.vendorId) txns = txns.filter((t) => t.vendorId === params.data.vendorId);
  }
  res.json(ListInventoryTransactionsResponse.parse(txns));
});

router.post("/inventory/transactions", async (req, res): Promise<void> => {
  const parsed = CreateInventoryTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [txn] = await db.insert(inventoryTransactionsTable).values(parsed.data).returning();
  // Update stock quantity
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, parsed.data.productId));
  if (product) {
    const delta = parsed.data.type === "in" ? parsed.data.quantity : parsed.data.type === "out" ? -parsed.data.quantity : parsed.data.quantity - product.stockQuantity;
    const newQty = Math.max(0, product.stockQuantity + (parsed.data.type === "adjustment" ? parsed.data.quantity - product.stockQuantity : delta));
    await db.update(productsTable).set({ stockQuantity: newQty }).where(eq(productsTable.id, product.id));
  }
  res.status(201).json(CreateInventoryTransactionResponse.parse(txn));
});

export default router;
