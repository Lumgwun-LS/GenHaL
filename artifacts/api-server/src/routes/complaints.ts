/**
 * Customer Complaints — submitted after a deal/order.
 *
 * POST /complaints               — submit a complaint (public, no auth required)
 * GET  /admin/complaints         — all complaints (admin only)
 * PATCH /admin/complaints/:id    — update status / add admin note (admin only)
 * GET  /admin/complaints/:vendorId — complaints for a specific vendor (admin only)
 */
import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, customerComplaintsTable, vendorsTable } from "@workspace/db";

const router = Router();
export default router;

// ── POST /complaints ──────────────────────────────────────────────────────────
router.post("/complaints", async (req, res): Promise<void> => {
  const { vendorId, orderId, customerName, customerEmail, subject, body } = req.body as {
    vendorId: number; orderId?: number; customerName?: string;
    customerEmail: string; subject: string; body: string;
  };

  if (!vendorId || !customerEmail || !subject?.trim() || !body?.trim()) {
    res.status(400).json({ error: "vendorId, customerEmail, subject and body are required" }); return;
  }

  // Verify vendor exists
  const [vendor] = await db.select({ id: vendorsTable.id })
    .from(vendorsTable).where(eq(vendorsTable.id, vendorId)).limit(1);
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const [row] = await db.insert(customerComplaintsTable).values({
    vendorId,
    orderId:       orderId ?? null,
    customerName:  customerName?.trim().slice(0, 120) ?? null,
    customerEmail: customerEmail.trim().toLowerCase().slice(0, 254),
    subject:       subject.trim().slice(0, 300),
    body:          body.trim().slice(0, 4000),
    status:        "open",
  }).returning();

  res.status(201).json({ id: row!.id, message: "Your complaint has been received. We will review it shortly." });
});

// ── GET /admin/complaints ─────────────────────────────────────────────────────
router.get("/admin/complaints", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!adminIds.includes(userId)) { res.status(403).json({ error: "Admin only" }); return; }

  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;

  const rows = statusFilter
    ? await db.select().from(customerComplaintsTable)
        .where(eq(customerComplaintsTable.status, statusFilter))
        .orderBy(desc(customerComplaintsTable.createdAt))
        .limit(200)
    : await db.select().from(customerComplaintsTable)
        .orderBy(desc(customerComplaintsTable.createdAt))
        .limit(200);

  res.json({ complaints: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) });
});

// ── GET /admin/complaints/vendor/:vendorId ────────────────────────────────────
router.get("/admin/complaints/vendor/:vendorId", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!adminIds.includes(userId)) { res.status(403).json({ error: "Admin only" }); return; }

  const vendorId = parseInt(req.params.vendorId, 10);
  const rows = await db.select().from(customerComplaintsTable)
    .where(eq(customerComplaintsTable.vendorId, vendorId))
    .orderBy(desc(customerComplaintsTable.createdAt))
    .limit(100);

  res.json({ complaints: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) });
});

// ── PATCH /admin/complaints/:id ───────────────────────────────────────────────
router.patch("/admin/complaints/:id", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!adminIds.includes(userId)) { res.status(403).json({ error: "Admin only" }); return; }

  const id = parseInt(req.params.id, 10);
  const { status, adminNote } = req.body as { status?: string; adminNote?: string };
  const VALID = ["open", "in_review", "resolved", "dismissed"];
  if (status && !VALID.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${VALID.join(", ")}` }); return;
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (status)    update.status    = status;
  if (typeof adminNote === "string") update.adminNote = adminNote.trim().slice(0, 2000);

  const [row] = await db.update(customerComplaintsTable).set(update).where(eq(customerComplaintsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Complaint not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});
