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
import { eq } from "drizzle-orm";
import { db, voiceCallLogsTable, voiceCampaignCallsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

router.post("/voice/status-callback", async (req, res) => {
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
