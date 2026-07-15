/**
 * Pre-publish reminder for scheduled social posts.
 *
 * Vendors can schedule an approved post to auto-publish later (see
 * POST /posts/:id/schedule and post-scheduler.ts). This job runs a short
 * lead time ahead of that so vendors get a last chance to catch a mistake
 * before it actually goes out — push + email, via notifyPostReminderDue.
 *
 * Idempotency / safety:
 *  - `reminderSentAt` is claimed atomically (UPDATE ... WHERE status =
 *    'scheduled' AND reminder_sent_at IS NULL) BEFORE the notification is
 *    sent, so a vendor gets exactly one reminder per scheduled post even if
 *    two ticks overlap or the server restarts mid-check — mirrors the
 *    reserve-before-send pattern in pending-reminders.ts.
 *  - Rescheduling (POST /posts/:id/schedule) or otherwise changing
 *    scheduledAt on a still-scheduled post clears reminderSentAt, so a new
 *    reminder fires ahead of the new time (see routes/posts.ts).
 *  - Once a post is actually due, post-scheduler.ts moves it out of
 *    'scheduled' before this job would otherwise re-check it, so there's no
 *    risk of reminding about a post that has already published.
 */
import { db, postsTable } from "@workspace/db";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { logger } from "./logger";
import { notifyPostReminderDue } from "./post-notifications";
import { recordJobRun } from "./job-run-status";

// How far ahead of scheduledAt the reminder should go out.
export const REMINDER_LEAD_MINUTES = 30;

// Name this tick's state is recorded under in job_run_status, for the admin panel.
export const POST_REMINDERS_JOB_NAME = "post-reminders";

/**
 * Exported (in addition to being used internally by tick/startPostReminderScheduler)
 * so tests can exercise it directly without waiting for setInterval.
 */
export async function sendDuePostReminders(): Promise<void> {
  const now = new Date();
  const leadCutoff = new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60_000);

  const due = await db
    .select({ id: postsTable.id, vendorId: postsTable.vendorId, caption: postsTable.caption, scheduledAt: postsTable.scheduledAt })
    .from(postsTable)
    .where(
      and(
        eq(postsTable.status, "scheduled"),
        isNull(postsTable.reminderSentAt),
        // Still in the future (post-scheduler claims/publishes anything already
        // due, so this only ever matches posts that haven't gone live yet) but
        // within the lead window.
        gt(postsTable.scheduledAt, now),
        lte(postsTable.scheduledAt, leadCutoff),
      ),
    );

  if (due.length === 0) return;

  logger.info({ count: due.length }, "[post-reminders] Found scheduled posts due for a pre-publish reminder");

  for (const { id, vendorId, caption, scheduledAt } of due) {
    try {
      // Atomic claim — only succeeds if still 'scheduled' and un-reminded at
      // the moment we act. Guards against double-sends across overlapping
      // ticks/restarts, and against a race with a reschedule that just
      // cleared reminderSentAt again.
      const [claimed] = await db
        .update(postsTable)
        .set({ reminderSentAt: new Date() })
        .where(and(eq(postsTable.id, id), eq(postsTable.status, "scheduled"), isNull(postsTable.reminderSentAt)))
        .returning({ id: postsTable.id });

      if (!claimed) {
        logger.info({ postId: id }, "[post-reminders] Post no longer eligible for a reminder — skipping");
        continue;
      }

      await notifyPostReminderDue(vendorId, id, caption, scheduledAt!);
      logger.info({ postId: id }, "[post-reminders] Sent pre-publish reminder");
    } catch (err) {
      logger.error({ err, postId: id }, "[post-reminders] Failed to send pre-publish reminder");
    }
  }
}

async function tick(): Promise<void> {
  try {
    await sendDuePostReminders();
    await recordJobRun(POST_REMINDERS_JOB_NAME, { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordJobRun(POST_REMINDERS_JOB_NAME, { success: false, error: message });
    throw err;
  }
}

/** Starts the pre-publish reminder job: checks every 5 minutes for posts due soon. */
export function startPostReminderScheduler(): void {
  setInterval(() => { tick().catch(() => {}); }, 5 * 60 * 1000);
  tick().catch(() => {}); // run once on boot too, in case a post is already due soon
  logger.info({ leadMinutes: REMINDER_LEAD_MINUTES }, "[post-reminders] Pre-publish reminder scheduler started — checks every 5 minutes");
}
