/**
 * GET /vendors/:id/notifications  — in-app notifications for a vendor
 * PATCH /vendors/:id/notifications/:nid/read — mark a notification as read
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { vendorNotificationsTable, vendorsTable } from "@workspace/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getAuth, clerkClient } from "@clerk/express";
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../lib/email-branding";

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

  // Resolve the sending admin's display name from Clerk so the vendor (and
  // admin history) can see who sent the message. Fall back gracefully if
  // Clerk lookup fails — the message should still send.
  let adminDisplayName: string | null = null;
  try {
    const adminUser = await clerkClient.users.getUser(userId);
    const fullName = [adminUser.firstName, adminUser.lastName].filter(Boolean).join(" ").trim();
    adminDisplayName =
      fullName ||
      adminUser.username ||
      adminUser.primaryEmailAddress?.emailAddress ||
      adminUser.emailAddresses[0]?.emailAddress ||
      null;
  } catch {
    adminDisplayName = null;
  }

  const [notification] = await db
    .insert(vendorNotificationsTable)
    .values({ vendorId: id, type: "general", message, adminUserId: userId, adminDisplayName })
    .returning();

  res.status(201).json(notification);
});

// ─── POST /vendors/notifications/bulk — admin messages several vendors ───────

router.post("/vendors/notifications/bulk", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) { res.status(400).json({ error: "Message is required" }); return; }
  if (message.length > 1000) { res.status(400).json({ error: "Message is too long" }); return; }

  const all = req.body?.all === true;
  const rawIds = Array.isArray(req.body?.vendorIds) ? req.body.vendorIds : [];
  const vendorIds: number[] = Array.from(
    new Set(rawIds.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n))),
  );

  let targetVendors: { id: number; name: string; email: string; announcementEmailOptOut: boolean }[];
  if (all) {
    targetVendors = await db
      .select({
        id: vendorsTable.id,
        name: vendorsTable.name,
        email: vendorsTable.email,
        announcementEmailOptOut: vendorsTable.announcementEmailOptOut,
      })
      .from(vendorsTable);
  } else {
    if (vendorIds.length === 0) { res.status(400).json({ error: "Select at least one vendor" }); return; }
    targetVendors = await db
      .select({
        id: vendorsTable.id,
        name: vendorsTable.name,
        email: vendorsTable.email,
        announcementEmailOptOut: vendorsTable.announcementEmailOptOut,
      })
      .from(vendorsTable)
      .where(inArray(vendorsTable.id, vendorIds));
  }

  if (targetVendors.length === 0) { res.status(404).json({ error: "No matching vendors found" }); return; }

  let adminDisplayName: string | null = null;
  try {
    const adminUser = await clerkClient.users.getUser(userId);
    const fullName = [adminUser.firstName, adminUser.lastName].filter(Boolean).join(" ").trim();
    adminDisplayName =
      fullName ||
      adminUser.username ||
      adminUser.primaryEmailAddress?.emailAddress ||
      adminUser.emailAddresses[0]?.emailAddress ||
      null;
  } catch {
    adminDisplayName = null;
  }

  const notifications = await db
    .insert(vendorNotificationsTable)
    .values(
      targetVendors.map((v) => ({
        vendorId: v.id,
        type: "general" as const,
        message,
        adminUserId: userId,
        adminDisplayName,
      })),
    )
    .returning();

  // In-app notification is always created above; also email each vendor so
  // time-sensitive announcements aren't missed by vendors who aren't logged in.
  // Vendors who opted out of announcement emails still get the in-app notification,
  // just no email. Emailing is best-effort — a mail failure never blocks the in-app send above.
  const emailEligibleVendors = targetVendors.filter((v) => !v.announcementEmailOptOut);
  let emailsSent = 0;
  await Promise.all(
    emailEligibleVendors.map(async (v) => {
      if (!v.email) return;
      const html = wrapVendorEmail({
        bodyHtml: `
          <h1 style="text-align: center; font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">Announcement from VendorHub</h1>
          <p style="font-size: 14px; line-height: 1.6; color: #444;">Hi ${escapeHtml(v.name)},</p>
          <p style="font-size: 14px; line-height: 1.6; color: #444; white-space: pre-wrap;">${escapeHtml(message)}</p>
        `,
      });
      const result = await sendEmail({
        to: v.email,
        subject: "Announcement from VendorHub",
        html,
      });
      if (result.status === "sent") emailsSent += 1;
    }),
  );

  res.status(201).json({ sent: notifications.length, emailsSent, emailAttempted: emailEligibleVendors.length });
});

export default router;
