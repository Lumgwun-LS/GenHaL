/**
 * Admin-only endpoints.
 *
 * GET  /admin/check          — returns { isAdmin: boolean } for the current user
 * GET  /admin/vendors        — all vendors enriched with payment-credential status
 */
import { Router } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { vendorsTable, vendorPaymentCredentialsTable, birthdayMessageLogsTable, voiceCallLogsTable, adminAuditLogTable, adminExportLogsTable, adminExportAcknowledgmentsTable, adminExportAcknowledgmentLogTable, voiceCampaignsTable, voiceCampaignCallsTable, voiceSignatureFailuresTable, voiceSignatureFailureAcknowledgmentsTable, voiceSignatureFailureAcknowledgmentLogTable, vendorNotificationsTable, paymentsTable, platformUsersTable, ordersTable, pageViewsTable, customersTable, leadsTable } from "@workspace/db/schema";
import { eq, desc, and, gte, lte, gt, asc, inArray, sql, isNull, or, ilike, type SQL } from "drizzle-orm";
import { subscriptionRefundBlacklistTable } from "@workspace/db/schema";
import { isTwilioConfigured } from "../lib/voice-caller";
import { canAddPaymentKeys } from "../lib/vendor-keys";
import { getSiteContent, getSiteContentBlock, setSiteContentBlock, validateSiteContentBlock, getSiteContentAuditLog, SITE_CONTENT_KEYS, type SiteContentKey } from "../lib/site-content";
import { ZodError } from "zod";
import { resendBirthdayEmail, retryBirthdayCall } from "../lib/birthday-scheduler";
import { retryCampaignCall, retryAllFailedCampaignCalls } from "./voice-campaigns";
import { sendSlackAlert } from "../lib/slack";
import { runVoiceBackfill, getVoiceBackfillLastRun, getVoiceBackfillRecentFixes } from "../lib/voice-backfill";
import { syncSaleFromPayment } from "../lib/sales-sync";
import { notifyVendorPaymentStatus, sendPushToVendor } from "../lib/push";
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../lib/email-branding";
import { getExportAlertSettings, getExportBurstStatus, checkExportBurst } from "../lib/admin-export-burst";

export { checkExportBurst };

/**
 * Mirrors the thresholds used in routes/voice-status-callback.ts (both read
 * the same site-content override) so the Admin Panel banner lights up on
 * the same criteria as the Slack alert.
 */
async function getVoiceSignatureFailureAlertSettings(): Promise<{ threshold: number; windowMinutes: number }> {
  const raw = await getSiteContentBlock("admin.voiceSignatureFailureAlertSettings");
  return raw as { threshold: number; windowMinutes: number };
}

/**
 * Determines whether the Twilio signature-failure burst alert is currently
 * flagged, mirroring `getExportBurstStatus` — except this alert is global
 * (one shared TWILIO_AUTH_TOKEN) rather than per-admin, so the
 * acknowledgment is a single row instead of one per admin. Flagged once the
 * failure count within the rolling window reaches the threshold, and stays
 * flagged until either:
 *  - an admin acknowledges *after* the failure that crossed the threshold
 *    (an ack that predates the crossing doesn't clear a new burst), or
 *  - enough time passes that the crossing failure ages out of the window.
 */
async function getVoiceSignatureFailureBurstStatus(): Promise<{
  flagged: boolean;
  count: number;
  threshold: number;
  windowMinutes: number;
  flaggedAt: Date | null;
  lastFailureAt: Date | null;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
}> {
  const { threshold, windowMinutes } = await getVoiceSignatureFailureAlertSettings();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  const recent = await db
    .select({ createdAt: voiceSignatureFailuresTable.createdAt })
    .from(voiceSignatureFailuresTable)
    .where(gte(voiceSignatureFailuresTable.createdAt, windowStart))
    .orderBy(desc(voiceSignatureFailuresTable.createdAt));

  const count = recent.length;
  const lastFailureAt = recent[0]?.createdAt ?? null;

  const [ack] = await db.select().from(voiceSignatureFailureAcknowledgmentsTable).limit(1);

  if (count < threshold) {
    return {
      flagged: false,
      count,
      threshold,
      windowMinutes,
      flaggedAt: null,
      lastFailureAt,
      acknowledgedAt: ack?.acknowledgedAt ?? null,
      acknowledgedBy: ack?.acknowledgedBy ?? null,
    };
  }

  // The failure that pushed the count to `threshold` (i.e. the Nth most
  // recent one) is the moment this burst became flagged.
  const flaggedAt = recent[threshold - 1]!.createdAt;
  const cleared = Boolean(ack) && ack!.acknowledgedAt >= flaggedAt;

  return {
    flagged: !cleared,
    count,
    threshold,
    windowMinutes,
    flaggedAt,
    lastFailureAt,
    acknowledgedAt: ack?.acknowledgedAt ?? null,
    acknowledgedBy: ack?.acknowledgedBy ?? null,
  };
}

/** Returns true if the calling Clerk user is listed in ADMIN_USER_IDS env var. */
function isAdmin(userId: string): boolean {
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

const router = Router();

// ─── GET /admin/check ─────────────────────────────────────────────────────────

router.get("/admin/check", (req, res): void => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ isAdmin: isAdmin(userId) });
});

// ─── GET /admin/whoami ─────────────────────────────────────────────────────────
// Returns the current user's Clerk user ID. Useful for confirming the correct
// ID is listed in ADMIN_USER_IDS — if isAdmin is false, copy the clerkUserId
// value and add it to the ADMIN_USER_IDS secret (comma-separated).

router.get("/admin/whoami", (req, res): void => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ clerkUserId: userId, isAdmin: isAdmin(userId) });
});

// ─── GET /admin/vendors ───────────────────────────────────────────────────────

router.get("/admin/vendors", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!isAdmin(userId)) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  const vendors = await db.select().from(vendorsTable).orderBy(vendorsTable.name);
  const creds = await db.select().from(vendorPaymentCredentialsTable);

  const credsByVendor = new Map(creds.map((c) => [c.vendorId, c]));

  const enriched = vendors.map((v) => {
    const c = credsByVendor.get(v.id);
    return {
      id: v.id,
      name: v.name,
      industry: v.industry,
      status: v.status,
      email: v.email,
      subscriptionTier: v.subscriptionTier,
      verificationLevel: v.verificationLevel,
      featureUnlocked: canAddPaymentKeys(v),
      createdAt: v.createdAt,
      announcementEmailOptOut: v.announcementEmailOptOut,
      stripe: {
        hasKey: Boolean(c?.stripeSecretEncrypted),
        testPassed: c?.stripeTestPassed ?? false,
      },
      paystack: {
        hasKey: Boolean(c?.paystackSecretEncrypted),
        testPassed: c?.paystackTestPassed ?? false,
      },
    };
  });

  res.json(enriched);
});

// ─── GET /admin/vendors/export ────────────────────────────────────────────────

router.get("/admin/vendors/export", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const burstStatus = await getExportBurstStatus(userId);
  if (burstStatus.blocked) {
    res.status(429).json({
      error:
        "Exports from this account are paused after unusually frequent downloads. Ask another admin to review and clear the flag in the Admin Panel's Export History before exporting again.",
      count: burstStatus.count,
      threshold: burstStatus.threshold,
      windowMinutes: burstStatus.windowMinutes,
    });
    return;
  }

  const { tier, status, verificationLevel, joinedAfter, joinedBefore } = req.query as {
    tier?: string;
    status?: string;
    verificationLevel?: string;
    joinedAfter?: string;
    joinedBefore?: string;
  };

  const conditions: SQL[] = [];
  if (tier) conditions.push(eq(vendorsTable.subscriptionTier, tier));
  if (status) conditions.push(eq(vendorsTable.status, status));
  if (verificationLevel) conditions.push(eq(vendorsTable.verificationLevel, verificationLevel));
  if (joinedAfter) {
    const d = new Date(joinedAfter);
    if (!isNaN(d.getTime())) conditions.push(gte(vendorsTable.createdAt, d));
  }
  if (joinedBefore) {
    const d = new Date(joinedBefore);
    if (!isNaN(d.getTime())) {
      // Include the entire selected day by treating it as an inclusive end-of-day bound.
      const endOfDay = new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1);
      conditions.push(lte(vendorsTable.createdAt, endOfDay));
    }
  }

  const HEADERS = [
    "ID", "Name", "Industry", "Status", "Email", "Phone", "Website",
    "Address", "Subscription Tier", "Verification Level",
    "Payment Keys Connected",
    "Stripe Enabled", "Paystack Enabled", "Default Currency",
    "Voice Call Opt-Out", "Date of Birth", "Created At", "Updated At",
  ];

  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    // Prevent CSV formula injection: prefix formula-starting chars with a single quote
    const safe = /^[=+\-@|\t]/.test(s) ? `'${s}` : s;
    if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  }

  const filename = `vendors-export-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  res.write(HEADERS.join(",") + "\r\n");

  // Stream vendors in fixed-size batches ordered by a stable, indexed key (id)
  // so memory usage stays constant regardless of table size — no matter how
  // many thousands of vendors match the filters, we only ever hold one batch
  // (plus its payment-credential lookups) in memory at a time.
  const BATCH_SIZE = 500;
  let lastId = 0;
  let totalRows = 0;

  while (true) {
    const batchConditions = [...conditions, gt(vendorsTable.id, lastId)];
    const batch = await db
      .select()
      .from(vendorsTable)
      .where(and(...batchConditions))
      .orderBy(asc(vendorsTable.id))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    const batchIds = batch.map((v) => v.id);
    const creds = await db
      .select()
      .from(vendorPaymentCredentialsTable)
      .where(inArray(vendorPaymentCredentialsTable.vendorId, batchIds));
    const credsByVendor = new Map(creds.map((c) => [c.vendorId, c]));

    let chunk = "";
    for (const v of batch) {
      const c = credsByVendor.get(v.id);
      const keysConnected: string[] = [];
      if (c?.stripeSecretEncrypted) keysConnected.push("Stripe");
      if (c?.paystackSecretEncrypted) keysConnected.push("Paystack");

      const row = [
        v.id, v.name, v.industry, v.status, v.email ?? "",
        v.phone ?? "", v.website ?? "", v.address ?? "",
        v.subscriptionTier, v.verificationLevel,
        keysConnected.join("; "),
        v.stripeEnabled, v.paystackEnabled, v.defaultCurrency ?? "",
        v.voiceCallOptOut, v.dateOfBirth ?? "", v.createdAt, v.updatedAt,
      ].map(csvCell).join(",");
      chunk += row + "\r\n";
    }
    res.write(chunk);

    totalRows += batch.length;
    lastId = batch[batch.length - 1]!.id;
    if (batch.length < BATCH_SIZE) break;
  }

  res.end();

  await db.insert(adminExportLogsTable).values({
    adminUserId: userId,
    filters: JSON.stringify({ tier, status, verificationLevel, joinedAfter, joinedBefore }),
    rowCount: totalRows,
  });

  await checkExportBurst(userId);
});

// ─── GET /admin/export-alerts ─────────────────────────────────────────────────

/**
 * Returns admins currently mid-burst (>= threshold exports within the
 * window), so the Admin Panel can show a visible warning even for admins
 * who didn't trigger the Slack alert themselves (e.g. a teammate checking
 * in later during the same burst).
 */
router.get("/admin/export-alerts", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const { threshold, windowMinutes } = await getExportAlertSettings();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
  const flagged = await db
    .select({
      adminUserId: adminExportLogsTable.adminUserId,
      count: sql<number>`count(*)`,
      lastExportAt: sql<string>`max(${adminExportLogsTable.exportedAt})`,
    })
    .from(adminExportLogsTable)
    .where(gte(adminExportLogsTable.exportedAt, windowStart))
    .groupBy(adminExportLogsTable.adminUserId)
    .having(sql`count(*) >= ${threshold}`);

  const acknowledgments = await db.select().from(adminExportAcknowledgmentsTable);
  const ackByAdmin = new Map(acknowledgments.map((a) => [a.adminUserId, a]));

  const enriched = await Promise.all(
    flagged.map(async (f) => {
      const status = await getExportBurstStatus(f.adminUserId);
      const ack = ackByAdmin.get(f.adminUserId);
      return {
        ...f,
        count: Number(f.count),
        blocked: status.blocked,
        acknowledgedAt: ack?.acknowledgedAt ?? null,
        acknowledgedBy: ack?.acknowledgedBy ?? null,
      };
    }),
  );

  res.json({
    threshold,
    windowMinutes,
    flagged: enriched,
  });
});

// ─── POST /admin/export-alerts/:adminUserId/acknowledge ───────────────────────

/**
 * Clears a flagged export burst for `adminUserId`, unblocking further
 * exports from that account. `adminExportAcknowledgmentsTable` is upserted
 * (keyed by adminUserId) so the block check only needs the latest review,
 * but every review is also appended to `adminExportAcknowledgmentLogTable`
 * so the full history survives for compliance — see who cleared each past
 * burst for this admin, not just the most recent one.
 */
router.post("/admin/export-alerts/:adminUserId/acknowledge", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const targetAdminUserId = req.params.adminUserId;
  if (!targetAdminUserId) {
    res.status(400).json({ error: "Missing admin user id." });
    return;
  }

  if (userId === targetAdminUserId) {
    res.status(403).json({
      error:
        "You cannot acknowledge your own export-burst flag. A different admin must review and clear it.",
    });
    return;
  }

  let acknowledgedByDisplayName: string | null = null;
  try {
    const adminUser = await clerkClient.users.getUser(userId);
    const fullName = [adminUser.firstName, adminUser.lastName].filter(Boolean).join(" ").trim();
    acknowledgedByDisplayName =
      fullName ||
      adminUser.username ||
      adminUser.primaryEmailAddress?.emailAddress ||
      adminUser.emailAddresses[0]?.emailAddress ||
      null;
  } catch {
    acknowledgedByDisplayName = null;
  }

  const acknowledgedAt = new Date();

  await db
    .insert(adminExportAcknowledgmentsTable)
    .values({ adminUserId: targetAdminUserId, acknowledgedBy: userId, acknowledgedAt })
    .onConflictDoUpdate({
      target: adminExportAcknowledgmentsTable.adminUserId,
      set: { acknowledgedAt, acknowledgedBy: userId },
    });

  await db.insert(adminExportAcknowledgmentLogTable).values({
    adminUserId: targetAdminUserId,
    acknowledgedAt,
    acknowledgedBy: userId,
    acknowledgedByDisplayName,
  });

  // Notify the flagged admin so they know their block has been lifted,
  // who reviewed it, and when — rather than silently discovering they can
  // export again on their next attempt.
  try {
    const [flaggedVendor] = await db
      .select({ id: vendorsTable.id, name: vendorsTable.name, email: vendorsTable.email })
      .from(vendorsTable)
      .where(eq(vendorsTable.clerkUserId, targetAdminUserId))
      .limit(1);

    if (flaggedVendor) {
      const reviewerName = escapeHtml(acknowledgedByDisplayName ?? userId);
      const clearedAt = acknowledgedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
      const notificationMessage =
        `Your export-burst flag was reviewed and cleared by ${acknowledgedByDisplayName ?? userId} on ${clearedAt}. You can export vendor data again.`;

      // In-app notification
      await db.insert(vendorNotificationsTable).values({
        vendorId: flaggedVendor.id,
        type: "general",
        message: notificationMessage,
        adminUserId: userId,
        adminDisplayName: acknowledgedByDisplayName,
      });

      // Push notification (no category filter — admin account-level notice)
      await sendPushToVendor(
        flaggedVendor.id,
        "Export block lifted",
        `Your export flag was cleared by ${acknowledgedByDisplayName ?? userId}.`,
        { screen: "notifications" },
      );

      // Email notification
      if (flaggedVendor.email) {
        const html = wrapVendorEmail({
          bodyHtml: `
            <h2 style="margin: 0 0 16px; font-size: 20px; color: #1a1a1a;">Your export block has been lifted</h2>
            <p style="margin: 0 0 12px; color: #444; line-height: 1.6;">
              Your vendor-data export access was temporarily paused after an unusually high number of
              downloads were detected from your account.
            </p>
            <p style="margin: 0 0 12px; color: #444; line-height: 1.6;">
              Another admin — <strong>${reviewerName}</strong> — has reviewed your activity and cleared
              the flag at <strong>${escapeHtml(clearedAt)}</strong>. You can now download vendor exports again.
            </p>
            <p style="margin: 0; color: #888; font-size: 13px;">
              If you have any questions about this review, please reach out to the admin team directly.
            </p>`,
        });
        await sendEmail({
          to: flaggedVendor.email,
          subject: "Your export block has been lifted",
          html,
        });
      }
    }
  } catch (err) {
    // Non-fatal: the acknowledgment itself succeeded; notifications are best-effort.
    console.error("[admin] Failed to send export-unblock notification:", err);
  }

  res.json({ success: true });
});

// ─── GET /admin/export-alerts/:adminUserId/history ────────────────────────────

/**
 * Full review history for a flagged admin — every past "Acknowledge &
 * unblock" click, not just the latest one used for the block check.
 */
router.get("/admin/export-alerts/:adminUserId/history", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const targetAdminUserId = req.params.adminUserId;
  if (!targetAdminUserId) {
    res.status(400).json({ error: "Missing admin user id." });
    return;
  }

  const history = await db
    .select()
    .from(adminExportAcknowledgmentLogTable)
    .where(eq(adminExportAcknowledgmentLogTable.adminUserId, targetAdminUserId))
    .orderBy(desc(adminExportAcknowledgmentLogTable.acknowledgedAt));

  res.json(history);
});

// ─── GET /admin/export-logs ────────────────────────────────────────────────────

router.get("/admin/export-logs", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const logs = await db
    .select()
    .from(adminExportLogsTable)
    .orderBy(desc(adminExportLogsTable.exportedAt))
    .limit(50);

  res.json(logs);
});

// ─── GET /admin/voice/signature-failures ──────────────────────────────────────

/**
 * Recent rejected Twilio status-callback requests (bad/missing signature).
 * A sustained stream of these — especially "invalid_signature" — means
 * TWILIO_AUTH_TOKEN in Secrets no longer matches the token active on the
 * Twilio account (usually because it was rotated in the Twilio console) and
 * needs to be updated there.
 */
router.get("/admin/voice/signature-failures", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const failures = await db
    .select()
    .from(voiceSignatureFailuresTable)
    .orderBy(desc(voiceSignatureFailuresTable.createdAt))
    .limit(50);

  res.json(failures);
});

// ─── GET /admin/voice/signature-failures/alert ────────────────────────────────

router.get("/admin/voice/signature-failures/alert", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const status = await getVoiceSignatureFailureBurstStatus();
  res.json(status);
});

// ─── POST /admin/voice/signature-failures/acknowledge ─────────────────────────

/**
 * Clears a flagged Twilio signature-failure burst, e.g. after an admin has
 * rotated TWILIO_AUTH_TOKEN in Secrets to match the token active on the
 * Twilio account. `voiceSignatureFailureAcknowledgmentsTable` keeps only the
 * latest review (single row) for the block-check, but every review is also
 * appended to `voiceSignatureFailureAcknowledgmentLogTable` so the history
 * survives for later reference — mirrors the export-burst acknowledge flow.
 */
router.post("/admin/voice/signature-failures/acknowledge", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  let acknowledgedByDisplayName: string | null = null;
  try {
    const adminUser = await clerkClient.users.getUser(userId);
    const fullName = [adminUser.firstName, adminUser.lastName].filter(Boolean).join(" ").trim();
    acknowledgedByDisplayName =
      fullName ||
      adminUser.username ||
      adminUser.primaryEmailAddress?.emailAddress ||
      adminUser.emailAddresses[0]?.emailAddress ||
      null;
  } catch {
    acknowledgedByDisplayName = null;
  }

  const acknowledgedAt = new Date();

  const [existing] = await db.select().from(voiceSignatureFailureAcknowledgmentsTable).limit(1);
  if (existing) {
    await db
      .update(voiceSignatureFailureAcknowledgmentsTable)
      .set({ acknowledgedAt, acknowledgedBy: userId })
      .where(eq(voiceSignatureFailureAcknowledgmentsTable.id, existing.id));
  } else {
    await db.insert(voiceSignatureFailureAcknowledgmentsTable).values({ acknowledgedAt, acknowledgedBy: userId });
  }

  await db.insert(voiceSignatureFailureAcknowledgmentLogTable).values({
    acknowledgedAt,
    acknowledgedBy: userId,
    acknowledgedByDisplayName,
  });

  res.json({ success: true });
});

// ─── GET /admin/voice/signature-failures/history ───────────────────────────────

/** Full review history for the signature-failure alert, not just the latest ack. */
router.get("/admin/voice/signature-failures/history", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const history = await db
    .select()
    .from(voiceSignatureFailureAcknowledgmentLogTable)
    .orderBy(desc(voiceSignatureFailureAcknowledgmentLogTable.acknowledgedAt))
    .limit(50);

  res.json(history);
});

// ─── GET /admin/birthday-logs ─────────────────────────────────────────────────

router.get("/admin/birthday-logs", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const logs = await db
    .select()
    .from(birthdayMessageLogsTable)
    .orderBy(desc(birthdayMessageLogsTable.sentAt))
    .limit(200);

  res.json(logs);
});

// ─── POST /admin/birthday-logs/:id/resend ─────────────────────────────────────

router.post("/admin/birthday-logs/:id/resend", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const logId = Number(req.params.id);
  if (!Number.isInteger(logId) || logId <= 0) {
    res.status(400).json({ error: "Invalid log id." });
    return;
  }

  const result = await resendBirthdayEmail(logId);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ success: true });
});

// ─── GET /admin/voice-call-logs ───────────────────────────────────────────────

router.get("/admin/voice-call-logs", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const logs = await db
    .select({
      id: voiceCallLogsTable.id,
      vendorId: voiceCallLogsTable.vendorId,
      campaignId: voiceCallLogsTable.campaignId,
      phone: voiceCallLogsTable.phone,
      purpose: voiceCallLogsTable.purpose,
      status: voiceCallLogsTable.status,
      durationSeconds: voiceCallLogsTable.durationSeconds,
      callSid: voiceCallLogsTable.callSid,
      initiatedAt: voiceCallLogsTable.initiatedAt,
      vendorName: vendorsTable.name,
    })
    .from(voiceCallLogsTable)
    .leftJoin(vendorsTable, eq(voiceCallLogsTable.vendorId, vendorsTable.id))
    .orderBy(desc(voiceCallLogsTable.initiatedAt))
    .limit(300);

  res.json(logs);
});

// ─── POST /admin/voice-call-logs/:id/retry ────────────────────────────────────

router.post("/admin/voice-call-logs/:id/retry", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const logId = Number(req.params.id);
  if (!Number.isInteger(logId) || logId <= 0) {
    res.status(400).json({ error: "Invalid log id." });
    return;
  }

  const [log] = await db
    .select({ purpose: voiceCallLogsTable.purpose })
    .from(voiceCallLogsTable)
    .where(eq(voiceCallLogsTable.id, logId))
    .limit(1);
  if (!log) {
    res.status(404).json({ error: "Call log entry not found." });
    return;
  }

  const result = log.purpose === "campaign" ? await retryCampaignCall(logId) : await retryBirthdayCall(logId);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ success: true });
});

// ─── Bulk-retry job progress store ────────────────────────────────────────────

/**
 * In-memory store for bulk campaign-call retry jobs. Keyed by campaignId.
 * Each entry holds the live progress of an ongoing (or recently finished)
 * retry run so the frontend can poll without blocking on a long HTTP request.
 *
 * Intentionally in-process rather than in the DB: this state is transient
 * (a server restart loses it, which is fine — the admin can just retry again)
 * and we want zero DB overhead per-tick during the hot loop.
 */
type RetryJobState =
  | { status: "running"; total: number; attempted: number; succeeded: number; failed: number }
  | { status: "done";    total: number; attempted: number; succeeded: number; failed: number }
  | { status: "error";   error: string };

const retryJobs = new Map<number, RetryJobState>();

// ─── POST /admin/voice-campaigns/:cid/retry-failed ─────────────────────────────

/**
 * Starts a background bulk-retry for all failed calls in a campaign and
 * returns immediately (HTTP 202) with the initial job state. The caller
 * should poll GET /admin/voice-campaigns/:cid/retry-status for progress.
 * A second POST while a retry is already running returns 409.
 */
router.post("/admin/voice-campaigns/:cid/retry-failed", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const campaignId = Number(req.params.cid);
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    res.status(400).json({ error: "Invalid campaign id." });
    return;
  }

  // Prevent double-starting a retry for the same campaign.
  const existing = retryJobs.get(campaignId);
  if (existing?.status === "running") {
    res.status(409).json({ error: "A retry is already running for this campaign.", ...existing });
    return;
  }

  // Quick pre-flight: count failed calls so we can reject early and seed `total`.
  const failedRows = await db
    .select({ id: voiceCallLogsTable.id })
    .from(voiceCallLogsTable)
    .where(and(
      eq(voiceCallLogsTable.campaignId, campaignId),
      eq(voiceCallLogsTable.purpose, "campaign"),
      eq(voiceCallLogsTable.status, "failed"),
    ));

  if (failedRows.length === 0) {
    res.status(400).json({ error: "No failed calls to retry for this campaign." });
    return;
  }

  const total = failedRows.length;
  const initialState: RetryJobState = { status: "running", total, attempted: 0, succeeded: 0, failed: 0 };
  retryJobs.set(campaignId, initialState);

  // Fire-and-forget — the loop updates the Map; the caller polls the status route.
  retryAllFailedCampaignCalls(campaignId, (progress) => {
    retryJobs.set(campaignId, { status: "running", ...progress });
  })
    .then((result) => {
      retryJobs.set(campaignId, { status: "done", total, ...result });
    })
    .catch((err) => {
      retryJobs.set(campaignId, { status: "error", error: String(err) });
    });

  res.status(202).json(initialState);
});

// ─── GET /admin/voice-campaigns/:cid/retry-status ──────────────────────────────

/**
 * Returns the current progress of a bulk retry job for the given campaign.
 * Returns `{ status: "idle" }` when no retry has been started (or after the
 * server was restarted). Admins poll this every ~1.5 s while a retry runs.
 */
router.get("/admin/voice-campaigns/:cid/retry-status", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const campaignId = Number(req.params.cid);
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    res.status(400).json({ error: "Invalid campaign id." });
    return;
  }

  const state = retryJobs.get(campaignId);
  res.json(state ?? { status: "idle" });
});

// ─── GET /admin/audit-log ─────────────────────────────────────────────────────

router.get("/admin/audit-log", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const DEFAULT_LIMIT = 50;
  const MAX_LIMIT = 200;

  const rawLimit = Number(req.query.limit ?? DEFAULT_LIMIT);
  const rawOffset = Number(req.query.offset ?? 0);

  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  // Optional admin filters: exact Clerk user ID or a case-insensitive display name substring.
  const adminUserIdFilter = typeof req.query.adminUserId === "string" && req.query.adminUserId.trim()
    ? req.query.adminUserId.trim()
    : null;
  const adminSearchFilter = typeof req.query.adminSearch === "string" && req.query.adminSearch.trim()
    ? req.query.adminSearch.trim()
    : null;
  // Optional vendor filter — lets admins see all changes made to a specific vendor's account.
  const vendorIdFilter = typeof req.query.vendorId === "string" && /^\d+$/.test(req.query.vendorId)
    ? parseInt(req.query.vendorId, 10)
    : null;

  const conditions: SQL[] = [];
  if (vendorIdFilter) {
    conditions.push(eq(adminAuditLogTable.vendorId, vendorIdFilter));
  }
  if (adminUserIdFilter) {
    conditions.push(eq(adminAuditLogTable.adminUserId, adminUserIdFilter));
  } else if (adminSearchFilter) {
    // Match against both the persisted display name and the raw Clerk user ID
    // so admins can search by name or partial ID.
    conditions.push(
      sql`(
        lower(${adminAuditLogTable.adminDisplayName}) LIKE lower(${"%" + adminSearchFilter + "%"})
        OR lower(${adminAuditLogTable.adminUserId}) LIKE lower(${"%" + adminSearchFilter + "%"})
      )`
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(adminAuditLogTable)
    .where(whereClause);
  const total = Number(countResult?.count ?? 0);

  const entries = await db
    .select({
      id: adminAuditLogTable.id,
      adminUserId: adminAuditLogTable.adminUserId,
      adminDisplayName: adminAuditLogTable.adminDisplayName,
      vendorId: adminAuditLogTable.vendorId,
      vendorName: vendorsTable.name,
      field: adminAuditLogTable.field,
      oldValue: adminAuditLogTable.oldValue,
      newValue: adminAuditLogTable.newValue,
      changedAt: adminAuditLogTable.changedAt,
      paymentId: adminAuditLogTable.paymentId,
    })
    .from(adminAuditLogTable)
    .leftJoin(vendorsTable, eq(adminAuditLogTable.vendorId, vendorsTable.id))
    .where(whereClause)
    .orderBy(desc(adminAuditLogTable.changedAt))
    .limit(limit)
    .offset(offset);

  res.json({ entries, total, limit, offset });
});

// ─── GET /admin/message-history ──────────────────────────────────────────────
// Admin-facing view of every "general" (admin-authored) message sent to
// vendors — via the per-vendor compose dialog or the bulk-message tool.
// Optional ?vendorId= filters to a single vendor's history.

router.get("/admin/message-history", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  // Include both regular messages ("general") and email-retry audit entries
  // ("email_retry_audit"). The latter are admin-only rows that are never shown
  // in a vendor's notification bell but do appear in admin message history so
  // there is a persistent audit trail of recovered emails after a retry.
  const conditions: SQL[] = [
    sql`${vendorNotificationsTable.type} IN ('general', 'email_retry_audit')`,
  ];

  if (req.query.vendorId !== undefined) {
    const vendorId = Number(req.query.vendorId);
    if (!Number.isInteger(vendorId) || vendorId <= 0) {
      res.status(400).json({ error: "Invalid vendorId." });
      return;
    }
    conditions.push(eq(vendorNotificationsTable.vendorId, vendorId));
  }

  const messages = await db
    .select({
      id: vendorNotificationsTable.id,
      vendorId: vendorNotificationsTable.vendorId,
      vendorName: vendorsTable.name,
      message: vendorNotificationsTable.message,
      adminUserId: vendorNotificationsTable.adminUserId,
      adminDisplayName: vendorNotificationsTable.adminDisplayName,
      createdAt: vendorNotificationsTable.createdAt,
      type: vendorNotificationsTable.type,
      emailFailed: vendorNotificationsTable.emailFailed,
    })
    .from(vendorNotificationsTable)
    .leftJoin(vendorsTable, eq(vendorNotificationsTable.vendorId, vendorsTable.id))
    .where(and(...conditions))
    .orderBy(desc(vendorNotificationsTable.createdAt))
    .limit(200);

  res.json(messages);
});

// ─── GET /admin/tier-change-history ──────────────────────────────────────────
// Admin-facing view of every vendor subscription plan upgrade/downgrade —
// via the Stripe Customer Portal, cancellation, refund, reconciliation, or an
// admin manually editing a vendor's tier. Sourced from the same
// vendorNotificationsTable rows vendors see (type="tier_change"), filtered to
// rows that carry structured previousTier/newTier. Verification-level admin
// edits use their own "verification_change" type (see task #129) and never
// appear here.

router.get("/admin/tier-change-history", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const rawPage = parseInt(String(req.query.page ?? "1"), 10);
  const rawPageSize = parseInt(String(req.query.pageSize ?? "50"), 10);
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const pageSize = isNaN(rawPageSize) || rawPageSize < 1 ? 50 : Math.min(rawPageSize, 200);
  const offset = (page - 1) * pageSize;

  const rawVendorId = req.query.vendorId ? parseInt(String(req.query.vendorId), 10) : null;
  const vendorId = rawVendorId !== null && !isNaN(rawVendorId) ? rawVendorId : null;

  const baseWhere = and(
    eq(vendorNotificationsTable.type, "tier_change"),
    sql`${vendorNotificationsTable.previousTier} IS NOT NULL`,
    sql`${vendorNotificationsTable.newTier} IS NOT NULL`,
    ...(vendorId !== null ? [eq(vendorNotificationsTable.vendorId, vendorId)] : []),
  );

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(vendorNotificationsTable)
    .where(baseWhere);

  const total = Number(totalRow?.count ?? 0);

  const changes = await db
    .select({
      id: vendorNotificationsTable.id,
      vendorId: vendorNotificationsTable.vendorId,
      vendorName: vendorsTable.name,
      previousTier: vendorNotificationsTable.previousTier,
      newTier: vendorNotificationsTable.newTier,
      message: vendorNotificationsTable.message,
      createdAt: vendorNotificationsTable.createdAt,
    })
    .from(vendorNotificationsTable)
    .leftJoin(vendorsTable, eq(vendorNotificationsTable.vendorId, vendorsTable.id))
    .where(baseWhere)
    .orderBy(desc(vendorNotificationsTable.createdAt), desc(vendorNotificationsTable.id))
    .limit(pageSize)
    .offset(offset);

  res.json({ data: changes, page, pageSize, total });
});

// ─── GET /admin/tier-change-history/export ───────────────────────────────────

/**
 * Streams every tier_change notification row (optionally filtered to one
 * vendor) as a `text/csv` attachment. Follows the same burst-detection and
 * logging pattern as GET /admin/vendors/export so the Export History tab and
 * Slack alerts cover this export type too.
 *
 * Rows are streamed in ascending-id batches so memory use stays constant
 * regardless of how many plan changes exist.
 */
router.get("/admin/tier-change-history/export", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const burstStatus = await getExportBurstStatus(userId);
  if (burstStatus.blocked) {
    res.status(429).json({
      error:
        "Exports from this account are paused after unusually frequent downloads. Ask another admin to review and clear the flag in the Admin Panel's Export History before exporting again.",
      count: burstStatus.count,
      threshold: burstStatus.threshold,
      windowMinutes: burstStatus.windowMinutes,
    });
    return;
  }

  const rawVendorId = req.query.vendorId ? parseInt(String(req.query.vendorId), 10) : null;
  const vendorId = rawVendorId !== null && !isNaN(rawVendorId) ? rawVendorId : null;

  const HEADERS = ["ID", "Vendor ID", "Vendor Name", "Previous Tier", "New Tier", "Message", "Changed At"];

  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    // Prevent CSV formula injection: prefix formula-starting chars with a single quote
    const safe = /^[=+\-@|\t]/.test(s) ? `'${s}` : s;
    if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  }

  const vendorSuffix = vendorId !== null ? `-vendor${vendorId}` : "";
  const filename = `tier-change-history${vendorSuffix}-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  res.write(HEADERS.join(",") + "\r\n");

  const BATCH_SIZE = 500;
  let lastId = 0;
  let totalRows = 0;

  while (true) {
    const baseConditions: SQL[] = [
      eq(vendorNotificationsTable.type, "tier_change"),
      sql`${vendorNotificationsTable.previousTier} IS NOT NULL`,
      sql`${vendorNotificationsTable.newTier} IS NOT NULL`,
      gt(vendorNotificationsTable.id, lastId),
    ];
    if (vendorId !== null) {
      baseConditions.push(eq(vendorNotificationsTable.vendorId, vendorId));
    }

    const batch = await db
      .select({
        id: vendorNotificationsTable.id,
        vendorId: vendorNotificationsTable.vendorId,
        vendorName: vendorsTable.name,
        previousTier: vendorNotificationsTable.previousTier,
        newTier: vendorNotificationsTable.newTier,
        message: vendorNotificationsTable.message,
        createdAt: vendorNotificationsTable.createdAt,
      })
      .from(vendorNotificationsTable)
      .leftJoin(vendorsTable, eq(vendorNotificationsTable.vendorId, vendorsTable.id))
      .where(and(...baseConditions))
      .orderBy(asc(vendorNotificationsTable.id))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    let chunk = "";
    for (const row of batch) {
      chunk += [
        row.id,
        row.vendorId,
        row.vendorName ?? "",
        row.previousTier ?? "",
        row.newTier ?? "",
        row.message ?? "",
        row.createdAt,
      ].map(csvCell).join(",") + "\r\n";
    }
    res.write(chunk);

    totalRows += batch.length;
    lastId = batch[batch.length - 1]!.id;
    if (batch.length < BATCH_SIZE) break;
  }

  res.end();

  await db.insert(adminExportLogsTable).values({
    adminUserId: userId,
    filters: JSON.stringify({ exportType: "tier-change-history", vendorId }),
    rowCount: totalRows,
  });

  await checkExportBurst(userId);
});

// ─── GET /admin/site-content ─────────────────────────────────────────────────

router.get("/admin/site-content", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const content = await getSiteContent();
  res.json(content);
});

// ─── PATCH /admin/site-content/:key ───────────────────────────────────────────

router.patch("/admin/site-content/:key", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const key = req.params.key as SiteContentKey;
  if (!SITE_CONTENT_KEYS.includes(key)) {
    res.status(400).json({ error: `Unknown content key "${key}".` });
    return;
  }

  const { value } = req.body as { value?: unknown };
  if (value === undefined || value === null || typeof value !== "object") {
    res.status(400).json({ error: "Body must include a `value` object." });
    return;
  }

  let validated: unknown;
  try {
    validated = validateSiteContentBlock(key, value);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: "Invalid content shape.", details: err.issues });
      return;
    }
    throw err;
  }

  // Resolve the admin's display name from Clerk so the change history is
  // readable without a separate lookup later. Fall back gracefully if
  // Clerk is unavailable.
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

  await setSiteContentBlock(key, validated, userId, adminDisplayName);
  res.json({ success: true });
});

// ─── GET /admin/site-content/:key/history ─────────────────────────────────────

/**
 * Full edit history for one site-content block (who changed it, old/new
 * value, when) — unlike the block's own row, which only keeps the latest
 * editor. Used e.g. by the Export History card to show every past change to
 * the export-burst alert threshold/window, not just the current setting.
 */
router.get("/admin/site-content/:key/history", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const key = req.params.key as SiteContentKey;
  if (!SITE_CONTENT_KEYS.includes(key)) {
    res.status(400).json({ error: `Unknown content key "${key}".` });
    return;
  }

  const entries = await getSiteContentAuditLog(key);
  res.json(entries);
});

// ─── GET /admin/voice-campaigns/scheduled ─────────────────────────────────────

router.get("/admin/voice-campaigns/scheduled", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const leadCounts = db
    .select({
      campaignId: voiceCampaignCallsTable.campaignId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(voiceCampaignCallsTable)
    .groupBy(voiceCampaignCallsTable.campaignId)
    .as("lead_counts");

  const rows = await db
    .select({
      id: voiceCampaignsTable.id,
      name: voiceCampaignsTable.name,
      scheduledAt: voiceCampaignsTable.scheduledAt,
      vendorId: voiceCampaignsTable.vendorId,
      vendorName: vendorsTable.name,
      leadCount: sql<number>`coalesce(${leadCounts.count}, 0)`,
    })
    .from(voiceCampaignsTable)
    .innerJoin(vendorsTable, eq(voiceCampaignsTable.vendorId, vendorsTable.id))
    .leftJoin(leadCounts, eq(leadCounts.campaignId, voiceCampaignsTable.id))
    .where(eq(voiceCampaignsTable.status, "scheduled"))
    .orderBy(asc(voiceCampaignsTable.scheduledAt));

  res.json(rows);
});

// ─── GET /admin/voice-backfill ─────────────────────────────────────────────────
// Reconciliation job that recovers calls stuck in a non-terminal status
// because their Twilio status-callback was rejected while TWILIO_AUTH_TOKEN
// was stale. Runs automatically every 5 minutes; this endpoint reports the
// last run outcome so admins can confirm it actually caught up.

router.get("/admin/voice-backfill", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const [lastRun, recentFixes] = await Promise.all([getVoiceBackfillLastRun(), getVoiceBackfillRecentFixes()]);
  res.json({ ...lastRun, recentFixes });
});

// ─── POST /admin/voice-backfill/run ────────────────────────────────────────────

router.post("/admin/voice-backfill/run", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const result = await runVoiceBackfill(userId);
  res.json(result);
});

// ─── GET /admin/voice-status ──────────────────────────────────────────────────

router.get("/admin/voice-status", (req, res): void => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }
  res.json({ configured: isTwilioConfigured() });
});

// ─── GET /voice-status (non-admin — any authenticated user) ───────────────────
// Used by the vendor Voice Campaigns page to conditionally show the setup banner.

router.get("/voice-status", (req, res): void => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json({ configured: isTwilioConfigured() });
});

// ─── GET /admin/payment-conflicts ──────────────────────────────────────────────
// Payments where applyPaymentStatusTransition (payments/webhooks.ts) refused to
// resurrect a vendor-cancelled payment because a late webhook reported it as
// paid/failed. The conflict is recorded on metadata.reconciliationConflict and
// a Slack alert already fired at the time — this is the durable, admin-visible
// counterpart so someone doesn't have to know to go dig through Slack + the DB.
//
// Pass ?resolved=true to retrieve the history of already-resolved conflicts
// (includes resolution, resolvedBy, resolvedAt). Omit it (or pass false) to
// get only unresolved conflicts — the default to-do list view.

router.get("/admin/payment-conflicts", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const showResolved = req.query.resolved === "true";

  const whereClause = showResolved
    ? sql`
        ${paymentsTable.metadata} -> 'reconciliationConflict' IS NOT NULL
        AND (${paymentsTable.metadata} -> 'reconciliationConflict' ->> 'resolvedAt') IS NOT NULL
      `
    : sql`
        ${paymentsTable.metadata} -> 'reconciliationConflict' IS NOT NULL
        AND (${paymentsTable.metadata} -> 'reconciliationConflict' ->> 'resolvedAt') IS NULL
      `;

  const rows = await db
    .select({
      id: paymentsTable.id,
      vendorId: paymentsTable.vendorId,
      vendorName: vendorsTable.name,
      orderId: paymentsTable.orderId,
      provider: paymentsTable.provider,
      providerReference: paymentsTable.providerReference,
      amount: paymentsTable.amount,
      currency: paymentsTable.currency,
      status: paymentsTable.status,
      metadata: paymentsTable.metadata,
      updatedAt: paymentsTable.updatedAt,
    })
    .from(paymentsTable)
    .leftJoin(vendorsTable, eq(paymentsTable.vendorId, vendorsTable.id))
    .where(whereClause)
    .orderBy(desc(paymentsTable.updatedAt))
    .limit(200);

  const conflicts = rows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const conflict = meta.reconciliationConflict as
      | { attemptedStatus: string; provider: string; detectedAt: string; resolution?: string; resolvedAt?: string; resolvedBy?: string; resolvedByDisplayName?: string | null }
      | undefined;
    return {
      id: r.id,
      vendorId: r.vendorId,
      vendorName: r.vendorName,
      orderId: r.orderId,
      provider: r.provider,
      providerReference: r.providerReference,
      amount: r.amount,
      currency: r.currency,
      currentStatus: r.status,
      attemptedStatus: conflict?.attemptedStatus ?? null,
      webhookProvider: conflict?.provider ?? null,
      detectedAt: conflict?.detectedAt ?? null,
      // Resolved-only fields — null on open conflicts
      resolution: conflict?.resolution ?? null,
      resolvedAt: conflict?.resolvedAt ?? null,
      resolvedBy: conflict?.resolvedBy ?? null,
      resolvedByDisplayName: conflict?.resolvedByDisplayName ?? null,
    };
  });

  res.json(conflicts);
});

// ─── POST /admin/payment-conflicts/:id/resolve ─────────────────────────────────
// Lets an admin close out a flagged conflict: either "dismiss" it (the locally
// cancelled status was correct and nothing should change) or manually apply the
// status the provider reported (the webhook was actually right and the payment
// should move to paid/failed/refunded). Either way the conflict is marked
// resolved so it drops off the list, and who/when is recorded for audit.

router.post("/admin/payment-conflicts/:id/resolve", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const paymentId = Number(req.params.id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    res.status(400).json({ error: "Invalid payment id." });
    return;
  }

  const RESOLUTIONS = ["dismiss", "paid", "failed", "refunded"] as const;
  const { resolution } = req.body as { resolution?: string };
  if (!resolution || !RESOLUTIONS.includes(resolution as (typeof RESOLUTIONS)[number])) {
    res.status(400).json({ error: `resolution must be one of: ${RESOLUTIONS.join(", ")}` });
    return;
  }

  const [existing] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
  if (!existing) {
    res.status(404).json({ error: "Payment not found." });
    return;
  }

  const meta = (existing.metadata ?? {}) as Record<string, unknown>;
  const conflict = meta.reconciliationConflict as Record<string, unknown> | undefined;
  if (!conflict) {
    res.status(400).json({ error: "This payment has no flagged reconciliation conflict." });
    return;
  }
  if (conflict.resolvedAt) {
    res.status(400).json({ error: "This conflict was already resolved." });
    return;
  }

  // Resolve the admin's display name from Clerk before writing metadata so it
  // is stored on the conflict record — follows the admin-sender-attribution pattern.
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

  const resolvedMetadata = {
    ...meta,
    reconciliationConflict: {
      ...conflict,
      resolution,
      resolvedAt: new Date().toISOString(),
      resolvedBy: userId,
      resolvedByDisplayName: adminDisplayName,
    },
  };

  const newStatus = resolution === "dismiss" ? existing.status : resolution;

  const [updated] = await db
    .update(paymentsTable)
    .set({ status: newStatus, metadata: resolvedMetadata, updatedAt: new Date() })
    .where(eq(paymentsTable.id, paymentId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Payment not found." });
    return;
  }

  // If the admin decided the provider was right after all, apply the same
  // side effects a normal webhook transition would have (sale sync + vendor
  // notice) so the payment doesn't just look "paid" without downstream effects.
  if (resolution === "paid") {
    await syncSaleFromPayment({
      id: updated.id,
      vendorId: updated.vendorId,
      amount: updated.amount,
      currency: updated.currency,
    });
  }
  if (resolution === "paid" || resolution === "failed" || resolution === "refunded") {
    await notifyVendorPaymentStatus(updated.vendorId, resolution, updated.amount, updated.currency);
  }

  // Write a durable audit entry so this resolution shows up in the Audit Log
  // tab alongside vendor-field edits, rather than only being visible in the
  // payment's metadata or Slack.
  const attemptedStatus = (conflict as Record<string, unknown>).attemptedStatus as string | undefined;
  await db.insert(adminAuditLogTable).values({
    adminUserId: userId,
    adminDisplayName,
    vendorId: existing.vendorId,
    field: "payment_conflict_resolution",
    oldValue: attemptedStatus ?? "conflict",
    newValue: resolution,
    changedAt: new Date(),
    paymentId: paymentId,
  });

  console.info(
    `[admin] payment reconciliation conflict resolved — payment=${paymentId} admin=${userId} resolution=${resolution}`,
  );

  // Look up vendor name for the Slack message (vendorsTable not joined in the
  // payment select above, so fetch it now — cheap single-row lookup).
  let vendorName: string | null = null;
  if (existing.vendorId) {
    const [vendor] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, existing.vendorId));
    vendorName = vendor?.name ?? null;
  }

  const adminLabel = adminDisplayName ? `*${adminDisplayName}* (${userId})` : `*${userId}*`;
  const vendorLabel = vendorName ? ` for vendor *${vendorName}*` : "";
  const resolutionLabel =
    resolution === "dismiss"
      ? "dismissed (kept local cancelled status)"
      : `manually set to *${resolution}*`;
  const attemptedLabel = attemptedStatus ? ` (provider had reported: *${attemptedStatus}*)` : "";
  await sendSlackAlert(
    `:white_check_mark: Payment conflict resolved — payment #${paymentId}${vendorLabel} was ${resolutionLabel}${attemptedLabel} by ${adminLabel}.`,
  );

  res.json({ success: true, payment: updated });
});

// ─── POST /admin/vendors/:id/trial ───────────────────────────────────────────
// Assign a free trial of a chosen duration (7 / 14 / 21 / 30 days) to any
// vendor. The vendor's trialEndsAt / trialStartedAt / trialDurationDays are
// updated and an in-app notification is created immediately.

function isAdminUser(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

const VALID_TRIAL_DURATIONS = [7, 14, 21, 30] as const;
type TrialDuration = (typeof VALID_TRIAL_DURATIONS)[number];

router.post("/admin/vendors/:id/trial", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdminUser(userId)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const body = req.body as { durationDays?: unknown };
  const durationDays = Number(body.durationDays);
  if (!VALID_TRIAL_DURATIONS.includes(durationDays as TrialDuration)) {
    res.status(400).json({ error: "durationDays must be 7, 14, 21, or 30" });
    return;
  }

  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.id, id))
    .limit(1);

  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  if (vendor.subscriptionTier !== "free") {
    res.status(400).json({
      error: `Vendor is already on the '${vendor.subscriptionTier}' plan. Admin-assigned trials only apply to free-tier vendors — this vendor already has paid access.`,
    });
    return;
  }

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const expiryStr = trialEndsAt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  await db
    .update(vendorsTable)
    .set({ trialEndsAt, trialStartedAt: now, trialDurationDays: durationDays })
    .where(eq(vendorsTable.id, id));

  await db.insert(vendorNotificationsTable).values({
    vendorId: id,
    type: "trial_assigned",
    message: `${durationDays}-Day Free Trial Activated 🎉 — Your trial has been activated by the platform admin. Enjoy full access to all premium features until ${expiryStr}. Upgrade anytime to continue after your trial ends.`,
  });

  // Send email notification
  try {
    const { wrapVendorEmail, escapeHtml } = await import("../lib/email-branding");
    const { sendEmail } = await import("../lib/mailer");
    const bodyHtml = `
      <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#fff">
        Your free trial is live! 🎉
      </h2>
      <p style="margin:0 0 10px;color:#ccc;font-size:15px">
        Hi ${escapeHtml(vendor.name)}, great news — the Awa Biz Suite team has activated
        your <strong>${durationDays}-day free trial</strong>.
      </p>
      <p style="margin:0 0 10px;color:#ccc;font-size:15px">
        You have full access to <strong>all premium features</strong> — AI Studio, Social Hub,
        Voice Campaigns, Analytics, and more — until <strong>${expiryStr}</strong>.
      </p>
      <p style="margin:0 0 10px;color:#ccc;font-size:15px">
        To keep access after your trial, simply upgrade to a paid plan. No charge until your
        trial ends.
      </p>`;
    const html = wrapVendorEmail({
      bodyHtml,
      action: { label: "Explore Your Dashboard", url: process.env.VITE_APP_URL ? `${process.env.VITE_APP_URL}/vendor-hub/dashboard` : "https://awajimaaai.com/vendor-hub/dashboard" },
    });
    await sendEmail({ to: vendor.email, subject: `Your ${durationDays}-day Awa Biz Suite free trial is now active!`, html });
  } catch (emailErr) {
    // Email failure is non-fatal — trial is already saved
  }

  res.json({ success: true, vendorId: id, trialEndsAt: trialEndsAt.toISOString(), durationDays });
});

// ─── GET /admin/late-arrival-refunds ─────────────────────────────────────────
// Payments where a Paystack (or other provider) charge arrived after the vendor
// cancelled the link. The platform tried an automatic refund; these rows show
// whether that succeeded (lateArrivalRefunded) or failed (lateArrivalRefundFailed).
// Failed rows stay here until an admin marks them resolved after handling manually.
//
// Query params:
//   ?status=failed   — only unresolved failures (default when omitted)
//   ?status=refunded — only successfully auto-refunded rows
//   ?status=all      — everything

router.get("/admin/late-arrival-refunds", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const statusFilter = (req.query.status as string | undefined) ?? "failed";

  // Build the SQL WHERE predicate from the JSONB metadata column
  let whereClause: SQL;
  if (statusFilter === "refunded") {
    whereClause = sql`(${paymentsTable.metadata} ->> 'lateArrivalRefunded')::boolean = true`;
  } else if (statusFilter === "all") {
    whereClause = sql`
      (${paymentsTable.metadata} ->> 'lateArrivalRefunded')::boolean = true
      OR (${paymentsTable.metadata} ->> 'lateArrivalRefundFailed')::boolean = true
    `;
  } else {
    // "failed" (default) — unresolved failures only
    whereClause = sql`
      (${paymentsTable.metadata} ->> 'lateArrivalRefundFailed')::boolean = true
      AND (${paymentsTable.metadata} ->> 'lateArrivalRefundResolved') IS NULL
    `;
  }

  const rows = await db
    .select({
      id: paymentsTable.id,
      vendorId: paymentsTable.vendorId,
      vendorName: vendorsTable.name,
      orderId: paymentsTable.orderId,
      provider: paymentsTable.provider,
      providerReference: paymentsTable.providerReference,
      amount: paymentsTable.amount,
      currency: paymentsTable.currency,
      status: paymentsTable.status,
      metadata: paymentsTable.metadata,
      updatedAt: paymentsTable.updatedAt,
    })
    .from(paymentsTable)
    .leftJoin(vendorsTable, eq(paymentsTable.vendorId, vendorsTable.id))
    .where(whereClause)
    .orderBy(desc(paymentsTable.updatedAt))
    .limit(200);

  const result = rows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      vendorId: r.vendorId,
      vendorName: r.vendorName,
      orderId: r.orderId,
      provider: r.provider,
      providerReference: r.providerReference,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      // Refund outcome flags
      lateArrivalRefunded: Boolean(meta.lateArrivalRefunded),
      lateArrivalRefundedAt: (meta.lateArrivalRefundedAt as string | undefined) ?? null,
      lateArrivalRefundFailed: Boolean(meta.lateArrivalRefundFailed),
      lateArrivalRefundFailedAt: (meta.lateArrivalRefundFailedAt as string | undefined) ?? null,
      lateArrivalRefundError: (meta.lateArrivalRefundError as string | undefined) ?? null,
      // Resolution fields (failed-only — set by POST /resolve)
      lateArrivalRefundResolved: Boolean(meta.lateArrivalRefundResolved),
      lateArrivalRefundResolvedAt: (meta.lateArrivalRefundResolvedAt as string | undefined) ?? null,
      lateArrivalRefundResolvedBy: (meta.lateArrivalRefundResolvedBy as string | undefined) ?? null,
      lateArrivalRefundResolvedByDisplayName: (meta.lateArrivalRefundResolvedByDisplayName as string | undefined) ?? null,
      updatedAt: r.updatedAt,
    };
  });

  res.json(result);
});

// ─── GET /admin/late-arrival-refunds/summary ──────────────────────────────────
// Returns a lightweight count of unresolved late-arrival refund failures — used
// by the admin panel badge so the tab lights up without loading the full list.

router.get("/admin/late-arrival-refunds/summary", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(paymentsTable)
    .where(sql`
      (${paymentsTable.metadata} ->> 'lateArrivalRefundFailed')::boolean = true
      AND (${paymentsTable.metadata} ->> 'lateArrivalRefundResolved') IS NULL
    `);

  res.json({ unresolvedFailures: Number(row?.count ?? 0) });
});

// ─── POST /admin/late-arrival-refunds/:id/resolve ─────────────────────────────
// An admin marks a failed late-arrival refund as resolved after handling it
// manually in the Paystack dashboard. Records who resolved it and when.

router.post("/admin/late-arrival-refunds/:id/resolve", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const paymentId = Number(req.params.id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    res.status(400).json({ error: "Invalid payment id." });
    return;
  }

  const [existing] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
  if (!existing) {
    res.status(404).json({ error: "Payment not found." });
    return;
  }

  const meta = (existing.metadata ?? {}) as Record<string, unknown>;
  if (!meta.lateArrivalRefundFailed) {
    res.status(400).json({ error: "This payment has no late-arrival refund failure to resolve." });
    return;
  }
  if (meta.lateArrivalRefundResolved) {
    res.status(400).json({ error: "This refund failure was already marked resolved." });
    return;
  }

  // Resolve the admin's display name for audit attribution
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

  const resolvedAt = new Date().toISOString();

  await db
    .update(paymentsTable)
    .set({
      metadata: {
        ...meta,
        lateArrivalRefundResolved: true,
        lateArrivalRefundResolvedAt: resolvedAt,
        lateArrivalRefundResolvedBy: userId,
        lateArrivalRefundResolvedByDisplayName: adminDisplayName,
      },
      updatedAt: new Date(),
    })
    .where(eq(paymentsTable.id, paymentId));

  // Write to audit log for traceability
  await db.insert(adminAuditLogTable).values({
    adminUserId: userId,
    adminDisplayName,
    vendorId: existing.vendorId,
    field: "late_arrival_refund_resolved",
    oldValue: "unresolved",
    newValue: "resolved",
    changedAt: new Date(),
    paymentId,
  });

  const adminLabel = adminDisplayName ? `*${adminDisplayName}* (${userId})` : `*${userId}*`;
  const reference = existing.providerReference ?? `payment #${paymentId}`;
  await sendSlackAlert(
    `:white_check_mark: Late-arrival refund failure resolved — \`${reference}\` (payment #${paymentId}, vendor ${existing.vendorId}) marked resolved by ${adminLabel}.`,
  );

  console.info(
    `[admin] late-arrival refund failure resolved — payment=${paymentId} admin=${userId}`,
  );

  res.json({ success: true });
});

// ─── GET /admin/subscription-refund-blacklist ─────────────────────────────────
// Lists all vendors who have been blacklisted due to a subscription refund within
// the 10-day window. Ordered most-recent first.
router.get("/admin/subscription-refund-blacklist", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdminUser(userId)) { res.status(403).json({ error: "Admin access required" }); return; }

  const rows = await db
    .select({
      id: subscriptionRefundBlacklistTable.id,
      vendorId: subscriptionRefundBlacklistTable.vendorId,
      vendorName: vendorsTable.name,
      vendorEmail: vendorsTable.email,
      refundedTier: subscriptionRefundBlacklistTable.refundedTier,
      minAllowedTier: subscriptionRefundBlacklistTable.minAllowedTier,
      minAllowedTierRank: subscriptionRefundBlacklistTable.minAllowedTierRank,
      gateway: subscriptionRefundBlacklistTable.gateway,
      refundReference: subscriptionRefundBlacklistTable.refundReference,
      refundedAt: subscriptionRefundBlacklistTable.refundedAt,
      createdAt: subscriptionRefundBlacklistTable.createdAt,
    })
    .from(subscriptionRefundBlacklistTable)
    .leftJoin(vendorsTable, eq(subscriptionRefundBlacklistTable.vendorId, vendorsTable.id))
    .orderBy(desc(subscriptionRefundBlacklistTable.createdAt));

  res.json(rows.map((r) => ({
    ...r,
    refundedAt: r.refundedAt?.toISOString() ?? null,
    createdAt: r.createdAt?.toISOString() ?? null,
  })));
});

// ─── DELETE /admin/subscription-refund-blacklist/:id ─────────────────────────
// Admin pardon: removes a specific blacklist entry by row ID.
// After removal the vendor can subscribe to any tier again.
router.delete("/admin/subscription-refund-blacklist/:id", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdminUser(userId)) { res.status(403).json({ error: "Admin access required" }); return; }

  const rowId = parseInt(req.params.id);
  if (isNaN(rowId)) { res.status(400).json({ error: "Invalid blacklist entry id" }); return; }

  const [deleted] = await db
    .delete(subscriptionRefundBlacklistTable)
    .where(eq(subscriptionRefundBlacklistTable.id, rowId))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Blacklist entry not found" });
    return;
  }

  console.info(`[admin] subscription-refund-blacklist entry removed — id=${rowId} vendor=${deleted.vendorId} admin=${userId}`);
  res.json({ success: true, removed: { ...deleted, refundedAt: deleted.refundedAt?.toISOString(), createdAt: deleted.createdAt?.toISOString() } });
});

// ─── GET /admin/vendors/search ────────────────────────────────────────────────
// Lightweight vendor search by name or email for the admin trial assignment UI.
router.get("/admin/vendors/search", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdminUser(userId)) { res.status(403).json({ error: "Admin access required" }); return; }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 2) { res.json([]); return; }

  const { ilike, or } = await import("drizzle-orm");
  const rows = await db
    .select({ id: vendorsTable.id, name: vendorsTable.name, email: vendorsTable.email, subscriptionTier: vendorsTable.subscriptionTier, trialEndsAt: vendorsTable.trialEndsAt })
    .from(vendorsTable)
    .where(or(ilike(vendorsTable.name, `%${q}%`), ilike(vendorsTable.email, `%${q}%`)))
    .limit(10);

  res.json(rows.map(r => ({
    ...r,
    trialEndsAt: r.trialEndsAt ? r.trialEndsAt.toISOString() : null,
  })));
});

// ─── Feature Trial Routes ─────────────────────────────────────────────────────
//  GET  /admin/feature-trials             — list active + recently-expired trials
//  POST /admin/feature-trials/:vendorId  — grant a feature-tier trial
//  DELETE /admin/feature-trials/:vendorId — revoke a feature-tier trial

const VALID_TRIAL_TIERS = ["starter", "pro", "enterprise"] as const;

router.get("/admin/feature-trials", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) { res.status(403).json({ error: "Admin only" }); return; }

  const now = new Date();
  // Return all vendors with a trial field set — includes active trials AND
  // recently-expired ones that the hourly scheduler hasn't cleared yet.
  // The `active` field in the response lets the UI render the right status.
  const rows = await db
    .select({
      id: vendorsTable.id,
      name: vendorsTable.name,
      email: vendorsTable.email,
      subscriptionTier: vendorsTable.subscriptionTier,
      featureTrialTier: vendorsTable.featureTrialTier,
      featureTrialExpiresAt: vendorsTable.featureTrialExpiresAt,
      featureTrialGrantedBy: vendorsTable.featureTrialGrantedBy,
      featureTrialGrantedAt: vendorsTable.featureTrialGrantedAt,
      featureTrialNote: vendorsTable.featureTrialNote,
    })
    .from(vendorsTable)
    .where(sql`${vendorsTable.featureTrialTier} IS NOT NULL`)
    .orderBy(asc(vendorsTable.featureTrialExpiresAt));

  res.json(rows.map(r => ({
    ...r,
    featureTrialExpiresAt: r.featureTrialExpiresAt?.toISOString() ?? null,
    featureTrialGrantedAt: r.featureTrialGrantedAt?.toISOString() ?? null,
    active: r.featureTrialExpiresAt ? r.featureTrialExpiresAt > now : false,
  })));
});

router.post("/admin/feature-trials/:vendorId", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) { res.status(403).json({ error: "Admin only" }); return; }

  const vendorId = parseInt(req.params.vendorId, 10);
  if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid vendor ID" }); return; }

  const { tier, days, note } = req.body as { tier?: string; days?: number; note?: string };
  if (!tier || !VALID_TRIAL_TIERS.includes(tier as any)) {
    res.status(400).json({ error: `tier must be one of: ${VALID_TRIAL_TIERS.join(", ")}` });
    return;
  }
  const daysNum = Number(days ?? 7);
  if (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 365) {
    res.status(400).json({ error: "days must be an integer between 1 and 365" });
    return;
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId)).limit(1);
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + daysNum * 24 * 60 * 60 * 1000);

  // Look up the admin's email for the audit trail
  let grantedBy = userId;
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    grantedBy = clerkUser.primaryEmailAddress?.emailAddress ?? userId;
  } catch { /* fall back to userId */ }

  await db
    .update(vendorsTable)
    .set({
      featureTrialTier: tier,
      featureTrialExpiresAt: expiresAt,
      featureTrialGrantedBy: grantedBy,
      featureTrialGrantedAt: now,
      featureTrialNote: note ?? null,
      updatedAt: now,
    })
    .where(eq(vendorsTable.id, vendorId));

  // Send an in-app notification to the vendor
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  await db.insert(vendorNotificationsTable).values({
    vendorId,
    type: "feature_trial_granted",
    message: `🎉 You've been granted a ${daysNum}-day free trial of the ${tierLabel} plan features. Enjoy full access to AI Content Studio, Website Builder, and more!`,
  }).catch(() => { /* non-fatal */ });

  // Send email notification
  if (vendor.email) {
    const expiryStr = expiresAt.toLocaleDateString("en-US", { dateStyle: "long" });
    const bodyHtml = `
      <h2 style="margin:0 0 12px">Your free feature trial is now active! 🎉</h2>
      <p>Hi ${escapeHtml(vendor.name)},</p>
      <p>You've been granted a <strong>${daysNum}-day free trial</strong> of the <strong>${tierLabel} plan</strong> features on your Awa Biz Suite dashboard.</p>
      <p>Your trial gives you access to:</p>
      <ul>
        <li>AI Content Studio (images, videos, captions)</li>
        <li>Website Builder</li>
        <li>Media Library &amp; Editor</li>
        <li>All ${tierLabel} plan features and quotas</li>
      </ul>
      <p>Your trial expires on <strong>${expiryStr}</strong>. Upgrade your plan before then to keep your access.</p>
    `;
    await sendEmail({
      to: vendor.email,
      subject: `Your ${daysNum}-day ${tierLabel} trial is now active on Awa Biz Suite`,
      html: wrapVendorEmail({ bodyHtml }),
    }).catch(() => { /* non-fatal */ });
  }

  res.json({
    vendorId,
    tier,
    expiresAt: expiresAt.toISOString(),
    grantedBy,
    note: note ?? null,
  });
});

router.delete("/admin/feature-trials/:vendorId", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) { res.status(403).json({ error: "Admin only" }); return; }

  const vendorId = parseInt(req.params.vendorId, 10);
  if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid vendor ID" }); return; }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId)).limit(1);
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const now = new Date();
  await db
    .update(vendorsTable)
    .set({
      featureTrialTier: null,
      featureTrialExpiresAt: null,
      featureTrialGrantedBy: null,
      featureTrialGrantedAt: null,
      featureTrialNote: null,
      updatedAt: now,
    })
    .where(eq(vendorsTable.id, vendorId));

  // Notify vendor that their trial was revoked
  await db.insert(vendorNotificationsTable).values({
    vendorId,
    type: "feature_trial_revoked",
    message: "Your admin-granted feature trial has ended. Upgrade your plan to continue using premium features.",
  }).catch(() => { /* non-fatal */ });

  res.json({ vendorId, revoked: true });
});

// ─── PLATFORM USERS ───────────────────────────────────────────────────────────

/**
 * GET /admin/platform-users
 * All signed-up Clerk users (including those who haven't completed onboarding),
 * with order counts and page-view counts aggregated per user.
 * Query params: ?q=<search>&status=all|completed|pending&limit=100&offset=0
 */
router.get("/admin/platform-users", async (req, res) => {
  const { userId } = getAuth(req);
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!userId || !adminIds.includes(userId)) return void res.status(403).json({ error: "Admin only" });

  const q      = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status : "all";
  const limit  = Math.min(parseInt(String(req.query.limit  ?? "100")), 200);
  const offset = parseInt(String(req.query.offset ?? "0")) || 0;

  const conditions: SQL[] = [];
  if (q) {
    conditions.push(or(
      ilike(platformUsersTable.name,  `%${q}%`),
      ilike(platformUsersTable.email, `%${q}%`),
      ilike(platformUsersTable.phone, `%${q}%`),
    ) as SQL);
  }
  if (status === "completed") conditions.push(eq(platformUsersTable.onboardingCompleted, true));
  if (status === "pending")   conditions.push(eq(platformUsersTable.onboardingCompleted, false));

  const where = conditions.length ? and(...conditions) : undefined;

  const [users, [{ total }]] = await Promise.all([
    db.select({
        id:                  platformUsersTable.id,
        clerkUserId:         platformUsersTable.clerkUserId,
        email:               platformUsersTable.email,
        name:                platformUsersTable.name,
        phone:               platformUsersTable.phone,
        imageUrl:            platformUsersTable.imageUrl,
        onboardingCompleted: platformUsersTable.onboardingCompleted,
        vendorId:            platformUsersTable.vendorId,
        firstSeenAt:         platformUsersTable.firstSeenAt,
        lastSeenAt:          platformUsersTable.lastSeenAt,
        vendorTier:          vendorsTable.subscriptionTier,
        vendorStatus:        vendorsTable.status,
        orderCount: sql<number>`(
          SELECT COUNT(*) FROM orders
          WHERE customer_email = ${platformUsersTable.email}
        )`,
        pageViewCount: sql<number>`COALESCE((
          SELECT COUNT(*) FROM page_views
          WHERE vendor_id = ${platformUsersTable.vendorId}
        ), 0)`,
      })
      .from(platformUsersTable)
      .leftJoin(vendorsTable, eq(platformUsersTable.vendorId, vendorsTable.id))
      .where(where)
      .orderBy(desc(platformUsersTable.lastSeenAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)` })
      .from(platformUsersTable)
      .where(where),
  ]);

  res.json({
    total: Number(total),
    users: users.map(u => ({
      ...u,
      orderCount:   Number(u.orderCount),
      pageViewCount: Number(u.pageViewCount),
      firstSeenAt:  u.firstSeenAt.toISOString(),
      lastSeenAt:   u.lastSeenAt.toISOString(),
    })),
  });
});

/**
 * GET /admin/platform-users/:clerkUserId
 * Full detail for one user: profile + last 30 orders + recent page views.
 */
router.get("/admin/platform-users/:clerkUserId", async (req, res) => {
  const { userId } = getAuth(req);
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!userId || !adminIds.includes(userId)) return void res.status(403).json({ error: "Admin only" });

  const { clerkUserId } = req.params;
  const user = await db.query.platformUsersTable.findFirst({
    where: eq(platformUsersTable.clerkUserId, clerkUserId),
  });
  if (!user) return void res.status(404).json({ error: "User not found" });

  // Orders (by email — the only stable cross-table link for pre-onboarding users)
  const orders = user.email
    ? await db.select({
        id:          ordersTable.id,
        status:      ordersTable.status,
        totalAmount: ordersTable.totalAmount,
        currency:    ordersTable.currency,
        customerName: ordersTable.customerName,
        notes:       ordersTable.notes,
        createdAt:   ordersTable.createdAt,
      })
      .from(ordersTable)
      .where(eq(ordersTable.customerEmail, user.email))
      .orderBy(desc(ordersTable.createdAt))
      .limit(30)
    : [];

  // Page views (only available for users with a vendor row)
  const pageViews = user.vendorId
    ? await db.select({
        id:          pageViewsTable.id,
        platform:    pageViewsTable.platform,
        path:        pageViewsTable.path,
        device:      pageViewsTable.device,
        country:     pageViewsTable.country,
        trafficSource: pageViewsTable.trafficSource,
        createdAt:   pageViewsTable.createdAt,
      })
      .from(pageViewsTable)
      .where(eq(pageViewsTable.vendorId, user.vendorId))
      .orderBy(desc(pageViewsTable.createdAt))
      .limit(30)
    : [];

  // Vendor row (if they completed onboarding)
  const vendor = user.vendorId
    ? await db.query.vendorsTable.findFirst({ where: eq(vendorsTable.id, user.vendorId) })
    : null;

  res.json({
    user: {
      ...user,
      firstSeenAt: user.firstSeenAt.toISOString(),
      lastSeenAt:  user.lastSeenAt.toISOString(),
    },
    vendor: vendor ? {
      id:                vendor.id,
      name:              vendor.name,
      subscriptionTier:  vendor.subscriptionTier,
      verificationLevel: vendor.verificationLevel,
      status:            vendor.status,
      country:           vendor.country,
      industry:          vendor.industry,
      createdAt:         vendor.createdAt.toISOString(),
    } : null,
    orders: orders.map(o => ({
      ...o,
      createdAt: o.createdAt.toISOString(),
    })),
    pageViews: pageViews.map(p => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    })),
  });
});

// ─── GET /admin/vendors/:id/payments ─────────────────────────────────────────
// Returns paginated payment transactions for a specific vendor.

router.get("/admin/vendors/:id/payments", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  const payments = await db
    .select({
      id:                paymentsTable.id,
      orderId:           paymentsTable.orderId,
      provider:          paymentsTable.provider,
      providerReference: paymentsTable.providerReference,
      amount:            paymentsTable.amount,
      currency:          paymentsTable.currency,
      status:            paymentsTable.status,
      createdAt:         paymentsTable.createdAt,
      updatedAt:         paymentsTable.updatedAt,
    })
    .from(paymentsTable)
    .where(eq(paymentsTable.vendorId, id))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(paymentsTable)
    .where(eq(paymentsTable.vendorId, id));

  res.json({
    payments: payments.map(p => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
    page,
    pageSize,
    total: total ?? 0,
  });
});

// ─── GET /admin/vendors/:id ────────────────────────────────────────────────────
// Returns full details for a single vendor (profile + virtual accounts).

router.get("/admin/vendors/:id", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { vendorVirtualAccountsTable } = await import("@workspace/db/schema");

  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.id, id))
    .limit(1);

  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const virtualAccounts = await db
    .select()
    .from(vendorVirtualAccountsTable)
    .where(and(
      eq(vendorVirtualAccountsTable.vendorId, id),
      eq(vendorVirtualAccountsTable.isActive, true),
    ));

  res.json({
    vendor: {
      id:                vendor.id,
      name:              vendor.name,
      email:             vendor.email,
      phone:             vendor.phone,
      country:           vendor.country,
      state:             vendor.state,
      city:              vendor.city,
      industry:          vendor.industry,
      status:            vendor.status,
      subscriptionTier:  vendor.subscriptionTier,
      verificationLevel: vendor.verificationLevel,
      trialEndsAt:       vendor.trialEndsAt?.toISOString() ?? null,
      trialStartedAt:    vendor.trialStartedAt?.toISOString() ?? null,
      trialDurationDays: vendor.trialDurationDays ?? null,
      paystackCustomerCode: vendor.paystackCustomerCode ?? null,
      createdAt:         vendor.createdAt.toISOString(),
    },
    virtualAccounts: virtualAccounts.map(a => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});

// ─── GET /admin/vendors/:id/kyc ───────────────────────────────────────────────
// Returns KYC fields and USD virtual account status for a vendor.

router.get("/admin/vendors/:id/kyc", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { vendorVirtualAccountsTable } = await import("@workspace/db/schema");

  const [vendor] = await db
    .select({
      id:                      vendorsTable.id,
      name:                    vendorsTable.name,
      email:                   vendorsTable.email,
      phone:                   vendorsTable.phone,
      address:                 vendorsTable.address,
      dateOfBirth:             vendorsTable.dateOfBirth,
      gender:                  vendorsTable.gender,
      bvn:                     vendorsTable.bvn,
      kycSubmittedAt:          vendorsTable.kycSubmittedAt,
      squadCustomerIdentifier: vendorsTable.squadCustomerIdentifier,
    })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, id))
    .limit(1);

  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  // All active dedicated accounts across all gateways
  const allAccounts = await db
    .select()
    .from(vendorVirtualAccountsTable)
    .where(and(
      eq(vendorVirtualAccountsTable.vendorId, id),
      eq(vendorVirtualAccountsTable.isActive, true),
    ))
    .orderBy(vendorVirtualAccountsTable.createdAt);

  const serialize = (a: typeof allAccounts[0]) => ({
    id:            a.id,
    gateway:       a.gateway,
    currency:      a.currency,
    type:          a.type,
    accountNumber: a.accountNumber,
    bankName:      a.bankName,
    accountName:   a.accountName,
    routingNumber: (a.metadata as Record<string, unknown> | null)?.["routing_number"] as string | undefined,
    walletId:      (a.metadata as Record<string, unknown> | null)?.["walletId"] as string | undefined,
    createdAt:     a.createdAt.toISOString(),
  });

  res.json({
    id:                      vendor.id,
    name:                    vendor.name,
    email:                   vendor.email,
    phone:                   vendor.phone,
    address:                 vendor.address,
    dateOfBirth:             vendor.dateOfBirth,
    gender:                  vendor.gender,
    bvnMasked:               vendor.bvn ? `****${vendor.bvn.slice(-4)}` : null,
    kycComplete:             !!(vendor.bvn && vendor.dateOfBirth && vendor.address),
    kycSubmittedAt:          vendor.kycSubmittedAt?.toISOString() ?? null,
    squadCustomerIdentifier: vendor.squadCustomerIdentifier,
    // All accounts grouped for easy UI consumption
    accounts:     allAccounts.map(serialize),
    usdAccounts:  allAccounts.filter(a => a.currency === "USD").map(serialize),
    ngnAccounts:  allAccounts.filter(a => a.currency === "NGN").map(serialize),
  });
});

// ─── PATCH /admin/vendors/:id/kyc ─────────────────────────────────────────────
// Admin saves KYC fields (BVN, DOB, address, gender) for a vendor.

router.patch("/admin/vendors/:id/kyc", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { bvn, dateOfBirth, address, gender } = req.body as {
    bvn?: string; dateOfBirth?: string; address?: string; gender?: string;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (bvn !== undefined && bvn !== "")          updates.bvn = bvn.trim();
  if (dateOfBirth !== undefined && dateOfBirth) updates.dateOfBirth = dateOfBirth;
  if (address !== undefined && address !== "")  updates.address = address.trim();
  if (gender !== undefined && gender !== "")    updates.gender = gender;

  const [current] = await db
    .select({ bvn: vendorsTable.bvn, dateOfBirth: vendorsTable.dateOfBirth, address: vendorsTable.address })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, id))
    .limit(1);

  if (!current) { res.status(404).json({ error: "Vendor not found" }); return; }

  const newBvn = (updates.bvn as string | undefined) ?? current.bvn;
  const newDob = (updates.dateOfBirth as string | undefined) ?? current.dateOfBirth;
  const newAddr = (updates.address as string | undefined) ?? current.address;
  if (newBvn && newDob && newAddr) updates.kycSubmittedAt = new Date();

  await db.update(vendorsTable).set(updates).where(eq(vendorsTable.id, id));

  res.json({ ok: true, kycComplete: !!(newBvn && newDob && newAddr) });
});

// ─── POST /admin/vendors/:id/squad-ngn-account ───────────────────────────────
// Admin triggers Squad NGN dedicated virtual account creation. Requires full KYC + gender.

router.post("/admin/vendors/:id/squad-ngn-account", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { vendorVirtualAccountsTable } = await import("@workspace/db/schema");
  const { resolveSquadKey, squadCreateDedicatedVirtualAccount } = await import("../lib/squad");

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (!vendor.bvn || !vendor.dateOfBirth || !vendor.address) {
    res.status(422).json({ error: "KYC is incomplete. BVN, date of birth, and address are required." }); return;
  }

  // Map vendor.gender (male/female/other) → Squad gender code (1=Male, 2=Female)
  const genderCode: "1" | "2" = vendor.gender === "female" ? "2" : "1";

  // Vendors may only have one dedicated NGN account regardless of gateway
  const [existingNGN] = await db.select({ id: vendorVirtualAccountsTable.id })
    .from(vendorVirtualAccountsTable)
    .where(and(
      eq(vendorVirtualAccountsTable.vendorId, id),
      eq(vendorVirtualAccountsTable.currency, "NGN"),
      eq(vendorVirtualAccountsTable.type, "dedicated"),
      eq(vendorVirtualAccountsTable.isActive, true),
    )).limit(1);
  if (existingNGN) { res.status(409).json({ error: "This vendor already has a dedicated NGN account." }); return; }

  let secretKey: string;
  try { secretKey = await resolveSquadKey(); }
  catch { res.status(503).json({ error: "Squad is not configured. Add a Squad secret key in Admin → Payment Gateways." }); return; }

  const customerIdentifier = `vendor-${id}`;
  const nameParts = vendor.name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? vendor.name;
  const lastName  = nameParts.slice(1).join(" ") || firstName;

  let result: Awaited<ReturnType<typeof squadCreateDedicatedVirtualAccount>>;
  try {
    result = await squadCreateDedicatedVirtualAccount(secretKey, {
      customerIdentifier,
      firstName,
      lastName,
      mobileNumber: vendor.phone ?? "",
      email:        vendor.email,
      bvn:          vendor.bvn,
      dob:          vendor.dateOfBirth,
      address:      vendor.address,
      gender:       genderCode,
    });
  } catch (e) {
    res.status(502).json({ error: `Squad API error: ${e instanceof Error ? e.message : String(e)}` }); return;
  }

  await db.update(vendorsTable)
    .set({ squadCustomerIdentifier: customerIdentifier, updatedAt: new Date() })
    .where(eq(vendorsTable.id, id));

  await db.insert(vendorVirtualAccountsTable).values({
    vendorId:      id,
    gateway:       "squad",
    accountNumber: result.data.virtual_account_number,
    bankName:      result.data.bank_name,
    accountName:   result.data.beneficiary_name,
    currency:      "NGN",
    type:          "dedicated",
    referenceCode: result.data.customer_identifier,
    metadata:      result.data as Record<string, unknown>,
  }).onConflictDoNothing();

  await db.insert(vendorNotificationsTable).values({
    vendorId: id,
    type:     "payment_received",
    message:  `Your Squad NGN dedicated account is ready: ${result.data.virtual_account_number} (${result.data.bank_name}). Customers can now pay directly into this account.`,
  }).catch(() => null);

  res.json({
    ok:              true,
    accountNumber:   result.data.virtual_account_number,
    bankName:        result.data.bank_name,
    beneficiaryName: result.data.beneficiary_name,
  });
});

// ─── POST /admin/vendors/:id/interswitch-account ──────────────────────────────
// Admin triggers Interswitch NGN virtual account (wallet) creation for a vendor.

router.post("/admin/vendors/:id/interswitch-account", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { vendorVirtualAccountsTable } = await import("@workspace/db/schema");
  const { interswitchCreateVirtualAccount } = await import("../lib/interswitch");
  const { resolveInterswitchCreds } = await import("../lib/vendor-keys");

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  // Vendors may only have one dedicated NGN account regardless of gateway
  const [existingNGN] = await db.select({ id: vendorVirtualAccountsTable.id })
    .from(vendorVirtualAccountsTable)
    .where(and(
      eq(vendorVirtualAccountsTable.vendorId, id),
      eq(vendorVirtualAccountsTable.currency, "NGN"),
      eq(vendorVirtualAccountsTable.type, "dedicated"),
      eq(vendorVirtualAccountsTable.isActive, true),
    )).limit(1);
  if (existingNGN) { res.status(409).json({ error: "This vendor already has a dedicated NGN account." }); return; }

  let creds: Awaited<ReturnType<typeof resolveInterswitchCreds>>;
  try { creds = await resolveInterswitchCreds(); }
  catch { res.status(503).json({ error: "Interswitch is not configured." }); return; }

  const nameParts = vendor.name.trim().split(/\s+/);
  const lastName   = nameParts[nameParts.length - 1] ?? vendor.name;
  const otherNames = nameParts.slice(0, -1).join(" ") || lastName;

  let result: Awaited<ReturnType<typeof interswitchCreateVirtualAccount>>;
  try {
    result = await interswitchCreateVirtualAccount(creds, {
      phoneNumber: vendor.phone ?? "",
      lastName,
      otherNames,
      email: vendor.email,
      bvn:   vendor.bvn ?? undefined,
    });
  } catch (e) {
    res.status(502).json({ error: `Interswitch API error: ${e instanceof Error ? e.message : String(e)}` }); return;
  }

  await db.insert(vendorVirtualAccountsTable).values({
    vendorId:      id,
    gateway:       "interswitch",
    accountNumber: result.accountNumber,
    bankCode:      result.bankCode,
    bankName:      result.bankName,
    accountName:   result.accountName,
    currency:      "NGN",
    type:          "dedicated",
    referenceCode: result.walletId,
    metadata:      { walletId: result.walletId } as Record<string, unknown>,
  }).onConflictDoNothing();

  await db.insert(vendorNotificationsTable).values({
    vendorId: id,
    type:     "payment_received",
    message:  `Your Interswitch virtual account is ready: ${result.accountNumber} (${result.bankName}). Customers can now pay into this account.`,
  }).catch(() => null);

  res.json({
    ok:            true,
    accountNumber: result.accountNumber,
    bankName:      result.bankName,
    accountName:   result.accountName,
    walletId:      result.walletId,
  });
});

// ─── POST /admin/vendors/:id/usd-account ──────────────────────────────────────
// Admin triggers Squad USD virtual account creation for a vendor.
// KYC (BVN, dateOfBirth, address) must be complete first.

router.post("/admin/vendors/:id/usd-account", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { vendorVirtualAccountsTable } = await import("@workspace/db/schema");
  const { resolveSquadKey, squadCreateUSDVirtualAccount } = await import("../lib/squad");

  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.id, id))
    .limit(1);

  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (!vendor.bvn || !vendor.dateOfBirth || !vendor.address) {
    res.status(422).json({ error: "KYC is incomplete. Please provide BVN, date of birth, and address before creating a USD account." });
    return;
  }

  // Check if USD account already exists
  const [existing] = await db
    .select({ id: vendorVirtualAccountsTable.id })
    .from(vendorVirtualAccountsTable)
    .where(and(
      eq(vendorVirtualAccountsTable.vendorId, id),
      eq(vendorVirtualAccountsTable.currency, "USD"),
      eq(vendorVirtualAccountsTable.isActive, true),
    ))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "This vendor already has an active USD virtual account." });
    return;
  }

  let secretKey: string;
  try {
    secretKey = await resolveSquadKey();
  } catch {
    res.status(503).json({ error: "Squad is not configured. Add a Squad secret key in Admin → Payment Gateways." });
    return;
  }

  // Build a stable customer identifier for this vendor
  const customerIdentifier = vendor.squadCustomerIdentifier ?? `vendor_${id}_usd_${Date.now()}`;

  const nameParts = vendor.name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? vendor.name;
  const lastName = nameParts.slice(1).join(" ") || firstName;

  let result: Awaited<ReturnType<typeof squadCreateUSDVirtualAccount>>;
  try {
    result = await squadCreateUSDVirtualAccount(secretKey, {
      customerIdentifier,
      firstName,
      lastName,
      mobileNumber: vendor.phone ?? "",
      email: vendor.email,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Squad API error";
    res.status(502).json({ error: `Failed to create USD account: ${msg}` });
    return;
  }

  const acct = result.data;

  // Persist Squad customer identifier on the vendor record
  await db.update(vendorsTable)
    .set({ squadCustomerIdentifier: customerIdentifier, updatedAt: new Date() })
    .where(eq(vendorsTable.id, id));

  // Store the account in vendorVirtualAccountsTable
  await db.insert(vendorVirtualAccountsTable).values({
    vendorId:      id,
    gateway:       "squad",
    accountNumber: acct.virtual_account_number,
    bankName:      acct.bank_name ?? "Squad",
    accountName:   acct.beneficiary_name ?? vendor.name,
    currency:      "USD",
    type:          "dedicated",
    referenceCode: customerIdentifier,
    metadata:      acct as unknown as Record<string, unknown>,
  }).onConflictDoNothing();

  // Notify vendor
  await db.insert(vendorNotificationsTable).values({
    vendorId: id,
    type:     "payment_received",
    message:  `Your USD virtual account is ready: ${acct.virtual_account_number} (${acct.bank_name ?? "Squad"}). You can now receive USD payments directly.`,
  }).catch(() => null);

  res.json({
    ok: true,
    accountNumber: acct.virtual_account_number,
    bankName:      acct.bank_name,
    routingNumber: acct.routing_number,
    beneficiaryName: acct.beneficiary_name,
  });
});

// ─── GET /admin/users-summary ─────────────────────────────────────────────────

router.get("/admin/users-summary", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [[vc], [cc], [puc], [vc7], [cc7]] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(vendorsTable),
    db.select({ total: sql<number>`count(*)` }).from(customersTable),
    db.select({ total: sql<number>`count(*)` }).from(platformUsersTable),
    db.select({ total: sql<number>`count(*)` }).from(vendorsTable).where(gte(vendorsTable.createdAt, sevenDaysAgo)),
    db.select({ total: sql<number>`count(*)` }).from(customersTable).where(gte(customersTable.createdAt, sevenDaysAgo)),
  ]);

  res.json({
    vendors:        Number(vc?.total   ?? 0),
    customers:      Number(cc?.total   ?? 0),
    platformUsers:  Number(puc?.total  ?? 0),
    newVendors7d:   Number(vc7?.total  ?? 0),
    newCustomers7d: Number(cc7?.total  ?? 0),
  });
});

// ─── GET /admin/customers ─────────────────────────────────────────────────────
// Paginated list of all registered customers. ?search=, ?vendorId=, ?limit=, ?offset=

router.get("/admin/customers", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const limit    = Math.min(Math.max(Number(req.query.limit  ?? 50), 1), 200);
  const offset   = Math.max(Number(req.query.offset ?? 0), 0);
  const search   = String(req.query.search ?? "").trim();
  const vendorId = req.query.vendorId ? Number(req.query.vendorId) : undefined;

  const conditions: SQL[] = [];
  if (search) {
    conditions.push(or(
      ilike(customersTable.name, `%${search}%`),
      ilike(customersTable.email, `%${search}%`),
    ) as SQL);
  }
  if (vendorId !== undefined && !isNaN(vendorId)) {
    conditions.push(eq(ordersTable.vendorId, vendorId));
  }
  const whereClause = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id:           customersTable.id,
      name:         customersTable.name,
      email:        customersTable.email,
      phone:        customersTable.phone,
      createdAt:    customersTable.createdAt,
      orderCount:   sql<number>`cast(count(distinct ${ordersTable.id}) as int)`,
      vendorCount:  sql<number>`cast(count(distinct ${ordersTable.vendorId}) as int)`,
      totalSpend:   sql<number>`cast(coalesce(sum(${ordersTable.totalAmount}), 0) as numeric)`,
      firstOrderAt: sql<string | null>`min(${ordersTable.createdAt})`,
    })
    .from(customersTable)
    .leftJoin(ordersTable, eq(ordersTable.customerId, customersTable.id))
    .where(whereClause)
    .groupBy(customersTable.id)
    .orderBy(desc(customersTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ total: sql<number>`cast(count(distinct ${customersTable.id}) as int)` })
    .from(customersTable)
    .leftJoin(ordersTable, eq(ordersTable.customerId, customersTable.id))
    .where(whereClause);

  res.json({
    customers: rows.map(r => ({
      ...r,
      totalSpend:  Number(r.totalSpend),
      createdAt:   r.createdAt.toISOString(),
      firstOrderAt: r.firstOrderAt ?? null,
    })),
    total: Number(countRow?.total ?? 0),
    limit,
    offset,
  });
});

// ─── POST /admin/newsletter/customers ─────────────────────────────────────────
// Sends a newsletter to all customers or to the customers of a specific vendor.
// When fromVendorName=true and targetType="vendor", the email is attributed to the vendor.

router.post("/admin/newsletter/customers", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const { subject, body, targetType, vendorId: rawVendorId, fromVendorName } = req.body as {
    subject: string; body: string;
    targetType: "all" | "vendor";
    vendorId?: number;
    fromVendorName?: boolean;
  };

  if (!subject?.trim()) { res.status(400).json({ error: "subject is required" }); return; }
  if (!body?.trim())    { res.status(400).json({ error: "body is required" }); return; }
  const vid = rawVendorId ? Number(rawVendorId) : undefined;
  if (targetType === "vendor" && !vid) {
    res.status(400).json({ error: "vendorId is required for vendor-targeted newsletters" }); return;
  }

  let vendorName: string | null = null;
  if (targetType === "vendor" && vid) {
    const [v] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, vid)).limit(1);
    if (!v) { res.status(404).json({ error: "Vendor not found" }); return; }
    vendorName = v.name;
  }

  // Collect distinct recipients
  let recipients: { email: string; name: string }[] = [];

  if (targetType === "all") {
    const rows = await db
      .select({ email: customersTable.email, name: customersTable.name })
      .from(customersTable)
      .where(sql`${customersTable.email} is not null`);
    recipients = rows.map(r => ({ email: r.email, name: r.name }));
  } else if (targetType === "vendor" && vid) {
    // Customers via orders
    const orderCustomers = await db
      .selectDistinctOn([customersTable.email], { email: customersTable.email, name: customersTable.name })
      .from(ordersTable)
      .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
      .where(and(eq(ordersTable.vendorId, vid), sql`${customersTable.email} is not null`));

    // CRM leads
    const leads = await db
      .select({ email: leadsTable.email, name: leadsTable.name })
      .from(leadsTable)
      .where(and(eq(leadsTable.vendorId, vid), sql`${leadsTable.email} is not null`));

    const seen = new Set<string>();
    for (const r of [...orderCustomers, ...leads]) {
      if (r.email && !seen.has(r.email.toLowerCase())) {
        seen.add(r.email.toLowerCase());
        recipients.push({ email: r.email, name: r.name });
      }
    }
  }

  if (!recipients.length) {
    res.json({ ok: true, sent: 0, message: "No recipients found." });
    return;
  }

  const displayName = fromVendorName && vendorName ? vendorName : "Awa Biz Suite";
  const total = recipients.length;
  // Respond immediately — send in background
  res.json({ ok: true, sent: total, message: `Queued newsletter to ${total} recipient${total === 1 ? "" : "s"}.` });

  void (async () => {
    for (const r of recipients) {
      const firstName = r.name.split(" ")[0] ?? r.name;
      const html = wrapVendorEmail({ bodyHtml:
        `<p style="font-size:16px;margin:0 0 16px">Hi ${escapeHtml(firstName)},</p>
         <div style="font-size:15px;line-height:1.7;margin:0 0 24px;white-space:pre-wrap">${escapeHtml(body.trim())}</div>
         <p style="font-size:12px;color:#9ca3af;margin:0">Sent by ${escapeHtml(displayName)} via Awa Biz Suite.</p>`,
      });
      await sendEmail({ to: r.email, subject: subject.trim(), html }).catch(() => null);
    }
    console.log(`[admin/newsletter] sent newsletter to ${total} customers`);
  })();
});

export default router;
