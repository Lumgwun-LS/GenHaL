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

async function publishDuePosts(): Promise<void> {
  const due = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(
      and(
        eq(postsTable.status, "scheduled"),
        sql`${postsTable.scheduledAt} IS NOT NULL`,
        lte(postsTable.scheduledAt, sql`now()`),
      ),
    );

  if (due.length === 0) return;

  logger.info({ count: due.length }, "[post-scheduler] Found due scheduled posts to auto-publish");

  for (const { id } of due) {
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

      const { anySucceeded } = await executeClaimedPublish(claimed);
      if (anySucceeded) {
        logger.info({ postId: id }, "[post-scheduler] Auto-published scheduled post");
      } else {
        logger.warn({ postId: id }, "[post-scheduler] Scheduled post failed to publish on every platform — reverted to approved for manual retry");
      }
    } catch (err) {
      logger.error({ err, postId: id }, "[post-scheduler] Error auto-publishing scheduled post — reverting to approved for manual retry");
      // executeClaimedPublish threw before it could resolve the claimed "publishing"
      // row itself (e.g. a transient DB error). Without this, the post would be
      // stuck in "publishing" forever, since the query above only ever looks for
      // status = 'scheduled'. Guard the revert on status still being "publishing"
      // so we don't clobber a state some other path already moved it to.
      await db
        .update(postsTable)
        .set({ status: "approved" })
        .where(and(eq(postsTable.id, id), eq(postsTable.status, "publishing")))
        .catch((revertErr) => {
          logger.error({ err: revertErr, postId: id }, "[post-scheduler] Failed to revert stuck post out of 'publishing'");
        });
    }
  }
}

/** Starts the scheduled-post publisher: checks every 5 minutes for due posts. */
export function startPostScheduler(): void {
  setInterval(() => { publishDuePosts().catch(() => {}); }, 5 * 60 * 1000);
  publishDuePosts().catch(() => {}); // run once on boot too, in case a post was already due
  logger.info("[post-scheduler] Scheduled post publisher started — checks every 5 minutes");
}
