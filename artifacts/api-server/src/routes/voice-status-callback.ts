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
import { eq } from "drizzle-orm";
import { db, voiceCallLogsTable, voiceCampaignCallsTable } from "@workspace/db";
import { logger } from "../lib/logger";

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

router.post("/voice/status-callback", async (req, res) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.header("X-Twilio-Signature");
  const expectedUrl = getExpectedCallbackUrl();

  if (!authToken || !signature || !expectedUrl) {
    logger.warn(
      { hasAuthToken: Boolean(authToken), hasSignature: Boolean(signature), expectedUrl },
      "[voice] status-callback rejected — missing auth token, signature header, or expected URL",
    );
    res.status(403).send("Forbidden");
    return;
  }

  const isValid = twilio.validateRequest(authToken, signature, expectedUrl, req.body ?? {});
  if (!isValid) {
    logger.warn(
      { expectedUrl, callSid: req.body?.CallSid },
      "[voice] status-callback rejected — invalid X-Twilio-Signature",
    );
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
