/**
 * Scheduled social-post auto-publisher.
 *
 * Vendors can schedule an already-approved post (see POST /posts/:id/schedule)
 * by setting `scheduledAt` and moving status to 'scheduled'. Every 5 minutes
 * this job looks for posts whose scheduledAt has passed and whose status is
 * still 'scheduled', then publishes them automatically — mirroring the
 * voice-campaign auto-launch job's setInterval pattern (see
 * voice-campaign-scheduler.ts).
 *
 * Idempotency / safety:
 *  - The status transition scheduled -> publishing uses the same atomic
 *    conditional UPDATE pattern as the manual /publish route (WHERE status =
 *    'scheduled'), so a post only gets claimed and published once even if two
 *    ticks overlap or the server restarts mid-check.
 *  - Actual per-platform publishing and the final publishing -> published /
 *    approved resolution reuse executeClaimedPublish from routes/posts.ts, so
 *    there is exactly one place that can move a post out of "publishing".
 *  - If a vendor cancels the schedule before it fires, cancel-schedule moves
 *    the post out of 'scheduled' (back to 'draft'), so the next tick's WHERE
 *    clause simply won't match it — it is never published.
 *  - If real publishing isn't available for a platform yet (e.g. it's not
 *    Facebook/Instagram), that leg just fails with a clear error the same way
 *    a manual publish would — scheduling never pretends to have gone live.
 */
import { db, postsTable } from "@workspace/db";
import { and, eq, lte, sql } from "drizzle-orm";
import { logger } from "./logger";
import { executeClaimedPublish } from "../routes/posts";
import { notifyScheduledPostFailed } from "./post-notifications";
import { recordJobRun } from "./job-run-status";

// Name this tick's state is recorded under in job_run_status, for the admin panel.
export const POST_SCHEDULER_JOB_NAME = "post-scheduler";

/**
 * Exported (in addition to being used internally by tick/startPostScheduler)
 * so tests can exercise the DB-exception fallback / revert-and-notify path
 * directly, without needing to fake setInterval or wait for the boot-time run.
 */
export async function publishDuePosts(): Promise<{ checked: number; published: number }> {
  const due = await db
    .select({ id: postsTable.id, vendorId: postsTable.vendorId, caption: postsTable.caption })
    .from(postsTable)
    .where(
      and(
        eq(postsTable.status, "scheduled"),
        sql`${postsTable.scheduledAt} IS NOT NULL`,
        lte(postsTable.scheduledAt, sql`now()`),
      ),
    );

  if (due.length === 0) return { checked: 0, published: 0 };

  logger.info({ count: due.length }, "[post-scheduler] Found due scheduled posts to auto-publish");

  let published = 0;
  for (const { id, vendorId, caption } of due) {
    try {
      // Atomic claim — only succeeds if still 'scheduled' at the moment we act.
      // If the vendor cancelled/rescheduled it in the meantime, this update
      // matches zero rows and we skip it.
      const [claimed] = await db
        .update(postsTable)
        .set({ status: "publishing" })
        .where(and(eq(postsTable.id, id), eq(postsTable.status, "scheduled")))
        .returning();

      if (!claimed) {
        logger.info({ postId: id }, "[post-scheduler] Post no longer scheduled — skipping");
        continue;
      }

      const { anySucceeded } = await executeClaimedPublish(claimed, { auto: true });
      if (anySucceeded) {
        logger.info({ postId: id }, "[post-scheduler] Auto-published scheduled post");
        published++;
      } else {
        // executeClaimedPublish already reverted the post to "approved" (with
        // autoPublishFailed set) and notified the vendor in-app + by email.
        logger.warn({ postId: id }, "[post-scheduler] Scheduled post failed to publish on every platform — reverted to approved for manual retry");
      }
    } catch (err) {
      logger.error({ err, postId: id }, "[post-scheduler] Error auto-publishing scheduled post — reverting to approved for manual retry");
      // executeClaimedPublish threw before it could resolve the claimed "publishing"
      // row itself (e.g. a transient DB error). Without this, the post would be
      // stuck in "publishing" forever, since the query above only ever looks for
      // status = 'scheduled'. Guard the revert on status still being "publishing"
      // so we don't clobber a state some other path already moved it out of.
      const [reverted] = await db
        .update(postsTable)
        .set({ status: "approved", autoPublishFailed: true })
        .where(and(eq(postsTable.id, id), eq(postsTable.status, "publishing")))
        .returning({ id: postsTable.id })
        .catch((revertErr) => {
          logger.error({ err: revertErr, postId: id }, "[post-scheduler] Failed to revert stuck post out of 'publishing'");
          return [];
        });
      // Only notify if we actually performed the revert (i.e. the post was still
      // "publishing" — not a state some other path already moved it out of).
      if (reverted) {
        await notifyScheduledPostFailed(vendorId, id, caption, []).catch((notifyErr) => {
          logger.error({ err: notifyErr, postId: id }, "[post-scheduler] Failed to notify vendor after DB-error revert");
        });
      }
    }
  }
  return { checked: due.length, published };
}

export async function tick(): Promise<void> {
  try {
    const counts = await publishDuePosts();
    await recordJobRun(POST_SCHEDULER_JOB_NAME, { success: true, checkedCount: counts.checked, affectedCount: counts.published });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordJobRun(POST_SCHEDULER_JOB_NAME, { success: false, error: message });
    throw err;
  }
}

/** Starts the scheduled-post publisher: checks every 5 minutes for due posts. */
export function startPostScheduler(): void {
  setInterval(() => { tick().catch(() => {}); }, 5 * 60 * 1000);
  tick().catch(() => {}); // run once on boot too, in case a post was already due
  logger.info("[post-scheduler] Scheduled post publisher started — checks every 5 minutes");
}
