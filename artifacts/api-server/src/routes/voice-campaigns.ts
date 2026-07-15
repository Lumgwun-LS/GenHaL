/**
 * Voice campaign routes — vendor-scoped outbound call campaigns.
 *
 * GET  /vendors/:id/voice-campaigns             — list campaigns
 * POST /vendors/:id/voice-campaigns             — create campaign
 * GET  /vendors/:id/voice-campaigns/:cid        — get campaign + call records
 * PATCH /vendors/:id/voice-campaigns/:cid       — update campaign (name/script/scheduledAt)
 * POST /vendors/:id/voice-campaigns/:cid/launch — launch: place calls to all leads
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  vendorsTable,
  voiceCampaignsTable,
  voiceCampaignCallsTable,
  voiceCallLogsTable,
  leadsTable,
  vendorNotificationsTable,
} from "@workspace/db/schema";
import { placeCall } from "../lib/voice-caller";
import { logger } from "../lib/logger";
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../lib/email-branding";
import { sendPushToVendor } from "../lib/push";
import { checkQuota, consumeQuota, releaseQuota, getBillingPeriodStart, getVendorForUsage, VOICE_CALL_RESERVATION_MINUTES } from "../lib/usage";
import { z } from "zod";

const router = Router();

/**
 * Places calls to all callable leads for an already-transitioned ("running")
 * campaign, then marks it completed/failed. Shared by the manual /launch
 * route and the scheduled-campaign background job so both paths run the
 * exact same call loop.
 */
export async function runCampaignCalls(
  campaign: typeof voiceCampaignsTable.$inferSelect,
  vendorId: number,
  callable: Array<typeof leadsTable.$inferSelect>,
): Promise<void> {
  const campaignId = campaign.id;
  let completedCount = 0;
  let terminalStatus = "completed";
  try {
    for (const lead of callable) {
      // Voice-minute usage is only known once a call ends (see
      // voice-status-callback.ts), so quota is RESERVED atomically per call
      // before placing it (see VOICE_CALL_RESERVATION_MINUTES) rather than
      // just gated with a read-only check — that reservation is what
      // actually prevents overshoot, since a plain check-then-place can
      // still race far ahead of usage that's only recorded after each call
      // ends. The reservation is refunded down to the real duration once the
      // call completes (voice-status-callback.ts), or fully refunded here if
      // the call never actually got placed.
      const usageVendor = await getVendorForUsage(vendorId);
      const reservationPeriodStart = usageVendor ? getBillingPeriodStart(usageVendor) : null;
      const reservation = usageVendor ? await consumeQuota(usageVendor, "voiceMinutes", VOICE_CALL_RESERVATION_MINUTES) : null;
      if (reservation && !reservation.allowed) {
        await db.insert(voiceCampaignCallsTable).values({
          campaignId,
          leadId: lead.id,
          leadName: lead.name ?? "Unknown",
          phone: lead.phone!,
          status: "canceled",
        });
        logger.warn({ campaignId, vendorId, leadId: lead.id }, "[voice] Skipping call — voice-minute quota exhausted for this billing period");
        continue;
      }

      const script = campaign.script.replace(/\{\{name\}\}/gi, lead.name ?? "there");

      const [callRow] = await db.insert(voiceCampaignCallsTable).values({
        campaignId,
        leadId: lead.id,
        leadName: lead.name ?? "Unknown",
        phone: lead.phone!,
        status: "queued",
      }).returning();

      const result = await placeCall({ to: lead.phone!, message: script, purpose: "campaign", vendorId, campaignId });

      if (result.status !== "placed" && usageVendor && reservationPeriodStart) {
        // Call never actually happened — give back the full reservation.
        // No voice_call_logs row exists for this attempt (no callSid to
        // settle against later), so this is the only settlement it gets.
        await releaseQuota(usageVendor.id, "voiceMinutes", VOICE_CALL_RESERVATION_MINUTES, reservationPeriodStart);
      }

      await db.insert(voiceCallLogsTable).values({
        vendorId,
        campaignId,
        phone: lead.phone!,
        purpose: "campaign",
        status: result.status === "placed" ? "queued" : result.status,
        callSid: result.callSid ?? null,
        // Only set when a reservation was actually made AND the call was
        // actually placed — this is what voice-status-callback.ts uses to
        // settle the reservation against the exact period it was made in,
        // regardless of what the vendor's period looks like by the time the
        // callback arrives.
        ...(result.status === "placed" && usageVendor && reservationPeriodStart ? {
          reservedMinutes: VOICE_CALL_RESERVATION_MINUTES.toString(),
          reservedPeriodStart: reservationPeriodStart,
        } : {}),
      });

      await db.update(voiceCampaignCallsTable).set({
        status: result.status === "placed" ? "ringing" : (result.status === "skipped" ? "canceled" : "failed"),
        callSid: result.callSid ?? null,
      }).where(eq(voiceCampaignCallsTable.id, callRow.id));

      completedCount++;
      // Small delay between calls to avoid rate-limiting
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch (err) {
    terminalStatus = "failed";
    logger.error({ err, campaignId, vendorId, completedCount }, "[voice] Campaign loop error — marking failed");
  } finally {
    await db.update(voiceCampaignsTable).set({ status: terminalStatus })
      .where(eq(voiceCampaignsTable.id, campaignId));
    logger.info({ campaignId, vendorId, completedCount, terminalStatus }, "[voice] Campaign finished");
    await notifyCampaignFinished(campaign, vendorId, terminalStatus, completedCount, callable.length);
  }
}

/**
 * Retries a failed campaign voice call for a given voice_call_logs row
 * (admin-triggered). Mirrors retryBirthdayCall's shape but re-derives the
 * campaign script (with the lead's name substituted) instead of a fixed
 * birthday message, and keeps voice_campaign_calls in sync alongside
 * voice_call_logs since campaign calls are tracked in both tables.
 */
export async function retryCampaignCall(logId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const [log] = await db
    .select()
    .from(voiceCallLogsTable)
    .where(eq(voiceCallLogsTable.id, logId))
    .limit(1);

  if (!log) {
    return { ok: false, error: "Call log entry not found." };
  }
  if (log.purpose !== "campaign") {
    return { ok: false, error: "Only campaign calls can be retried here." };
  }
  if (log.status !== "failed") {
    return { ok: false, error: "Only failed calls can be retried." };
  }
  if (!log.campaignId) {
    return { ok: false, error: "This call has no associated campaign." };
  }

  const [campaign] = await db
    .select()
    .from(voiceCampaignsTable)
    .where(eq(voiceCampaignsTable.id, log.campaignId))
    .limit(1);
  if (!campaign) {
    return { ok: false, error: "Campaign no longer exists." };
  }

  // Reserve only after every precondition that can fail without ever
  // attempting a call has already passed — a reservation made any earlier
  // would leak quota on a path that returns before `placeCall` runs and has
  // no voice_call_logs row to settle it against later.
  const usageVendor = log.vendorId != null ? await getVendorForUsage(log.vendorId) : null;
  const reservationPeriodStart = usageVendor ? getBillingPeriodStart(usageVendor) : null;
  const reservation = usageVendor ? await consumeQuota(usageVendor, "voiceMinutes", VOICE_CALL_RESERVATION_MINUTES) : null;
  if (reservation && !reservation.allowed) {
    return { ok: false, error: "Voice-minute quota exhausted for this billing period — upgrade your plan to retry this call." };
  }

  // The per-lead row (leadName, etc.) lives in voice_campaign_calls, not on
  // the voice_call_logs row itself — look up the matching one (same
  // campaign + phone, most recent) so the retried call still gets the
  // lead's name substituted into the script.
  const [campaignCall] = await db
    .select()
    .from(voiceCampaignCallsTable)
    .where(and(eq(voiceCampaignCallsTable.campaignId, log.campaignId), eq(voiceCampaignCallsTable.phone, log.phone)))
    .orderBy(desc(voiceCampaignCallsTable.initiatedAt))
    .limit(1);

  const leadName = campaignCall?.leadName ?? "there";
  const script = campaign.script.replace(/\{\{name\}\}/gi, leadName);

  const result = await placeCall({
    to: log.phone,
    message: script,
    purpose: "campaign",
    vendorId: campaign.vendorId,
    campaignId: campaign.id,
  });

  // Mirror the outcome mapping used by the original campaign call loop:
  // voice_call_logs uses "queued"/"failed", voice_campaign_calls uses
  // "ringing"/"failed". "skipped" (e.g. misconfigured Twilio) counts as a
  // failed retry, not success — the row stays "failed" so Retry remains
  // available instead of silently disappearing.
  if (result.status !== "placed") {
    logger.warn(
      { logId, campaignId: log.campaignId, reason: result.error, twilioStatus: result.status },
      "[voice-campaign] Manual retry did not succeed",
    );
    if (usageVendor && reservationPeriodStart) {
      // Call never actually happened — give back the full reservation.
      await releaseQuota(usageVendor.id, "voiceMinutes", VOICE_CALL_RESERVATION_MINUTES, reservationPeriodStart);
    }
    await db
      .update(voiceCallLogsTable)
      .set({ status: "failed", callSid: result.callSid ?? null })
      .where(eq(voiceCallLogsTable.id, logId));
    if (campaignCall) {
      await db
        .update(voiceCampaignCallsTable)
        .set({ status: "failed", callSid: result.callSid ?? null })
        .where(eq(voiceCampaignCallsTable.id, campaignCall.id));
    }
    return { ok: false, error: result.error ?? "Call failed to place." };
  }

  await db
    .update(voiceCallLogsTable)
    .set({
      status: "queued",
      callSid: result.callSid ?? null,
      initiatedAt: new Date(),
      // Reset settlement state for this retry attempt: a prior attempt on
      // this same log row may have already been metered/refunded, and this
      // new call needs its own reservation settled independently once it
      // ends.
      meteredAt: null,
      ...(usageVendor && reservationPeriodStart ? {
        reservedMinutes: VOICE_CALL_RESERVATION_MINUTES.toString(),
        reservedPeriodStart: reservationPeriodStart,
      } : {}),
    })
    .where(eq(voiceCallLogsTable.id, logId));
  if (campaignCall) {
    await db
      .update(voiceCampaignCallsTable)
      .set({ status: "ringing", callSid: result.callSid ?? null, initiatedAt: new Date() })
      .where(eq(voiceCampaignCallsTable.id, campaignCall.id));
  }

  logger.info({ logId, campaignId: log.campaignId, result: result.status }, "[voice-campaign] Manual retry result");
  return { ok: true };
}

/**
 * Retries every failed campaign call for a given campaign, one at a time
 * (reusing retryCampaignCall per call), with the same inter-call delay used
 * by runCampaignCalls so a bulk retry doesn't hammer Twilio/the provider.
 * Best-effort per call — one failure doesn't stop the rest from being
 * attempted — and the final tally is returned so the caller can report
 * how many succeeded vs. failed.
 */
export async function retryAllFailedCampaignCalls(
  campaignId: number,
): Promise<{ attempted: number; succeeded: number; failed: number }> {
  const failedLogs = await db
    .select({ id: voiceCallLogsTable.id })
    .from(voiceCallLogsTable)
    .where(and(
      eq(voiceCallLogsTable.campaignId, campaignId),
      eq(voiceCallLogsTable.purpose, "campaign"),
      eq(voiceCallLogsTable.status, "failed"),
    ))
    .orderBy(desc(voiceCallLogsTable.initiatedAt));

  let succeeded = 0;
  let failed = 0;
  for (const log of failedLogs) {
    const result = await retryCampaignCall(log.id);
    if (result.ok) {
      succeeded++;
    } else {
      failed++;
    }
    // Small delay between calls to avoid rate-limiting — mirrors the launch loop.
    await new Promise((r) => setTimeout(r, 500));
  }

  logger.info(
    { campaignId, attempted: failedLogs.length, succeeded, failed },
    "[voice-campaign] Bulk retry of failed calls finished",
  );

  return { attempted: failedLogs.length, succeeded, failed };
}

/**
 * Notifies the vendor (in-app + email) once an auto-launched or manually
 * launched campaign reaches a terminal state. Best-effort: failures here are
 * logged, not thrown, so a notification hiccup never re-marks the campaign
 * or otherwise disrupts the call loop that already finished.
 */
async function notifyCampaignFinished(
  campaign: typeof voiceCampaignsTable.$inferSelect,
  vendorId: number,
  terminalStatus: string,
  completedCount: number,
  totalLeads: number,
): Promise<void> {
  try {
    const calls = await db.select().from(voiceCampaignCallsTable)
      .where(eq(voiceCampaignCallsTable.campaignId, campaign.id));
    const placedCount = calls.filter((c) => c.status === "ringing" || c.status === "completed").length;
    const failedCount = calls.filter((c) => c.status === "failed").length;
    const canceledCount = calls.filter((c) => c.status === "canceled").length;

    const summary = terminalStatus === "completed"
      ? `placed ${placedCount} call(s)${failedCount ? `, ${failedCount} failed` : ""}${canceledCount ? `, ${canceledCount} skipped` : ""} out of ${totalLeads} lead(s)`
      : `stopped after ${completedCount} of ${totalLeads} lead(s) — an error interrupted the run`;

    const message = `Your voice campaign "${campaign.name}" ${terminalStatus === "completed" ? "finished" : "failed"}: ${summary}.`;

    await db.insert(vendorNotificationsTable).values({
      vendorId,
      type: "voice_campaign",
      message,
    });

    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
    if (vendor?.email) {
      const html = wrapVendorEmail({
        bodyHtml: `
          <h1 style="text-align: center; font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">
            Voice campaign ${terminalStatus === "completed" ? "finished" : "failed"}
          </h1>
          <p style="font-size: 14px; line-height: 1.6; color: #444;">
            Hi ${escapeHtml(vendor.name)}, your voice campaign "<strong>${escapeHtml(campaign.name)}</strong>" has
            ${terminalStatus === "completed" ? "finished running" : "failed"}: ${escapeHtml(summary)}.
          </p>
        `,
      });
      await sendEmail({
        to: vendor.email,
        subject: `Voice campaign ${terminalStatus === "completed" ? "finished" : "failed"}: ${campaign.name}`,
        html,
      });
    }

    await sendPushToVendor(
      vendorId,
      `Voice campaign ${terminalStatus === "completed" ? "finished" : "failed"}`,
      `"${campaign.name}" ${terminalStatus === "completed" ? "finished" : "failed"}: ${summary}.`,
      { screen: "voice-campaigns", campaignId: campaign.id },
      "voice_campaigns",
    );
  } catch (err) {
    logger.error({ err, campaignId: campaign.id, vendorId }, "[voice] Failed to send campaign-finished notification");
  }
}

const ADMIN_IDS = () =>
  (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

async function ownerOrAdmin(req: Parameters<Parameters<typeof router.get>[1]>[0], vendorId: number): Promise<boolean> {
  const { userId } = getAuth(req);
  if (!userId) return false;
  if (ADMIN_IDS().includes(userId)) return true;
  const [v] = await db.select({ clerkUserId: vendorsTable.clerkUserId }).from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  return v?.clerkUserId === userId;
}

// ─── List campaigns ───────────────────────────────────────────────────────────

router.get("/vendors/:id/voice-campaigns", async (req, res): Promise<void> => {
  const vendorId = Number(req.params.id);
  if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid vendor id" }); return; }
  if (!(await ownerOrAdmin(req, vendorId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const campaigns = await db
    .select()
    .from(voiceCampaignsTable)
    .where(eq(voiceCampaignsTable.vendorId, vendorId))
    .orderBy(desc(voiceCampaignsTable.createdAt));

  // Attach call counts
  const enriched = await Promise.all(campaigns.map(async (c) => {
    const calls = await db
      .select()
      .from(voiceCampaignCallsTable)
      .where(eq(voiceCampaignCallsTable.campaignId, c.id));
    const answered = calls.filter((x) => x.status === "completed").length;
    return { ...c, totalCalls: calls.length, answeredCalls: answered };
  }));

  res.json(enriched);
});

// ─── Create campaign ──────────────────────────────────────────────────────────

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  script: z.string().min(1).max(2000),
  scheduledAt: z.string().optional(),
});

router.post("/vendors/:id/voice-campaigns", async (req, res): Promise<void> => {
  const vendorId = Number(req.params.id);
  if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid vendor id" }); return; }
  if (!(await ownerOrAdmin(req, vendorId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { name, script, scheduledAt } = parsed.data;
  const [campaign] = await db.insert(voiceCampaignsTable).values({
    vendorId,
    name,
    script,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    status: scheduledAt ? "scheduled" : "draft",
  }).returning();

  res.status(201).json(campaign);
});

// ─── Get campaign + calls ─────────────────────────────────────────────────────

router.get("/vendors/:id/voice-campaigns/:cid", async (req, res): Promise<void> => {
  const vendorId = Number(req.params.id);
  const campaignId = Number(req.params.cid);
  if (isNaN(vendorId) || isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await ownerOrAdmin(req, vendorId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const [campaign] = await db.select().from(voiceCampaignsTable)
    .where(and(eq(voiceCampaignsTable.id, campaignId), eq(voiceCampaignsTable.vendorId, vendorId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  const calls = await db.select().from(voiceCampaignCallsTable)
    .where(eq(voiceCampaignCallsTable.campaignId, campaignId))
    .orderBy(desc(voiceCampaignCallsTable.initiatedAt));

  const answered = calls.filter((c) => c.status === "completed").length;
  const avgDuration = calls.filter((c) => c.durationSeconds != null).reduce((s, c) => s + (c.durationSeconds ?? 0), 0) / (calls.filter((c) => c.durationSeconds != null).length || 1);

  res.json({
    ...campaign,
    stats: { totalCalls: calls.length, answeredCalls: answered, answerRate: calls.length ? Math.round((answered / calls.length) * 100) : 0, avgDurationSeconds: Math.round(avgDuration) },
    calls,
  });
});

// ─── Update campaign ──────────────────────────────────────────────────────────

router.patch("/vendors/:id/voice-campaigns/:cid", async (req, res): Promise<void> => {
  const vendorId = Number(req.params.id);
  const campaignId = Number(req.params.cid);
  if (isNaN(vendorId) || isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await ownerOrAdmin(req, vendorId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const PatchBody = z.object({ name: z.string().optional(), script: z.string().optional(), scheduledAt: z.string().nullish(), status: z.enum(["draft", "scheduled", "paused"]).optional() });
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.script !== undefined) update.script = parsed.data.script;
  if (parsed.data.scheduledAt !== undefined) {
    update.scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
    // Keep status in sync with scheduling intent unless the caller explicitly overrides it below.
    if (parsed.data.status === undefined) {
      update.status = parsed.data.scheduledAt ? "scheduled" : "draft";
    }
  }
  if (parsed.data.status !== undefined) update.status = parsed.data.status;

  // Only allow editing a campaign that isn't already running/completed — prevents
  // reviving or mutating a campaign that's mid-flight or finished.
  const [campaign] = await db.update(voiceCampaignsTable).set(update)
    .where(and(
      eq(voiceCampaignsTable.id, campaignId),
      eq(voiceCampaignsTable.vendorId, vendorId),
      sql`${voiceCampaignsTable.status} NOT IN ('running', 'completed')`,
    ))
    .returning();

  if (!campaign) { res.status(404).json({ error: "Campaign not found, or it can no longer be edited" }); return; }
  res.json(campaign);
});

// ─── Launch campaign ──────────────────────────────────────────────────────────

router.post("/vendors/:id/voice-campaigns/:cid/launch", async (req, res): Promise<void> => {
  const vendorId = Number(req.params.id);
  const campaignId = Number(req.params.cid);
  if (isNaN(vendorId) || isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await ownerOrAdmin(req, vendorId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const [campaign] = await db.select().from(voiceCampaignsTable)
    .where(and(eq(voiceCampaignsTable.id, campaignId), eq(voiceCampaignsTable.vendorId, vendorId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  // Validate leads BEFORE touching campaign status — prevents stuck 'running' on early error
  const E164_RE = /^\+[1-9]\d{1,14}$/;
  const leads = await db.select().from(leadsTable).where(eq(leadsTable.vendorId, vendorId));
  const callable = leads.filter((l) => l.phone && E164_RE.test(l.phone));
  if (callable.length === 0) {
    res.status(400).json({ error: "No leads with E.164 phone numbers found. Add phone numbers starting with + to your leads first." });
    return;
  }

  const usageVendor = await getVendorForUsage(vendorId);
  if (!usageVendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  const quotaCheck = await checkQuota(usageVendor, "voiceMinutes", 0.01);
  if (!quotaCheck.allowed) {
    res.status(402).json({
      error: `You've used all ${quotaCheck.quota} voice campaign minutes included in your ${usageVendor.subscriptionTier} plan this period. Upgrade your plan to launch more voice campaigns.`,
      usage: quotaCheck,
    });
    return;
  }

  // Atomic status transition — prevents duplicate launch from concurrent requests.
  // Only succeeds if the campaign is not already running; returns nothing if it is.
  const [transitioned] = await db
    .update(voiceCampaignsTable)
    .set({ status: "running" })
    .where(and(
      eq(voiceCampaignsTable.id, campaignId),
      eq(voiceCampaignsTable.vendorId, vendorId),
      sql`${voiceCampaignsTable.status} != 'running'`,
    ))
    .returning();
  if (!transitioned) { res.status(409).json({ error: "Campaign is already running" }); return; }

  res.json({ message: `Launching campaign — placing ${callable.length} call(s) now.`, totalCalls: callable.length });

  // Place calls asynchronously after response is sent
  setImmediate(() => { runCampaignCalls(transitioned, vendorId, callable).catch(() => {}); });
});

export default router;
