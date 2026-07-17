/**
 * Guards the connection-warnings precheck in POST /posts/:id/schedule and
 * GET /posts/:id/connection-warnings against regression.
 *
 * Scenarios covered:
 *  - 409 + warnings when a platform has no connected account at all
 *  - 409 + warnings when a platform has multiple (ambiguous) active accounts
 *  - 409 + warnings when the explicitly-chosen account has no live token (accessTokenEncrypted is null)
 *  - force:true bypasses the block and schedules anyway even when warnings exist
 *  - All accounts healthy → no warnings, schedule proceeds
 *  - GET /posts/:id/connection-warnings returns warnings without scheduling anything
 *  - GET /posts/:id/connection-warnings returns empty warnings when all accounts are healthy
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.ADMIN_USER_IDS = "admin_1";
process.env.PAYMENT_CREDS_ENCRYPTION_KEY = "0".repeat(64);

const VENDOR_ID = 10;
const POST_ID = 42;

// Mutable state shared across tests. Closed over by the mock factory.
let existingPost: Record<string, unknown>;
let currentSocialAccounts: Array<Record<string, unknown>> = [];
// selectCallCount lets us return different rows for each sequential db.select()
// call within a single request. The order is always:
//   1st call  → the post row  (postsTable lookup in the route handler)
//   2nd call  → the vendor row (vendorsTable lookup inside resolveAuthedVendor)
//   3rd call  → the social accounts (socialAccountsTable lookup inside getConnectionWarnings)
let selectCallCount = 0;
let lastUpdateSet: Record<string, unknown> | null = null;

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
          selectCallCount++;
          if (selectCallCount === 1) return [existingPost];    // post lookup
          if (selectCallCount === 2) return [{ id: VENDOR_ID }]; // vendor lookup
          return currentSocialAccounts;                         // social accounts lookup
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findHandler(
  router: any,
  path: string,
  method: "get" | "post",
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /posts/:id/schedule — connection-warnings precheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallCount = 0;
    lastUpdateSet = null;
    currentSocialAccounts = [];
    existingPost = {
      id: POST_ID,
      vendorId: VENDOR_ID,
      caption: "Big sale this weekend!",
      status: "approved",
      autoPublishFailed: false,
      platforms: ["facebook"],
      socialAccountIds: [0], // 0 means "not explicitly chosen"
      mediaUrls: [],
      productIds: [],
      linkMode: "none",
      shareToken: null,
      scheduledAt: null,
      publishedAt: null,
      reminderSentAt: null,
      createdAt: new Date(),
    };
  });

  it("returns 409 with a warning when the platform has no connected account at all", async () => {
    currentSocialAccounts = []; // vendor has no social accounts whatsoever

    const mod = await import("../posts");
    const handler = findHandler(mod.default as any, "/posts/:id/schedule", "post");

    const req = {
      params: { id: String(POST_ID) },
      body: { scheduledAt: FUTURE_DATE }, // no force flag
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
    expect(lastUpdateSet).toBeNull(); // post must NOT have been scheduled
  });

  it("returns 409 with a warning when the platform has multiple (ambiguous) connected accounts", async () => {
    // Two facebook accounts — impossible to know which one to publish to without an explicit choice
    currentSocialAccounts = [
      makeActiveAccount({ id: 1 }),
      makeActiveAccount({ id: 2, accountName: "acme-page-2", accountId: "fb-456" }),
    ];

    const mod = await import("../posts");
    const handler = findHandler(mod.default as any, "/posts/:id/schedule", "post");

    const req = {
      params: { id: String(POST_ID) },
      body: { scheduledAt: FUTURE_DATE },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform: "facebook",
          message: expect.stringContaining("Multiple"),
        }),
      ]),
    );
    expect(lastUpdateSet).toBeNull();
  });

  it("returns 409 with a warning when the explicitly-chosen account has no live token", async () => {
    // Account id=1 is explicitly chosen (socialAccountIds: [1]) but has no access token
    existingPost = { ...existingPost, socialAccountIds: [1] };
    currentSocialAccounts = [makeActiveAccount({ id: 1, accessTokenEncrypted: null })];

    const mod = await import("../posts");
    const handler = findHandler(mod.default as any, "/posts/:id/schedule", "post");

    const req = {
      params: { id: String(POST_ID) },
      body: { scheduledAt: FUTURE_DATE },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform: "facebook",
          message: expect.stringContaining("no live connection"),
        }),
      ]),
    );
    expect(lastUpdateSet).toBeNull();
  });

  it("schedules successfully when force:true is passed despite a missing connected account", async () => {
    currentSocialAccounts = []; // no accounts — would normally block

    const mod = await import("../posts");
    const handler = findHandler(mod.default as any, "/posts/:id/schedule", "post");

    const req = {
      params: { id: String(POST_ID) },
      body: { scheduledAt: FUTURE_DATE, force: true }, // vendor acknowledged the risk
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(lastUpdateSet).toMatchObject({
      status: "scheduled",
      autoPublishFailed: false,
    });
  });

  it("schedules successfully with no warnings when all accounts are healthy", async () => {
    existingPost = { ...existingPost, socialAccountIds: [1] };
    currentSocialAccounts = [makeActiveAccount({ id: 1 })]; // live token, one account

    const mod = await import("../posts");
    const handler = findHandler(mod.default as any, "/posts/:id/schedule", "post");

    const req = {
      params: { id: String(POST_ID) },
      body: { scheduledAt: FUTURE_DATE },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(lastUpdateSet).toMatchObject({
      status: "scheduled",
      autoPublishFailed: false,
    });
  });
});

describe("GET /posts/:id/connection-warnings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallCount = 0;
    lastUpdateSet = null;
    currentSocialAccounts = [];
    existingPost = {
      id: POST_ID,
      vendorId: VENDOR_ID,
      caption: "Big sale this weekend!",
      status: "approved",
      autoPublishFailed: false,
      platforms: ["facebook"],
      socialAccountIds: [0],
      mediaUrls: [],
      productIds: [],
      linkMode: "none",
      shareToken: null,
      scheduledAt: null,
      publishedAt: null,
      reminderSentAt: null,
      createdAt: new Date(),
    };
  });

  it("returns warnings when the platform has no connected account", async () => {
    currentSocialAccounts = [];

    const mod = await import("../posts");
    const handler = findHandler(mod.default as any, "/posts/:id/connection-warnings", "get");

    const req = { params: { id: String(POST_ID) } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      warnings: expect.arrayContaining([
        expect.objectContaining({
          platform: "facebook",
          message: expect.stringContaining("No connected"),
        }),
      ]),
    });
    // Must be read-only — no DB update should happen
    expect(lastUpdateSet).toBeNull();
  });

  it("returns warnings when the platform has multiple (ambiguous) connected accounts", async () => {
    currentSocialAccounts = [
      makeActiveAccount({ id: 1 }),
      makeActiveAccount({ id: 2, accountName: "acme-page-2", accountId: "fb-456" }),
    ];

    const mod = await import("../posts");
    const handler = findHandler(mod.default as any, "/posts/:id/connection-warnings", "get");

    const req = { params: { id: String(POST_ID) } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform: "facebook",
          message: expect.stringContaining("Multiple"),
        }),
      ]),
    );
    expect(lastUpdateSet).toBeNull();
  });

  it("returns a warning when the explicitly-chosen account exists but has no live token", async () => {
    existingPost = { ...existingPost, socialAccountIds: [1] };
    currentSocialAccounts = [makeActiveAccount({ id: 1, accessTokenEncrypted: null })];

    const mod = await import("../posts");
    const handler = findHandler(mod.default as any, "/posts/:id/connection-warnings", "get");

    const req = { params: { id: String(POST_ID) } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform: "facebook",
          message: expect.stringContaining("no live connection"),
        }),
      ]),
    );
    expect(lastUpdateSet).toBeNull();
  });

  it("returns an empty warnings list when all accounts are healthy", async () => {
    existingPost = { ...existingPost, socialAccountIds: [1] };
    currentSocialAccounts = [makeActiveAccount({ id: 1 })];

    const mod = await import("../posts");
    const handler = findHandler(mod.default as any, "/posts/:id/connection-warnings", "get");

    const req = { params: { id: String(POST_ID) } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ warnings: [] });
    expect(lastUpdateSet).toBeNull();
  });
});
