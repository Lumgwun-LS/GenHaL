/**
 * Tests for the bulk-retry endpoints in admin.ts:
 *   POST /admin/voice-campaigns/:cid/retry-failed  — starts a background retry
 *   GET  /admin/voice-campaigns/:cid/retry-status  — polls live progress
 *
 * Three cases:
 *  1. A second POST while status="running" returns 409.
 *  2. After the job errors, status transitions to "error" and a new POST
 *     succeeds (202), confirming the Map guard is lifted.
 *  3. The onProgress callback fires after each call and the poll endpoint
 *     reflects the live state immediately.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

process.env.ADMIN_USER_IDS = "user_admin";

// ─── Mutable state ────────────────────────────────────────────────────────────

/**
 * Rows returned by the pre-flight SELECT in the retry-failed handler.
 * Each test seeds this to control whether there are "failed" calls to retry.
 */
let failedRows: Array<{ id: number }> = [{ id: 1 }, { id: 2 }, { id: 3 }];

/**
 * Mutable implementation for retryAllFailedCampaignCalls.
 * Tests replace this to control timing (hang, error, immediate resolve).
 * The vi.mock factory below closes over this variable so each fresh module
 * import picks up whatever the test has set, without needing vi.mocked() after
 * resetModules().
 */
type ProgressFn = (state: { attempted: number; total: number; succeeded: number; failed: number }) => void;
type RetryResult = { attempted: number; succeeded: number; failed: number };

let retryImpl: (campaignId: number, onProgress?: ProgressFn) => Promise<RetryResult> = async () => ({
  attempted: 0,
  succeeded: 0,
  failed: 0,
});

// ─── Module mocks (hoisted by Vitest) ─────────────────────────────────────────

vi.mock("@clerk/express", () => ({
  getAuth: (req: Request) => ({ userId: (req.headers["x-test-user"] as string) ?? "user_admin" }),
  clerkClient: {
    users: {
      getUser: async () => ({
        firstName: "Ada",
        lastName: "Admin",
        username: null,
        primaryEmailAddress: { emailAddress: "ada@example.com" },
        emailAddresses: [{ emailAddress: "ada@example.com" }],
      }),
    },
  },
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: (_cols?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => Promise.resolve(failedRows.map((r) => ({ ...r }))),
        limit: (_n: number) => Promise.resolve([]),
        orderBy: (_col: unknown) => ({
          limit: (_n: number) => Promise.resolve([]),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve([]),
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve([]),
        }),
        onConflictDoUpdate: () => Promise.resolve(),
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  voiceCallLogsTable: {},
  voiceCampaignCallsTable: {},
  vendorsTable: {},
  voiceCampaignsTable: {},
  vendorPaymentCredentialsTable: {},
  birthdayMessageLogsTable: {},
  adminAuditLogTable: {},
  adminExportLogsTable: {},
  adminExportAcknowledgmentsTable: {},
  adminExportAcknowledgmentLogTable: {},
  adminExportBurstSentAlertsTable: {},
  voiceSignatureFailuresTable: {},
  voiceSignatureFailureAcknowledgmentsTable: {},
  voiceSignatureFailureAcknowledgmentLogTable: {},
  vendorNotificationsTable: {},
  paymentsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq:        (col: unknown, val: unknown)       => ({ eq: [col, val] }),
  and:       (...args: unknown[])               => ({ and: args }),
  or:        (...args: unknown[])               => ({ or: args }),
  desc:      (col: unknown)                     => ({ desc: col }),
  asc:       (col: unknown)                     => ({ asc: col }),
  gte:       (col: unknown, val: unknown)       => ({ gte: [col, val] }),
  lte:       (col: unknown, val: unknown)       => ({ lte: [col, val] }),
  gt:        (col: unknown, val: unknown)       => ({ gt: [col, val] }),
  lt:        (col: unknown, val: unknown)       => ({ lt: [col, val] }),
  inArray:   (col: unknown, vals: unknown[])    => ({ inArray: [col, vals] }),
  isNotNull: ()                                 => ({ isNotNull: true }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings, values }),
    { raw: (s: string) => s },
  ),
}));

// ─── Core mock — voice-campaigns ──────────────────────────────────────────────
// The factory closes over `retryImpl` (module-level mutable variable).
// Tests replace `retryImpl` before calling buildApp() so each fresh import
// of admin.ts picks up the right behaviour without needing vi.mocked().

vi.mock("../voice-campaigns", () => ({
  retryCampaignCall: async () => ({ ok: true }),
  retryAllFailedCampaignCalls: (campaignId: number, onProgress?: ProgressFn) =>
    retryImpl(campaignId, onProgress),
}));

// ─── Side-dependency no-ops ────────────────────────────────────────────────────

vi.mock("../../lib/voice-caller",      () => ({ isTwilioConfigured: () => true }));
vi.mock("../../lib/vendor-keys",       () => ({ canAddPaymentKeys: () => false }));
vi.mock("../../lib/birthday-scheduler", () => ({
  resendBirthdayEmail: async () => ({ ok: true }),
  retryBirthdayCall:   async () => ({ ok: true }),
}));
vi.mock("../../lib/slack",       () => ({ sendSlackAlert: async () => {} }));
vi.mock("../../lib/sales-sync",  () => ({ syncSaleFromPayment: async () => {} }));
vi.mock("../../lib/push",        () => ({
  notifyVendorPaymentStatus: async () => {},
  sendPushToVendor:          async () => {},
}));
vi.mock("../../lib/mailer",      () => ({ sendEmail: async () => {} }));
vi.mock("../../lib/email-branding", () => ({
  wrapVendorEmail: (x: { bodyHtml: string }) => x.bodyHtml,
  escapeHtml:      (s: string) => s,
}));
vi.mock("../../lib/site-content", () => ({
  getSiteContent:           async () => ({}),
  getSiteContentBlock:      async () => null,
  setSiteContentBlock:      async () => {},
  getSiteContentAuditLog:   async () => [],
  validateSiteContentBlock: (_key: string, v: unknown) => v,
  SITE_CONTENT_KEYS: [],
}));
vi.mock("../../lib/voice-backfill", () => ({
  runVoiceBackfill:            async () => ({ checked: 0, updated: 0, failed: 0 }),
  getVoiceBackfillLastRun:     async () => null,
  getVoiceBackfillRecentFixes: async () => [],
}));
vi.mock("../../lib/job-run-status", () => ({ recordJobRun: async () => {} }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildApp() {
  vi.resetModules();
  const { default: router } = await import("../admin");
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use((_err: unknown, _req: Request, res: Response, _next: (e?: unknown) => void) => {
    res.status(500).json({ error: "Internal error" });
  });
  return app;
}

function callApp(
  app: express.Express,
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      fetch(`http://localhost:${addr.port}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(opts.headers ?? {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      })
        .then(async (res) => {
          const text = await res.text();
          let body: unknown = null;
          try { body = JSON.parse(text); } catch { body = null; }
          server.close();
          resolve({ status: res.status, body });
        })
        .catch((err) => { server.close(); reject(err); });
    });
  });
}

/** Returns a promise that never resolves (simulates a hanging retry job). */
function neverResolves(): Promise<RetryResult> {
  return new Promise(() => { /* intentionally hangs */ });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const CID = 42;
const RETRY_FAILED = `/admin/voice-campaigns/${CID}/retry-failed`;
const RETRY_STATUS = `/admin/voice-campaigns/${CID}/retry-status`;

describe("POST /admin/voice-campaigns/:cid/retry-failed — double-start prevention", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    failedRows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    // Default: hang forever so we can observe the running state.
    retryImpl = () => neverResolves();
    app = await buildApp();
  });

  it("returns 202 with status=running on the first POST", async () => {
    const { status, body } = await callApp(app, "POST", RETRY_FAILED);

    expect(status).toBe(202);
    const b = body as Record<string, unknown>;
    expect(b.status).toBe("running");
    expect(b.total).toBe(3);
    expect(b.attempted).toBe(0);
    expect(b.succeeded).toBe(0);
    expect(b.failed).toBe(0);
  });

  it("returns 409 when a second POST is issued while the first is running", async () => {
    // First POST starts the job (job never resolves → stays "running")
    const first = await callApp(app, "POST", RETRY_FAILED);
    expect(first.status).toBe(202);

    // Second POST to the same campaign while still running
    const second = await callApp(app, "POST", RETRY_FAILED);
    expect(second.status).toBe(409);

    const b = second.body as Record<string, unknown>;
    expect(b.error).toMatch(/already running/i);
    // The 409 body should echo the current running state
    expect(b.status).toBe("running");
  });

  it("returns 400 when there are no failed calls to retry", async () => {
    failedRows = []; // no failed calls
    // Rebuild app so it picks up the updated failedRows state
    app = await buildApp();

    const { status, body } = await callApp(app, "POST", RETRY_FAILED);
    expect(status).toBe(400);
    expect((body as Record<string, unknown>).error).toMatch(/no failed calls/i);
  });

  it("returns 401 for an unauthenticated request", async () => {
    const { status } = await callApp(app, "POST", RETRY_FAILED, {
      headers: { "x-test-user": "" },
    });
    expect(status).toBe(401);
  });

  it("returns 403 for a non-admin user", async () => {
    const { status } = await callApp(app, "POST", RETRY_FAILED, {
      headers: { "x-test-user": "user_regular" },
    });
    expect(status).toBe(403);
  });
});

describe("POST retry-failed — error recovery (Map guard is lifted after error)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    failedRows = [{ id: 10 }, { id: 11 }];
    app = await buildApp();
  });

  it("transitions to status=error when the job throws, then allows a new POST to succeed", async () => {
    // Set up an impl that rejects immediately.
    let rejectRetry!: (err: Error) => void;
    retryImpl = () =>
      new Promise<RetryResult>((_res, rej) => {
        rejectRetry = rej;
      });
    app = await buildApp();

    // Start the first retry job
    const first = await callApp(app, "POST", RETRY_FAILED);
    expect(first.status).toBe(202);

    // While running, a second POST is rejected.
    const concurrent = await callApp(app, "POST", RETRY_FAILED);
    expect(concurrent.status).toBe(409);

    // Simulate the background job throwing.
    rejectRetry(new Error("Twilio exploded"));

    // Allow microtask queue to flush so the .catch() handler in admin.ts can
    // update the Map before we poll.
    await new Promise((r) => setTimeout(r, 20));

    // Poll the status endpoint — should now be "error".
    const pollAfterError = await callApp(app, "GET", RETRY_STATUS);
    expect(pollAfterError.status).toBe(200);
    const s = pollAfterError.body as Record<string, unknown>;
    expect(s.status).toBe("error");
    expect(typeof s.error).toBe("string");

    // Now a fresh POST should succeed (202) because the guard has been lifted.
    // Wire a new impl that resolves immediately.
    retryImpl = async () => ({ attempted: 2, succeeded: 2, failed: 0 });
    // We must rebuild the app so the module picks up the new retryImpl via the
    // mock factory — but the retryJobs Map also resets, which is fine for this
    // scenario (server restart → clean slate). To test against the same Map
    // state, we keep the app instance and rely on the closure-based retryImpl.
    // Admin.ts calls retryImpl through the mock, so updating retryImpl is enough.
    const retry = await callApp(app, "POST", RETRY_FAILED);
    expect(retry.status).toBe(202);
    const rb = retry.body as Record<string, unknown>;
    expect(rb.status).toBe("running");
  });

  it("sets status=error (not status=running) so the guard is always lifted on catch", async () => {
    // This confirms the catch path in admin.ts sets { status: "error" }, not
    // { status: "running" } — which would permanently lock retries.
    let rejectRetry!: (err: Error) => void;
    retryImpl = () =>
      new Promise<RetryResult>((_res, rej) => {
        rejectRetry = rej;
      });
    app = await buildApp();

    await callApp(app, "POST", RETRY_FAILED);

    rejectRetry(new Error("DB timeout"));
    await new Promise((r) => setTimeout(r, 20));

    const { body } = await callApp(app, "GET", RETRY_STATUS);
    expect((body as Record<string, unknown>).status).toBe("error");

    // Second POST must not be 409
    retryImpl = () => neverResolves();
    const second = await callApp(app, "POST", RETRY_FAILED);
    expect(second.status).not.toBe(409);
    expect(second.status).toBe(202);
  });
});

describe("GET /admin/voice-campaigns/:cid/retry-status — progress polling", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    failedRows = [{ id: 20 }, { id: 21 }, { id: 22 }];
    app = await buildApp();
  });

  it("returns status=idle before any retry has been started", async () => {
    const { status, body } = await callApp(app, "GET", RETRY_STATUS);
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).status).toBe("idle");
  });

  it("reflects progress updates fired by the onProgress callback", async () => {
    // The mock calls onProgress twice then resolves, simulating a 3-call
    // campaign where the first two are attempted before the loop ends.
    let capturedProgress: ProgressFn | undefined;
    let resolveRetry!: (r: RetryResult) => void;
    retryImpl = (_cid, onProgress) => {
      capturedProgress = onProgress;
      return new Promise<RetryResult>((res) => { resolveRetry = res; });
    };
    app = await buildApp();

    // Start the retry
    const start = await callApp(app, "POST", RETRY_FAILED);
    expect(start.status).toBe(202);

    // Poll immediately — should be "running" with attempted=0
    const poll0 = await callApp(app, "GET", RETRY_STATUS);
    const s0 = poll0.body as Record<string, unknown>;
    expect(s0.status).toBe("running");
    expect(s0.attempted).toBe(0);

    // Simulate the first call completing (succeeded)
    capturedProgress?.({ attempted: 1, total: 3, succeeded: 1, failed: 0 });
    await new Promise((r) => setTimeout(r, 5));

    const poll1 = await callApp(app, "GET", RETRY_STATUS);
    const s1 = poll1.body as Record<string, unknown>;
    expect(s1.status).toBe("running");
    expect(s1.attempted).toBe(1);
    expect(s1.succeeded).toBe(1);
    expect(s1.failed).toBe(0);

    // Simulate the second call completing (failed)
    capturedProgress?.({ attempted: 2, total: 3, succeeded: 1, failed: 1 });
    await new Promise((r) => setTimeout(r, 5));

    const poll2 = await callApp(app, "GET", RETRY_STATUS);
    const s2 = poll2.body as Record<string, unknown>;
    expect(s2.status).toBe("running");
    expect(s2.attempted).toBe(2);
    expect(s2.succeeded).toBe(1);
    expect(s2.failed).toBe(1);

    // Resolve the job — status should flip to "done"
    resolveRetry({ attempted: 3, succeeded: 2, failed: 1 });
    await new Promise((r) => setTimeout(r, 20));

    const pollDone = await callApp(app, "GET", RETRY_STATUS);
    const sd = pollDone.body as Record<string, unknown>;
    expect(sd.status).toBe("done");
    expect(sd.attempted).toBe(3);
    expect(sd.succeeded).toBe(2);
    expect(sd.failed).toBe(1);
  });

  it("returns 401 for unauthenticated requests to the poll endpoint", async () => {
    const { status } = await callApp(app, "GET", RETRY_STATUS, {
      headers: { "x-test-user": "" },
    });
    expect(status).toBe(401);
  });

  it("returns 403 for non-admin requests to the poll endpoint", async () => {
    const { status } = await callApp(app, "GET", RETRY_STATUS, {
      headers: { "x-test-user": "user_regular" },
    });
    expect(status).toBe(403);
  });

  it("returns status=done with full tally after the job completes without error", async () => {
    retryImpl = async (_cid, onProgress) => {
      onProgress?.({ attempted: 1, total: 3, succeeded: 1, failed: 0 });
      onProgress?.({ attempted: 2, total: 3, succeeded: 2, failed: 0 });
      onProgress?.({ attempted: 3, total: 3, succeeded: 2, failed: 1 });
      return { attempted: 3, succeeded: 2, failed: 1 };
    };
    app = await buildApp();

    await callApp(app, "POST", RETRY_FAILED);
    // Allow the microtask queue to fully drain
    await new Promise((r) => setTimeout(r, 30));

    const { body } = await callApp(app, "GET", RETRY_STATUS);
    const b = body as Record<string, unknown>;
    expect(b.status).toBe("done");
    expect(b.attempted).toBe(3);
    expect(b.succeeded).toBe(2);
    expect(b.failed).toBe(1);
  });
});
