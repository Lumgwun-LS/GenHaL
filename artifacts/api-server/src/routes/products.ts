import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, lte, desc } from "drizzle-orm";
import { db, productsTable, vendorsTable } from "@workspace/db";
import {
  ListProductsQueryParams,
  CreateProductBody,
  GetProductParams,
  UpdateProductParams,
  UpdateProductBody,
  DeleteProductParams,
  ListProductsResponse,
  CreateProductResponse,
  GetProductResponse,
  UpdateProductResponse,
  ListLowStockProductsResponse,
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

router.get("/products/low-stock", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Non-admins are scoped to their own vendor at the DB level.
  const products = await db
    .select()
    .from(productsTable)
    .where(
      !authed.isAdmin
        ? and(eq(productsTable.vendorId, authed.vendorId!), lte(productsTable.stockQuantity, productsTable.lowStockThreshold))
        : lte(productsTable.stockQuantity, productsTable.lowStockThreshold),
    );
  const lowStock = products.filter((p) => p.status === "active");
  res.json(ListLowStockProductsResponse.parse(lowStock.map(serializeProduct)));
});

router.get("/products", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = ListProductsQueryParams.safeParse(req.query);

  // Non-admins are always scoped to their own vendor at DB level — never a full table scan.
  const dbVendorId: number | null =
    !authed.isAdmin ? authed.vendorId
    : (params.success && params.data.vendorId) ? params.data.vendorId : null;

  let products = await db
    .select()
    .from(productsTable)
    .where(dbVendorId !== null ? eq(productsTable.vendorId, dbVendorId) : undefined)
    .orderBy(desc(productsTable.createdAt));

  // Remaining in-memory filters.
  if (params.success) {
    if (params.data.category) products = products.filter((p) => p.category === params.data.category);
    if (params.data.search) {
      const s = params.data.search.toLowerCase();
      products = products.filter((p) => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s));
    }
    if (params.data.lowStock === true || params.data.lowStock === "true" as any) {
      products = products.filter((p) => p.stockQuantity <= p.lowStockThreshold);
    }
  }
  res.json(ListProductsResponse.parse(products.map(serializeProduct)));
});

router.post("/products", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Non-admins may only create products for their own vendor.
  if (!authed.isAdmin && parsed.data.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You can only create products for your own vendor." });
    return;
  }

  const { price, costPrice, ...rest } = parsed.data;
  const [product] = await db.insert(productsTable).values({
    ...rest,
    price: price.toString(),
    ...(costPrice !== undefined ? { costPrice: costPrice.toString() } : {}),
  }).returning();
  res.status(201).json(CreateProductResponse.parse(serializeProduct(product)));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = GetProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  // Ownership check.
  if (!authed.isAdmin && product.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(GetProductResponse.parse(serializeProduct(product)));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Ownership check before update.
  const [existing] = await db.select({ vendorId: productsTable.vendorId }).from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { price, costPrice, ...rest } = parsed.data;
  const updateData = {
    ...rest,
    ...(price !== undefined ? { price: price.toString() } : {}),
    ...(costPrice !== undefined ? { costPrice: costPrice.toString() } : {}),
  };
  const [product] = await db.update(productsTable).set(updateData).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(UpdateProductResponse.parse(serializeProduct(product)));
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Ownership check before delete.
  const [existing] = await db.select({ vendorId: productsTable.vendorId }).from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [product] = await db.delete(productsTable).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.sendStatus(204);
});

function serializeProduct(p: typeof productsTable.$inferSelect) {
  return {
    ...p,
    price: parseFloat(p.price),
    costPrice: p.costPrice ? parseFloat(p.costPrice) : null,
  };
}

export default router;
