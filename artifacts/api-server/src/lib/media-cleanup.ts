/**
 * Deletes AI-generated images/videos AND vendor-uploaded photos/videos from
 * object storage once they've sat unattached to any post for RETENTION_HOURS.
 *
 * AI-generated media path
 * ─────────────────────────
 * Every successful call to /ai/generate-image, /ai/generate-video-scenes,
 * /ai/regenerate-video-scene, or /ai/render-video permanently uploads its
 * result (see generated-media-storage.ts) so it has a public URL platforms
 * like Instagram can fetch — but a vendor who previews, regenerates, or simply
 * never publishes a generation otherwise leaves that object in the bucket
 * forever. Scene preview images are recorded as ordinary `type: "image"`
 * AiGeneration rows, so they're swept by the exact same "image"/"video" query
 * below with no special-casing.
 *
 * Vendor-uploaded media path
 * ─────────────────────────
 * Every presigned-URL response from /ai/upload-image-url and
 * /ai/upload-video-url now records the object in `vendorUploadsTable`. The
 * same 48-hour grace window and "still in use" live-check used for AI
 * generations is applied here too, so:
 *   • A vendor who picks an upload for a post and then keeps editing gets the
 *     full retention window before anything is touched.
 *   • An upload that was attached to a post that later got deleted is no
 *     longer considered "in use" and is swept on the next tick.
 *   • An upload abandoned mid-compose (never saved to any post) is swept
 *     after the grace window.
 *
 * "Still attached" is re-checked live on every tick (not decided once at
 * upload/generation time) via a lookup against posts.media_urls, so media
 * belonging to a now-deleted post is correctly swept and not left orphaned.
 *
 * Mirrors the setInterval scheduler pattern in post-scheduler.ts and reports
 * through the shared job-run-status helper.
 */
import { db, aiGenerationsTable, postsTable, vendorUploadsTable } from "@workspace/db";
import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { logger } from "./logger";
import { recordJobRun } from "./job-run-status";
import { ObjectStorageService } from "./objectStorage";
import { extractMediaObjectId } from "./generated-media-storage";

export const MEDIA_CLEANUP_JOB_NAME = "media-cleanup";

// Long enough that a vendor actively working with a fresh generation or upload
// (picking it for a post, drafting, coming back the next day) never has it
// vanish out from under them, but short enough that abandoned media doesn't
// linger.
const RETENTION_HOURS = 48;
// Caps how many candidates a single tick processes, so one huge backlog
// (e.g. after this job was down for a while) can't turn a tick into an
// unbounded loop of storage-delete calls — the rest are picked up next tick.
// Shared across both sweep passes so we always have headroom for both.
const BATCH_LIMIT = 100;

const objectStorageService = new ObjectStorageService();

/**
 * Returns true if the given media URL is still referenced by at least one
 * post in the database. "In use" means the URL appears in posts.media_urls
 * for any post (regardless of status or scheduled-at).
 */
async function isMediaStillInUse(mediaUrl: string): Promise<boolean> {
  const [row] = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(sql`${mediaUrl} = ANY(${postsTable.mediaUrls})`)
    .limit(1);
  return !!row;
}

/**
 * Sweeps orphaned AI-generated images/videos: those older than RETENTION_HOURS
 * and not currently referenced by any post.
 */
async function sweepOrphanedAiMedia(): Promise<{ checked: number; deleted: number }> {
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);

  // Ordered oldest-checked-first (nulls — never checked — first of all) so a
  // large backlog of permanently-in-use rows can't dominate every tick's
  // BATCH_LIMIT slice and starve out truly orphaned rows elsewhere in the
  // table: every row's mediaLastCheckedAt is bumped below whether it's
  // deleted or skipped, so it naturally rotates to the back of the queue.
  const candidates = await db
    .select({ id: aiGenerationsTable.id, result: aiGenerationsTable.result })
    .from(aiGenerationsTable)
    .where(
      and(
        inArray(aiGenerationsTable.type, ["image", "video"]),
        eq(aiGenerationsTable.status, "completed"),
        isNull(aiGenerationsTable.mediaDeletedAt),
        lt(aiGenerationsTable.createdAt, cutoff),
        sql`${aiGenerationsTable.result} LIKE '%/api/media/%'`,
      ),
    )
    .orderBy(sql`${aiGenerationsTable.mediaLastCheckedAt} ASC NULLS FIRST`, asc(aiGenerationsTable.id))
    .limit(BATCH_LIMIT);

  let deleted = 0;
  for (const { id, result } of candidates) {
    if (!result) continue;
    try {
      if (await isMediaStillInUse(result)) {
        // Still attached to a post — leave the object alone but bump the
        // checked timestamp so this row rotates to the back of next tick's
        // ordering.
        await db.update(aiGenerationsTable).set({ mediaLastCheckedAt: new Date() }).where(eq(aiGenerationsTable.id, id));
        continue;
      }

      const objectId = extractMediaObjectId(result);
      if (objectId) {
        await objectStorageService.deleteObject(`/objects/uploads/${objectId}`);
      }
      // `result` itself is left untouched — mediaDeletedAt alone marks this
      // generation as swept, so the AI Generations history stays intact for
      // the vendor/admin even though the underlying file is gone.
      const now = new Date();
      await db.update(aiGenerationsTable).set({ mediaDeletedAt: now, mediaLastCheckedAt: now }).where(eq(aiGenerationsTable.id, id));
      deleted++;
    } catch (err) {
      logger.error({ err, generationId: id }, "[media-cleanup] Failed to sweep AI-generated media object");
    }
  }

  return { checked: candidates.length, deleted };
}

/**
 * Sweeps orphaned vendor-uploaded photos/videos: those older than
 * RETENTION_HOURS that are not currently referenced by any post.
 */
async function sweepOrphanedVendorUploads(): Promise<{ checked: number; deleted: number }> {
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);

  const candidates = await db
    .select({ id: vendorUploadsTable.id, mediaUrl: vendorUploadsTable.mediaUrl })
    .from(vendorUploadsTable)
    .where(
      and(
        isNull(vendorUploadsTable.mediaDeletedAt),
        lt(vendorUploadsTable.createdAt, cutoff),
      ),
    )
    .orderBy(sql`${vendorUploadsTable.mediaLastCheckedAt} ASC NULLS FIRST`, asc(vendorUploadsTable.id))
    .limit(BATCH_LIMIT);

  let deleted = 0;
  for (const { id, mediaUrl } of candidates) {
    try {
      if (await isMediaStillInUse(mediaUrl)) {
        await db.update(vendorUploadsTable).set({ mediaLastCheckedAt: new Date() }).where(eq(vendorUploadsTable.id, id));
        continue;
      }

      const objectId = extractMediaObjectId(mediaUrl);
      if (objectId) {
        await objectStorageService.deleteObject(`/objects/uploads/${objectId}`);
      }
      const now = new Date();
      await db.update(vendorUploadsTable).set({ mediaDeletedAt: now, mediaLastCheckedAt: now }).where(eq(vendorUploadsTable.id, id));
      deleted++;
    } catch (err) {
      logger.error({ err, uploadId: id }, "[media-cleanup] Failed to sweep vendor-uploaded media object");
    }
  }

  return { checked: candidates.length, deleted };
}

export async function sweepOrphanedMedia(): Promise<{ checked: number; deleted: number }> {
  const [ai, vendor] = await Promise.all([
    sweepOrphanedAiMedia(),
    sweepOrphanedVendorUploads(),
  ]);
  return {
    checked: ai.checked + vendor.checked,
    deleted: ai.deleted + vendor.deleted,
  };
}

async function tick(): Promise<void> {
  try {
    const { checked, deleted } = await sweepOrphanedMedia();
    if (deleted > 0) logger.info({ checked, deleted }, "[media-cleanup] Deleted orphaned media (AI-generated + vendor-uploaded)");
    await recordJobRun(MEDIA_CLEANUP_JOB_NAME, { success: true, checkedCount: checked, affectedCount: deleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordJobRun(MEDIA_CLEANUP_JOB_NAME, { success: false, error: message });
    throw err;
  }
}

/** Starts the orphaned media sweeper (AI-generated + vendor-uploaded): checks every hour. */
export function startMediaCleanupScheduler(): void {
  setInterval(() => { tick().catch(() => {}); }, 60 * 60 * 1000);
  tick().catch(() => {}); // run once on boot too
  logger.info("[media-cleanup] Orphaned media cleanup started — checks every hour (AI-generated + vendor-uploaded)");
}
