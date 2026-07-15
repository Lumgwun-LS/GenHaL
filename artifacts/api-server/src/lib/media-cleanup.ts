/**
 * Deletes AI-generated images/videos from object storage once they've sat
 * unattached to any post for RETENTION_HOURS. Every successful call to
 * /ai/generate-image, /ai/generate-video-scenes, /ai/regenerate-video-scene,
 * or /ai/render-video permanently uploads its result (see
 * generated-media-storage.ts) so it has a public URL platforms like
 * Instagram can fetch — but a vendor who previews, regenerates, or simply
 * never publishes a generation otherwise leaves that object in the bucket
 * forever, growing storage cost with no bound. Scene preview images are
 * recorded as ordinary `type: "image"` AiGeneration rows, so they're swept
 * by the exact same "image"/"video" query below with no special-casing.
 *
 * "Still attached" is re-checked live on every tick (not decided once at
 * generation time) via a lookup against posts.media_urls, so media that WAS
 * referenced by a post that later got deleted is correctly swept up too,
 * not left orphaned forever. Mirrors the setInterval scheduler pattern in
 * post-scheduler.ts and reports through the shared job-run-status helper.
 */
import { db, aiGenerationsTable, postsTable } from "@workspace/db";
import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { logger } from "./logger";
import { recordJobRun } from "./job-run-status";
import { ObjectStorageService } from "./objectStorage";
import { extractMediaObjectId } from "./generated-media-storage";

export const MEDIA_CLEANUP_JOB_NAME = "media-cleanup";

// Long enough that a vendor actively working with a fresh generation (picking
// it for a post, drafting, coming back the next day) never has it vanish out
// from under them, but short enough that abandoned generations don't linger.
const RETENTION_HOURS = 48;
// Caps how many candidates a single tick processes, so one huge backlog
// (e.g. after this job was down for a while) can't turn a tick into an
// unbounded loop of storage-delete calls — the rest are picked up next tick.
const BATCH_LIMIT = 200;

const objectStorageService = new ObjectStorageService();

export async function sweepOrphanedMedia(): Promise<{ checked: number; deleted: number }> {
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);

  // Ordered oldest-checked-first (nulls — never checked — first of all) so a
  // large backlog of permanently-in-use rows can't dominate every tick's
  // BATCH_LIMIT slice and starve out truly orphaned rows elsewhere in the
  // table: every row's mediaLastCheckedAt is bumped below whether it's
  // deleted or skipped, so it naturally rotates to the back of the queue and
  // the next batch reaches further into the backlog.
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
      const [stillUsed] = await db
        .select({ id: postsTable.id })
        .from(postsTable)
        .where(sql`${result} = ANY(${postsTable.mediaUrls})`)
        .limit(1);
      if (stillUsed) {
        // Still attached to a post — leave the object alone, but bump the
        // checked timestamp so this row rotates to the back of next tick's
        // ordering instead of being reselected ahead of rows never checked.
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
      logger.error({ err, generationId: id }, "[media-cleanup] Failed to sweep generated media object");
    }
  }

  return { checked: candidates.length, deleted };
}

async function tick(): Promise<void> {
  try {
    const { checked, deleted } = await sweepOrphanedMedia();
    if (deleted > 0) logger.info({ checked, deleted }, "[media-cleanup] Deleted orphaned generated media");
    await recordJobRun(MEDIA_CLEANUP_JOB_NAME, { success: true, checkedCount: checked, affectedCount: deleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordJobRun(MEDIA_CLEANUP_JOB_NAME, { success: false, error: message });
    throw err;
  }
}

/** Starts the orphaned generated-media sweeper: checks every hour. */
export function startMediaCleanupScheduler(): void {
  setInterval(() => { tick().catch(() => {}); }, 60 * 60 * 1000);
  tick().catch(() => {}); // run once on boot too
  logger.info("[media-cleanup] Orphaned generated-media cleanup started — checks every hour");
}
