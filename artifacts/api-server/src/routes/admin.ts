/**
 * Admin-only endpoints.
 *
 * GET  /admin/check          — returns { isAdmin: boolean } for the current user
 * GET  /admin/vendors        — all vendors enriched with payment-credential status
 */
import { Router } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { vendorsTable, vendorPaymentCredentialsTable, birthdayMessageLogsTable, voiceCallLogsTable, adminAuditLogTable, adminExportLogsTable, adminExportAcknowledgmentsTable, adminExportAcknowledgmentLogTable, adminExportBurstSentAlertsTable, voiceCampaignsTable, voiceCampaignCallsTable, voiceSignatureFailuresTable, voiceSignatureFailureAcknowledgmentsTable, voiceSignatureFailureAcknowledgmentLogTable, vendorNotificationsTable, paymentsTable } from "@workspace/db/schema";
import { eq, desc, and, gte, lte, gt, asc, inArray, sql, type SQL } from "drizzle-orm";
import { isTwilioConfigured } from "../lib/voice-caller";
import { canAddPaymentKeys } from "../lib/vendor-keys";
import { getSiteContent, getSiteContentBlock, setSiteContentBlock, validateSiteContentBlock, getSiteContentAuditLog, SITE_CONTENT_KEYS, type SiteContentKey } from "../lib/site-content";
import { ZodError } from "zod";
import { resendBirthdayEmail, retryBirthdayCall } from "../lib/birthday-scheduler";
import { retryCampaignCall, retryAllFailedCampaignCalls } from "./voice-campaigns";
import { sendSlackAlert } from "../lib/slack";
import { runVoiceBackfill, getVoiceBackfillLastRun, getVoiceBackfillRecentFixes } from "../lib/voice-backfill";
import { syncSaleFromPayment } from "../lib/sales-sync";
import { notifyVendorPaymentStatus } from "../lib/push";

/**
 * Export-burst detection: if the same admin downloads the vendor CSV export
 * this many times within the rolling window below, we treat it as unusual
 * activity (possible mass-exfiltration of vendor PII) and surface a warning
 * — both a Slack alert and a flag the Admin Panel can display. Threshold and
 * window are editable from the Admin Panel (persisted via the site-content
 * store under "admin.exportAlertSettings"); the env vars below are only the
 * fallback default until an admin saves an override.
 */
async function getExportAlertSettings(): Promise<{ threshold: number; windowMinutes: number }> {
  const raw = await getSiteContentBlock("admin.exportAlertSettings");
  return raw as { threshold: number; windowMinutes: number };
}

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

/**
 * Counts how many exports `adminUserId` has triggered within the alert
 * window (including the export that just happened) and fires a Slack alert
 * exactly once per burst — the first time the count reaches or exceeds the
 * threshold — so a long-running spree doesn't spam a message per download.
 *
 * Concurrency safety: two simultaneous exports can cause the running count
 * to skip past the threshold value, so we use `>= threshold` rather than
 * `=== threshold`.  To guarantee exactly one alert per burst even under
 * concurrent requests, we use an atomic "claim" pattern:
 *
 *  1. Sort all in-window exports by (exportedAt ASC, id ASC) — a stable
 *     total order even when two rows share the same timestamp.
 *  2. The Nth row (threshold-th) is the deterministic "crossing record"
 *     regardless of how many concurrent exports landed together.
 *  3. We INSERT a row into `adminExportBurstSentAlertsTable` keyed by
 *     (adminUserId, crossingExportId) with ON CONFLICT DO NOTHING.
 *     Only the one request that wins the INSERT race proceeds to alert;
 *     all others silently skip because of the unique-constraint conflict.
 */
async function checkExportBurst(adminUserId: string): Promise<void> {
  const { threshold, windowMinutes } = await getExportAlertSettings();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  // Order by (exportedAt ASC, id ASC) — id breaks ties deterministically so
  // the Nth row is always the same record regardless of which concurrent
  // request queries first.
  const recent = await db
    .select({ id: adminExportLogsTable.id })
    .from(adminExportLogsTable)
    .where(and(eq(adminExportLogsTable.adminUserId, adminUserId), gte(adminExportLogsTable.exportedAt, windowStart)))
    .orderBy(asc(adminExportLogsTable.exportedAt), asc(adminExportLogsTable.id));

  const count = recent.length;
  if (count < threshold) return;

  // The threshold-th export (0-indexed: threshold - 1) is the crossing record.
  const crossingExportId = recent[threshold - 1]!.id;

  // Atomically claim the alert for this crossing record.  Only the first
  // INSERT succeeds; concurrent requests receive a unique-constraint conflict
  // and get an empty array back, so they skip the Slack call.
  const claimed = await db
    .insert(adminExportBurstSentAlertsTable)
    .values({ adminUserId, crossingExportId })
    .onConflictDoNothing()
    .returning({ id: adminExportBurstSentAlertsTable.id });

  if (claimed.length > 0) {
    await sendSlackAlert(
      `:rotating_light: Admin *${adminUserId}* has downloaded the vendor data export ${count} times in the last ${windowMinutes} minutes. Further exports from this account are paused until another admin reviews and clears it in the Admin Panel.`,
    );
  }
}

/**
 * Determines whether `adminUserId` is currently mid-burst and should be
 * blocked from exporting further. An admin is blocked once their export
 * count within the rolling window reaches the threshold, and stays blocked
 * until either:
 *  - another admin acknowledges the flag *after* the export that crossed
 *    the threshold (an ack that predates the crossing doesn't clear a new
 *    burst — it must be a fresh review), or
 *  - enough time passes that the crossing export ages out of the window.
 */
async function getExportBurstStatus(
  adminUserId: string,
): Promise<{ blocked: boolean; count: number; threshold: number; windowMinutes: number; flaggedAt: Date | null }> {
  const { threshold, windowMinutes } = await getExportAlertSettings();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  const recent = await db
    .select({ exportedAt: adminExportLogsTable.exportedAt })
    .from(adminExportLogsTable)
    .where(and(eq(adminExportLogsTable.adminUserId, adminUserId), gte(adminExportLogsTable.exportedAt, windowStart)))
    .orderBy(desc(adminExportLogsTable.exportedAt));

  const count = recent.length;
  if (count < threshold) {
    return { blocked: false, count, threshold, windowMinutes, flaggedAt: null };
  }

  // The export that pushed the count to `threshold` (i.e. the Nth most
  // recent one) is the moment this burst became flagged.
  const flaggedAt = recent[threshold - 1]!.exportedAt;

  const [ack] = await db
    .select()
    .from(adminExportAcknowledgmentsTable)
    .where(eq(adminExportAcknowledgmentsTable.adminUserId, adminUserId));

  const cleared = Boolean(ack) && ack!.acknowledgedAt >= flaggedAt;
  return { blocked: !cleared, count, threshold, windowMinutes, flaggedAt };
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
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
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
    .select()
    .from(voiceCallLogsTable)
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

// ─── POST /admin/voice-campaigns/:cid/retry-failed ─────────────────────────────

/**
 * Retries every failed campaign call for one campaign in one click, instead
 * of an admin clicking Retry per row. Reuses retryAllFailedCampaignCalls,
 * which calls retryCampaignCall per row with the same rate-limiting delay
 * runCampaignCalls uses.
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

  const result = await retryAllFailedCampaignCalls(campaignId);
  if (result.attempted === 0) {
    res.status(400).json({ error: "No failed calls to retry for this campaign.", ...result });
    return;
  }
  res.json({ success: true, ...result });
});

// ─── GET /admin/audit-log ─────────────────────────────────────────────────────

router.get("/admin/audit-log", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

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
    })
    .from(adminAuditLogTable)
    .leftJoin(vendorsTable, eq(adminAuditLogTable.vendorId, vendorsTable.id))
    .orderBy(desc(adminAuditLogTable.changedAt))
    .limit(50);

  res.json(entries);
});

// ─── GET /admin/message-history ──────────────────────────────────────────────
// Admin-facing view of every "general" (admin-authored) message sent to
// vendors — via the per-vendor compose dialog or the bulk-message tool.
// Optional ?vendorId= filters to a single vendor's history.

router.get("/admin/message-history", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const conditions: SQL[] = [eq(vendorNotificationsTable.type, "general")];

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
    .where(
      and(
        eq(vendorNotificationsTable.type, "tier_change"),
        sql`${vendorNotificationsTable.previousTier} IS NOT NULL`,
        sql`${vendorNotificationsTable.newTier} IS NOT NULL`,
      ),
    )
    .orderBy(desc(vendorNotificationsTable.createdAt))
    .limit(200);

  res.json(changes);
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

// ─── GET /admin/payment-conflicts ──────────────────────────────────────────────
// Payments where applyPaymentStatusTransition (payments/webhooks.ts) refused to
// resurrect a vendor-cancelled payment because a late webhook reported it as
// paid/failed. The conflict is recorded on metadata.reconciliationConflict and
// a Slack alert already fired at the time — this is the durable, admin-visible
// counterpart so someone doesn't have to know to go dig through Slack + the DB.
// Resolved conflicts (resolvedAt set) are excluded so this stays a to-do list.

router.get("/admin/payment-conflicts", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

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
    .where(
      sql`
        ${paymentsTable.metadata} -> 'reconciliationConflict' IS NOT NULL
        AND (${paymentsTable.metadata} -> 'reconciliationConflict' ->> 'resolvedAt') IS NULL
      `,
    )
    .orderBy(desc(paymentsTable.updatedAt))
    .limit(200);

  const conflicts = rows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const conflict = meta.reconciliationConflict as
      | { attemptedStatus: string; provider: string; detectedAt: string }
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

  const resolvedMetadata = {
    ...meta,
    reconciliationConflict: {
      ...conflict,
      resolution,
      resolvedAt: new Date().toISOString(),
      resolvedBy: userId,
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

  // Resolve the admin's display name from Clerk so the audit entry is readable
  // without a separate lookup later — follows the admin-sender-attribution pattern.
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
  });

  console.info(
    `[admin] payment reconciliation conflict resolved — payment=${paymentId} admin=${userId} resolution=${resolution}`,
  );

  const adminLabel = adminDisplayName ? `*${adminDisplayName}* (${userId})` : `*${userId}*`;
  const resolutionLabel =
    resolution === "dismiss"
      ? "dismissed (kept local status)"
      : `manually set to *${resolution}*`;
  await sendSlackAlert(
    `:white_check_mark: Payment conflict resolved — payment #${paymentId} was ${resolutionLabel} by ${adminLabel}.`,
  );

  res.json({ success: true, payment: updated });
});

export default router;
