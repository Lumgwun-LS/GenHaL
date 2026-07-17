/**
 * Confirms that a vendor-uploaded photo (sourced from the /ai/upload-image-url
 * presigned-URL flow, stored in vendorUploadsTable) publishes correctly through
 * all four platform publishers — Facebook, Instagram, LinkedIn, and X/Twitter —
 * without regression.
 *
 * The key risk guarded against: code that assumes "only AI-generated URLs ever
 * appear in mediaUrls" and bakes in a check against aiGenerationsTable (or
 * another AI-specific assumption) that would silently break vendor-uploaded
 * media. Both sources produce the same /api/media/:objectId URL shape; the
 * publish pipeline must treat them identically.
 *
 * Mirrors the structure of posts-instagram-publish.test.ts (which covers
 * AI-generated hosted URLs) so any future refactor can be checked against both.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.PAYMENT_CREDS_ENCRYPTION_KEY = "0".repeat(64);

// ---------------------------------------------------------------------------
// Fixtures — URLs use the same /api/media/:objectId shape as AI-generated
// media, but are described as vendor-uploaded to make the distinction explicit.
// ---------------------------------------------------------------------------
const VENDOR_UPLOADED_IMAGE_URL = "https://example.repl.co/api/media/vendor-uploaded-photo-abc123";
const VENDOR_UPLOADED_VIDEO_URL = "https://example.repl.co/api/media/vendor-uploaded-video-abc123";
const FAKE_IMAGE_BYTES = Buffer.from("fake-vendor-png-bytes");
const FAKE_VIDEO_BYTES = Buffer.from("fake-vendor-mp4-bytes");

const POST_BASE = {
  id: 2,
  vendorId: 20,
  caption: "Check out our store!",
  status: "publishing" as const,
  mediaUrls: [VENDOR_UPLOADED_IMAGE_URL],
  platforms: [] as string[],
  socialAccountIds: [] as number[],
};

function makeAccount(overrides: Record<string, unknown>) {
  return {
    id: 5,
    vendorId: 20,
    platform: "instagram",
    accountName: "myshop",
    accountId: "ig-shop-456",
    status: "active",
    accessTokenEncrypted: "enc-shop-token",
    ...overrides,
  };
}

let socialAccounts: ReturnType<typeof makeAccount>[] = [];

// ---------------------------------------------------------------------------
// DB mock
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
          return list.map((r) => ({
            id: 99,
            publishedAt: new Date(),
            ...(r as Record<string, unknown>),
          }));
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

// ---------------------------------------------------------------------------
// Platform publish spies
// ---------------------------------------------------------------------------
const publishInstagramPhotoPost = vi.fn(async () => ({
  externalPostId: "ig-vendor-post-1",
  externalUrl: "https://www.instagram.com/p/ig-vendor-post-1",
}));
const publishFacebookFeedPost = vi.fn();
const publishFacebookPhotoPost = vi.fn(async () => ({
  externalPostId: "fb-vendor-photo-1",
  externalUrl: "https://www.facebook.com/fb-vendor-photo-1",
}));
const publishFacebookVideoPost = vi.fn(async () => ({
  externalPostId: "fb-vendor-video-1",
  externalUrl: "https://www.facebook.com/fb-vendor-video-1",
  processing: true as const,
}));

vi.mock("../../lib/meta", () => ({
  publishFacebookFeedPost,
  publishFacebookPhotoPost,
  publishFacebookVideoPost,
  publishInstagramPhotoPost,
  isMetaAuthError: () => false,
}));

const publishLinkedInTextPost = vi.fn();
const publishLinkedInVideoPost = vi.fn(async () => ({
  externalPostId: "li-vendor-video-1",
  externalUrl: "https://linkedin.com/li-vendor-video-1",
}));
const publishLinkedInImagePost = vi.fn(async () => ({
  externalPostId: "li-vendor-post-1",
  externalUrl: "https://linkedin.com/li-vendor-post-1",
}));

vi.mock("../../lib/linkedin", () => ({
  publishLinkedInTextPost,
  publishLinkedInImagePost,
  publishLinkedInVideoPost,
  isLinkedInAuthError: () => false,
}));

const publishTweet = vi.fn();
const publishTweetWithImage = vi.fn(async () => ({
  externalPostId: "tw-vendor-1",
  externalUrl: "https://x.com/myshop/status/tw-vendor-1",
}));
const publishTweetWithVideo = vi.fn(async () => ({
  externalPostId: "tw-vendor-video-1",
  externalUrl: "https://x.com/myshop/status/tw-vendor-video-1",
}));

vi.mock("../../lib/twitter", () => ({
  publishTweet,
  publishTweetWithImage,
  publishTweetWithVideo,
  isTwitterAuthError: () => false,
}));

vi.mock("../../lib/token-refresh", () => ({
  ensureFreshAccessToken: async (account: { accessTokenEncrypted: string }) =>
    `decrypted:${account.accessTokenEncrypted}`,
}));

// ---------------------------------------------------------------------------
// Helpers to build a consistent fetch mock for image and video URL probing.
// HEAD requests are used by probeHostedMediaKind (Facebook path); GET requests
// are used by resolveMediaBuffer (LinkedIn / X / Facebook-video path).
// ---------------------------------------------------------------------------
function makeImageFetch(): typeof fetch {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === VENDOR_UPLOADED_IMAGE_URL) {
      // Both HEAD (probe) and GET (buffer download) return image/png.
      return new Response(init?.method === "HEAD" ? null : FAKE_IMAGE_BYTES, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
    if (u.includes("graph.facebook.com") && u.includes("/photos") && init?.method === "POST") {
      return new Response(JSON.stringify({ post_id: "fb-vendor-photo-1" }), { status: 200 });
    }
    throw new Error(`Unexpected fetch to ${u} (${init?.method ?? "GET"})`);
  }) as unknown as typeof fetch;
}

function makeVideoFetch(): typeof fetch {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === VENDOR_UPLOADED_VIDEO_URL) {
      return new Response(init?.method === "HEAD" ? null : FAKE_VIDEO_BYTES, {
        status: 200,
        headers: { "content-type": "video/mp4" },
      });
    }
    throw new Error(`Unexpected fetch to ${u} (${init?.method ?? "GET"})`);
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("publishing a post whose media is a vendor-uploaded (non-AI-generated) hosted URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socialAccounts = [];
    global.fetch = makeImageFetch();
  });

  it("publishes a vendor-uploaded photo to Instagram using the URL directly — no byte download", async () => {
    socialAccounts = [makeAccount({ platform: "instagram" })];
    const { executeClaimedPublish } = await import("../posts");

    const claimed = {
      ...POST_BASE,
      platforms: ["instagram"],
      socialAccountIds: [5],
    } as any;
    const { publications, anySucceeded } = await executeClaimedPublish(claimed);

    expect(anySucceeded).toBe(true);
    expect(publications[0].status).toBe("success");
    // Instagram's Content Publishing API is passed the URL itself — the server
    // must NOT download the bytes first, regardless of whether it's AI-generated
    // or vendor-uploaded.
    expect(publishInstagramPhotoPost).toHaveBeenCalledWith(
      "ig-shop-456",
      "decrypted:enc-shop-token",
      VENDOR_UPLOADED_IMAGE_URL,
      POST_BASE.caption,
    );
    // fetch should not have been called for byte-download (probing/photo endpoint
    // only — and for instagram, neither should occur)
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const getCalls = fetchMock.mock.calls.filter(
      ([, init]) => !init || init.method !== "HEAD",
    );
    // No GET call to the media URL — Instagram takes it as-is
    expect(getCalls.filter(([u]) => String(u) === VENDOR_UPLOADED_IMAGE_URL)).toHaveLength(0);
  });

  it("publishes a vendor-uploaded photo to Facebook via the photo endpoint using a URL passthrough", async () => {
    socialAccounts = [makeAccount({ platform: "facebook", accountId: "fb-page-789" })];
    const { executeClaimedPublish } = await import("../posts");

    const claimed = {
      ...POST_BASE,
      platforms: ["facebook"],
      socialAccountIds: [5],
    } as any;
    const { publications, anySucceeded } = await executeClaimedPublish(claimed);

    expect(anySucceeded).toBe(true);
    expect(publications[0].status).toBe("success");
    expect(publications[0].externalPostId).toBe("fb-vendor-photo-1");
    // The video endpoint must NOT be invoked for a photo.
    expect(publishFacebookVideoPost).not.toHaveBeenCalled();
    // Facebook's /photos endpoint receives a POST with the URL — the pipeline
    // probes Content-Type first (HEAD) and then sends the URL, not raw bytes.
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const headCalls = fetchMock.mock.calls.filter(([u, init]) => String(u) === VENDOR_UPLOADED_IMAGE_URL && init?.method === "HEAD");
    expect(headCalls).toHaveLength(1);
  });

  it("publishes a vendor-uploaded video to Facebook via the video endpoint (not the photo endpoint)", async () => {
    socialAccounts = [makeAccount({ platform: "facebook", accountId: "fb-page-789" })];
    global.fetch = makeVideoFetch();
    const { executeClaimedPublish } = await import("../posts");

    const claimed = {
      ...POST_BASE,
      mediaUrls: [VENDOR_UPLOADED_VIDEO_URL],
      platforms: ["facebook"],
      socialAccountIds: [5],
    } as any;
    const { publications, anySucceeded } = await executeClaimedPublish(claimed);

    // Facebook video upload returns immediately with "processing" — the
    // video-publish-finalizer background job resolves it later. anySucceeded
    // is still true (same behaviour as AI-generated video).
    expect(anySucceeded).toBe(true);
    expect(publications[0].status).toBe("processing");
    expect(publications[0].externalPostId).toBe("fb-vendor-video-1");
    expect(publishFacebookVideoPost).toHaveBeenCalledWith(
      "fb-page-789",
      "decrypted:enc-shop-token",
      FAKE_VIDEO_BYTES,
      POST_BASE.caption,
    );
  });

  it("publishes a vendor-uploaded photo to LinkedIn by fetching the bytes from the hosted URL", async () => {
    socialAccounts = [makeAccount({ platform: "linkedin", accountId: "li-member-321" })];
    const { executeClaimedPublish } = await import("../posts");

    const claimed = {
      ...POST_BASE,
      platforms: ["linkedin"],
      socialAccountIds: [5],
    } as any;
    const { publications, anySucceeded } = await executeClaimedPublish(claimed);

    expect(anySucceeded).toBe(true);
    expect(publications[0].status).toBe("success");
    // LinkedIn's Posts API needs the raw bytes — the pipeline must fetch them
    // from the vendor-uploaded URL, same as it would for an AI-generated URL.
    expect(publishLinkedInImagePost).toHaveBeenCalledWith(
      "li-member-321",
      "decrypted:enc-shop-token",
      FAKE_IMAGE_BYTES,
      POST_BASE.caption,
    );
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(VENDOR_UPLOADED_IMAGE_URL);
  });

  it("publishes a vendor-uploaded video to LinkedIn by fetching the bytes from the hosted URL", async () => {
    socialAccounts = [makeAccount({ platform: "linkedin", accountId: "li-member-321" })];
    global.fetch = makeVideoFetch();
    const { executeClaimedPublish } = await import("../posts");

    const claimed = {
      ...POST_BASE,
      mediaUrls: [VENDOR_UPLOADED_VIDEO_URL],
      platforms: ["linkedin"],
      socialAccountIds: [5],
    } as any;
    const { publications, anySucceeded } = await executeClaimedPublish(claimed);

    expect(anySucceeded).toBe(true);
    expect(publications[0].status).toBe("success");
    expect(publishLinkedInVideoPost).toHaveBeenCalledWith(
      "li-member-321",
      "decrypted:enc-shop-token",
      FAKE_VIDEO_BYTES,
      POST_BASE.caption,
    );
  });

  it("publishes a vendor-uploaded photo to X/Twitter by fetching the bytes from the hosted URL", async () => {
    socialAccounts = [makeAccount({ platform: "twitter", accountName: "@myshop", accountId: "tw-user-654" })];
    const { executeClaimedPublish } = await import("../posts");

    const claimed = {
      ...POST_BASE,
      platforms: ["twitter"],
      socialAccountIds: [5],
    } as any;
    const { publications, anySucceeded } = await executeClaimedPublish(claimed);

    expect(anySucceeded).toBe(true);
    expect(publications[0].status).toBe("success");
    // X/Twitter's v1.1 media upload also needs the raw bytes.
    expect(publishTweetWithImage).toHaveBeenCalledWith(
      "myshop",
      "decrypted:enc-shop-token",
      FAKE_IMAGE_BYTES,
      POST_BASE.caption,
    );
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(VENDOR_UPLOADED_IMAGE_URL);
  });

  it("publishes a vendor-uploaded video to X/Twitter by fetching the bytes from the hosted URL", async () => {
    socialAccounts = [makeAccount({ platform: "twitter", accountName: "@myshop", accountId: "tw-user-654" })];
    global.fetch = makeVideoFetch();
    const { executeClaimedPublish } = await import("../posts");

    const claimed = {
      ...POST_BASE,
      mediaUrls: [VENDOR_UPLOADED_VIDEO_URL],
      platforms: ["twitter"],
      socialAccountIds: [5],
    } as any;
    const { publications, anySucceeded } = await executeClaimedPublish(claimed);

    expect(anySucceeded).toBe(true);
    expect(publications[0].status).toBe("success");
    expect(publishTweetWithVideo).toHaveBeenCalledWith(
      "myshop",
      "decrypted:enc-shop-token",
      FAKE_VIDEO_BYTES,
      POST_BASE.caption,
    );
  });

  it("fails clearly for Instagram if a vendor-uploaded URL is somehow a data URI (not a hosted URL)", async () => {
    socialAccounts = [makeAccount({ platform: "instagram" })];
    const { executeClaimedPublish } = await import("../posts");

    // A data: URI would indicate something went wrong in the upload pipeline —
    // Instagram must reject it with a clear message, not silently drop the media.
    const claimed = {
      ...POST_BASE,
      mediaUrls: ["data:image/png;base64,abc123"],
      platforms: ["instagram"],
      socialAccountIds: [5],
    } as any;
    const { publications, anySucceeded } = await executeClaimedPublish(claimed);

    expect(anySucceeded).toBe(false);
    expect(publications[0].status).toBe("failed");
    expect(publications[0].errorMessage).toMatch(/publicly hosted media URL/);
    expect(publishInstagramPhotoPost).not.toHaveBeenCalled();
  });
});
