/**
 * Deletes AI-generated images/videos AND vendor-uploaded photos/videos from
 * object storage once they've sat unattached to any post for RETENTION_HOURS.
 *
 * Warning pass (run first, every tick)
 * ─────────────────────────────────────
 * Before deleting anything, the job checks for media that has entered the
 * WARNING window (older than WARNING_HOURS but younger than RETENTION_HOURS)
 * and has not yet been warned. For each of these orphaned rows the vendor
 * receives an in-app notification and a push notification (if they haven't
 * muted the `ai_media_expiry` category). `mediaWarningSentAt` is stamped so
 * the warning is only sent once per item.
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
import { db, aiGenerationsTable, postsTable, vendorUploadsTable, vendorNotificationsTable } from "@workspace/db";
import { and, asc, eq, inArray, isNull, lt, sql, gte } from "drizzle-orm";
import { logger } from "./logger";
import { recordJobRun } from "./job-run-status";
import { ObjectStorageService } from "./objectStorage";
import { extractMediaObjectId } from "./generated-media-storage";
import { sendPushToVendor } from "./push";

export const MEDIA_CLEANUP_JOB_NAME = "media-cleanup";

// Long enough that a vendor actively working with a fresh generation or upload
// (picking it for a post, drafting, coming back the next day) never has it
// vanish out from under them, but short enough that abandoned media doesn't
// linger.
const RETENTION_HOURS = 48;
// Vendors are warned this many hours before deletion. At WARNING_HOURS old the
// media has RETENTION_HOURS - WARNING_HOURS left before it is swept.
const WARNING_HOURS = 24;
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
 * Sends an in-app notification and push notification to warn a vendor that
 * one of their unused media items will be deleted soon.
 *
 * Returns `true` if the durable in-app notification was successfully inserted
 * (the caller should stamp `mediaWarningSentAt` only on true so that failed
 * rows are retried on the next tick rather than silently skipped forever).
 * Push delivery is best-effort and does not affect the return value.
 */
async function sendMediaExpiryWarning(
  vendorId: number,
  mediaType: "image" | "video" | string,
  hoursLeft: number,
): Promise<boolean> {
  const mediaLabel = mediaType === "video" ? "video" : "image";
  const hoursText = hoursLeft === 1 ? "1 hour" : `${hoursLeft} hours`;
  const message = `An unused AI-generated ${mediaLabel} will be automatically deleted in approximately ${hoursText}. Attach it to a post to keep it.`;

  let inAppSent = false;
  try {
    await db.insert(vendorNotificationsTable).values({
      vendorId,
      type: "ai_media_expiry",
      message,
    });
    inAppSent = true;
  } catch (err) {
    logger.error({ err, vendorId }, "[media-cleanup] Failed to insert ai_media_expiry notification");
  }

  // Push is best-effort — failures here do not block the stamp.
  try {
    await sendPushToVendor(
      vendorId,
      "Media expiring soon",
      `An unused ${mediaLabel} will be deleted in ~${hoursText}. Use it in a post to save it.`,
      { screen: "ai-studio" },
      "ai_media_expiry",
    );
  } catch (err) {
    logger.error({ err, vendorId }, "[media-cleanup] Failed to send ai_media_expiry push notification");
  }

  return inAppSent;
}

/**
 * Warns vendors about orphaned AI-generated media that entered the warning
 * window (older than WARNING_HOURS, younger than RETENTION_HOURS, not yet
 * warned). Returns how many warnings were sent.
 */
export async function warnOrphanedAiMedia(): Promise<{ warned: number }> {
  const warnCutoff = new Date(Date.now() - WARNING_HOURS * 60 * 60 * 1000);
  const deleteCutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);

  // Rows older than WARNING_HOURS but NOT yet old enough to delete, and whose
  // warning has not been sent yet.
  const candidates = await db
    .select({ id: aiGenerationsTable.id, vendorId: aiGenerationsTable.vendorId, type: aiGenerationsTable.type, result: aiGenerationsTable.result })
    .from(aiGenerationsTable)
    .where(
      and(
        inArray(aiGenerationsTable.type, ["image", "video"]),
        eq(aiGenerationsTable.status, "completed"),
        isNull(aiGenerationsTable.mediaDeletedAt),
        isNull(aiGenerationsTable.mediaWarningSentAt),
        lt(aiGenerationsTable.createdAt, warnCutoff),
        // Only warn rows not yet past the deletion cutoff (those go straight to sweep)
        gte(aiGenerationsTable.createdAt, deleteCutoff),
        sql`${aiGenerationsTable.result} LIKE '%/api/media/%'`,
      ),
    )
    .orderBy(asc(aiGenerationsTable.id))
    .limit(BATCH_LIMIT);

  let warned = 0;
  const hoursLeft = RETENTION_HOURS - WARNING_HOURS;
  for (const { id, vendorId, type, result } of candidates) {
    if (!result) continue;
    try {
      if (await isMediaStillInUse(result)) {
        // Still in use — leave mediaWarningSentAt null so this row remains
        // eligible for a warning on future ticks if it becomes orphaned
        // before the 48-hour deletion cutoff. Stamping it here would
        // permanently suppress a warning it never received.
        continue;
      }
      const sent = await sendMediaExpiryWarning(vendorId, type, hoursLeft);
      // Only stamp mediaWarningSentAt when the durable in-app notification
      // was successfully inserted. If it failed, leave the row unset so the
      // next tick retries rather than permanently suppressing the warning.
      if (sent) {
        await db.update(aiGenerationsTable).set({ mediaWarningSentAt: new Date() }).where(eq(aiGenerationsTable.id, id));
        warned++;
      }
    } catch (err) {
      logger.error({ err, generationId: id }, "[media-cleanup] Failed to send AI media expiry warning");
    }
  }

  return { warned };
}

/**
 * Warns vendors about orphaned vendor-uploaded media that entered the warning
 * window. Returns how many warnings were sent.
 */
export async function warnOrphanedVendorUploads(): Promise<{ warned: number }> {
  const warnCutoff = new Date(Date.now() - WARNING_HOURS * 60 * 60 * 1000);
  const deleteCutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);

  const candidates = await db
    .select({ id: vendorUploadsTable.id, vendorId: vendorUploadsTable.vendorId, mediaType: vendorUploadsTable.mediaType, mediaUrl: vendorUploadsTable.mediaUrl })
    .from(vendorUploadsTable)
    .where(
      and(
        isNull(vendorUploadsTable.mediaDeletedAt),
        isNull(vendorUploadsTable.mediaWarningSentAt),
        lt(vendorUploadsTable.createdAt, warnCutoff),
        gte(vendorUploadsTable.createdAt, deleteCutoff),
      ),
    )
    .orderBy(asc(vendorUploadsTable.id))
    .limit(BATCH_LIMIT);

  let warned = 0;
  const hoursLeft = RETENTION_HOURS - WARNING_HOURS;
  for (const { id, vendorId, mediaType, mediaUrl } of candidates) {
    try {
      if (await isMediaStillInUse(mediaUrl)) {
        // Still in use — leave mediaWarningSentAt null so this upload stays
        // eligible for a warning if it becomes orphaned before deletion.
        continue;
      }
      const sent = await sendMediaExpiryWarning(vendorId, mediaType, hoursLeft);
      if (sent) {
        await db.update(vendorUploadsTable).set({ mediaWarningSentAt: new Date() }).where(eq(vendorUploadsTable.id, id));
        warned++;
      }
    } catch (err) {
      logger.error({ err, uploadId: id }, "[media-cleanup] Failed to send vendor upload expiry warning");
    }
  }

  return { warned };
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
    // Warning pass: notify vendors before deletion happens.
    const [aiWarnings, uploadWarnings] = await Promise.all([
      warnOrphanedAiMedia(),
      warnOrphanedVendorUploads(),
    ]);
    const totalWarned = aiWarnings.warned + uploadWarnings.warned;
    if (totalWarned > 0) logger.info({ warned: totalWarned }, "[media-cleanup] Sent expiry warnings to vendors");

    // Deletion pass: sweep rows that are past the retention window.
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
