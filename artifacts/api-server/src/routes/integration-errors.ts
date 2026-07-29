/**
 * Integration Error Tracker routes
 *
 * Vendor routes (auth-gated via Clerk):
 *   POST /integration-errors/report           — submit a support report
 *   GET  /integration-errors/my-reports       — vendor's own report history
 *   GET  /integration-errors/my-logs          — vendor's own auto-captured error logs
 *
 * Admin routes:
 *   GET   /admin/integration-errors/reports          — all reports (filterable)
 *   GET   /admin/integration-errors/logs             — all raw error logs (filterable)
 *   PATCH /admin/integration-errors/reports/:id/status — update status / resolve
 */

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq, desc, and, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  integrationErrorLogsTable,
  integrationSupportReportsTable,
  vendorNotificationsTable,
  vendorsTable,
} from "@workspace/db";
import { sendPushToVendor } from "../lib/push";
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../lib/email-branding";
import { PLATFORM_LABELS } from "../lib/integration-errors";
import pino from "pino";

const logger = pino({ name: "integration-errors-routes" });

function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

async function resolveVendorId(clerkUserId: string): Promise<number | null> {
  const [v] = await db
    .select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, clerkUserId))
    .limit(1);
  return v?.id ?? null;
}

const router = Router();

// ── Vendor: submit a report ──────────────────────────────────────────────────

const ReportInput = z.object({
  platform:   z.string().min(1).max(64),
  description: z.string().min(5).max(2000),
  /** Optional link to an auto-captured error log row. */
  errorLogId: z.number().int().positive().optional(),
});

router.post("/integration-errors/report", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendorId = await resolveVendorId(userId);
  if (!vendorId) { res.status(403).json({ error: "Vendor account required." }); return; }

  const parsed = ReportInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { platform, description, errorLogId } = parsed.data;

  // Validate the errorLogId belongs to this vendor (if provided)
  if (errorLogId) {
    const [log] = await db
      .select({ vendorId: integrationErrorLogsTable.vendorId })
      .from(integrationErrorLogsTable)
      .where(eq(integrationErrorLogsTable.id, errorLogId))
      .limit(1);
    if (!log || log.vendorId !== vendorId) {
      res.status(400).json({ error: "Invalid errorLogId." });
      return;
    }
  }

  const [report] = await db
    .insert(integrationSupportReportsTable)
    .values({ vendorId, platform, description, errorLogId: errorLogId ?? null, status: "open" })
    .returning();

  res.status(201).json(report);
});

// ── Vendor: my reports ───────────────────────────────────────────────────────

router.get("/integration-errors/my-reports", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendorId = await resolveVendorId(userId);
  if (!vendorId) { res.status(403).json({ error: "Vendor account required." }); return; }

  const reports = await db
    .select()
    .from(integrationSupportReportsTable)
    .where(eq(integrationSupportReportsTable.vendorId, vendorId))
    .orderBy(desc(integrationSupportReportsTable.createdAt))
    .limit(100);

  res.json(reports.map(serializeReport));
});

// ── Vendor: my error logs ────────────────────────────────────────────────────

router.get("/integration-errors/my-logs", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendorId = await resolveVendorId(userId);
  if (!vendorId) { res.status(403).json({ error: "Vendor account required." }); return; }

  const logs = await db
    .select()
    .from(integrationErrorLogsTable)
    .where(eq(integrationErrorLogsTable.vendorId, vendorId))
    .orderBy(desc(integrationErrorLogsTable.createdAt))
    .limit(200);

  res.json(logs.map(serializeLog));
});

// ── Admin: all reports ───────────────────────────────────────────────────────

router.get("/admin/integration-errors/reports", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const { status, platform, vendorId } = req.query;

  const conditions = [];
  if (status && typeof status === "string") conditions.push(eq(integrationSupportReportsTable.status, status));
  if (platform && typeof platform === "string") conditions.push(eq(integrationSupportReportsTable.platform, platform));
  if (vendorId && !isNaN(Number(vendorId))) conditions.push(eq(integrationSupportReportsTable.vendorId, Number(vendorId)));

  const reports = await db
    .select({
      report: integrationSupportReportsTable,
      vendorName: vendorsTable.name,
      vendorEmail: vendorsTable.email,
    })
    .from(integrationSupportReportsTable)
    .leftJoin(vendorsTable, eq(integrationSupportReportsTable.vendorId, vendorsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(integrationSupportReportsTable.createdAt))
    .limit(500);

  res.json(reports.map(({ report, vendorName, vendorEmail }) => ({
    ...serializeReport(report),
    vendorName,
    vendorEmail,
  })));
});

// ── Admin: all error logs ────────────────────────────────────────────────────

router.get("/admin/integration-errors/logs", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const { platform, vendorId } = req.query;

  const conditions = [];
  if (platform && typeof platform === "string") conditions.push(eq(integrationErrorLogsTable.platform, platform));
  if (vendorId && !isNaN(Number(vendorId))) conditions.push(eq(integrationErrorLogsTable.vendorId, Number(vendorId)));

  const logs = await db
    .select({
      log: integrationErrorLogsTable,
      vendorName: vendorsTable.name,
    })
    .from(integrationErrorLogsTable)
    .leftJoin(vendorsTable, eq(integrationErrorLogsTable.vendorId, vendorsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(integrationErrorLogsTable.createdAt))
    .limit(500);

  res.json(logs.map(({ log, vendorName }) => ({
    ...serializeLog(log),
    vendorName,
  })));
});

// ── Admin: update report status / resolve ────────────────────────────────────

const UpdateReportInput = z.object({
  status: z.enum(["open", "in_progress", "resolved"]),
  adminNote: z.string().max(2000).optional(),
});

router.patch("/admin/integration-errors/reports/:id/status", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const reportId = Number(req.params.id);
  if (isNaN(reportId)) { res.status(400).json({ error: "Invalid report id." }); return; }

  const parsed = UpdateReportInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { status, adminNote } = parsed.data;
  const isResolving = status === "resolved";

  // Load the report + vendor info
  const [existing] = await db
    .select({
      report: integrationSupportReportsTable,
      vendorName: vendorsTable.name,
      vendorEmail: vendorsTable.email,
    })
    .from(integrationSupportReportsTable)
    .leftJoin(vendorsTable, eq(integrationSupportReportsTable.vendorId, vendorsTable.id))
    .where(eq(integrationSupportReportsTable.id, reportId))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Report not found." }); return; }

  // Resolve admin display name from Clerk
  let adminName = "Platform Admin";
  try {
    const { clerkClient } = await import("@clerk/express");
    const clerkUser = await clerkClient.users.getUser(userId);
    adminName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.username || adminName;
  } catch { /* non-fatal */ }

  const now = new Date();
  const [updated] = await db
    .update(integrationSupportReportsTable)
    .set({
      status,
      adminNote: adminNote ?? existing.report.adminNote,
      resolvedByAdminId: isResolving ? userId : existing.report.resolvedByAdminId,
      resolvedByAdminName: isResolving ? adminName : existing.report.resolvedByAdminName,
      resolvedAt: isResolving ? now : existing.report.resolvedAt,
    })
    .where(eq(integrationSupportReportsTable.id, reportId))
    .returning();

  // Notify vendor on resolve (only once — check vendorNotifiedAt)
  if (isResolving && !existing.report.vendorNotifiedAt && existing.report.vendorId) {
    const vendorId = existing.report.vendorId;
    const platformLabel = PLATFORM_LABELS[existing.report.platform] ?? existing.report.platform;
    const note = adminNote ?? "";

    // In-app notification
    try {
      await db.insert(vendorNotificationsTable).values({
        vendorId,
        type: "integration_error_resolved",
        message: `Your integration issue with ${platformLabel} has been resolved.${note ? ` Admin note: ${note}` : ""}`,
        adminUserId: userId,
        adminDisplayName: adminName,
      });
    } catch (err) {
      logger.error({ err }, "Failed to insert vendor notification for integration resolve");
    }

    // Push notification
    sendPushToVendor(vendorId, "Integration Issue Resolved ✅", `Your ${platformLabel} connection issue has been resolved.`, { type: "integration_error_resolved", reportId })
      .catch((err) => logger.error({ err }, "Push notify failed for integration resolve"));

    // Email
    if (existing.vendorEmail) {
      const bodyHtml = `
        <p>Hi ${escapeHtml(existing.vendorName ?? "there")},</p>
        <p>Your support report for a <strong>${escapeHtml(platformLabel)}</strong> integration issue has been marked as <strong>resolved</strong>.</p>
        ${note ? `<p><strong>Admin note:</strong> ${escapeHtml(note)}</p>` : ""}
        <p>If the issue persists, please open a new report from your dashboard under <em>Settings → Integrations</em>.</p>
        <p>Thank you for your patience.</p>
      `;
      sendEmail({
        to: existing.vendorEmail,
        subject: `Your ${platformLabel} Integration Issue Has Been Resolved`,
        html: wrapVendorEmail({ bodyHtml }),
      }).catch((err) => logger.error({ err }, "Email notify failed for integration resolve"));
    }

    // Mark vendor as notified
    await db
      .update(integrationSupportReportsTable)
      .set({ vendorNotifiedAt: now })
      .where(eq(integrationSupportReportsTable.id, reportId));
  }

  res.json(serializeReport(updated));
});

// ── Serialisers ──────────────────────────────────────────────────────────────

function serializeLog(log: typeof integrationErrorLogsTable.$inferSelect) {
  return {
    ...log,
    createdAt: log.createdAt.toISOString(),
  };
}

function serializeReport(r: typeof integrationSupportReportsTable.$inferSelect) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    vendorNotifiedAt: r.vendorNotifiedAt?.toISOString() ?? null,
  };
}

export default router;
