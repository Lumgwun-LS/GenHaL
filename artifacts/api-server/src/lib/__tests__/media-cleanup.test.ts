/**
 * Guards the AI media cleanup job (task #193): confirms the sweep pass never
 * deletes a media object that is still attached to a post, always deletes
 * objects that are genuinely orphaned and past the retention window, and
 * leaves fresh generations alone regardless of attachment status.
 *
 * Also guards the warning pass (task #293): confirms that media still attached
 * to a post never receives an expiry warning, orphaned media does, and a
 * failed in-app insert prevents mediaWarningSentAt from being stamped.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ─── Shared mutable state ─────────────────────────────────────────────────────

/** Rows returned by the ai_generations SELECT candidate query. */
let aiCandidateRows: Array<{ id: number; result: string; vendorId?: number; type?: string }> = [];
/** Rows returned by the vendor_uploads SELECT candidate query. */
let uploadCandidateRows: Array<{ id: number; mediaUrl: string; vendorId?: number; mediaType?: string }> = [];

/** Records every db.insert().values() call: { table, values } */
const insertedValues: Array<{ table: string; values: Record<string, unknown> }> = [];
/**
 * When true, the next db.insert().values() call for vendorNotificationsTable
 * will throw, simulating a DB write failure.
 */
let insertShouldFail = false;

/**
 * URL → boolean: controls whether isMediaStillInUse() returns true for that URL.
 * A missing / undefined entry means "not in use" (false).
 */
const inUseByUrl: Record<string, boolean> = {};

/** All db.update().set() calls captured for assertions. */
const updateSets: Array<{ table: string; set: Record<string, unknown>; whereVal: unknown }> = [];
/** objectStorageService.deleteObject() path arguments captured. */
const deletedObjectPaths: string[] = [];

// ─── Mock @workspace/db ───────────────────────────────────────────────────────

const aiGenerationsTableRef = {
  id: "ag.id",
  type: "ag.type",
  status: "ag.status",
  result: "ag.result",
  mediaDeletedAt: "ag.media_deleted_at",
  mediaWarningSentAt: "ag.media_warning_sent_at",
  mediaLastCheckedAt: "ag.media_last_checked_at",
  createdAt: "ag.created_at",
  vendorId: "ag.vendor_id",
};
const postsTableRef = { id: "posts.id", mediaUrls: "posts.media_urls" };
const vendorUploadsTableRef = {
  id: "vu.id",
  vendorId: "vu.vendor_id",
  mediaUrl: "vu.media_url",
  mediaType: "vu.media_type",
  mediaDeletedAt: "vu.media_deleted_at",
  mediaWarningSentAt: "vu.media_warning_sent_at",
  mediaLastCheckedAt: "vu.media_last_checked_at",
  createdAt: "vu.created_at",
};
const vendorNotificationsTableRef = {};

vi.mock("@workspace/db", () => {
  /**
   * Build a chainable query object. We track which `table` was passed to
   * `.from()` so the `.limit()` terminal knows what rows to return.
   *
   * For the posts lookup (isMediaStillInUse) the real query uses
   *   WHERE url = ANY(posts.media_urls)
   * We simulate this by inspecting the last `sql` condition's `values` array
   * to extract the URL, then consulting `inUseByUrl`.
   */
  const makeSelect = () => {
    let _fromTable: unknown = null;
    // The SQL condition passed to .where() carries the candidate URL in its
    // `values` array when it's the posts lookup.
    let _lastSqlValues: unknown[] = [];

    const chain = {
      from: (table: unknown) => {
        _fromTable = table;
        return chain;
      },
      where: (...args: unknown[]) => {
        // Flatten nested args to extract any sql() node with a values array.
        function extractSqlValues(node: unknown): unknown[] {
          if (!node || typeof node !== "object") return [];
          const obj = node as Record<string, unknown>;
          if (Array.isArray(obj["values"])) return obj["values"] as unknown[];
          return Object.values(obj).flatMap(extractSqlValues);
        }
        _lastSqlValues = args.flatMap(extractSqlValues);
        return chain;
      },
      orderBy: (..._args: unknown[]) => chain,
      limit: async (_n: number) => {
        if (_fromTable === postsTableRef) {
          // isMediaStillInUse — the URL is the first value in the sql node.
          const url = _lastSqlValues[0] as string | undefined;
          if (url && inUseByUrl[url]) return [{ id: 9999 }];
          return [];
        }
        if (_fromTable === aiGenerationsTableRef) return aiCandidateRows;
        if (_fromTable === vendorUploadsTableRef) return uploadCandidateRows;
        return [];
      },
    };
    return chain;
  };

  const makeUpdate = (tableTag: string) => ({
    set: (vals: Record<string, unknown>) => ({
      where: (cond: unknown) => {
        // Extract numeric id from the eq() mock: { val: number }
        const whereVal = (cond as Record<string, unknown>)?.val;
        updateSets.push({ table: tableTag, set: vals, whereVal });
        return Promise.resolve();
      },
    }),
  });

  return {
    db: {
      select: () => makeSelect(),
      update: (table: unknown) => {
        if (table === aiGenerationsTableRef) return makeUpdate("ai_generations");
        if (table === vendorUploadsTableRef) return makeUpdate("vendor_uploads");
        if (table === vendorNotificationsTableRef) return makeUpdate("vendor_notifications");
        return makeUpdate("unknown");
      },
      insert: (table: unknown) => ({
        values: async (vals: Record<string, unknown>) => {
          const tableTag =
            table === vendorNotificationsTableRef ? "vendor_notifications" : "unknown";
          if (insertShouldFail && tableTag === "vendor_notifications") {
            throw new Error("DB insert error (simulated)");
          }
          insertedValues.push({ table: tableTag, values: vals });
        },
      }),
    },
    aiGenerationsTable: aiGenerationsTableRef,
    postsTable: postsTableRef,
    vendorUploadsTable: vendorUploadsTableRef,
    vendorNotificationsTable: vendorNotificationsTableRef,
  };
});

// ─── Mock drizzle-orm ─────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  asc: (col: unknown) => ({ asc: col }),
  eq: (_col: unknown, val: unknown) => ({ val }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: { col, vals } }),
  isNull: (col: unknown) => ({ isNull: col }),
  lt: (col: unknown, val: unknown) => ({ lt: { col, val } }),
  gte: (col: unknown, val: unknown) => ({ gte: { col, val } }),
  // sql tagged template: store the first interpolated value in `values` so our
  // mock can extract the media URL from the isMediaStillInUse ANY() check.
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join(""), values }),
    { raw: (s: string) => s },
  ),
}));

// ─── Mock ObjectStorageService ────────────────────────────────────────────────
// Must use `class` (not an arrow function) because media-cleanup.ts does
// `new ObjectStorageService()` at module scope.

vi.mock("../objectStorage", () => ({
  ObjectStorageService: class {
    async deleteObject(path: string) {
      deletedObjectPaths.push(path);
    }
  },
}));

// ─── Mock generated-media-storage ─────────────────────────────────────────────

vi.mock("../generated-media-storage", () => ({
  extractMediaObjectId: (url: string) => {
    const match = url.match(/\/api\/media\/([^/]+)/);
    return match ? match[1] : null;
  },
}));

// ─── Mock push / job-run-status / logger ──────────────────────────────────────

vi.mock("../push", () => ({
  sendPushToVendor: vi.fn(async () => {}),
}));

vi.mock("../job-run-status", () => ({
  recordJobRun: vi.fn(async () => {}),
}));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MEDIA_URL_A = "/api/media/abc123";
const MEDIA_URL_B = "/api/media/def456";

function resetState() {
  aiCandidateRows = [];
  uploadCandidateRows = [];
  Object.keys(inUseByUrl).forEach((k) => delete inUseByUrl[k]);
  updateSets.length = 0;
  deletedObjectPaths.length = 0;
  insertedValues.length = 0;
  insertShouldFail = false;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("sweepOrphanedAiMedia — core sweep scenarios", () => {
  beforeEach(resetState);

  it("deletes an old unreferenced generation and stamps mediaDeletedAt", async () => {
    aiCandidateRows = [{ id: 1, result: MEDIA_URL_A }];
    // No post references this URL
    inUseByUrl[MEDIA_URL_A] = false;

    const { sweepOrphanedMedia } = await import("../media-cleanup");
    const { checked, deleted } = await sweepOrphanedMedia();

    expect(checked).toBeGreaterThanOrEqual(1);
    expect(deleted).toBeGreaterThanOrEqual(1);

    // Object must have been passed to deleteObject
    expect(deletedObjectPaths.some((p) => p.includes("abc123"))).toBe(true);

    // Row must have mediaDeletedAt stamped
    const update = updateSets.find((u) => u.table === "ai_generations" && u.whereVal === 1);
    expect(update).toBeDefined();
    expect(update!.set.mediaDeletedAt).toBeInstanceOf(Date);
  });

  it("leaves an old generation alone when it is still referenced by a post", async () => {
    aiCandidateRows = [{ id: 2, result: MEDIA_URL_A }];
    inUseByUrl[MEDIA_URL_A] = true; // URL is in use

    const { sweepOrphanedMedia } = await import("../media-cleanup");
    const { deleted } = await sweepOrphanedMedia();

    expect(deleted).toBe(0);
    // Storage must NOT have been touched
    expect(deletedObjectPaths).toHaveLength(0);
    // The row gets mediaLastCheckedAt bumped for rotation, but not mediaDeletedAt
    const update = updateSets.find((u) => u.table === "ai_generations" && u.whereVal === 2);
    expect(update).toBeDefined();
    expect(update!.set.mediaDeletedAt).toBeUndefined();
    expect(update!.set.mediaLastCheckedAt).toBeInstanceOf(Date);
  });

  it("does nothing when there are no candidate rows", async () => {
    aiCandidateRows = [];

    const { sweepOrphanedMedia } = await import("../media-cleanup");
    const { checked, deleted } = await sweepOrphanedMedia();

    expect(checked).toBe(0);
    expect(deleted).toBe(0);
    expect(deletedObjectPaths).toHaveLength(0);
    // No updates should have been made for ai_generations
    expect(updateSets.filter((u) => u.table === "ai_generations")).toHaveLength(0);
  });

  it("sweeps a generation whose referencing post was later deleted", async () => {
    // The post that used to reference this URL was deleted; inUseByUrl = false
    aiCandidateRows = [{ id: 3, result: MEDIA_URL_A }];
    inUseByUrl[MEDIA_URL_A] = false;

    const { sweepOrphanedMedia } = await import("../media-cleanup");
    const { deleted } = await sweepOrphanedMedia();

    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(deletedObjectPaths.some((p) => p.includes("abc123"))).toBe(true);

    const update = updateSets.find((u) => u.table === "ai_generations" && u.whereVal === 3);
    expect(update).toBeDefined();
    expect(update!.set.mediaDeletedAt).toBeInstanceOf(Date);
  });

  it("handles multiple orphaned candidates in one tick: deletes all unreferenced rows", async () => {
    aiCandidateRows = [
      { id: 10, result: MEDIA_URL_A },
      { id: 11, result: MEDIA_URL_B },
    ];
    // Both URLs are orphaned
    inUseByUrl[MEDIA_URL_A] = false;
    inUseByUrl[MEDIA_URL_B] = false;

    const { sweepOrphanedMedia } = await import("../media-cleanup");
    const { checked, deleted } = await sweepOrphanedMedia();

    expect(checked).toBeGreaterThanOrEqual(2);
    expect(deleted).toBeGreaterThanOrEqual(2);
    expect(deletedObjectPaths.some((p) => p.includes("abc123"))).toBe(true);
    expect(deletedObjectPaths.some((p) => p.includes("def456"))).toBe(true);
  });

  it("skips deletion for an in-use row and deletes the orphaned sibling", async () => {
    aiCandidateRows = [
      { id: 20, result: MEDIA_URL_A }, // in use — must be skipped
      { id: 21, result: MEDIA_URL_B }, // orphaned — must be deleted
    ];
    inUseByUrl[MEDIA_URL_A] = true;
    inUseByUrl[MEDIA_URL_B] = false;

    const { sweepOrphanedMedia } = await import("../media-cleanup");
    const { deleted } = await sweepOrphanedMedia();

    // Only the orphaned row should be deleted
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(deletedObjectPaths.some((p) => p.includes("def456"))).toBe(true);
    expect(deletedObjectPaths.some((p) => p.includes("abc123"))).toBe(false);

    // In-use row gets only mediaLastCheckedAt (rotation), not mediaDeletedAt
    const inUseUpdate = updateSets.find((u) => u.table === "ai_generations" && u.whereVal === 20);
    expect(inUseUpdate?.set.mediaDeletedAt).toBeUndefined();
    expect(inUseUpdate?.set.mediaLastCheckedAt).toBeInstanceOf(Date);

    // Orphaned row gets mediaDeletedAt
    const deletedUpdate = updateSets.find((u) => u.table === "ai_generations" && u.whereVal === 21);
    expect(deletedUpdate?.set.mediaDeletedAt).toBeInstanceOf(Date);
  });
});

describe("sweepOrphanedMedia — vendor uploads sweep", () => {
  beforeEach(resetState);

  it("deletes an old unreferenced vendor upload and stamps mediaDeletedAt", async () => {
    uploadCandidateRows = [{ id: 50, mediaUrl: MEDIA_URL_A }];
    inUseByUrl[MEDIA_URL_A] = false;

    const { sweepOrphanedMedia } = await import("../media-cleanup");
    const { deleted } = await sweepOrphanedMedia();

    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(deletedObjectPaths.some((p) => p.includes("abc123"))).toBe(true);

    const update = updateSets.find((u) => u.table === "vendor_uploads" && u.whereVal === 50);
    expect(update).toBeDefined();
    expect(update!.set.mediaDeletedAt).toBeInstanceOf(Date);
  });

  it("leaves an old vendor upload alone when it is still referenced by a post", async () => {
    uploadCandidateRows = [{ id: 51, mediaUrl: MEDIA_URL_A }];
    inUseByUrl[MEDIA_URL_A] = true;

    const { sweepOrphanedMedia } = await import("../media-cleanup");
    const { deleted } = await sweepOrphanedMedia();

    expect(deleted).toBe(0);
    expect(deletedObjectPaths).toHaveLength(0);

    const update = updateSets.find((u) => u.table === "vendor_uploads" && u.whereVal === 51);
    expect(update).toBeDefined();
    expect(update!.set.mediaDeletedAt).toBeUndefined();
    expect(update!.set.mediaLastCheckedAt).toBeInstanceOf(Date);
  });

  it("sweeps a vendor upload whose referencing post was later deleted", async () => {
    uploadCandidateRows = [{ id: 52, mediaUrl: MEDIA_URL_A }];
    inUseByUrl[MEDIA_URL_A] = false; // post was deleted

    const { sweepOrphanedMedia } = await import("../media-cleanup");
    const { deleted } = await sweepOrphanedMedia();

    expect(deleted).toBeGreaterThanOrEqual(1);

    const update = updateSets.find((u) => u.table === "vendor_uploads" && u.whereVal === 52);
    expect(update).toBeDefined();
    expect(update!.set.mediaDeletedAt).toBeInstanceOf(Date);
  });
});

describe("sweepOrphanedMedia — mediaLastCheckedAt rotation", () => {
  beforeEach(resetState);

  it("bumps mediaLastCheckedAt (but NOT mediaDeletedAt) for an in-use generation", async () => {
    aiCandidateRows = [{ id: 60, result: MEDIA_URL_A }];
    inUseByUrl[MEDIA_URL_A] = true;

    const { sweepOrphanedMedia } = await import("../media-cleanup");
    await sweepOrphanedMedia();

    const update = updateSets.find((u) => u.table === "ai_generations" && u.whereVal === 60);
    expect(update).toBeDefined();
    expect(update!.set.mediaLastCheckedAt).toBeInstanceOf(Date);
    expect(update!.set.mediaDeletedAt).toBeUndefined();
  });

  it("stamps both mediaDeletedAt AND mediaLastCheckedAt when sweeping an orphaned generation", async () => {
    aiCandidateRows = [{ id: 61, result: MEDIA_URL_A }];
    inUseByUrl[MEDIA_URL_A] = false;

    const { sweepOrphanedMedia } = await import("../media-cleanup");
    await sweepOrphanedMedia();

    const update = updateSets.find((u) => u.table === "ai_generations" && u.whereVal === 61);
    expect(update).toBeDefined();
    expect(update!.set.mediaDeletedAt).toBeInstanceOf(Date);
    expect(update!.set.mediaLastCheckedAt).toBeInstanceOf(Date);
  });
});

// ─── Warning-pass tests (task #293) ──────────────────────────────────────────

describe("warnOrphanedAiMedia — warning pass", () => {
  beforeEach(async () => {
    resetState();
    // Re-import push mock so we can inspect / reset call counts.
    const pushMod = await import("../push");
    (pushMod.sendPushToVendor as Mock).mockClear();
  });

  it("does not send a warning, push, or stamp mediaWarningSentAt for AI media still attached to a post", async () => {
    // Media is in the warning window but still referenced by a live post.
    aiCandidateRows = [{ id: 100, vendorId: 1, type: "image", result: MEDIA_URL_A }];
    inUseByUrl[MEDIA_URL_A] = true;

    const { warnOrphanedAiMedia } = await import("../media-cleanup");
    const { warned } = await warnOrphanedAiMedia();

    expect(warned).toBe(0);

    // No in-app notification inserted.
    expect(insertedValues.filter((v) => v.table === "vendor_notifications")).toHaveLength(0);

    // No push notification sent.
    const pushMod = await import("../push");
    expect(pushMod.sendPushToVendor).not.toHaveBeenCalled();

    // mediaWarningSentAt must NOT be stamped on this row.
    const update = updateSets.find(
      (u) => u.table === "ai_generations" && u.whereVal === 100,
    );
    expect(update?.set.mediaWarningSentAt).toBeUndefined();
  });

  it("sends a warning notification and stamps mediaWarningSentAt for orphaned AI media in the warning window", async () => {
    // Media is in the warning window and NOT attached to any post.
    aiCandidateRows = [{ id: 101, vendorId: 2, type: "image", result: MEDIA_URL_A }];
    inUseByUrl[MEDIA_URL_A] = false;

    const { warnOrphanedAiMedia } = await import("../media-cleanup");
    const { warned } = await warnOrphanedAiMedia();

    expect(warned).toBe(1);

    // In-app notification inserted for the correct vendor.
    const notification = insertedValues.find(
      (v) => v.table === "vendor_notifications" && v.values.vendorId === 2,
    );
    expect(notification).toBeDefined();
    expect(notification!.values.type).toBe("ai_media_expiry");

    // Push notification sent.
    const pushMod = await import("../push");
    expect(pushMod.sendPushToVendor).toHaveBeenCalled();

    // mediaWarningSentAt stamped on the row.
    const update = updateSets.find(
      (u) => u.table === "ai_generations" && u.whereVal === 101,
    );
    expect(update).toBeDefined();
    expect(update!.set.mediaWarningSentAt).toBeInstanceOf(Date);
  });

  it("does not stamp mediaWarningSentAt when the in-app notification insert fails, so the next tick retries", async () => {
    aiCandidateRows = [{ id: 102, vendorId: 3, type: "video", result: MEDIA_URL_B }];
    inUseByUrl[MEDIA_URL_B] = false;
    insertShouldFail = true; // make db.insert throw for vendor_notifications

    const { warnOrphanedAiMedia } = await import("../media-cleanup");
    const { warned } = await warnOrphanedAiMedia();

    expect(warned).toBe(0);

    // No stamp — the row stays eligible for a retry on the next tick.
    const update = updateSets.find(
      (u) => u.table === "ai_generations" && u.whereVal === 102,
    );
    expect(update?.set.mediaWarningSentAt).toBeUndefined();
  });
});

describe("warnOrphanedVendorUploads — warning pass", () => {
  beforeEach(async () => {
    resetState();
    const pushMod = await import("../push");
    (pushMod.sendPushToVendor as Mock).mockClear();
  });

  it("does not send a warning, push, or stamp mediaWarningSentAt for a vendor upload still attached to a post", async () => {
    uploadCandidateRows = [{ id: 200, vendorId: 10, mediaType: "image", mediaUrl: MEDIA_URL_A }];
    inUseByUrl[MEDIA_URL_A] = true;

    const { warnOrphanedVendorUploads } = await import("../media-cleanup");
    const { warned } = await warnOrphanedVendorUploads();

    expect(warned).toBe(0);

    expect(insertedValues.filter((v) => v.table === "vendor_notifications")).toHaveLength(0);

    const pushMod = await import("../push");
    expect(pushMod.sendPushToVendor).not.toHaveBeenCalled();

    const update = updateSets.find(
      (u) => u.table === "vendor_uploads" && u.whereVal === 200,
    );
    expect(update?.set.mediaWarningSentAt).toBeUndefined();
  });

  it("sends a warning notification and stamps mediaWarningSentAt for an orphaned vendor upload in the warning window", async () => {
    uploadCandidateRows = [{ id: 201, vendorId: 11, mediaType: "video", mediaUrl: MEDIA_URL_B }];
    inUseByUrl[MEDIA_URL_B] = false;

    const { warnOrphanedVendorUploads } = await import("../media-cleanup");
    const { warned } = await warnOrphanedVendorUploads();

    expect(warned).toBe(1);

    const notification = insertedValues.find(
      (v) => v.table === "vendor_notifications" && v.values.vendorId === 11,
    );
    expect(notification).toBeDefined();
    expect(notification!.values.type).toBe("ai_media_expiry");

    const pushMod = await import("../push");
    expect(pushMod.sendPushToVendor).toHaveBeenCalled();

    const update = updateSets.find(
      (u) => u.table === "vendor_uploads" && u.whereVal === 201,
    );
    expect(update).toBeDefined();
    expect(update!.set.mediaWarningSentAt).toBeInstanceOf(Date);
  });

  it("does not stamp mediaWarningSentAt when the in-app notification insert fails, so the next tick retries", async () => {
    uploadCandidateRows = [{ id: 202, vendorId: 12, mediaType: "image", mediaUrl: MEDIA_URL_A }];
    inUseByUrl[MEDIA_URL_A] = false;
    insertShouldFail = true;

    const { warnOrphanedVendorUploads } = await import("../media-cleanup");
    const { warned } = await warnOrphanedVendorUploads();

    expect(warned).toBe(0);

    const update = updateSets.find(
      (u) => u.table === "vendor_uploads" && u.whereVal === 202,
    );
    expect(update?.set.mediaWarningSentAt).toBeUndefined();
  });
});
