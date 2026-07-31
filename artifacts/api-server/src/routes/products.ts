import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, lte, desc, asc } from "drizzle-orm";
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

/**
 * PATCH /products/:id/variations
 * Save variation groups (e.g. [{name:"Size",options:["S","M","L"]}]) for a product.
 */
router.patch("/products/:id/variations", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id ?? "", 10);
  if (!id) { res.status(400).json({ error: "Invalid product id" }); return; }

  const [existing] = await db.select({ vendorId: productsTable.vendorId }).from(productsTable).where(eq(productsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  // variations: Array<{name:string; options:string[]}> or null to clear
  const { variations } = req.body as { variations: unknown };
  if (variations !== null && !Array.isArray(variations)) {
    res.status(400).json({ error: "variations must be an array or null" }); return;
  }
  const variationsJson = variations === null ? null : JSON.stringify(variations);
  await db.update(productsTable).set({ variationsJson }).where(eq(productsTable.id, id));
  res.json({ ok: true });
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

// ── CSV helpers ──────────────────────────────────────────────────────────────
import multer from "multer";
const _csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function parseCSV(buffer: Buffer): string[][] {
  const text = buffer.toString("utf8");
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push(current.trim()); current = "";
    } else if ((ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) && !inQuotes) {
      if (ch === '\r') i++;
      row.push(current.trim());
      if (row.some(v => v !== '')) rows.push(row);
      row = []; current = "";
    } else {
      current += ch;
    }
  }
  if (current !== '' || row.length > 0) {
    row.push(current.trim());
    if (row.some(v => v !== '')) rows.push(row);
  }
  return rows;
}

// ── Export ───────────────────────────────────────────────────────────────────
router.get("/products/export", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const dbVendorId: number | null = !authed.isAdmin ? authed.vendorId
    : (req.query.vendorId ? Number(req.query.vendorId) : null);

  const products = await db.select().from(productsTable)
    .where(dbVendorId !== null ? eq(productsTable.vendorId, dbVendorId) : undefined)
    .orderBy(asc(productsTable.id));

  const HEADERS = ["ID", "Name", "SKU", "Category", "Price", "Cost Price", "Stock Quantity", "Unit", "Low Stock Threshold", "Status", "Description"];
  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = String(v);
    const safe = /^[=+\-@|\t]/.test(s) ? `'${s}` : s;
    if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) return `"${safe.replace(/"/g, '""')}"`;
    return safe;
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.write(HEADERS.join(",") + "\r\n");
  for (const p of products) {
    res.write([p.id, p.name, p.sku, p.category, parseFloat(p.price), p.costPrice ? parseFloat(p.costPrice) : "", p.stockQuantity, p.unit, p.lowStockThreshold, p.status, p.description].map(csvCell).join(",") + "\r\n");
  }
  res.end();
});

// ── Import ───────────────────────────────────────────────────────────────────
router.post("/products/import", _csvUpload.single("file"), async (req: any, res: any): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  const vendorId = authed.vendorId!;

  if (!req.file) { res.status(400).json({ error: "No CSV file uploaded" }); return; }
  const rows = parseCSV(req.file.buffer);
  if (rows.length < 2) { res.status(400).json({ error: "CSV must have a header row and at least one data row" }); return; }

  const header = rows[0]!.map(h => h.toLowerCase().replace(/\s+/g, "_"));
  const col = (name: string) => header.indexOf(name);

  let imported = 0; const errors: { row: number; error: string }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const name = r[col("name")] ?? "";
    const price = parseFloat(r[col("price")] ?? "");
    const stock = parseInt(r[col("stock_quantity")] ?? r[col("stockquantity")] ?? "0", 10);
    if (!name) { errors.push({ row: i + 1, error: "Name is required" }); continue; }
    if (isNaN(price)) { errors.push({ row: i + 1, error: "Price is required and must be a number" }); continue; }
    try {
      const sku = r[col("sku")] || `SKU-${Date.now()}-${i}`;
      await db.insert(productsTable).values({
        vendorId,
        name,
        sku,
        category: r[col("category")] || "General",
        price: price.toString(),
        costPrice: r[col("cost_price")] ? parseFloat(r[col("cost_price")]!).toString() : null,
        stockQuantity: isNaN(stock) ? 0 : stock,
        unit: r[col("unit")] || "units",
        lowStockThreshold: parseInt(r[col("low_stock_threshold")] ?? "10", 10) || 10,
        status: (r[col("status")] === "inactive" ? "inactive" : "active") as "active" | "inactive",
        description: r[col("description")] || null,
      });
      imported++;
    } catch (e: any) {
      errors.push({ row: i + 1, error: e.message ?? "Insert failed" });
    }
  }
  res.json({ imported, skipped: 0, errors: errors.length, errorDetails: errors.slice(0, 20) });
});

export default router;
