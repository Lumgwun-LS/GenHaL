/**
 * GET /vendors/:id/notifications  — in-app notifications for a vendor
 * PATCH /vendors/:id/notifications/:nid/read — mark a notification as read
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { vendorNotificationsTable, vendorsTable } from "@workspace/db/schema";
import { eq, and, desc, inArray, isNull, ne } from "drizzle-orm";
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
    .where(
      and(
        eq(vendorNotificationsTable.vendorId, id),
        // email_retry_audit rows are admin-only audit entries and must
        // never appear in the vendor's own notification bell.
        ne(vendorNotificationsTable.type, "email_retry_audit"),
      ),
    )
    .orderBy(desc(vendorNotificationsTable.createdAt))
    .limit(50);

  res.json(notifications);
});

// ─── PATCH /vendors/:id/notifications/read-all ───────────────────────────────

router.patch("/vendors/:id/notifications/read-all", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (vendor.clerkUserId !== userId && !isAdmin(userId)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const updated = await db
    .update(vendorNotificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(vendorNotificationsTable.vendorId, id),
        isNull(vendorNotificationsTable.readAt),
      ),
    )
    .returning();

  res.json({ updated: updated.length });
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
  //
  // Track exactly which vendors did NOT get the email, and why, so admins can
  // follow up manually instead of only seeing an aggregate count.
  type EmailFailure = { vendorId: number; vendorName: string; reason: "opted_out" | "no_email" | "send_failed" };
  const failures: EmailFailure[] = targetVendors
    .filter((v) => v.announcementEmailOptOut)
    .map((v) => ({ vendorId: v.id, vendorName: v.name, reason: "opted_out" as const }));

  const emailEligibleVendors = targetVendors.filter((v) => !v.announcementEmailOptOut);
  let emailsSent = 0;
  await Promise.all(
    emailEligibleVendors.map(async (v) => {
      if (!v.email) {
        failures.push({ vendorId: v.id, vendorName: v.name, reason: "no_email" });
        return;
      }
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
      if (result.status === "sent") {
        emailsSent += 1;
      } else {
        failures.push({ vendorId: v.id, vendorName: v.name, reason: "send_failed" });
      }
    }),
  );

  res.status(201).json({
    sent: notifications.length,
    emailsSent,
    emailAttempted: emailEligibleVendors.length,
    failures,
  });
});

// ─── POST /vendors/notifications/bulk/retry-emails ────────────────────────────
// Re-sends the announcement email to a specific set of vendors (no new in-app
// notification). The caller must supply the `failures` array from the original
// bulk-send response. The server extracts only the vendor IDs with
// reason="send_failed" and retries those — vendors who succeeded on the first
// send are not present in the failures array and therefore can never be
// double-sent by this endpoint. opted_out and no_email vendors are silently
// skipped even if the caller accidentally includes them.

router.post("/vendors/notifications/bulk/retry-emails", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) { res.status(400).json({ error: "Message is required" }); return; }
  if (message.length > 1000) { res.status(400).json({ error: "Message is too long" }); return; }

  // Accept the structured failures list from the original bulk send so the
  // server can enforce — without any external state — that only send_failed
  // vendors are ever retried. Vendors who received the email successfully are
  // not present in the failures array and are therefore structurally excluded.
  const rawFailures: unknown[] = Array.isArray(req.body?.failures) ? req.body.failures : [];
  const sendFailedIds: number[] = Array.from(
    new Set(
      rawFailures
        .filter(
          (f): f is { vendorId: unknown; reason: unknown } =>
            typeof f === "object" && f !== null && "vendorId" in f && "reason" in f,
        )
        .filter((f) => f.reason === "send_failed")
        .map((f) => Number(f.vendorId))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  );

  if (sendFailedIds.length === 0) {
    res.status(400).json({ error: "No send_failed vendors to retry" });
    return;
  }

  const targetVendors = await db
    .select({
      id: vendorsTable.id,
      name: vendorsTable.name,
      email: vendorsTable.email,
      announcementEmailOptOut: vendorsTable.announcementEmailOptOut,
    })
    .from(vendorsTable)
    .where(inArray(vendorsTable.id, sendFailedIds));

  if (targetVendors.length === 0) { res.status(404).json({ error: "No matching vendors found" }); return; }

  // Skip opted-out and no-email vendors — only attempt those who can actually receive email.
  type EmailFailure = { vendorId: number; vendorName: string; reason: "opted_out" | "no_email" | "send_failed" };
  const skipped: EmailFailure[] = [];
  const eligible = targetVendors.filter((v) => {
    if (v.announcementEmailOptOut) {
      skipped.push({ vendorId: v.id, vendorName: v.name, reason: "opted_out" });
      return false;
    }
    if (!v.email) {
      skipped.push({ vendorId: v.id, vendorName: v.name, reason: "no_email" });
      return false;
    }
    return true;
  });

  let succeeded = 0;
  const newFailures: EmailFailure[] = [];

  await Promise.all(
    eligible.map(async (v) => {
      const html = wrapVendorEmail({
        bodyHtml: `
          <h1 style="text-align: center; font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">Announcement from VendorHub</h1>
          <p style="font-size: 14px; line-height: 1.6; color: #444;">Hi ${escapeHtml(v.name)},</p>
          <p style="font-size: 14px; line-height: 1.6; color: #444; white-space: pre-wrap;">${escapeHtml(message)}</p>
        `,
      });
      const result = await sendEmail({
        to: v.email!,
        subject: "Announcement from VendorHub",
        html,
      });
      if (result.status === "sent") {
        succeeded += 1;
      } else {
        newFailures.push({ vendorId: v.id, vendorName: v.name, reason: "send_failed" });
      }
    }),
  );

  // Insert one admin-only audit row per vendor whose email was successfully
  // re-delivered, so the admin message history reflects the retry and admins
  // have a persistent record instead of only the ephemeral toast.
  if (succeeded > 0) {
    let retryAdminDisplayName: string | null = null;
    try {
      const adminUser = await clerkClient.users.getUser(userId);
      const fullName = [adminUser.firstName, adminUser.lastName].filter(Boolean).join(" ").trim();
      retryAdminDisplayName =
        fullName ||
        adminUser.username ||
        adminUser.primaryEmailAddress?.emailAddress ||
        adminUser.emailAddresses[0]?.emailAddress ||
        null;
    } catch {
      retryAdminDisplayName = null;
    }

    const recoveredVendors = eligible.filter(
      (v) => !newFailures.some((f) => f.vendorId === v.id),
    );
    if (recoveredVendors.length > 0) {
      await db.insert(vendorNotificationsTable).values(
        recoveredVendors.map((v) => ({
          vendorId: v.id,
          type: "email_retry_audit" as const,
          message,
          adminUserId: userId,
          adminDisplayName: retryAdminDisplayName,
        })),
      );
    }
  }

  res.json({
    retried: eligible.length,
    succeeded,
    failures: [...skipped, ...newFailures],
  });
});

export default router;
