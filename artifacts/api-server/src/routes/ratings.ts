/**
 * Vendor Ratings — customer-facing routes.
 *
 * POST /ratings            — submit a rating after an order (public, no auth required)
 * GET  /ratings/:vendorId  — fetch all public ratings for a vendor (public)
 * GET  /ratings/summary/:vendorId — avg + count for a vendor (public, used by site renderer)
 * GET  /admin/ratings      — all ratings across all vendors (admin only)
 * PATCH /admin/ratings/:id — flag/unflag a rating or toggle visibility (admin only)
 */
import { Router } from "express";
import { eq, desc, avg, count, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db,
  vendorRatingsTable,
  ordersTable,
} from "@workspace/db";

const router = Router();
export default router;

// ── POST /ratings ─────────────────────────────────────────────────────────────
router.post("/ratings", async (req, res): Promise<void> => {
  const { vendorId, orderId, customerName, customerEmail, rating, review } = req.body as {
    vendorId: number; orderId?: number; customerName?: string; customerEmail?: string;
    rating: number; review?: string;
  };

  if (!vendorId || !rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: "vendorId and rating (1–5) are required" }); return;
  }

  // Verify the order belongs to this vendor if provided
  let isVerifiedPurchase = false;
  if (orderId) {
    const [order] = await db.select({ id: ordersTable.id })
      .from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.vendorId, vendorId)))
      .limit(1);
    isVerifiedPurchase = !!order;
  }

  // Prevent duplicate ratings for the same order
  if (orderId) {
    const [existing] = await db.select({ id: vendorRatingsTable.id })
      .from(vendorRatingsTable)
      .where(eq(vendorRatingsTable.orderId, orderId))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "A rating has already been submitted for this order." }); return;
    }
  }

  const [row] = await db.insert(vendorRatingsTable).values({
    vendorId,
    orderId:             orderId ?? null,
    customerName:        customerName?.trim().slice(0, 120) ?? null,
    customerEmail:       customerEmail?.trim().toLowerCase().slice(0, 254) ?? null,
    rating,
    review:              review?.trim().slice(0, 1200) ?? null,
    isVerifiedPurchase,
    isPublic:            true,
    isFlagged:           false,
  }).returning();

  res.status(201).json({ id: row!.id, message: "Thank you for your rating!" });
});

// ── GET /ratings/:vendorId ────────────────────────────────────────────────────
router.get("/ratings/:vendorId", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.params.vendorId, 10);
  if (!vendorId) { res.status(400).json({ error: "Invalid vendorId" }); return; }

  const rows = await db.select()
    .from(vendorRatingsTable)
    .where(and(
      eq(vendorRatingsTable.vendorId, vendorId),
      eq(vendorRatingsTable.isPublic, true),
      eq(vendorRatingsTable.isFlagged, false),
    ))
    .orderBy(desc(vendorRatingsTable.createdAt))
    .limit(50);

  res.json({ ratings: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) });
});

// ── GET /ratings/summary/:vendorId ────────────────────────────────────────────
router.get("/ratings/summary/:vendorId", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.params.vendorId, 10);
  if (!vendorId) { res.status(400).json({ error: "Invalid vendorId" }); return; }

  const [result] = await db
    .select({ avg: avg(vendorRatingsTable.rating), count: count() })
    .from(vendorRatingsTable)
    .where(and(
      eq(vendorRatingsTable.vendorId, vendorId),
      eq(vendorRatingsTable.isPublic, true),
      eq(vendorRatingsTable.isFlagged, false),
    ));

  res.json({
    average: result?.avg ? parseFloat(result.avg).toFixed(1) : null,
    count:   result?.count ?? 0,
  });
});

// ── GET /admin/ratings ────────────────────────────────────────────────────────
router.get("/admin/ratings", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!adminIds.includes(userId)) { res.status(403).json({ error: "Admin only" }); return; }

  const rows = await db.select().from(vendorRatingsTable)
    .orderBy(desc(vendorRatingsTable.createdAt))
    .limit(200);

  res.json({ ratings: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) });
});

// ── PATCH /admin/ratings/:id ──────────────────────────────────────────────────
router.patch("/admin/ratings/:id", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!adminIds.includes(userId)) { res.status(403).json({ error: "Admin only" }); return; }

  const id = parseInt(req.params.id, 10);
  const { isFlagged, isPublic } = req.body as { isFlagged?: boolean; isPublic?: boolean };
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof isFlagged === "boolean") update.isFlagged = isFlagged;
  if (typeof isPublic  === "boolean") update.isPublic  = isPublic;

  const [row] = await db.update(vendorRatingsTable).set(update).where(eq(vendorRatingsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Rating not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});
