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
import { eq, gte, sql } from "drizzle-orm";
import { db, voiceCallLogsTable, voiceCampaignCallsTable, voiceSignatureFailuresTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { sendSlackAlert } from "../lib/slack";
import { getSiteContentBlock } from "../lib/site-content";

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

    logger.info({ callSid, callStatus, durationSeconds }, "[voice] status-callback applied");
    res.status(204).end();
  } catch (err) {
    logger.error({ err, callSid, callStatus }, "[voice] status-callback failed to update DB");
    // Return 200 so Twilio doesn't retry indefinitely; the terminal status is
    // best-effort and non-critical to the call itself having completed.
    res.status(200).end();
  }
});

export default router;
