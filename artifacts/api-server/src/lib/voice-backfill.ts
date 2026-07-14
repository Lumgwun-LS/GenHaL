/**
 * Voice call-status backfill / reconciliation.
 *
 * While TWILIO_AUTH_TOKEN is stale (rotated in the Twilio console but not
 * yet updated in Secrets), every status-callback POST from Twilio fails
 * signature validation and gets 403'd (see routes/voice-status-callback.ts).
 * The call itself still happens — Twilio just never gets to tell us how it
 * ended — so the row in voice_call_logs / voice_campaign_calls is stuck at
 * whatever non-terminal status it had (usually "queued" or "in-progress")
 * forever, even after the token is fixed.
 *
 * This job looks for calls stuck in a non-terminal status for long enough
 * that they can't still be genuinely in progress, and asks Twilio's REST
 * API directly for the real current status (an outbound, connector-authed
 * request — unaffected by the inbound webhook signature issue). It runs
 * automatically on a timer, so once an admin corrects the token the very
 * next tick self-heals any calls that got stuck during the outage. Admins
 * can also trigger it on demand from the Admin Panel.
 */
import { db } from "@workspace/db";
import { voiceCallLogsTable, voiceCampaignCallsTable } from "@workspace/db/schema";
import { and, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import { logger } from "./logger";
import { fetchCallStatus, isTwilioConfigured } from "./voice-caller";
import { getSiteContentBlock, setSiteContentBlock } from "./site-content";
import { recordJobRun } from "./job-run-status";

// Name this job's state is recorded under in job_run_status, for the admin panel.
export const VOICE_BACKFILL_JOB_NAME = "voice-backfill";

const NON_TERMINAL_STATUSES = ["queued", "ringing", "in-progress"] as const;

// A real call is never in a non-terminal status for this long — if it still
// is, its status-callback almost certainly never landed.
const STUCK_AFTER_MS = 15 * 60 * 1000;

export type VoiceBackfillResult = {
  ranAt: string;
  triggeredBy: string;
  checked: number;
  updated: number;
  failed: number;
};

export type VoiceBackfillFix = {
  ranAt: string;
  callSid: string;
  fromStatus: string;
  toStatus: string;
};

const MAX_RECENT_FIXES = 50;

/** Maps each stuck callSid to the non-terminal status it was found in (log table takes priority). */
async function findStuckCallSids(): Promise<Map<string, string>> {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS);

  const [logRows, campaignRows] = await Promise.all([
    db
      .select({ callSid: voiceCallLogsTable.callSid, status: voiceCallLogsTable.status })
      .from(voiceCallLogsTable)
      .where(
        and(
          isNotNull(voiceCallLogsTable.callSid),
          inArray(voiceCallLogsTable.status, [...NON_TERMINAL_STATUSES]),
          lt(voiceCallLogsTable.initiatedAt, cutoff),
        ),
      ),
    db
      .select({ callSid: voiceCampaignCallsTable.callSid, status: voiceCampaignCallsTable.status })
      .from(voiceCampaignCallsTable)
      .where(
        and(
          isNotNull(voiceCampaignCallsTable.callSid),
          inArray(voiceCampaignCallsTable.status, [...NON_TERMINAL_STATUSES]),
          lt(voiceCampaignCallsTable.initiatedAt, cutoff),
        ),
      ),
  ]);

  const sids = new Map<string, string>();
  // Campaign rows first so log rows (checked second) take priority if both exist.
  for (const r of [...campaignRows, ...logRows]) {
    if (r.callSid) sids.set(r.callSid, r.status);
  }
  return sids;
}

/**
 * Reconciles every stuck call by fetching its real status from Twilio and
 * applying it to both tables (mirroring the status-callback handler, since
 * a campaign call is recorded in both under the same SID). Records the run
 * outcome so the Admin Panel can show "last ran at / found / fixed".
 */
export async function runVoiceBackfill(triggeredBy = "system"): Promise<VoiceBackfillResult> {
  const ranAt = new Date().toISOString();

  try {
    if (!isTwilioConfigured()) {
      const result: VoiceBackfillResult = { ranAt, triggeredBy, checked: 0, updated: 0, failed: 0 };
      await setSiteContentBlock("admin.voiceBackfillLastRun", result, "system");
      await recordJobRun(VOICE_BACKFILL_JOB_NAME, { success: true, checkedCount: 0, affectedCount: 0 });
      return result;
    }

    const stuckSids = await findStuckCallSids();
    let updated = 0;
    let failed = 0;
    const newFixes: VoiceBackfillFix[] = [];

    for (const [callSid, fromStatus] of stuckSids) {
      try {
        const snapshot = await fetchCallStatus(callSid);
        if (!snapshot || NON_TERMINAL_STATUSES.includes(snapshot.status as (typeof NON_TERMINAL_STATUSES)[number])) {
          // Still genuinely in progress (or Twilio has no record) — leave it alone.
          continue;
        }

        await db
          .update(voiceCallLogsTable)
          .set({
            status: snapshot.status,
            ...(snapshot.durationSeconds !== undefined ? { durationSeconds: snapshot.durationSeconds } : {}),
          })
          .where(eq(voiceCallLogsTable.callSid, callSid));

        await db
          .update(voiceCampaignCallsTable)
          .set({
            status: snapshot.status,
            ...(snapshot.durationSeconds !== undefined ? { durationSeconds: snapshot.durationSeconds } : {}),
          })
          .where(eq(voiceCampaignCallsTable.callSid, callSid));

        updated++;
        newFixes.push({ ranAt, callSid, fromStatus, toStatus: snapshot.status });
        logger.info({ callSid, status: snapshot.status }, "[voice-backfill] Reconciled stuck call from Twilio");
      } catch (err) {
        failed++;
        logger.error({ err, callSid }, "[voice-backfill] Failed to reconcile call — will retry next run");
      }
    }

    const result: VoiceBackfillResult = { ranAt, triggeredBy, checked: stuckSids.size, updated, failed };
    await setSiteContentBlock("admin.voiceBackfillLastRun", result, "system");

    if (newFixes.length > 0) {
      const existing = (await getSiteContentBlock("admin.voiceBackfillRecentFixes")) as VoiceBackfillFix[];
      const merged = [...newFixes, ...existing].slice(0, MAX_RECENT_FIXES);
      await setSiteContentBlock("admin.voiceBackfillRecentFixes", merged, "system");
    }

    if (stuckSids.size > 0) {
      logger.info(result, "[voice-backfill] Run complete");
    }

    await recordJobRun(VOICE_BACKFILL_JOB_NAME, { success: true, checkedCount: stuckSids.size, affectedCount: updated });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordJobRun(VOICE_BACKFILL_JOB_NAME, { success: false, error: message });
    throw err;
  }
}

export async function getVoiceBackfillLastRun(): Promise<VoiceBackfillResult> {
  return (await getSiteContentBlock("admin.voiceBackfillLastRun")) as VoiceBackfillResult;
}

export async function getVoiceBackfillRecentFixes(): Promise<VoiceBackfillFix[]> {
  return (await getSiteContentBlock("admin.voiceBackfillRecentFixes")) as VoiceBackfillFix[];
}

/** Starts the automatic reconciliation job: checks every 5 minutes for stuck calls. */
export function startVoiceBackfillScheduler(): void {
  const tick = () => { runVoiceBackfill("system").catch((err) => logger.error({ err }, "[voice-backfill] Scheduled tick failed")); };
  tick(); // run once on boot too, in case calls got stuck while the server was down
  setInterval(tick, 5 * 60 * 1000);
  logger.info("[voice-backfill] Scheduled reconciliation started — checks every 5 minutes");
}
