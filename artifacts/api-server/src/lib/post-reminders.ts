/**
 * Pre-publish reminder for scheduled social posts.
 *
 * Vendors can schedule an approved post to auto-publish later (see
 * POST /posts/:id/schedule and post-scheduler.ts). This job runs ahead of
 * that time — using each vendor's personal lead-time preference
 * (postReminderLeadMinutes on the vendors table, default 30) — so they get a
 * last chance to catch a mistake before it goes out: push + email via
 * notifyPostReminderDue.
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
 *
 * Lead-time preference changes and reminder behaviour:
 *
 *  Case A — vendor changes lead time AFTER the reminder has already fired:
 *    `reminderSentAt` is set on the post. The query's `isNull(reminderSentAt)`
 *    clause excludes the post entirely, so the reminder is never re-sent.
 *    This is correct regardless of whether the vendor widens or narrows the
 *    preference.
 *
 *  Case B — vendor changes lead time BEFORE the reminder fires (reminderSentAt
 *    is still NULL):
 *    The job re-evaluates each candidate against the vendor's current preference
 *    at the moment each tick runs. This means:
 *    • Widening the lead time (e.g. 30 min → 2 h) can cause the next tick to
 *      send a reminder that would otherwise have waited — the vendor has
 *      explicitly asked for a longer heads-up, so firing sooner is the correct
 *      response to their updated preference. A guard here would silently ignore
 *      the preference change for in-flight posts, which would be more confusing.
 *    • Narrowing the lead time (e.g. 2 h → 10 min) can delay the reminder or
 *      mean it never fires at all if the post publishes before the next tick
 *      with the narrower window. This is also intentional — the vendor chose a
 *      shorter heads-up.
 *    In both sub-cases the atomic `reminderSentAt` claim ensures exactly-once
 *    delivery once the post enters the window, even across concurrent ticks.
 *
 *  No additional guard is needed: the single-send guarantee already comes from
 *  `reminderSentAt`, and the preference is intentionally evaluated live so that
 *  changes take effect for posts that have not yet been reminded.
 */
import { db, postsTable, vendorsTable } from "@workspace/db";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { logger } from "./logger";
import { notifyPostReminderDue } from "./post-notifications";
import { recordJobRun } from "./job-run-status";

/**
 * Maximum lead time any vendor can configure (1 day).
 * We fetch all posts due within this outer window and then filter
 * per-vendor using each vendor's own preference — avoids a complex
 * per-row SQL expression while keeping a single round-trip to the DB.
 */
export const MAX_REMINDER_LEAD_MINUTES = 1440; // 1 day

/**
 * Default lead time used when a vendor has not set a preference (mirrors the
 * legacy fixed constant so existing vendors see no behaviour change).
 */
export const DEFAULT_REMINDER_LEAD_MINUTES = 30;

// Name this tick's state is recorded under in job_run_status, for the admin panel.
export const POST_REMINDERS_JOB_NAME = "post-reminders";

/**
 * Exported (in addition to being used internally by tick/startPostReminderScheduler)
 * so tests can exercise it directly without waiting for setInterval.
 */
export async function sendDuePostReminders(): Promise<void> {
  const now = new Date();
  // Outer window: fetch everything that could be due for *any* vendor lead time.
  const outerCutoff = new Date(now.getTime() + MAX_REMINDER_LEAD_MINUTES * 60_000);

  // Fetch candidate posts joined with their vendor's lead-time preference.
  const candidates = await db
    .select({
      id: postsTable.id,
      vendorId: postsTable.vendorId,
      caption: postsTable.caption,
      scheduledAt: postsTable.scheduledAt,
      leadMinutes: vendorsTable.postReminderLeadMinutes,
    })
    .from(postsTable)
    .innerJoin(vendorsTable, eq(postsTable.vendorId, vendorsTable.id))
    .where(
      and(
        eq(postsTable.status, "scheduled"),
        isNull(postsTable.reminderSentAt),
        // Still in the future (post-scheduler claims/publishes anything already
        // due, so this only ever matches posts that haven't gone live yet) but
        // within the outer lead window.
        gt(postsTable.scheduledAt, now),
        lte(postsTable.scheduledAt, outerCutoff),
      ),
    );

  // Filter to posts that fall within THIS vendor's personal lead window.
  const due = candidates.filter(({ scheduledAt, leadMinutes }) => {
    const lead = leadMinutes ?? DEFAULT_REMINDER_LEAD_MINUTES;
    const vendorCutoff = new Date(now.getTime() + lead * 60_000);
    return scheduledAt! <= vendorCutoff;
  });

  if (due.length === 0) return;

  logger.info({ count: due.length }, "[post-reminders] Found scheduled posts due for a pre-publish reminder");

  for (const { id, vendorId, caption, scheduledAt, leadMinutes } of due) {
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
      logger.info({ postId: id, leadMinutes: leadMinutes ?? DEFAULT_REMINDER_LEAD_MINUTES }, "[post-reminders] Sent pre-publish reminder");
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
  logger.info(
    { defaultLeadMinutes: DEFAULT_REMINDER_LEAD_MINUTES, maxLeadMinutes: MAX_REMINDER_LEAD_MINUTES },
    "[post-reminders] Pre-publish reminder scheduler started — checks every 5 minutes (per-vendor lead time)",
  );
}
