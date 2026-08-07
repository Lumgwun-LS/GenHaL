/**
 * Product media management — multiple images and videos per product.
 *
 * GET    /products/:id/media                — list all media for a product
 * POST   /products/:id/media               — add a media item (url + type)
 * PATCH  /products/:id/media/:mediaId      — update caption, sortOrder, isPrimary
 * DELETE /products/:id/media/:mediaId      — remove a media item
 * POST   /products/media/upload-url        — get a presigned upload URL
 * GET    /public/products/:vendorId/:productId — public product detail page
 */
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, asc } from "drizzle-orm";
import { db, productMediaTable, productsTable, vendorsTable, vendorWebsitesTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { z } from "zod";

const objectStorageService = new ObjectStorageService();
const router: IRouter = Router();

async function resolveAuthedVendor(req: import("express").Request): Promise<{ vendorId: number | null; isAdmin: boolean }> {
  const { userId } = getAuth(req);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

// ── GET /products/:id/media ──────────────────────────────────────────────────
router.get("/products/:id/media", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const productId = parseInt(req.params.id ?? "", 10);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }

  const [product] = await db.select({ vendorId: productsTable.vendorId }).from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  if (!authed.isAdmin && product.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const media = await db.select().from(productMediaTable)
    .where(eq(productMediaTable.productId, productId))
    .orderBy(asc(productMediaTable.sortOrder), asc(productMediaTable.id));

  res.json(media.map(serializeMedia));
});

// ── POST /products/:id/media ─────────────────────────────────────────────────
const AddMediaBody = z.object({
  url: z.string().url(),
  type: z.enum(["image", "video"]).default("image"),
  caption: z.string().max(500).optional(),
  isPrimary: z.boolean().optional(),
});

router.post("/products/:id/media", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const productId = parseInt(req.params.id ?? "", 10);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }

  const [product] = await db.select({ vendorId: productsTable.vendorId }).from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  if (!authed.isAdmin && product.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = AddMediaBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const vendorId = product.vendorId;

  // Determine next sort order
  const existing = await db.select({ id: productMediaTable.id }).from(productMediaTable).where(eq(productMediaTable.productId, productId));
  const sortOrder = existing.length;

  // If isPrimary requested or this is the first item, clear other primary flags first
  if (parsed.data.isPrimary || existing.length === 0) {
    await db.update(productMediaTable).set({ isPrimary: false }).where(eq(productMediaTable.productId, productId));
  }

  const [item] = await db.insert(productMediaTable).values({
    productId,
    vendorId,
    type: parsed.data.type ?? "image",
    url: parsed.data.url,
    caption: parsed.data.caption ?? null,
    sortOrder,
    isPrimary: parsed.data.isPrimary || existing.length === 0,
  }).returning();

  // Also update the product's legacy imageUrl if this is primary and an image
  if (item!.isPrimary && item!.type === "image") {
    await db.update(productsTable).set({ imageUrl: item!.url }).where(eq(productsTable.id, productId));
  }

  res.status(201).json(serializeMedia(item!));
});

// ── PATCH /products/:id/media/:mediaId ───────────────────────────────────────
const UpdateMediaBody = z.object({
  caption: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isPrimary: z.boolean().optional(),
});

router.patch("/products/:id/media/:mediaId", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const productId = parseInt(req.params.id ?? "", 10);
  const mediaId = parseInt(req.params.mediaId ?? "", 10);
  if (!productId || !mediaId) { res.status(400).json({ error: "Invalid ids" }); return; }

  const [existing] = await db.select().from(productMediaTable).where(and(eq(productMediaTable.id, mediaId), eq(productMediaTable.productId, productId)));
  if (!existing) { res.status(404).json({ error: "Media item not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateMediaBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // If setting as primary, clear others first
  if (parsed.data.isPrimary) {
    await db.update(productMediaTable).set({ isPrimary: false }).where(eq(productMediaTable.productId, productId));
  }

  const [updated] = await db.update(productMediaTable).set({
    ...(parsed.data.caption !== undefined ? { caption: parsed.data.caption } : {}),
    ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
    ...(parsed.data.isPrimary !== undefined ? { isPrimary: parsed.data.isPrimary } : {}),
  }).where(eq(productMediaTable.id, mediaId)).returning();

  // Sync product's legacy imageUrl
  if (updated!.isPrimary && updated!.type === "image") {
    await db.update(productsTable).set({ imageUrl: updated!.url }).where(eq(productsTable.id, productId));
  }

  res.json(serializeMedia(updated!));
});

// ── DELETE /products/:id/media/:mediaId ──────────────────────────────────────
router.delete("/products/:id/media/:mediaId", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const productId = parseInt(req.params.id ?? "", 10);
  const mediaId = parseInt(req.params.mediaId ?? "", 10);
  if (!productId || !mediaId) { res.status(400).json({ error: "Invalid ids" }); return; }

  const [existing] = await db.select().from(productMediaTable).where(and(eq(productMediaTable.id, mediaId), eq(productMediaTable.productId, productId)));
  if (!existing) { res.status(404).json({ error: "Media item not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(productMediaTable).where(eq(productMediaTable.id, mediaId));

  // If deleted item was primary, promote the next image to primary
  if (existing.isPrimary) {
    const remaining = await db.select().from(productMediaTable)
      .where(eq(productMediaTable.productId, productId))
      .orderBy(asc(productMediaTable.sortOrder), asc(productMediaTable.id));
    const nextImage = remaining.find(m => m.type === "image") ?? remaining[0];
    if (nextImage) {
      await db.update(productMediaTable).set({ isPrimary: true }).where(eq(productMediaTable.id, nextImage.id));
      await db.update(productsTable).set({ imageUrl: nextImage.url }).where(eq(productsTable.id, productId));
    } else {
      // No media left — clear legacy imageUrl
      await db.update(productsTable).set({ imageUrl: null }).where(eq(productsTable.id, productId));
    }
  }

  res.sendStatus(204);
});

// ── POST /products/media/upload-url ─────────────────────────────────────────
// Presigned URL so the browser can upload directly to object storage.
router.post("/products/media/upload-url", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
  const objectPath = objectStorageService.normalizeObjectEntityPath(uploadUrl);
  const publicUrl = await objectStorageService.getPublicObjectURL(objectPath);

  res.json({ uploadUrl, objectPath, publicUrl });
});

// ── GET /public/products/:vendorId/:productId ────────────────────────────────
// Public product detail page — used for shareable product links.
router.get("/public/products/:vendorId/:productId", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.params.vendorId ?? "", 10);
  const productId = parseInt(req.params.productId ?? "", 10);
  if (!vendorId || !productId) { res.status(400).json({ error: "Invalid ids" }); return; }

  const [vendor] = await db.select({
    id: vendorsTable.id,
    name: vendorsTable.name,
    businessType: vendorsTable.businessType,
  }).from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const [product] = await db.select().from(productsTable).where(
    and(eq(productsTable.id, productId), eq(productsTable.vendorId, vendorId))
  );
  if (!product || product.status !== "active") { res.status(404).json({ error: "Product not found" }); return; }

  const media = await db.select().from(productMediaTable)
    .where(eq(productMediaTable.productId, productId))
    .orderBy(asc(productMediaTable.sortOrder), asc(productMediaTable.id));

  // Resolve vendor website slug for shop link
  const [website] = await db.select({ slug: vendorWebsitesTable.slug })
    .from(vendorWebsitesTable).where(eq(vendorWebsitesTable.vendorId, vendorId));

  res.json({
    vendor: { id: vendor.id, name: vendor.name, businessType: vendor.businessType },
    product: {
      ...product,
      price: parseFloat(product.price),
      costPrice: product.costPrice ? parseFloat(product.costPrice) : null,
      variations: product.variationsJson ? JSON.parse(product.variationsJson) : [],
    },
    media: media.map(serializeMedia),
    shopUrl: website?.slug ? `/site/${website.slug}/shop` : null,
  });
});

function serializeMedia(m: typeof productMediaTable.$inferSelect) {
  return {
    ...m,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
  };
}

export default router;
