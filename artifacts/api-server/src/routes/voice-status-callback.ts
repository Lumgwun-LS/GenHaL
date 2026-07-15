/**
 * Twilio call status callback — public, no auth (Twilio can't send a Clerk session).
 * Mounted BEFORE requireAuth in routes/index.ts.
 *
 * Twilio POSTs application/x-www-form-urlencoded with at least:
 *   CallSid, CallStatus, CallDuration (seconds, present once the call ends)
 *
 * Updates both voice_call_logs and voice_campaign_calls rows matched by callSid,
 * since a campaign call is recorded in both tables under the same SID.
 */
import { Router } from "express";
import twilio from "twilio";
import { eq, gte, sql, and, isNull } from "drizzle-orm";
import { db, voiceCallLogsTable, voiceCampaignCallsTable, voiceSignatureFailuresTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { sendSlackAlert } from "../lib/slack";
import { getSiteContentBlock } from "../lib/site-content";
import { releaseQuota } from "../lib/usage";

const router = Router();

/**
 * Rebuilds the exact URL Twilio was given as the StatusCallback, since the
 * signature is computed over that exact URL. Must match getStatusCallbackUrl()
 * in lib/voice-caller.ts (same domain precedence, same path, no query string).
 */
function getExpectedCallbackUrl(): string | null {
  const domain = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || null;
  if (!domain) return null;
  return `https://${domain}/api/voice/status-callback`;
}

/**
 * If TWILIO_AUTH_TOKEN is rotated in the Twilio console, every real callback
 * starts failing signature validation and gets silently 403'd — call
 * statuses stop updating with no visible symptom other than this rejection
 * rate climbing. We log every rejection and fire a Slack alert (once per
 * burst, same pattern as export-burst detection) so an admin notices and
 * knows to update the TWILIO_AUTH_TOKEN secret to match the current token
 * in the Twilio console (Console → Account → API keys & tokens).
 *
 * Threshold and window are editable from the Admin Panel (persisted via the
 * site-content store under "admin.voiceSignatureFailureAlertSettings") so
 * operators can tune sensitivity without a redeploy; the env vars read in
 * site-content.ts are only the fallback default until an admin saves an
 * override.
 */
async function getSignatureFailureAlertSettings(): Promise<{ threshold: number; windowMinutes: number }> {
  const raw = await getSiteContentBlock("admin.voiceSignatureFailureAlertSettings");
  return raw as { threshold: number; windowMinutes: number };
}

async function recordSignatureFailure(
  reason: "missing_config" | "missing_signature" | "invalid_signature",
  callSid: string | undefined,
): Promise<void> {
  try {
    await db.insert(voiceSignatureFailuresTable).values({ reason, callSid: callSid ?? null });

    const { threshold, windowMinutes } = await getSignatureFailureAlertSettings();
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(voiceSignatureFailuresTable)
      .where(gte(voiceSignatureFailuresTable.createdAt, windowStart));
    const count = Number(row?.count ?? 0);

    if (count === threshold) {
      await sendSlackAlert(
        `:rotating_light: ${count} Twilio voice status-callback requests were rejected for bad/missing signatures in the last ${windowMinutes} minutes. Call status updates are being silently dropped. This usually means the Auth Token was rotated in the Twilio console — check *TWILIO_AUTH_TOKEN* in Replit Secrets against Twilio Console → Account → API keys & tokens and update it.`,
      );
    }
  } catch (err) {
    logger.error({ err, reason }, "[voice] failed to record signature-failure metric");
  }
}

router.post("/voice/status-callback", async (req, res) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.header("X-Twilio-Signature");
  const expectedUrl = getExpectedCallbackUrl();
  const incomingCallSid = typeof req.body?.CallSid === "string" ? req.body.CallSid : undefined;

  if (!authToken || !signature || !expectedUrl) {
    logger.warn(
      { hasAuthToken: Boolean(authToken), hasSignature: Boolean(signature), expectedUrl },
      "[voice] status-callback rejected — missing auth token, signature header, or expected URL",
    );
    await recordSignatureFailure(!authToken ? "missing_config" : "missing_signature", incomingCallSid);
    res.status(403).send("Forbidden");
    return;
  }

  const isValid = twilio.validateRequest(authToken, signature, expectedUrl, req.body ?? {});
  if (!isValid) {
    logger.warn(
      { expectedUrl, callSid: req.body?.CallSid },
      "[voice] status-callback rejected — invalid X-Twilio-Signature",
    );
    await recordSignatureFailure("invalid_signature", incomingCallSid);
    res.status(403).send("Forbidden");
    return;
  }

  const callSid = typeof req.body?.CallSid === "string" ? req.body.CallSid : undefined;
  const callStatus = typeof req.body?.CallStatus === "string" ? req.body.CallStatus : undefined;
  const durationRaw = req.body?.CallDuration;

  if (!callSid || !callStatus) {
    logger.warn({ body: req.body }, "[voice] status-callback missing CallSid/CallStatus");
    res.status(400).send("Missing CallSid or CallStatus");
    return;
  }

  const durationSeconds =
    typeof durationRaw === "string" && durationRaw.trim() !== "" && !Number.isNaN(Number(durationRaw))
      ? Number(durationRaw)
      : undefined;

  // Status/duration bookkeeping is best-effort (non-billing, display-only) —
  // a failure here should never block metering below, and is never worth
  // making Twilio retry on its own.
  try {
    await db
      .update(voiceCallLogsTable)
      .set({
        status: callStatus,
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      })
      .where(eq(voiceCallLogsTable.callSid, callSid));

    await db
      .update(voiceCampaignCallsTable)
      .set({
        status: callStatus,
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      })
      .where(eq(voiceCampaignCallsTable.callSid, callSid));
  } catch (err) {
    logger.error({ err, callSid, callStatus }, "[voice] status-callback failed to update call status (non-billing, not retried)");
  }

  // Voice-minute quota is RESERVED atomically (VOICE_CALL_RESERVATION_MINUTES)
  // before a campaign call is even placed (see voice-campaigns.ts), with the
  // exact amount and billing period captured on the voice_call_logs row at
  // that time (reservedMinutes/reservedPeriodStart) — that reservation, not
  // this callback, is what actually enforces the quota cap, since it's
  // impossible to know a call's real duration until it ends. This callback
  // only settles the reservation: it refunds however much of it wasn't
  // used. The StatusCallbackEvent Twilio was configured with (see
  // voice-caller.ts) is "completed", which fires exactly once a call
  // reaches ANY terminal status (completed, busy, no-answer, failed,
  // canceled) — so every delivery of this callback for a campaign call
  // means the call is done and its reservation should be settled in full,
  // regardless of whether a duration is present. A call that never
  // connected (busy/no-answer/failed with no CallDuration) settles as "0
  // minutes used, refund the whole reservation" — treating "no duration" as
  // "still owes the full reservation" would silently and permanently lock
  // up quota on every non-connected call.
  //
  // This whole block — including the lookup that decides WHETHER to
  // settle — is billing-critical: it gets its own error handling, entirely
  // independent of the best-effort bookkeeping above, and ANY failure
  // inside it (including the initial lookup) returns 5xx so Twilio retries
  // the callback (it retries on non-2xx, never on 200) instead of silently
  // losing the refund forever (which would just permanently under-refund
  // the vendor — safe from an overshoot standpoint, but still a real bug).
  // Only a *successful* lookup that determines "nothing to settle here" (no
  // matching log, not a campaign call, or no reservation was ever recorded
  // for it) is a no-op.
  //
  // Twilio delivers status callbacks at-least-once, so retries/duplicates
  // for the same call are expected. The claim (meteredAt: NULL -> now()) and
  // the refund happen in ONE transaction, so a mid-step failure rolls back
  // the claim too — a retried callback will see meteredAt still NULL and
  // correctly re-attempt settlement rather than being skipped as "already
  // settled" for a call that never actually got its refund applied.
  try {
    await db.transaction(async (tx) => {
      const [existingLog] = await tx
        .select({
          vendorId: voiceCallLogsTable.vendorId,
          purpose: voiceCallLogsTable.purpose,
          reservedMinutes: voiceCallLogsTable.reservedMinutes,
          reservedPeriodStart: voiceCallLogsTable.reservedPeriodStart,
        })
        .from(voiceCallLogsTable)
        .where(eq(voiceCallLogsTable.callSid, callSid))
        .limit(1);

      if (
        existingLog?.purpose !== "campaign" ||
        existingLog.vendorId == null ||
        existingLog.reservedMinutes == null ||
        existingLog.reservedPeriodStart == null
      ) {
        return; // Legitimate no-op — nothing reserved to settle for this callback.
      }
      const vendorId = existingLog.vendorId;
      const reservedMinutes = Number(existingLog.reservedMinutes);
      const reservedPeriodStart = existingLog.reservedPeriodStart;

      const [claimed] = await tx
        .update(voiceCallLogsTable)
        .set({ meteredAt: new Date() })
        .where(and(eq(voiceCallLogsTable.callSid, callSid), isNull(voiceCallLogsTable.meteredAt)))
        .returning({ id: voiceCallLogsTable.id });

      if (!claimed) {
        logger.info({ callSid }, "[voice] status-callback duplicate delivery — reservation already settled, skipping");
        return;
      }

      // A call with no reported duration never connected — it used 0
      // billable minutes, so the entire reservation is unused.
      const actualMinutes = durationSeconds !== undefined && durationSeconds > 0 ? durationSeconds / 60 : 0;
      // TimeLimit on the Twilio call (see voice-caller.ts) guarantees
      // actualMinutes can never exceed the reservation, but clamp at 0
      // defensively in case that ever changes.
      const unusedReservation = Math.max(reservedMinutes - actualMinutes, 0);
      if (unusedReservation > 0) {
        // Settle against the EXACT period this reservation was made in
        // (captured at reservation time), not whatever the vendor's rolling
        // period happens to be right now — the two can differ if the
        // vendor's period rolled over between call placement and this
        // callback (e.g. a tier change), and refunding against the wrong
        // period would leave the original reservation's period permanently
        // over-charged.
        await releaseQuota(vendorId, "voiceMinutes", unusedReservation, reservedPeriodStart, tx);
      }
    });
  } catch (err) {
    logger.error({ err, callSid, callStatus }, "[voice] status-callback failed to settle voice-minute reservation — requesting Twilio retry");
    res.status(500).end();
    return;
  }

  logger.info({ callSid, callStatus, durationSeconds }, "[voice] status-callback applied");
  res.status(204).end();
});

export default router;
