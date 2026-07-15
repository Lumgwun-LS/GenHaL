/**
 * Verifies that a post whose AI-generated image is a real public URL
 * (object storage) — not a base64 data: URI — actually publishes to
 * Instagram, and that LinkedIn/X/Twitter (which need the raw bytes, not a
 * URL) still succeed by fetching that hosted URL themselves.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.PAYMENT_CREDS_ENCRYPTION_KEY = "0".repeat(64);

const HOSTED_IMAGE_URL = "https://example.repl.co/api/media/some-generated-image";
const HOSTED_VIDEO_URL = "https://example.repl.co/api/media/some-generated-video";
const FAKE_BYTES = Buffer.from("fake-png-bytes");
const FAKE_VIDEO_BYTES = Buffer.from("fake-mp4-bytes");

const POST_BASE = {
  id: 1,
  vendorId: 10,
  caption: "Check out our new product!",
  status: "publishing" as const,
  mediaUrls: [HOSTED_IMAGE_URL],
  platforms: [] as string[],
  socialAccountIds: [] as number[],
};

function makeAccount(overrides: Record<string, unknown>) {
  return {
    id: 1,
    vendorId: 10,
    platform: "instagram",
    accountName: "acme",
    accountId: "ig-123",
    status: "active",
    accessTokenEncrypted: "enc-token",
    ...overrides,
  };
}

let socialAccounts: ReturnType<typeof makeAccount>[] = [];

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

vi.mock("../../lib/encryption", () => ({
  decrypt: (v: string) => `decrypted:${v}`,
}));

const publishInstagramPhotoPost = vi.fn(async () => ({ externalPostId: "ig-post-1", externalUrl: "https://www.instagram.com/p/ig-post-1" }));
const publishFacebookFeedPost = vi.fn();
const publishFacebookPhotoPost = vi.fn();
const publishFacebookVideoPost = vi.fn(async () => ({ externalPostId: "fb-video-1", externalUrl: "https://www.facebook.com/fb-video-1", processing: true as const }));

vi.mock("../../lib/meta", () => ({
  publishFacebookFeedPost,
  publishFacebookPhotoPost,
  publishFacebookVideoPost,
  publishInstagramPhotoPost,
  isMetaAuthError: () => false,
}));

const publishLinkedInTextPost = vi.fn();
const publishLinkedInImagePost = vi.fn(async () => ({ externalPostId: "li-post-1", externalUrl: "https://linkedin.com/li-post-1" }));

vi.mock("../../lib/linkedin", () => ({
  publishLinkedInTextPost,
  publishLinkedInImagePost,
  isLinkedInAuthError: () => false,
}));

const publishTweet = vi.fn();
const publishTweetWithImage = vi.fn(async () => ({ externalPostId: "tw-1", externalUrl: "https://x.com/acme/status/tw-1" }));

vi.mock("../../lib/twitter", () => ({
  publishTweet,
  publishTweetWithImage,
  isTwitterAuthError: () => false,
}));

// Publish attempts resolve a fresh access token via lib/token-refresh, which
// itself pulls in refresh flows, Slack alerting, and email — none of which
// this test cares about. Stub it down to "just decrypt the stored token".
vi.mock("../../lib/token-refresh", () => ({
  ensureFreshAccessToken: async (account: { accessTokenEncrypted: string }) => `decrypted:${account.accessTokenEncrypted}`,
}));

describe("publishing a post whose image is a hosted object-storage URL (not base64)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socialAccounts = [];
    global.fetch = vi.fn(async (url: string | URL) => {
      if (String(url) === HOSTED_IMAGE_URL) {
        return new Response(FAKE_BYTES, { status: 200, headers: { "content-type": "image/png" } });
      }
      if (String(url) === HOSTED_VIDEO_URL) {
        return new Response(FAKE_VIDEO_BYTES, { status: 200, headers: { "content-type": "video/mp4" } });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;
  });

  it("publishes to Instagram using the hosted image URL directly (no byte download needed)", async () => {
    socialAccounts = [makeAccount({ platform: "instagram" })];
    const { executeClaimedPublish } = await import("../posts");

    const claimed = { ...POST_BASE, platforms: ["instagram"], socialAccountIds: [1] } as any;
    const { publications, anySucceeded } = await executeClaimedPublish(claimed);

    expect(anySucceeded).toBe(true);
    expect(publications[0].status).toBe("success");
    expect(publishInstagramPhotoPost).toHaveBeenCalledWith("ig-123", "decrypted:enc-token", HOSTED_IMAGE_URL, POST_BASE.caption);
    // Instagram takes the URL as-is — publishing it must not require downloading the bytes ourselves.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("publishes to LinkedIn by fetching the hosted URL's bytes (LinkedIn's API needs bytes, not a URL)", async () => {
    socialAccounts = [makeAccount({ platform: "linkedin" })];
    const { executeClaimedPublish } = await import("../posts");

    const claimed = { ...POST_BASE, platforms: ["linkedin"], socialAccountIds: [1] } as any;
    const { publications, anySucceeded } = await executeClaimedPublish(claimed);

    expect(anySucceeded).toBe(true);
    expect(publications[0].status).toBe("success");
    expect(global.fetch).toHaveBeenCalledWith(HOSTED_IMAGE_URL);
    expect(publishLinkedInImagePost).toHaveBeenCalledWith("ig-123", "decrypted:enc-token", FAKE_BYTES, POST_BASE.caption);
  });

  it("publishes to X/Twitter by fetching the hosted URL's bytes", async () => {
    socialAccounts = [makeAccount({ platform: "twitter", accountName: "@acme" })];
    const { executeClaimedPublish } = await import("../posts");

    const claimed = { ...POST_BASE, platforms: ["twitter"], socialAccountIds: [1] } as any;
    const { publications, anySucceeded } = await executeClaimedPublish(claimed);

    expect(anySucceeded).toBe(true);
    expect(publications[0].status).toBe("success");
    expect(publishTweetWithImage).toHaveBeenCalledWith("acme", "decrypted:enc-token", FAKE_BYTES, POST_BASE.caption);
  });

  it("publishes a hosted image to Facebook via the direct URL passthrough, not the video endpoint", async () => {
    socialAccounts = [makeAccount({ platform: "facebook" })];
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === HOSTED_IMAGE_URL) return new Response(FAKE_BYTES, { status: 200, headers: { "content-type": "image/png" } });
      if (u.includes("graph.facebook.com") && u.includes("/photos") && init?.method === "POST") {
        return new Response(JSON.stringify({ post_id: "fb-photo-1" }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${u}`);
    }) as unknown as typeof fetch;
    const { executeClaimedPublish } = await import("../posts");

    const claimed = { ...POST_BASE, platforms: ["facebook"], socialAccountIds: [1] } as any;
    const { publications, anySucceeded } = await executeClaimedPublish(claimed);

    expect(anySucceeded).toBe(true);
    expect(publications[0].status).toBe("success");
    expect(publications[0].externalPostId).toBe("fb-photo-1");
    expect(publishFacebookVideoPost).not.toHaveBeenCalled();
  });

  it("publishes a hosted AI-generated video to Facebook via the video endpoint, not the photo endpoint", async () => {
    socialAccounts = [makeAccount({ platform: "facebook" })];
    const { executeClaimedPublish } = await import("../posts");

    const claimed = { ...POST_BASE, mediaUrls: [HOSTED_VIDEO_URL], platforms: ["facebook"], socialAccountIds: [1] } as any;
    const { publications, anySucceeded } = await executeClaimedPublish(claimed);

    // The video upload is accepted immediately without waiting for Facebook's
    // async processing — the post still counts as "succeeded" (so the request
    // doesn't block), but the individual publication row stays "processing"
    // until the video-publish-finalizer background job resolves it.
    expect(anySucceeded).toBe(true);
    expect(publications[0].status).toBe("processing");
    expect(publications[0].externalPostId).toBe("fb-video-1");
    expect(publishFacebookVideoPost).toHaveBeenCalledWith("ig-123", "decrypted:enc-token", FAKE_VIDEO_BYTES, POST_BASE.caption);
  });

  it("still fails clearly for Instagram if the media is somehow not a real hosted URL", async () => {
    socialAccounts = [makeAccount({ platform: "instagram" })];
    const { executeClaimedPublish } = await import("../posts");

    const claimed = { ...POST_BASE, mediaUrls: ["data:image/png;base64,abc123"], platforms: ["instagram"], socialAccountIds: [1] } as any;
    const { publications, anySucceeded } = await executeClaimedPublish(claimed);

    expect(anySucceeded).toBe(false);
    expect(publications[0].status).toBe("failed");
    expect(publications[0].errorMessage).toMatch(/publicly hosted media URL/);
    expect(publishInstagramPhotoPost).not.toHaveBeenCalled();
  });
});
