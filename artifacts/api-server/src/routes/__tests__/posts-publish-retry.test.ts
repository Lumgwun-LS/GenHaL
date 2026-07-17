/**
 * Verifies the auth-error retry path inside publishToPlatform:
 *   - A publish attempt that fails with an auth-shaped error triggers exactly
 *     one forced token refresh + one retry, not an infinite loop.
 *   - A publish attempt that fails with a non-auth error is NOT retried.
 *
 * The test exercises the full publishToPlatform → attemptPublish flow via
 * executeClaimedPublish, using Twitter/X as a representative platform (the
 * retry logic is platform-agnostic — see the isAuthError inner function in
 * posts.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.PAYMENT_CREDS_ENCRYPTION_KEY = "0".repeat(64);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const POST_BASE = {
  id: 1,
  vendorId: 10,
  caption: "Hello from Acme!",
  status: "publishing" as const,
  mediaUrls: [] as string[],
  platforms: ["X (Twitter)"] as string[],
  socialAccountIds: [1] as number[],
};

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    vendorId: 10,
    platform: "X (Twitter)",
    accountName: "@acme",
    accountId: "twitter-123",
    status: "active",
    connectedVia: "oauth_twitter",
    accessTokenEncrypted: "enc:stored-token",
    refreshTokenEncrypted: "enc:refresh-token",
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // far from expiry
    ...overrides,
  };
}

let socialAccounts: ReturnType<typeof makeAccount>[] = [];

// ---------------------------------------------------------------------------
// DB mock — mirrors the pattern from posts-instagram-publish.test.ts
// ---------------------------------------------------------------------------
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
          returning: async () => [{ ...POST_BASE, ...vals }],
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

// ---------------------------------------------------------------------------
// ensureFreshAccessToken spy — tracks calls with their arguments so we can
// verify the first call is proactive (no force) and the second is forced.
// ---------------------------------------------------------------------------
const ensureFreshAccessToken = vi.fn();

vi.mock("../../lib/token-refresh", () => ({
  ensureFreshAccessToken,
  ReconnectRequiredError: class ReconnectRequiredError extends Error {},
}));

// ---------------------------------------------------------------------------
// Platform publish spies
// ---------------------------------------------------------------------------
const publishTweet = vi.fn();
const publishTweetWithImage = vi.fn();
const publishTweetWithVideo = vi.fn();
const isTwitterAuthError = vi.fn();

vi.mock("../../lib/twitter", () => ({
  publishTweet,
  publishTweetWithImage,
  publishTweetWithVideo,
  isTwitterAuthError,
}));

vi.mock("../../lib/meta", () => ({
  publishFacebookFeedPost: vi.fn(),
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

vi.mock("../../lib/post-notifications", () => ({
  notifyScheduledPostFailed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("../../lib/encryption", () => ({
  decrypt: (v: string) => `decrypted:${v}`,
  encrypt: (v: string) => `enc:${v}`,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("publishToPlatform auth-error retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socialAccounts = [];
    global.fetch = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch;
  });

  it("retries exactly once with force=true after an auth-shaped publish failure, then returns success", async () => {
    socialAccounts = [makeAccount()];

    // First proactive call → token-1; forced retry call → token-2
    ensureFreshAccessToken
      .mockResolvedValueOnce("token-1")
      .mockResolvedValueOnce("token-2");

    // publishTweet: first call throws an auth error; second succeeds
    const authError = new Error("invalid_access_token: The token has been invalidated");
    publishTweet
      .mockRejectedValueOnce(authError)
      .mockResolvedValueOnce({ externalPostId: "tw-ok", externalUrl: "https://x.com/acme/status/tw-ok" });

    // isTwitterAuthError must recognise the error message so the retry fires
    isTwitterAuthError.mockImplementation((msg: string) => msg.includes("invalid_access_token"));

    const { executeClaimedPublish } = await import("../posts");
    const { publications, anySucceeded } = await executeClaimedPublish(POST_BASE as any);

    // The retry must have succeeded
    expect(anySucceeded).toBe(true);
    expect(publications[0].status).toBe("success");
    expect(publications[0].externalPostId).toBe("tw-ok");

    // ensureFreshAccessToken must have been called exactly twice:
    // 1st: proactive check (no force flag)
    // 2nd: forced renewal after auth failure
    expect(ensureFreshAccessToken).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = ensureFreshAccessToken.mock.calls;
    expect(firstCall[1]).toBeUndefined(); // no opts on proactive call
    expect(secondCall[1]).toEqual({ force: true }); // forced on retry

    // publishTweet must have been called exactly twice — once with each token
    expect(publishTweet).toHaveBeenCalledTimes(2);
    expect(publishTweet.mock.calls[0][1]).toBe("token-1");
    expect(publishTweet.mock.calls[1][1]).toBe("token-2");
  });

  it("does NOT retry when the publish failure is a non-auth error", async () => {
    socialAccounts = [makeAccount()];

    ensureFreshAccessToken.mockResolvedValue("token-1");

    const networkError = new Error("rate limit exceeded: too many requests");
    publishTweet.mockRejectedValue(networkError);

    // isTwitterAuthError returns false for this error → no retry
    isTwitterAuthError.mockReturnValue(false);

    const { executeClaimedPublish } = await import("../posts");
    const { publications, anySucceeded } = await executeClaimedPublish(POST_BASE as any);

    expect(anySucceeded).toBe(false);
    expect(publications[0].status).toBe("failed");
    expect(publications[0].errorMessage).toContain("rate limit exceeded");

    // Only one publish attempt — no retry
    expect(publishTweet).toHaveBeenCalledTimes(1);
    // Only one token fetch — no forced refresh
    expect(ensureFreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it("returns failed when the forced-refresh also throws ReconnectRequiredError (no infinite retry)", async () => {
    socialAccounts = [makeAccount()];

    const { ReconnectRequiredError } = await import("../../lib/token-refresh");

    // Proactive call succeeds; forced retry throws reconnect error
    ensureFreshAccessToken
      .mockResolvedValueOnce("token-1")
      .mockRejectedValueOnce(new ReconnectRequiredError("Token could not be renewed"));

    const authError = new Error("invalid_access_token");
    publishTweet.mockRejectedValueOnce(authError);
    isTwitterAuthError.mockReturnValue(true);

    const { executeClaimedPublish } = await import("../posts");
    const { publications, anySucceeded } = await executeClaimedPublish(POST_BASE as any);

    expect(anySucceeded).toBe(false);
    expect(publications[0].status).toBe("failed");

    // Still exactly two ensureFreshAccessToken calls — no further looping
    expect(ensureFreshAccessToken).toHaveBeenCalledTimes(2);
    // publishTweet only attempted once (before the forced refresh failed)
    expect(publishTweet).toHaveBeenCalledTimes(1);
  });

  it("returns failed immediately when the proactive ensureFreshAccessToken throws ReconnectRequiredError", async () => {
    socialAccounts = [makeAccount()];

    const { ReconnectRequiredError } = await import("../../lib/token-refresh");
    ensureFreshAccessToken.mockRejectedValue(new ReconnectRequiredError("Needs reconnect"));

    const { executeClaimedPublish } = await import("../posts");
    const { publications, anySucceeded } = await executeClaimedPublish(POST_BASE as any);

    expect(anySucceeded).toBe(false);
    expect(publications[0].status).toBe("failed");
    // Publish was never even attempted
    expect(publishTweet).not.toHaveBeenCalled();
    // Token lookup attempted exactly once
    expect(ensureFreshAccessToken).toHaveBeenCalledTimes(1);
  });
});
