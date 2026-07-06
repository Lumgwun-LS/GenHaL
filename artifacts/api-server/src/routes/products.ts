import { Router, type IRouter } from "express";
import { eq, and, lte, desc } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
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

router.get("/products/low-stock", async (_req, res): Promise<void> => {
  const products = await db.select().from(productsTable);
  const lowStock = products.filter((p) => p.stockQuantity <= p.lowStockThreshold && p.status === "active");
  res.json(ListLowStockProductsResponse.parse(lowStock.map(serializeProduct)));
});

router.get("/products", async (req, res): Promise<void> => {
  const params = ListProductsQueryParams.safeParse(req.query);
  let products = await db.select().from(productsTable).orderBy(desc(productsTable.createdAt));
  if (params.success) {
    if (params.data.vendorId) products = products.filter((p) => p.vendorId === params.data.vendorId);
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
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { price, costPrice, ...rest } = parsed.data;
  const [product] = await db.insert(productsTable).values({
    ...rest,
    price: price.toString(),
    ...(costPrice !== undefined ? { costPrice: costPrice.toString() } : {}),
  }).returning();
  res.status(201).json(CreateProductResponse.parse(serializeProduct(product)));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(GetProductResponse.parse(serializeProduct(product)));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
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
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
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
