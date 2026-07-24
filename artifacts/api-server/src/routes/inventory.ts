import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, desc, sql } from "drizzle-orm";
import { db, inventoryTransactionsTable, productsTable, vendorsTable } from "@workspace/db";
import {
  ListInventoryTransactionsQueryParams,
  CreateInventoryTransactionBody,
  GetInventorySummaryQueryParams,
  ListInventoryTransactionsResponse,
  CreateInventoryTransactionResponse,
  GetInventorySummaryResponse,
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

router.get("/inventory/summary", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = GetInventorySummaryQueryParams.safeParse(req.query);

  // Non-admins are scoped to their own vendor at the DB query level.
  const dbVendorId: number | null =
    !authed.isAdmin ? authed.vendorId
    : (params.success && params.data.vendorId) ? params.data.vendorId : null;

  const products = await db
    .select()
    .from(productsTable)
    .where(dbVendorId !== null ? eq(productsTable.vendorId, dbVendorId) : undefined);

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
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = ListInventoryTransactionsQueryParams.safeParse(req.query);

  // Non-admins are scoped to their own vendor at the DB query level.
  const dbVendorId: number | null =
    !authed.isAdmin ? authed.vendorId
    : (params.success && params.data.vendorId) ? params.data.vendorId : null;

  let txns = await db
    .select()
    .from(inventoryTransactionsTable)
    .where(dbVendorId !== null ? eq(inventoryTransactionsTable.vendorId, dbVendorId) : undefined)
    .orderBy(desc(inventoryTransactionsTable.createdAt));

  // Remaining in-memory filters.
  if (params.success && params.data.productId) {
    txns = txns.filter((t) => t.productId === params.data.productId);
  }

  res.json(ListInventoryTransactionsResponse.parse(txns));
});

router.post("/inventory/transactions", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateInventoryTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Non-admins may only record transactions for their own vendor.
  if (!authed.isAdmin && parsed.data.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You can only record inventory transactions for your own vendor." });
    return;
  }

  const [txn] = await db.insert(inventoryTransactionsTable).values(parsed.data).returning();
  // Update stock quantity atomically (no read-then-write race with concurrent order decrements).
  if (parsed.data.type === "in") {
    await db.update(productsTable)
      .set({ stockQuantity: sql`${productsTable.stockQuantity} + ${parsed.data.quantity}` })
      .where(eq(productsTable.id, parsed.data.productId));
  } else if (parsed.data.type === "out") {
    // GREATEST prevents stock going below 0 without a prior SELECT.
    await db.update(productsTable)
      .set({ stockQuantity: sql`GREATEST(0, ${productsTable.stockQuantity} - ${parsed.data.quantity})` })
      .where(eq(productsTable.id, parsed.data.productId));
  } else {
    // adjustment — set absolute value directly (no read needed).
    await db.update(productsTable)
      .set({ stockQuantity: Math.max(0, parsed.data.quantity) })
      .where(eq(productsTable.id, parsed.data.productId));
  }
  res.status(201).json(CreateInventoryTransactionResponse.parse(txn));
});

export default router;
