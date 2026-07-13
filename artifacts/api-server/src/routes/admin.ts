/**
 * Admin-only endpoints.
 *
 * GET  /admin/check          — returns { isAdmin: boolean } for the current user
 * GET  /admin/vendors        — all vendors enriched with payment-credential status
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { vendorsTable, vendorPaymentCredentialsTable, birthdayMessageLogsTable, voiceCallLogsTable, adminAuditLogTable, adminExportLogsTable, adminExportAcknowledgmentsTable, voiceCampaignsTable, voiceCampaignCallsTable, voiceSignatureFailuresTable, vendorNotificationsTable } from "@workspace/db/schema";
import { eq, desc, and, gte, lte, gt, asc, inArray, sql, type SQL } from "drizzle-orm";
import { isTwilioConfigured } from "../lib/voice-caller";
import { canAddPaymentKeys } from "../lib/vendor-keys";
import { getSiteContent, getSiteContentBlock, setSiteContentBlock, validateSiteContentBlock, SITE_CONTENT_KEYS, type SiteContentKey } from "../lib/site-content";
import { ZodError } from "zod";
import { resendBirthdayEmail, retryBirthdayCall } from "../lib/birthday-scheduler";
import { retryCampaignCall } from "./voice-campaigns";
import { sendSlackAlert } from "../lib/slack";

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
 * Counts how many exports `adminUserId` has triggered within the alert
 * window (including the export that just happened) and fires a Slack alert
 * exactly once per burst — the moment the count first reaches the
 * threshold — so a long-running spree doesn't spam a message per download.
 */
async function checkExportBurst(adminUserId: string): Promise<void> {
  const { threshold, windowMinutes } = await getExportAlertSettings();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(adminExportLogsTable)
    .where(and(eq(adminExportLogsTable.adminUserId, adminUserId), gte(adminExportLogsTable.exportedAt, windowStart)));

  const count = Number(row?.count ?? 0);
  if (count === threshold) {
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
 * exports from that account. Recorded as an upsert keyed by adminUserId so
 * only the latest review matters for the block check above.
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

  await db
    .insert(adminExportAcknowledgmentsTable)
    .values({ adminUserId: targetAdminUserId, acknowledgedBy: userId, acknowledgedAt: new Date() })
    .onConflictDoUpdate({
      target: adminExportAcknowledgmentsTable.adminUserId,
      set: { acknowledgedAt: new Date(), acknowledgedBy: userId },
    });

  res.json({ success: true });
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

  const { threshold, windowMinutes } = await getVoiceSignatureFailureAlertSettings();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
  const [row] = await db
    .select({
      count: sql<number>`count(*)`,
      lastFailureAt: sql<string>`max(${voiceSignatureFailuresTable.createdAt})`,
    })
    .from(voiceSignatureFailuresTable)
    .where(gte(voiceSignatureFailuresTable.createdAt, windowStart));

  const count = Number(row?.count ?? 0);

  res.json({
    threshold,
    windowMinutes,
    count,
    lastFailureAt: row?.lastFailureAt ?? null,
    flagged: count >= threshold,
  });
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

  await setSiteContentBlock(key, validated, userId);
  res.json({ success: true });
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

// ─── GET /admin/voice-status ──────────────────────────────────────────────────

router.get("/admin/voice-status", (req, res): void => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }
  res.json({ configured: isTwilioConfigured() });
});

export default router;
