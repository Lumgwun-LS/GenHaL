/**
 * Inventory analytics: per-product sales velocity, fast/slow movers, stock-vs-reorder dashboard.
 */
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { db, productsTable, inventoryTransactionsTable, vendorsTable } from "@workspace/db";

const router: IRouter = Router();

async function resolveVendorId(req: import("express").Request): Promise<number | null> {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  if (isAdmin && req.query.vendorId) return Number(req.query.vendorId);
  const [v] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return v?.id ?? null;
}

router.get("/inventory/analytics", async (req, res): Promise<void> => {
  const vendorId = await resolveVendorId(req);
  if (!vendorId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const now = new Date();
  const day1 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const day7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const day30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // All products for this vendor
  const products = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      sku: productsTable.sku,
      category: productsTable.category,
      stockQuantity: productsTable.stockQuantity,
      lowStockThreshold: productsTable.lowStockThreshold,
      maxStock: productsTable.maxStock,
      price: productsTable.price,
      unit: productsTable.unit,
    })
    .from(productsTable)
    .where(and(eq(productsTable.vendorId, vendorId), eq(productsTable.status, "active")));

  if (products.length === 0) {
    res.json({ products: [], fastMovers: [], slowMovers: [] });
    return;
  }

  const productIds = products.map(p => p.id);

  // Sales velocity from inventory out-transactions in the last 30 days
  const velocityRows = await db
    .select({
      productId: inventoryTransactionsTable.productId,
      dailyUnits: sql<number>`SUM(CASE WHEN ${inventoryTransactionsTable.createdAt} >= ${day1.toISOString()}::timestamptz THEN ${inventoryTransactionsTable.quantity} ELSE 0 END)::int`,
      weeklyUnits: sql<number>`SUM(CASE WHEN ${inventoryTransactionsTable.createdAt} >= ${day7.toISOString()}::timestamptz THEN ${inventoryTransactionsTable.quantity} ELSE 0 END)::int`,
      monthlyUnits: sql<number>`SUM(${inventoryTransactionsTable.quantity})::int`,
    })
    .from(inventoryTransactionsTable)
    .where(and(
      eq(inventoryTransactionsTable.vendorId, vendorId),
      eq(inventoryTransactionsTable.type, "out"),
      gte(inventoryTransactionsTable.createdAt, day30),
      sql`${inventoryTransactionsTable.productId} = ANY(${sql.raw(`ARRAY[${productIds.join(",")}]::int[]`)})`,
    ))
    .groupBy(inventoryTransactionsTable.productId);

  const velocityMap = new Map(velocityRows.map(r => [r.productId, r]));

  const enriched = products.map(p => {
    const v = velocityMap.get(p.id);
    const stockPct = p.maxStock > 0 ? Math.round((p.stockQuantity / p.maxStock) * 100) : null;
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      stockQuantity: p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold,
      maxStock: p.maxStock,
      price: parseFloat(p.price),
      unit: p.unit,
      stockPercent: stockPct,
      dailyUnits: v?.dailyUnits ?? 0,
      weeklyUnits: v?.weeklyUnits ?? 0,
      monthlyUnits: v?.monthlyUnits ?? 0,
    };
  });

  // Fast movers: top 10 by monthly units sold
  const fastMovers = [...enriched]
    .filter(p => p.monthlyUnits > 0)
    .sort((a, b) => b.monthlyUnits - a.monthlyUnits)
    .slice(0, 10);

  // Slow movers: zero movement in 30 days, sorted by stock value descending (idle capital)
  const slowMovers = [...enriched]
    .filter(p => p.monthlyUnits === 0)
    .sort((a, b) => b.stockQuantity * b.price - a.stockQuantity * a.price)
    .slice(0, 20);

  res.json({ products: enriched, fastMovers, slowMovers });
});

export default router;
