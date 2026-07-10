/**
 * GET /vendors/:id/notifications  — in-app notifications for a vendor
 * PATCH /vendors/:id/notifications/:nid/read — mark a notification as read
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { vendorNotificationsTable, vendorsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";

function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

const router = Router();

// ─── GET /vendors/:id/notifications ──────────────────────────────────────────

router.get("/vendors/:id/notifications", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Only the vendor owner or an admin may read notifications
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (vendor.clerkUserId !== userId && !isAdmin(userId)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const notifications = await db
    .select()
    .from(vendorNotificationsTable)
    .where(eq(vendorNotificationsTable.vendorId, id))
    .orderBy(desc(vendorNotificationsTable.createdAt))
    .limit(50);

  res.json(notifications);
});

// ─── PATCH /vendors/:id/notifications/:nid/read ───────────────────────────────

router.patch("/vendors/:id/notifications/:nid/read", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const nid = Number(req.params.nid);
  if (isNaN(id) || isNaN(nid)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (vendor.clerkUserId !== userId && !isAdmin(userId)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [notification] = await db
    .update(vendorNotificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(vendorNotificationsTable.id, nid),
        eq(vendorNotificationsTable.vendorId, id),
      ),
    )
    .returning();

  if (!notification) { res.status(404).json({ error: "Notification not found" }); return; }

  res.json(notification);
});

// ─── POST /vendors/:id/notifications — admin sends a custom message ─────────

router.post("/vendors/:id/notifications", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) { res.status(400).json({ error: "Message is required" }); return; }
  if (message.length > 1000) { res.status(400).json({ error: "Message is too long" }); return; }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const [notification] = await db
    .insert(vendorNotificationsTable)
    .values({ vendorId: id, type: "general", message })
    .returning();

  res.status(201).json(notification);
});

export default router;
