/**
 * Guards the connection-warning precheck added to PATCH /posts/:id for
 * rescheduling an already-scheduled post (task #196).
 *
 * Scenarios covered:
 *  - 409 + warnings when a scheduled post is rescheduled and the platform has
 *    no active social account at all
 *  - force:true bypasses the block and updates scheduledAt even when warnings exist
 *  - A post NOT in "scheduled" status (e.g. "draft") is never blocked by the
 *    connection check on a plain PATCH with a new scheduledAt
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.ADMIN_USER_IDS = "admin_1";
process.env.PAYMENT_CREDS_ENCRYPTION_KEY = "0".repeat(64);

const VENDOR_ID = 10;
const POST_ID = 55;

// Mutable state shared across tests. Closed over by the mock factory.
let existingPost: Record<string, unknown>;
let currentSocialAccounts: Array<Record<string, unknown>> = [];

// selectCallCount lets us return different rows for each sequential db.select()
// call within a single request. For PATCH, the order is always:
//   1st call → the post row  (postsTable lookup in the route handler)
//   2nd call → the vendor row (vendorsTable lookup inside resolveAuthedVendor)
//   3rd call → the social accounts (socialAccountsTable lookup inside getConnectionWarnings)
let selectCallCount = 0;
let lastUpdateSet: Record<string, unknown> | null = null;

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
          selectCallCount++;
          if (selectCallCount === 1) return [existingPost];       // post lookup
          if (selectCallCount === 2) return [{ id: VENDOR_ID }];  // vendor lookup (resolveAuthedVendor)
          return currentSocialAccounts;                            // social accounts (getConnectionWarnings)
        },
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            lastUpdateSet = vals;
            return [{ ...existingPost, ...vals }];
          },
        }),
      }),
    }),
  },
  postsTable: {},
  vendorsTable: {},
  socialAccountsTable: {},
  postPublicationsTable: {},
  productsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  gt: (col: unknown, val: unknown) => ({ col, val }),
  desc: (col: unknown) => ({ desc: col }),
  inArray: (col: unknown, val: unknown) => ({ col, val }),
}));

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: "admin_1" }),
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
vi.mock("../../lib/twitter", () => ({
  publishTweet: vi.fn(),
  publishTweetWithImage: vi.fn(),
  publishTweetWithVideo: vi.fn(),
  isTwitterAuthError: () => false,
}));
vi.mock("../../lib/token-refresh", () => ({
  ensureFreshAccessToken: async (account: { accessTokenEncrypted: string }) =>
    `decrypted:${account.accessTokenEncrypted}`,
}));
vi.mock("../../lib/post-notifications", () => ({
  notifyScheduledPostFailed: vi.fn(async () => {}),
}));
vi.mock("../../lib/media-cleanup", () => ({
  releaseOrphanedPostMedia: vi.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findHandler(
  router: any,
  path: string,
  method: "get" | "post" | "patch" | "delete",
): (req: any, res: any) => Promise<void> {
  const layer = router.stack.find(
    (l: any) => l.route?.path === path && l.route.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  return layer.route.stack[0].handle;
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.sendStatus = (code: number) => { res.statusCode = code; return res; };
  return res;
}

function makeActiveAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    vendorId: VENDOR_ID,
    platform: "facebook",
    accountName: "acme-page",
    accountId: "fb-123",
    status: "active",
    accessTokenEncrypted: "enc-token",
    connectedVia: "oauth",
    ...overrides,
  };
}

const FUTURE_DATE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

// Base scheduled post — status is "scheduled" so the connection check fires.
function makeScheduledPost(overrides: Record<string, unknown> = {}) {
  return {
    id: POST_ID,
    vendorId: VENDOR_ID,
    caption: "Weekend flash sale",
    status: "scheduled",
    autoPublishFailed: false,
    platforms: ["facebook"],
    socialAccountIds: [0], // 0 = "not explicitly chosen"
    mediaUrls: [],
    productIds: [],
    linkMode: "none",
    shareToken: null,
    scheduledAt: new Date(Date.now() + 30 * 60 * 1000),
    publishedAt: null,
    reminderSentAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PATCH /posts/:id — reschedule connection-warning precheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallCount = 0;
    lastUpdateSet = null;
    currentSocialAccounts = [];
    existingPost = makeScheduledPost();
  });

  it("returns 409 with warnings when a scheduled post is rescheduled and the platform has no connected account", async () => {
    currentSocialAccounts = []; // vendor has no social accounts at all

    const mod = await import("../posts");
    const handler = findHandler(mod.default as any, "/posts/:id", "patch");

    const req = {
      params: { id: String(POST_ID) },
      body: { scheduledAt: FUTURE_DATE }, // rescheduling without force
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("no usable connected account"),
      warnings: expect.arrayContaining([
        expect.objectContaining({
          platform: "facebook",
          message: expect.stringContaining("No connected"),
        }),
      ]),
    });
    // The update must NOT have been applied — the block must fire before the DB write
    expect(lastUpdateSet).toBeNull();
  });

  it("bypasses the block and updates scheduledAt when force:true is passed despite missing connected account", async () => {
    currentSocialAccounts = []; // would normally block — but vendor acknowledged the warning

    const mod = await import("../posts");
    const handler = findHandler(mod.default as any, "/posts/:id", "patch");

    const req = {
      params: { id: String(POST_ID) },
      body: { scheduledAt: FUTURE_DATE, force: true },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(lastUpdateSet).not.toBeNull();
    // scheduledAt must have been updated to the requested value
    expect(lastUpdateSet).toMatchObject({
      scheduledAt: expect.any(Date),
      reminderSentAt: null, // cleared so the vendor gets a fresh reminder
    });
  });

  it("does not apply the connection check when the post status is 'draft' (non-scheduled PATCH)", async () => {
    // A draft post being edited — even if scheduledAt is provided, the guard
    // only fires for posts already in "scheduled" status.
    existingPost = makeScheduledPost({ status: "draft", scheduledAt: null });
    currentSocialAccounts = []; // no accounts — would block if the guard fired

    const mod = await import("../posts");
    const handler = findHandler(mod.default as any, "/posts/:id", "patch");

    const req = {
      params: { id: String(POST_ID) },
      body: { scheduledAt: FUTURE_DATE }, // no force — if the guard fired this would 409
    };
    const res = makeRes();

    await handler(req, res);

    // Must succeed — a draft is not subject to the reschedule guard
    expect(res.statusCode).toBe(200);
    expect(lastUpdateSet).not.toBeNull();
    expect(lastUpdateSet).toMatchObject({
      scheduledAt: expect.any(Date),
    });
  });
});
