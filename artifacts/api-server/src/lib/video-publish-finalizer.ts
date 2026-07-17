/**
 * Finalizes Facebook video publications that were left in "processing" status
 * by publishFacebookVideoPost (see lib/meta.ts) — that function only uploads
 * the video bytes and returns immediately, rather than blocking the
 * publishing HTTP request (manual /posts/:id/publish or the scheduled
 * auto-publisher) for up to ~2 minutes while Facebook finishes async video
 * processing.
 *
 * This job periodically checks every still-"processing" post_publications
 * row against Facebook's Graph API and resolves it to "success" or "failed"
 * once Facebook reports a real outcome, or after MAX_WAIT_MS with no
 * resolution (treated as a failure so a row never lingers as "processing"
 * forever). Follows the standard VendorHub scheduled-job pattern: a plain
 * setInterval loop plus one immediate tick on boot.
 */
import { and, eq } from "drizzle-orm";
import { db, postPublicationsTable, postsTable, socialAccountsTable } from "@workspace/db";
import { checkFacebookVideoStatus, isMetaAuthError } from "./meta";
import { ensureFreshAccessToken } from "./token-refresh";
import { logger } from "./logger";
import { recordJobRun } from "./job-run-status";
import { notifyFacebookVideoLive, notifyFacebookVideoFailed } from "./post-notifications";

const CHECK_INTERVAL_MS = 20 * 1000; // 20 seconds — video processing usually finishes well under a minute
// If Facebook hasn't reported ready/error within this long, give up and mark
// the publication failed rather than polling forever.
const MAX_WAIT_MS = 15 * 60 * 1000; // 15 minutes

// Name this tick's state is recorded under in job_run_status, for the admin panel.
export const VIDEO_PUBLISH_FINALIZER_JOB_NAME = "video-publish-finalizer";

async function resolveOne(
  pub: typeof postPublicationsTable.$inferSelect,
  account: typeof socialAccountsTable.$inferSelect | undefined,
  vendorId: number,
  caption: string,
): Promise<"resolved" | "still-processing"> {
  const elapsedMs = Date.now() - pub.publishedAt.getTime();

  const notifyFailure = (reason: string) =>
    notifyFacebookVideoFailed(vendorId, pub.postId, caption, reason).catch((err) =>
      logger.error({ err, publicationId: pub.id, vendorId }, "[video-publish-finalizer] Failed to send video-failed notification"),
    );

  if (!account || !account.accessTokenEncrypted) {
    const errorMessage = "The connected Facebook account is no longer connected — could not confirm whether the video finished processing.";
    await db
      .update(postPublicationsTable)
      .set({ status: "failed", errorMessage })
      .where(and(eq(postPublicationsTable.id, pub.id), eq(postPublicationsTable.status, "processing")));
    await notifyFailure(errorMessage);
    return "resolved";
  }

  const checkOnce = async (): Promise<{ status: "ready" | "error" | "processing"; failureReason: string | null }> => {
    const accessToken = await ensureFreshAccessToken(account);
    try {
      return await checkFacebookVideoStatus(pub.externalPostId!, accessToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!isMetaAuthError(message)) throw err;
      // Same reactive-refresh-and-retry-once pattern used for publish attempts.
      const refreshedToken = await ensureFreshAccessToken(account, { force: true });
      return await checkFacebookVideoStatus(pub.externalPostId!, refreshedToken);
    }
  };

  try {
    const check = await checkOnce();

    if (check.status === "ready") {
      await db
        .update(postPublicationsTable)
        .set({ status: "success" })
        .where(and(eq(postPublicationsTable.id, pub.id), eq(postPublicationsTable.status, "processing")));
      await notifyFacebookVideoLive(vendorId, pub.postId, caption).catch((err) =>
        logger.error({ err, publicationId: pub.id, vendorId }, "[video-publish-finalizer] Failed to send video-live notification"),
      );
      return "resolved";
    }

    if (check.status === "error") {
      const errorMessage = `Facebook accepted the video upload but processing failed: ${check.failureReason}`;
      await db
        .update(postPublicationsTable)
        .set({ status: "failed", errorMessage })
        .where(and(eq(postPublicationsTable.id, pub.id), eq(postPublicationsTable.status, "processing")));
      await notifyFailure(errorMessage);
      return "resolved";
    }

    // Still processing — give up only once we've waited long enough that
    // this is clearly stuck, not just slow.
    if (elapsedMs >= MAX_WAIT_MS) {
      const errorMessage = "Timed out waiting for Facebook to finish processing the video.";
      await db
        .update(postPublicationsTable)
        .set({ status: "failed", errorMessage })
        .where(and(eq(postPublicationsTable.id, pub.id), eq(postPublicationsTable.status, "processing")));
      await notifyFailure(errorMessage);
      return "resolved";
    }
    return "still-processing";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A transient lookup failure shouldn't immediately fail the publication —
    // only once we've also blown past the max wait do we give up on it.
    if (elapsedMs >= MAX_WAIT_MS) {
      const errorMessage = `Could not confirm Facebook video processing status: ${message}`;
      await db
        .update(postPublicationsTable)
        .set({ status: "failed", errorMessage })
        .where(and(eq(postPublicationsTable.id, pub.id), eq(postPublicationsTable.status, "processing")));
      await notifyFailure(errorMessage);
      return "resolved";
    }
    logger.warn({ err, publicationId: pub.id }, "[video-publish-finalizer] Transient error checking Facebook video status — will retry next tick");
    return "still-processing";
  }
}

/**
 * Exported (in addition to being used internally by tick/start) so tests can
 * exercise it directly without waiting for setInterval.
 */
export async function finalizePendingVideoPublications(): Promise<{ checked: number; resolved: number }> {
  const pending = await db
    .select({
      pub: postPublicationsTable,
      vendorId: postsTable.vendorId,
      caption: postsTable.caption,
    })
    .from(postPublicationsTable)
    .innerJoin(postsTable, eq(postPublicationsTable.postId, postsTable.id))
    .where(and(eq(postPublicationsTable.status, "processing"), eq(postPublicationsTable.platform, "facebook")));

  if (pending.length === 0) return { checked: 0, resolved: 0 };

  const accounts = await db.select().from(socialAccountsTable).where(eq(socialAccountsTable.status, "active"));

  const accountById = new Map(accounts.map((a) => [a.id, a]));

  let resolved = 0;
  for (const { pub, vendorId, caption } of pending) {
    const account = pub.socialAccountId != null ? accountById.get(pub.socialAccountId) : undefined;
    const outcome = await resolveOne(pub, account, vendorId, caption ?? "");
    if (outcome === "resolved") resolved++;
  }

  return { checked: pending.length, resolved };
}

async function tick(): Promise<void> {
  try {
    const { checked, resolved } = await finalizePendingVideoPublications();
    await recordJobRun(VIDEO_PUBLISH_FINALIZER_JOB_NAME, { success: true, checkedCount: checked, affectedCount: resolved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "[video-publish-finalizer] Tick failed");
    await recordJobRun(VIDEO_PUBLISH_FINALIZER_JOB_NAME, { success: false, error: message });
  }
}

/** Starts the Facebook video publish finalizer: checks every 20 seconds for processing videos to resolve. */
export function startVideoPublishFinalizer(): void {
  tick().catch((err) => logger.error({ err }, "Video publish finalizer: initial tick failed"));
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, "Video publish finalizer: tick failed"));
  }, CHECK_INTERVAL_MS);
}
