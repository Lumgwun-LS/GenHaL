/**
 * Vendor support-ticket routes — all require Clerk authentication.
 * Mounted AFTER requireAuth in routes/index.ts.
 */
import { Router } from "express";
import { db, vendorsTable, supportTicketsTable, supportTicketMessagesTable } from "@workspace/db";
import { eq, and, desc, asc, inArray, sql, count } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router = Router();
const objectStorageService = new ObjectStorageService();

/** Resolve the authenticated vendor's ID from their Clerk session. */
async function resolveAuthedVendor(req: import("express").Request): Promise<{ vendorId: number | null; isAdmin: boolean }> {
  const userId = (req as any).auth?.userId as string | undefined;
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

// ── GET /support/tickets ───────────────────────────────────────────────────────
// List vendor's tickets with optional status/category/priority filters.
router.get("/support/tickets", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { status, category, priority, page = "1", limit = "30" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * pageSize;

  const conditions = [eq(supportTicketsTable.vendorId, authed.vendorId)];
  if (status) conditions.push(eq(supportTicketsTable.status, status));
  if (category) conditions.push(eq(supportTicketsTable.category, category));
  if (priority) conditions.push(eq(supportTicketsTable.priority, priority));

  const [tickets, [{ total }]] = await Promise.all([
    db.select().from(supportTicketsTable)
      .where(and(...conditions))
      .orderBy(desc(supportTicketsTable.updatedAt))
      .limit(pageSize).offset(offset),
    db.select({ total: count() }).from(supportTicketsTable).where(and(...conditions)),
  ]);

  // Count unread (customer messages after vendorLastReadAt)
  const unreadCounts: Record<number, number> = {};
  if (tickets.length > 0) {
    const ticketIds = tickets.map((t) => t.id);
    const unreadRows = await db
      .select({ ticketId: supportTicketMessagesTable.ticketId, cnt: count() })
      .from(supportTicketMessagesTable)
      .where(and(
        inArray(supportTicketMessagesTable.ticketId, ticketIds),
        eq(supportTicketMessagesTable.senderType, "customer"),
      ))
      .groupBy(supportTicketMessagesTable.ticketId);

    for (const row of unreadRows) {
      // Count messages after vendorLastReadAt for that ticket
      const ticket = tickets.find((t) => t.id === row.ticketId);
      if (ticket?.vendorLastReadAt) {
        const [{ cnt: unread }] = await db
          .select({ cnt: count() })
          .from(supportTicketMessagesTable)
          .where(and(
            eq(supportTicketMessagesTable.ticketId, row.ticketId),
            eq(supportTicketMessagesTable.senderType, "customer"),
            sql`${supportTicketMessagesTable.createdAt} > ${ticket.vendorLastReadAt}`,
          ));
        unreadCounts[row.ticketId] = unread;
      } else {
        unreadCounts[row.ticketId] = row.cnt;
      }
    }
  }

  res.json({
    tickets: tickets.map((t) => ({ ...t, unreadCount: unreadCounts[t.id] ?? 0 })),
    total,
    page: pageNum,
    pageSize,
  });
});

// ── GET /support/tickets/stats ─────────────────────────────────────────────────
// Summary counts by status for dashboard badges.
router.get("/support/tickets/stats", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const rows = await db
    .select({ status: supportTicketsTable.status, cnt: count() })
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.vendorId, authed.vendorId))
    .groupBy(supportTicketsTable.status);

  const stats: Record<string, number> = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
  for (const row of rows) stats[row.status] = row.cnt;

  res.json(stats);
});

// ── GET /support/tickets/:id ──────────────────────────────────────────────────
// Get a single ticket with full message thread.
router.get("/support/tickets/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const ticketId = parseInt(req.params.id ?? "");
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const [ticket] = await db
    .select()
    .from(supportTicketsTable)
    .where(and(eq(supportTicketsTable.id, ticketId), eq(supportTicketsTable.vendorId, authed.vendorId)));

  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const messages = await db
    .select()
    .from(supportTicketMessagesTable)
    .where(eq(supportTicketMessagesTable.ticketId, ticketId))
    .orderBy(asc(supportTicketMessagesTable.createdAt));

  // Mark as read
  await db.update(supportTicketsTable)
    .set({ vendorLastReadAt: new Date() })
    .where(eq(supportTicketsTable.id, ticketId));

  res.json({ ticket, messages });
});

// ── PATCH /support/tickets/:id ────────────────────────────────────────────────
// Update ticket status and/or priority.
router.patch("/support/tickets/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const ticketId = parseInt(req.params.id ?? "");
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const [existing] = await db
    .select({ id: supportTicketsTable.id })
    .from(supportTicketsTable)
    .where(and(eq(supportTicketsTable.id, ticketId), eq(supportTicketsTable.vendorId, authed.vendorId)));

  if (!existing) { res.status(404).json({ error: "Ticket not found" }); return; }

  const { status, priority } = req.body as { status?: string; priority?: string };
  const validStatuses = ["open", "in_progress", "resolved", "closed"];
  const validPriorities = ["low", "normal", "high", "urgent"];

  if (status && !validStatuses.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  if (priority && !validPriorities.includes(priority)) { res.status(400).json({ error: "Invalid priority" }); return; }

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (status) {
    updates.status = status;
    if (status === "resolved") updates.resolvedAt = new Date();
  }
  if (priority) updates.priority = priority;

  const [updated] = await db.update(supportTicketsTable).set(updates).where(eq(supportTicketsTable.id, ticketId)).returning();
  res.json(updated);
});

// ── POST /support/tickets/:id/messages ────────────────────────────────────────
// Vendor replies to a ticket.
router.post("/support/tickets/:id/messages", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const ticketId = parseInt(req.params.id ?? "");
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const { content, attachmentUrls = [], attachmentTypes = [] } = req.body as {
    content?: string; attachmentUrls?: string[]; attachmentTypes?: string[];
  };
  if (!content?.trim()) { res.status(400).json({ error: "content is required" }); return; }

  const [ticket] = await db
    .select()
    .from(supportTicketsTable)
    .where(and(eq(supportTicketsTable.id, ticketId), eq(supportTicketsTable.vendorId, authed.vendorId)));

  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (ticket.status === "closed") { res.status(409).json({ error: "Cannot reply to a closed ticket" }); return; }

  // Fetch vendor name
  const [vendor] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, authed.vendorId));

  const [msg] = await db.transaction(async (tx) => {
    const [m] = await tx.insert(supportTicketMessagesTable).values({
      ticketId,
      senderType: "vendor",
      senderName: vendor?.name ?? "Support",
      content: content.trim(),
      attachmentUrls: attachmentUrls.length ? attachmentUrls : null,
      attachmentTypes: attachmentTypes.length ? attachmentTypes : null,
    }).returning();

    const statusUpdate: Record<string, any> = {
      status: ticket.status === "open" ? "in_progress" : ticket.status,
      updatedAt: new Date(),
      vendorLastReadAt: new Date(),
    };
    if (!ticket.firstReplyAt) statusUpdate.firstReplyAt = new Date();

    await tx.update(supportTicketsTable).set(statusUpdate).where(eq(supportTicketsTable.id, ticketId));
    return [m];
  });

  res.status(201).json(msg);
});

// ── POST /support/upload-url ──────────────────────────────────────────────────
// Presigned upload URL for vendor reply attachments.
router.post("/support/upload-url", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const base = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
  if (!base) { res.status(500).json({ error: "No public domain configured" }); return; }

  try {
    const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadUrl);
    const objectId = objectPath.replace(/^\/objects\/uploads\//, "");
    const publicUrl = `https://${base}/api/media/${objectId}`;
    await objectStorageService
      .trySetObjectEntityAclPolicy(objectPath, { owner: "system:vendor-upload", visibility: "public" })
      .catch(() => { /* best-effort */ });
    res.json({ uploadUrl, publicUrl });
  } catch (err) {
    logger.error({ err }, "[support] Failed to get upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// ── GET /support/link ─────────────────────────────────────────────────────────
// Returns the vendor's shareable public support link.
router.get("/support/link", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }
  const origin = `${req.protocol}://${req.headers.host}`;
  res.json({ link: `${origin}/help/${authed.vendorId}` });
});

export default router;
