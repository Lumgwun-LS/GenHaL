/**
 * Scheduled voice campaign launcher.
 *
 * Vendors can set a `scheduledAt` on a campaign while it sits in status
 * 'scheduled'. Every 5 minutes this job looks for campaigns whose
 * scheduledAt has passed and whose status is still 'scheduled', then
 * launches them automatically — mirroring the birthday scheduler's
 * setInterval pattern (see birthday-scheduler.ts).
 *
 * Idempotency / safety:
 *  - The status transition scheduled -> running uses the same atomic
 *    conditional UPDATE pattern as the manual /launch route (WHERE status
 *    = 'scheduled'), so a campaign only launches once even if two ticks
 *    overlap or the server restarts mid-check.
 *  - If a vendor edits or cancels a campaign before it fires, the PATCH
 *    route moves it out of 'scheduled' (back to 'draft', or to 'paused'),
 *    so the next tick's WHERE clause simply won't match it — it is never
 *    launched.
 */
import { db } from "@workspace/db";
import { voiceCampaignsTable, leadsTable } from "@workspace/db/schema";
import { and, eq, lte, sql } from "drizzle-orm";
import { logger } from "./logger";
import { runCampaignCalls } from "../routes/voice-campaigns";
import { recordJobRun } from "./job-run-status";

const E164_RE = /^\+[1-9]\d{1,14}$/;

// Name this job's state is recorded under in job_run_status, for the admin panel.
export const VOICE_CAMPAIGN_SCHEDULER_JOB_NAME = "voice-campaign-scheduler";

async function launchDueCampaigns(): Promise<void> {
  const due = await db
    .select()
    .from(voiceCampaignsTable)
    .where(
      and(
        eq(voiceCampaignsTable.status, "scheduled"),
        sql`${voiceCampaignsTable.scheduledAt} IS NOT NULL`,
        lte(voiceCampaignsTable.scheduledAt, sql`now()`),
      ),
    );

  if (due.length === 0) return;

  logger.info({ count: due.length }, "[voice-scheduler] Found due campaigns to auto-launch");

  for (const campaign of due) {
    try {
      // Atomic transition — only succeeds if still 'scheduled' at the moment we act.
      // If the vendor cancelled/edited it in the meantime, this update matches
      // zero rows and we skip it.
      const [transitioned] = await db
        .update(voiceCampaignsTable)
        .set({ status: "running" })
        .where(and(eq(voiceCampaignsTable.id, campaign.id), eq(voiceCampaignsTable.status, "scheduled")))
        .returning();

      if (!transitioned) {
        logger.info({ campaignId: campaign.id }, "[voice-scheduler] Campaign no longer scheduled — skipping");
        continue;
      }

      const leads = await db.select().from(leadsTable).where(eq(leadsTable.vendorId, campaign.vendorId));
      const callable = leads.filter((l) => l.phone && E164_RE.test(l.phone));

      if (callable.length === 0) {
        logger.warn({ campaignId: campaign.id }, "[voice-scheduler] No callable leads — marking failed");
        await db.update(voiceCampaignsTable).set({ status: "failed" }).where(eq(voiceCampaignsTable.id, campaign.id));
        continue;
      }

      logger.info({ campaignId: campaign.id, vendorId: campaign.vendorId, count: callable.length }, "[voice-scheduler] Auto-launching campaign");
      await runCampaignCalls(transitioned, campaign.vendorId, callable);
    } catch (err) {
      logger.error({ err, campaignId: campaign.id }, "[voice-scheduler] Error auto-launching campaign — will retry next tick");
    }
  }
}

async function tick(): Promise<void> {
  try {
    await launchDueCampaigns();
    await recordJobRun(VOICE_CAMPAIGN_SCHEDULER_JOB_NAME, { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordJobRun(VOICE_CAMPAIGN_SCHEDULER_JOB_NAME, { success: false, error: message });
    throw err;
  }
}

/** Starts the scheduled-campaign launcher: checks every 5 minutes for due campaigns. */
export function startVoiceCampaignScheduler(): void {
  setInterval(() => { tick().catch(() => {}); }, 5 * 60 * 1000);
  tick().catch(() => {}); // run once on boot too, in case a campaign was already due
  logger.info("[voice-scheduler] Scheduled campaign launcher started — checks every 5 minutes");
}
