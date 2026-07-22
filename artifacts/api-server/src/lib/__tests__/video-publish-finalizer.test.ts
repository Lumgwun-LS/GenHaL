/**
 * Guards the Facebook video publish finalizer's notification paths:
 * finalizePendingVideoPublications() must send the correct in-app + push
 * notification for every outcome — video live (ready), Facebook processing
 * error (error status), and timeout (still-processing past MAX_WAIT_MS).
 * A disconnected account must also notify the vendor of failure.
 *
 * Tests mock @workspace/db, post-notifications, push (via post-notifications),
 * meta (checkFacebookVideoStatus), token-refresh, and job-run-status so no
 * real DB or Expo calls are made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Shared mutable state ─────────────────────────────────────────────────────

type PubRow = {
  id: number;
  postId: number;
  socialAccountId: number | null;
  externalPostId: string | null;
  status: string;
  platform: string;
  publishedAt: Date;
  errorMessage: string | null;
};

type PendingJoinRow = {
  pub: PubRow;
  vendorId: number;
  caption: string;
};

type AccountRow = {
  id: number;
  status: string;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  platform: string;
  vendorId: number;
  externalAccountId: string;
};

// Fixed "now" for timing assertions — far enough from publishedAt to test
// both within-timeout and past-timeout scenarios.
const NOW = new Date("2026-05-01T12:00:00.000Z");

// A pub published just 30 seconds ago — well within MAX_WAIT_MS (15 min).
const RECENT_PUBLISHED_AT = new Date(NOW.getTime() - 30_000);

// A pub published 20 minutes ago — past MAX_WAIT_MS (15 min).
const OLD_PUBLISHED_AT = new Date(NOW.getTime() - 20 * 60_000);

let pendingRows: PendingJoinRow[] = [];
let accountRows: AccountRow[] = [];

// Track every update call: { status, errorMessage }
const updateCalls: Array<{ status: string; errorMessage?: string | null }> = [];

// selectCallCount lets us route the two db.select() calls (pending join, then accounts)
// to different datasets without inspecting table args (which are mocked as {}).
let selectCallCount = 0;

vi.mock("@workspace/db", () => ({
  db: {
    select: () => {
      selectCallCount++;
      const callIndex = selectCallCount;
      return {
        from: () => ({
          // First select: .from().innerJoin().where() → pending publications join
          innerJoin: () => ({
            where: async () => (callIndex === 1 ? pendingRows : []),
          }),
          // Second select: .from().where() → active social accounts
          where: async () => (callIndex === 2 ? accountRows : []),
        }),
      };
    },
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        updateCalls.push({ status: vals.status as string, errorMessage: vals.errorMessage as string | null | undefined });
        return {
          where: async () => {},
        };
      },
    }),
  },
  postPublicationsTable: {},
  postsTable: {},
  socialAccountsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
}));

// ─── Notification mocks ───────────────────────────────────────────────────────
const notifyFacebookVideoLive = vi.fn(async () => {});
const notifyFacebookVideoFailed = vi.fn(async () => {});
vi.mock("../post-notifications", () => ({
  notifyFacebookVideoLive,
  notifyFacebookVideoFailed,
}));

// ─── Facebook status check mock ───────────────────────────────────────────────
type FbStatus = { status: "ready" | "error" | "processing"; failureReason: string | null };
const checkFacebookVideoStatus = vi.fn<[], Promise<FbStatus>>();
vi.mock("../meta", () => ({
  checkFacebookVideoStatus,
  isMetaAuthError: () => false,
}));

// ─── Token refresh mock ───────────────────────────────────────────────────────
const ensureFreshAccessToken = vi.fn(async () => "access-token-abc");
vi.mock("../token-refresh", () => ({
  ensureFreshAccessToken,
}));

vi.mock("../logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("../job-run-status", () => ({
  recordJobRun: vi.fn(async () => {}),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePub(overrides: Partial<PubRow> = {}): PubRow {
  return {
    id: 1,
    postId: 100,
    socialAccountId: 10,
    externalPostId: "fb-video-123",
    status: "processing",
    platform: "facebook",
    publishedAt: RECENT_PUBLISHED_AT,
    errorMessage: null,
    ...overrides,
  };
}

function makeAccount(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 10,
    status: "active",
    accessTokenEncrypted: "enc-token",
    refreshTokenEncrypted: null,
    platform: "facebook",
    vendorId: 42,
    externalAccountId: "fb-page-1",
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("finalizePendingVideoPublications — notification paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingRows = [];
    accountRows = [];
    updateCalls.length = 0;
    selectCallCount = 0;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. No pending rows ──────────────────────────────────────────────────────
  it("returns { checked: 0, resolved: 0 } and sends no notifications when there are no processing rows", async () => {
    pendingRows = [];

    const { finalizePendingVideoPublications } = await import("../video-publish-finalizer");
    const result = await finalizePendingVideoPublications();

    expect(result).toEqual({ checked: 0, resolved: 0 });
    expect(notifyFacebookVideoLive).not.toHaveBeenCalled();
    expect(notifyFacebookVideoFailed).not.toHaveBeenCalled();
    expect(checkFacebookVideoStatus).not.toHaveBeenCalled();
  });

  // ── 2. "ready" outcome → success notification ───────────────────────────────
  it("marks the publication success and sends notifyFacebookVideoLive when Facebook reports ready", async () => {
    const pub = makePub();
    pendingRows = [{ pub, vendorId: 42, caption: "My video post" }];
    accountRows = [makeAccount()];
    checkFacebookVideoStatus.mockResolvedValueOnce({ status: "ready", failureReason: null });

    const { finalizePendingVideoPublications } = await import("../video-publish-finalizer");
    const result = await finalizePendingVideoPublications();

    expect(result).toEqual({ checked: 1, resolved: 1 });

    // DB update: status set to success
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].status).toBe("success");

    // In-app + push notification for "video is live"
    expect(notifyFacebookVideoLive).toHaveBeenCalledTimes(1);
    expect(notifyFacebookVideoLive).toHaveBeenCalledWith(42, pub.postId, "My video post");
    expect(notifyFacebookVideoFailed).not.toHaveBeenCalled();
  });

  // ── 3. "error" outcome → failure notification ───────────────────────────────
  it("marks the publication failed and sends notifyFacebookVideoFailed when Facebook reports an error", async () => {
    const pub = makePub();
    pendingRows = [{ pub, vendorId: 42, caption: "Another video" }];
    accountRows = [makeAccount()];
    checkFacebookVideoStatus.mockResolvedValueOnce({
      status: "error",
      failureReason: "Unsupported codec",
    });

    const { finalizePendingVideoPublications } = await import("../video-publish-finalizer");
    const result = await finalizePendingVideoPublications();

    expect(result).toEqual({ checked: 1, resolved: 1 });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].status).toBe("failed");
    expect(updateCalls[0].errorMessage).toContain("Unsupported codec");

    expect(notifyFacebookVideoFailed).toHaveBeenCalledTimes(1);
    expect(notifyFacebookVideoFailed).toHaveBeenCalledWith(
      42,
      pub.postId,
      "Another video",
      expect.stringContaining("Unsupported codec"),
    );
    expect(notifyFacebookVideoLive).not.toHaveBeenCalled();
  });

  // ── 4. "processing" + past MAX_WAIT_MS → timeout failure notification ───────
  it("marks the publication failed and notifies vendor of timeout when still-processing past MAX_WAIT_MS", async () => {
    // publishedAt = 20 min ago, MAX_WAIT_MS = 15 min → elapsed > threshold
    const pub = makePub({ publishedAt: OLD_PUBLISHED_AT });
    pendingRows = [{ pub, vendorId: 55, caption: "Slow video" }];
    accountRows = [makeAccount({ id: 10 })];
    checkFacebookVideoStatus.mockResolvedValueOnce({ status: "processing", failureReason: null });

    const { finalizePendingVideoPublications } = await import("../video-publish-finalizer");
    const result = await finalizePendingVideoPublications();

    expect(result).toEqual({ checked: 1, resolved: 1 });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].status).toBe("failed");
    expect(updateCalls[0].errorMessage).toContain("Timed out");

    expect(notifyFacebookVideoFailed).toHaveBeenCalledTimes(1);
    expect(notifyFacebookVideoFailed).toHaveBeenCalledWith(
      55,
      pub.postId,
      "Slow video",
      expect.stringContaining("Timed out"),
    );
    expect(notifyFacebookVideoLive).not.toHaveBeenCalled();
  });

  // ── 5. "processing" + within MAX_WAIT_MS → still-processing, no notification
  it("does not update the row or notify when still-processing and within MAX_WAIT_MS", async () => {
    const pub = makePub({ publishedAt: RECENT_PUBLISHED_AT }); // only 30 s old
    pendingRows = [{ pub, vendorId: 42, caption: "Still going" }];
    accountRows = [makeAccount()];
    checkFacebookVideoStatus.mockResolvedValueOnce({ status: "processing", failureReason: null });

    const { finalizePendingVideoPublications } = await import("../video-publish-finalizer");
    const result = await finalizePendingVideoPublications();

    expect(result).toEqual({ checked: 1, resolved: 0 });
    expect(updateCalls).toHaveLength(0);
    expect(notifyFacebookVideoLive).not.toHaveBeenCalled();
    expect(notifyFacebookVideoFailed).not.toHaveBeenCalled();
  });

  // ── 6. Disconnected account → failure notification without FB API call ───────
  it("marks the publication failed and notifies vendor when the social account is missing (disconnected)", async () => {
    // No account in the DB for this pub's socialAccountId
    const pub = makePub({ socialAccountId: 99 });
    pendingRows = [{ pub, vendorId: 77, caption: "Disconnected account video" }];
    accountRows = []; // account 99 absent

    const { finalizePendingVideoPublications } = await import("../video-publish-finalizer");
    const result = await finalizePendingVideoPublications();

    expect(result).toEqual({ checked: 1, resolved: 1 });

    // No FB API call should be made
    expect(checkFacebookVideoStatus).not.toHaveBeenCalled();

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].status).toBe("failed");

    expect(notifyFacebookVideoFailed).toHaveBeenCalledTimes(1);
    expect(notifyFacebookVideoFailed).toHaveBeenCalledWith(
      77,
      pub.postId,
      "Disconnected account video",
      expect.stringContaining("no longer connected"),
    );
    expect(notifyFacebookVideoLive).not.toHaveBeenCalled();
  });

  // ── 7. null socialAccountId → treated as disconnected ────────────────────────
  it("marks failed and notifies when socialAccountId is null", async () => {
    const pub = makePub({ socialAccountId: null });
    pendingRows = [{ pub, vendorId: 33, caption: "No account set" }];
    accountRows = [makeAccount()]; // irrelevant — won't be found by null key

    const { finalizePendingVideoPublications } = await import("../video-publish-finalizer");
    await finalizePendingVideoPublications();

    expect(checkFacebookVideoStatus).not.toHaveBeenCalled();
    expect(notifyFacebookVideoFailed).toHaveBeenCalledTimes(1);
    expect(notifyFacebookVideoLive).not.toHaveBeenCalled();
  });

  // ── 8. Multiple pubs: mixed outcomes ─────────────────────────────────────────
  it("handles multiple pubs in one tick: ready, error, and still-processing each get the right outcome", async () => {
    const pubReady = makePub({ id: 1, postId: 101, socialAccountId: 10, publishedAt: RECENT_PUBLISHED_AT });
    const pubError = makePub({ id: 2, postId: 102, socialAccountId: 10, publishedAt: RECENT_PUBLISHED_AT });
    const pubWaiting = makePub({ id: 3, postId: 103, socialAccountId: 10, publishedAt: RECENT_PUBLISHED_AT });

    pendingRows = [
      { pub: pubReady, vendorId: 10, caption: "Ready video" },
      { pub: pubError, vendorId: 10, caption: "Error video" },
      { pub: pubWaiting, vendorId: 10, caption: "Waiting video" },
    ];
    accountRows = [makeAccount({ id: 10 })];

    checkFacebookVideoStatus
      .mockResolvedValueOnce({ status: "ready", failureReason: null })
      .mockResolvedValueOnce({ status: "error", failureReason: "Bad format" })
      .mockResolvedValueOnce({ status: "processing", failureReason: null });

    const { finalizePendingVideoPublications } = await import("../video-publish-finalizer");
    const result = await finalizePendingVideoPublications();

    // 3 checked, 2 resolved (waiting is still-processing)
    expect(result).toEqual({ checked: 3, resolved: 2 });

    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0].status).toBe("success");
    expect(updateCalls[1].status).toBe("failed");

    expect(notifyFacebookVideoLive).toHaveBeenCalledTimes(1);
    expect(notifyFacebookVideoLive).toHaveBeenCalledWith(10, 101, "Ready video");

    expect(notifyFacebookVideoFailed).toHaveBeenCalledTimes(1);
    expect(notifyFacebookVideoFailed).toHaveBeenCalledWith(10, 102, "Error video", expect.stringContaining("Bad format"));
  });

  // ── 9. Transient API error within MAX_WAIT_MS → still-processing, no notify ──
  it("does not notify or update when checkFacebookVideoStatus throws transiently and elapsed < MAX_WAIT_MS", async () => {
    const pub = makePub({ publishedAt: RECENT_PUBLISHED_AT });
    pendingRows = [{ pub, vendorId: 42, caption: "Transient fail" }];
    accountRows = [makeAccount()];
    checkFacebookVideoStatus.mockRejectedValueOnce(new Error("network timeout"));

    const { finalizePendingVideoPublications } = await import("../video-publish-finalizer");
    const result = await finalizePendingVideoPublications();

    expect(result).toEqual({ checked: 1, resolved: 0 });
    expect(updateCalls).toHaveLength(0);
    expect(notifyFacebookVideoLive).not.toHaveBeenCalled();
    expect(notifyFacebookVideoFailed).not.toHaveBeenCalled();
  });

  // ── 10. Transient API error past MAX_WAIT_MS → resolved with failure notify ──
  it("marks failed and notifies when checkFacebookVideoStatus throws and elapsed >= MAX_WAIT_MS", async () => {
    const pub = makePub({ publishedAt: OLD_PUBLISHED_AT }); // 20 min old
    pendingRows = [{ pub, vendorId: 42, caption: "Old transient fail" }];
    accountRows = [makeAccount()];
    checkFacebookVideoStatus.mockRejectedValueOnce(new Error("upstream 503"));

    const { finalizePendingVideoPublications } = await import("../video-publish-finalizer");
    const result = await finalizePendingVideoPublications();

    expect(result).toEqual({ checked: 1, resolved: 1 });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].status).toBe("failed");

    expect(notifyFacebookVideoFailed).toHaveBeenCalledTimes(1);
    expect(notifyFacebookVideoFailed).toHaveBeenCalledWith(
      42,
      pub.postId,
      "Old transient fail",
      expect.stringContaining("upstream 503"),
    );
    expect(notifyFacebookVideoLive).not.toHaveBeenCalled();
  });

  // ── 11. notifyFacebookVideoLive throwing must not crash the whole tick ────────
  it("does not throw when notifyFacebookVideoLive rejects — the notification error is swallowed", async () => {
    const pub = makePub();
    pendingRows = [{ pub, vendorId: 42, caption: "Notify throws" }];
    accountRows = [makeAccount()];
    checkFacebookVideoStatus.mockResolvedValueOnce({ status: "ready", failureReason: null });
    notifyFacebookVideoLive.mockRejectedValueOnce(new Error("push service down"));

    const { finalizePendingVideoPublications } = await import("../video-publish-finalizer");
    // Must resolve, not reject
    await expect(finalizePendingVideoPublications()).resolves.toEqual({ checked: 1, resolved: 1 });

    // The DB update still went through
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].status).toBe("success");
  });
});
