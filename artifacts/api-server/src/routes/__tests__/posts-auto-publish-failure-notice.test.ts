/**
 * Guards the auto-publish failure notice (task #101) against silent
 * regression: whenever executeClaimedPublish resolves an auto-publish
 * attempt (opts.auto = true) that failed on every platform, it must
 * (a) set autoPublishFailed = true on the reverted post, and
 * (b) call notifyScheduledPostFailed with the per-platform failures.
 *
 * Also verifies the two ways this flag is expected to clear:
 * (c) a successful auto-publish clears autoPublishFailed, and
 * (d) a manual (non-auto) publish failure never fires the notice, since a
 *     manual "Publish Now" click is already surfaced synchronously in the UI.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.PAYMENT_CREDS_ENCRYPTION_KEY = "0".repeat(64);

const POST_BASE = {
  id: 42,
  vendorId: 10,
  caption: "Big sale this weekend!",
  status: "publishing" as const,
  mediaUrls: [] as string[],
  platforms: ["facebook"],
  socialAccountIds: [1],
};

let socialAccounts: Array<Record<string, unknown>> = [];
let lastUpdateSet: Record<string, unknown> | null = null;
let updateShouldMatch = true;

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => socialAccounts,
      }),
    }),
    insert: () => ({
      values: (rows: unknown) => ({
        returning: async () => {
          const list = Array.isArray(rows) ? rows : [rows];
          return list.map((r) => ({ id: 1, publishedAt: new Date(), ...(r as Record<string, unknown>) }));
        },
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            lastUpdateSet = vals;
            return updateShouldMatch ? [{ ...POST_BASE, ...vals }] : [];
          },
        }),
      }),
    }),
  },
  postsTable: {},
  productsTable: {},
  vendorsTable: {},
  socialAccountsTable: {},
  postPublicationsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  gt: (col: unknown, val: unknown) => ({ col, val }),
  desc: (col: unknown) => ({ desc: col }),
  inArray: (col: unknown, val: unknown) => ({ col, val }),
}));

vi.mock("../../lib/encryption", () => ({
  decrypt: (v: string) => `decrypted:${v}`,
}));

vi.mock("../../lib/meta", () => ({
  publishFacebookFeedPost: vi.fn(async () => {
    throw new Error("Facebook rejected the post");
  }),
  publishFacebookPhotoPost: vi.fn(),
  publishFacebookVideoPost: vi.fn(),
  publishInstagramPhotoPost: vi.fn(),
  isMetaAuthError: () => false,
}));

vi.mock("../../lib/linkedin", () => ({
  publishLinkedInTextPost: vi.fn(),
  publishLinkedInImagePost: vi.fn(),
  publishLinkedInVideoPost: vi.fn(),
  isLinkedInAuthError: () => false,
}));

vi.mock("../../lib/twitter", () => ({
  publishTweet: vi.fn(),
  publishTweetWithImage: vi.fn(),
  publishTweetWithVideo: vi.fn(),
  isTwitterAuthError: () => false,
}));

vi.mock("../../lib/token-refresh", () => ({
  ensureFreshAccessToken: async (account: { accessTokenEncrypted: string }) => `decrypted:${account.accessTokenEncrypted}`,
}));

const notifyScheduledPostFailed = vi.fn(async () => {});
vi.mock("../../lib/post-notifications", () => ({
  notifyScheduledPostFailed,
}));

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    vendorId: 10,
    platform: "facebook",
    accountName: "acme",
    accountId: "fb-123",
    status: "active",
    accessTokenEncrypted: "enc-token",
    ...overrides,
  };
}

describe("auto-publish failure notice — regression guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socialAccounts = [makeAccount()];
    lastUpdateSet = null;
    updateShouldMatch = true;
  });

  it("sets autoPublishFailed=true and notifies the vendor when every platform fails during an auto-publish attempt", async () => {
    const { executeClaimedPublish } = await import("../posts");
    const claimed = { ...POST_BASE } as any;

    const { anySucceeded } = await executeClaimedPublish(claimed, { auto: true });

    expect(anySucceeded).toBe(false);
    expect(lastUpdateSet).toEqual({ status: "approved", autoPublishFailed: true });
    expect(notifyScheduledPostFailed).toHaveBeenCalledTimes(1);
    expect(notifyScheduledPostFailed).toHaveBeenCalledWith(
      claimed.vendorId,
      claimed.id,
      claimed.caption,
      [{ platform: "facebook", errorMessage: "Facebook rejected the post" }],
    );
  });

  it("clears autoPublishFailed and does not notify when the auto-publish attempt succeeds on at least one platform", async () => {
    const meta = await import("../../lib/meta");
    (meta.publishFacebookFeedPost as any).mockResolvedValueOnce({ externalPostId: "fb-1", externalUrl: "https://fb.com/fb-1" });

    const { executeClaimedPublish } = await import("../posts");
    const claimed = { ...POST_BASE } as any;

    const { anySucceeded } = await executeClaimedPublish(claimed, { auto: true });

    expect(anySucceeded).toBe(true);
    expect(lastUpdateSet).toMatchObject({ status: "published", autoPublishFailed: false });
    expect(notifyScheduledPostFailed).not.toHaveBeenCalled();
  });

  it("does not fire the auto-publish notice for a manual (non-scheduled) publish failure", async () => {
    const { executeClaimedPublish } = await import("../posts");
    const claimed = { ...POST_BASE } as any;

    const { anySucceeded } = await executeClaimedPublish(claimed); // opts.auto defaults to false

    expect(anySucceeded).toBe(false);
    // auto is false, so autoPublishFailed must be set to false (not treated as an auto failure).
    expect(lastUpdateSet).toEqual({ status: "approved", autoPublishFailed: false });
    expect(notifyScheduledPostFailed).not.toHaveBeenCalled();
  });

  it("does not notify when the resolving update matches zero rows (post already moved out of 'publishing')", async () => {
    updateShouldMatch = false;
    const { executeClaimedPublish } = await import("../posts");
    const claimed = { ...POST_BASE } as any;

    const { anySucceeded, post } = await executeClaimedPublish(claimed, { auto: true });

    expect(anySucceeded).toBe(false);
    expect(post).toBeUndefined();
    expect(notifyScheduledPostFailed).not.toHaveBeenCalled();
  });
});
