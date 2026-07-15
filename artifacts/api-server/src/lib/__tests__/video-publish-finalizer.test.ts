/**
 * Verifies video-publish-finalizer.ts — the background job that resolves a
 * Facebook video post_publications row left in "processing" status by
 * publishFacebookVideoPost (see lib/meta.ts), which now uploads and returns
 * immediately instead of blocking the publish request on Facebook's async
 * video processing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

function makePublication(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    postId: 10,
    socialAccountId: 5,
    platform: "facebook",
    status: "processing",
    externalPostId: "fb-video-1",
    externalUrl: "https://www.facebook.com/fb-video-1",
    errorMessage: null,
    // Use current time so elapsedMs=~0 by default (within the MAX_WAIT_MS window).
    publishedAt: new Date(),
    ...overrides,
  };
}

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    vendorId: 1,
    platform: "facebook",
    status: "active",
    accessTokenEncrypted: "enc-token",
    ...overrides,
  };
}

let pendingPublications: ReturnType<typeof makePublication>[] = [];
let activeAccounts: ReturnType<typeof makeAccount>[] = [];
const updateCalls: Array<{ set: Record<string, unknown>; whereStatus: string }> = [];

function extractValues(whereArg: unknown): unknown[] {
  if (!whereArg || typeof whereArg !== "object") return [];
  const w = whereArg as Record<string, unknown>;
  // and(...) returns { and: [...] }, eq() returns { col, val }
  if (Array.isArray(w.and)) return (w.and as Array<Record<string, unknown>>).flatMap((c) => [c.val]);
  if ("val" in w) return [w.val];
  return [];
}

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async (whereArg: unknown) => {
          // Distinguish the two queries by inspecting the filter values.
          const values = extractValues(whereArg);
          if (values.includes("processing")) return pendingPublications;
          if (values.includes("active")) return activeAccounts;
          return [];
        },
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          updateCalls.push({ set: vals, whereStatus: "processing" });
          return Promise.resolve();
        },
      }),
    }),
  },
  postPublicationsTable: { id: "post_publications.id", status: "post_publications.status", platform: "post_publications.platform" },
  socialAccountsTable: { id: "social_accounts.id", status: "social_accounts.status" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
}));

const checkFacebookVideoStatus = vi.fn();
const isMetaAuthError = vi.fn(() => false);
vi.mock("../meta", () => ({
  checkFacebookVideoStatus,
  isMetaAuthError,
}));

const ensureFreshAccessToken = vi.fn(async (account: { accessTokenEncrypted: string }) => `decrypted:${account.accessTokenEncrypted}`);
vi.mock("../token-refresh", () => ({
  ensureFreshAccessToken,
}));

vi.mock("../job-run-status", () => ({
  recordJobRun: vi.fn(async () => {}),
}));

const { finalizePendingVideoPublications } = await import("../video-publish-finalizer");

describe("finalizePendingVideoPublications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureFreshAccessToken.mockImplementation(async (account: { accessTokenEncrypted: string }) => `decrypted:${account.accessTokenEncrypted}`);
    pendingPublications = [makePublication()];
    activeAccounts = [makeAccount()];
    updateCalls.length = 0;
  });

  it("marks the publication success once Facebook reports the video ready", async () => {
    checkFacebookVideoStatus.mockResolvedValueOnce({ status: "ready", failureReason: null });

    const { checked, resolved } = await finalizePendingVideoPublications();

    expect(checked).toBe(1);
    expect(resolved).toBe(1);
    expect(checkFacebookVideoStatus).toHaveBeenCalledWith("fb-video-1", "decrypted:enc-token");
    expect(updateCalls[0].set).toMatchObject({ status: "success" });
  });

  it("marks the publication failed with Facebook's reason when processing errors out", async () => {
    checkFacebookVideoStatus.mockResolvedValueOnce({ status: "error", failureReason: "Video codec not supported" });

    const { resolved } = await finalizePendingVideoPublications();

    expect(resolved).toBe(1);
    expect(updateCalls[0].set.status).toBe("failed");
    expect(updateCalls[0].set.errorMessage).toMatch(/Video codec not supported/);
  });

  it("leaves the publication as processing (no update) while still processing and within the wait window", async () => {
    checkFacebookVideoStatus.mockResolvedValueOnce({ status: "processing", failureReason: null });

    const { checked, resolved } = await finalizePendingVideoPublications();

    expect(checked).toBe(1);
    expect(resolved).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("gives up and marks failed once the max wait has elapsed while still processing", async () => {
    const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
    pendingPublications = [makePublication({ publishedAt: twentyMinsAgo })];
    checkFacebookVideoStatus.mockResolvedValueOnce({ status: "processing", failureReason: null });

    const { resolved } = await finalizePendingVideoPublications();

    expect(resolved).toBe(1);
    expect(updateCalls[0].set.status).toBe("failed");
    expect(updateCalls[0].set.errorMessage).toMatch(/Timed out/);
  });

  it("marks the publication failed if its social account is no longer connected", async () => {
    activeAccounts = [];

    const { resolved } = await finalizePendingVideoPublications();

    expect(resolved).toBe(1);
    expect(checkFacebookVideoStatus).not.toHaveBeenCalled();
    expect(updateCalls[0].set.status).toBe("failed");
    expect(updateCalls[0].set.errorMessage).toMatch(/no longer connected/);
  });

  it("does nothing when there are no processing Facebook video publications", async () => {
    pendingPublications = [];

    const { checked, resolved } = await finalizePendingVideoPublications();

    expect(checked).toBe(0);
    expect(resolved).toBe(0);
    expect(checkFacebookVideoStatus).not.toHaveBeenCalled();
  });
});
