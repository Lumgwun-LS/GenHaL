/**
 * Guards the other half of the auto-publish failure notice's lifecycle:
 * the "autoPublishFailed" UI flag (task #101) must clear whenever a vendor
 * reschedules or cancels a schedule, not just when a retry succeeds.
 * Covers POST /posts/:id/schedule and POST /posts/:id/cancel-schedule.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.ADMIN_USER_IDS = "admin_1";

const VENDOR_ID = 10;
const POST_ID = 42;

let existingPost: Record<string, unknown>;
let connectionWarnings: Array<{ platform: string; message: string }> = [];
let lastScheduleUpdateSet: Record<string, unknown> | null = null;
let lastCancelUpdateSet: Record<string, unknown> | null = null;

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => (Array.isArray(existingPost) ? existingPost : [existingPost]),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if ("scheduledAt" in vals && vals.status === "scheduled") {
              lastScheduleUpdateSet = vals;
            }
            if (vals.status === "draft" && "scheduledAt" in vals) {
              lastCancelUpdateSet = vals;
            }
            return [{ ...existingPost, ...vals, createdAt: new Date() }];
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

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: "admin_1" }),
}));

// resolveAuthedVendor's own select for the vendor row shares the same mocked
// db as the post lookup above, so disambiguating "which select is this" isn't
// reliable here. This test authenticates as an admin (ADMIN_USER_IDS=admin_1)
// so the ownership check short-circuits on isAdmin and never depends on that
// vendor lookup's result. Ownership itself is covered by the
// vendorhub-vendor-ownership-pattern tests elsewhere — this test is only
// about whether autoPublishFailed clears on reschedule/cancel.

vi.mock("../../lib/meta", () => ({}));
vi.mock("../../lib/linkedin", () => ({}));
vi.mock("../../lib/twitter", () => ({}));
vi.mock("../../lib/token-refresh", () => ({}));
vi.mock("../../lib/post-notifications", () => ({ notifyScheduledPostFailed: vi.fn() }));

function findHandler(router: any, path: string, method: "post"): (req: any, res: any) => Promise<void> {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  return layer.route.stack[0].handle;
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.sendStatus = (code: number) => { res.statusCode = code; return res; };
  return res;
}

describe("/posts/:id/schedule and /posts/:id/cancel-schedule clear autoPublishFailed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastScheduleUpdateSet = null;
    lastCancelUpdateSet = null;
    connectionWarnings = [];
  });

  it("clears autoPublishFailed when a vendor reschedules a post that previously failed to auto-publish", async () => {
    existingPost = {
      id: POST_ID,
      vendorId: VENDOR_ID,
      caption: "Weekend flash sale",
      status: "approved",
      autoPublishFailed: true,
      platforms: ["facebook"],
      socialAccountIds: [1],
      createdAt: new Date(),
    };

    const mod = await import("../posts");
    const router = mod.default as any;
    const handler = findHandler(router, "/posts/:id/schedule", "post");

    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const req = {
      params: { id: String(POST_ID) },
      // force:true bypasses the connection-warnings precheck, which isn't
      // what this test is about (and the shared db mock can't meaningfully
      // simulate a real per-table social-accounts lookup).
      body: { scheduledAt: futureDate, force: true },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(lastScheduleUpdateSet).toMatchObject({ status: "scheduled", autoPublishFailed: false });
  });

  it("clears autoPublishFailed when a vendor cancels the schedule of a post that previously failed to auto-publish", async () => {
    existingPost = {
      id: POST_ID,
      vendorId: VENDOR_ID,
      caption: "Weekend flash sale",
      status: "scheduled",
      autoPublishFailed: true,
      platforms: ["facebook"],
      socialAccountIds: [1],
      createdAt: new Date(),
    };

    const mod = await import("../posts");
    const router = mod.default as any;
    const handler = findHandler(router, "/posts/:id/cancel-schedule", "post");

    const req = { params: { id: String(POST_ID) } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(lastCancelUpdateSet).toMatchObject({ status: "draft", scheduledAt: null, autoPublishFailed: false });
  });
});
