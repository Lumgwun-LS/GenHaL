/**
 * Integration tests for the voice-backfill admin routes:
 *   GET  /admin/voice-backfill       — returns last-run stats + recentFixes
 *   POST /admin/voice-backfill/run   — triggers an on-demand reconciliation pass
 *
 * Two test suites:
 *
 * 1. Shape tests: voice-backfill module is mocked; only the route's glue code
 *    (auth, response assembly) is verified.
 *
 * 2. End-to-end tests: the REAL runVoiceBackfill / getVoiceBackfillRecentFixes
 *    implementations run; only their external dependencies (DB, Twilio
 *    fetchCallStatus, site-content, job-run-status) are mocked.
 *    These confirm that a stuck call seeded into the mock DB surfaces in both
 *    the DB update log and the recentFixes list returned by GET.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

process.env.ADMIN_USER_IDS = "user_admin";

// ─── Shared mutable state ─────────────────────────────────────────────────────

/** Rows returned by SELECT from voiceCallLogsTable (controlled per-test). */
let logRows: Array<{ callSid: string; status: string; vendorId: number | null; campaignId: number | null }> = [];
/** Rows returned by SELECT from voiceCampaignCallsTable (controlled per-test). */
let campaignRows: Array<{ callSid: string; status: string; campaignId: number | null }> = [];

/** Accumulates every DB update call so tests can assert what got written. */
const dbUpdates: Array<{ table: string; callSid: string; status: string }> = [];

/** Simulates the site-content KV store (persists across calls within a test). */
const siteContent = new Map<string, unknown>();

/** Twilio snapshot returned by fetchCallStatus (per callSid). */
const callStatuses = new Map<string, { status: string; durationSeconds?: number } | null>();

// ─── Sentinel table references ────────────────────────────────────────────────
// These are arbitrary values — the DB mock distinguishes tables by reference
// equality, so the schema mock just needs to export the same object the DB
// mock checks against.

const LOG_TABLE = "LOG_TABLE";
const CAMPAIGN_TABLE = "CAMPAIGN_TABLE";
const VENDORS_TABLE = "VENDORS_TABLE";
const VOICE_CAMPAIGNS_TABLE = "VOICE_CAMPAIGNS_TABLE";

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
      from: (table: unknown) => ({
        where: (_cond: unknown) => {
          if (table === LOG_TABLE) {
            return Promise.resolve(logRows.map((r) => ({ ...r })));
          }
          if (table === CAMPAIGN_TABLE) {
            return Promise.resolve(campaignRows.map((r) => ({ ...r })));
          }
          // vendorsTable / voiceCampaignsTable name look-ups — no rows needed
          return Promise.resolve([]);
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: (whereClause: unknown) => {
          // whereClause is the result of eq(table.callSid, sid).
          // Our drizzle-orm mock (see below) returns { eq: [col, val] }.
          const clause = whereClause as { eq?: [unknown, string] };
          const sid = clause?.eq?.[1] ?? "unknown";
          const tableName = table === LOG_TABLE ? "log" : table === CAMPAIGN_TABLE ? "campaign" : "unknown";
          dbUpdates.push({ table: tableName, callSid: String(sid), status: String(vals.status) });
          return Promise.resolve();
        },
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  voiceCallLogsTable: LOG_TABLE,
  voiceCampaignCallsTable: CAMPAIGN_TABLE,
  vendorsTable: VENDORS_TABLE,
  voiceCampaignsTable: VOICE_CAMPAIGNS_TABLE,
  // The following are only referenced at module-import time by admin.ts
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
  eq:      (col: unknown, val: unknown) => ({ eq: [col, val] }),
  and:     (...args: unknown[])         => ({ and: args }),
  or:      (...args: unknown[])         => ({ or: args }),
  desc:    (col: unknown)               => ({ desc: col }),
  asc:     (col: unknown)               => ({ asc: col }),
  gte:     (col: unknown, val: unknown) => ({ gte: [col, val] }),
  lte:     (col: unknown, val: unknown) => ({ lte: [col, val] }),
  gt:      (col: unknown, val: unknown) => ({ gt: [col, val] }),
  lt:      (col: unknown, val: unknown) => ({ lt: [col, val] }),
  inArray: (col: unknown, vals: unknown[]) => ({ inArray: [col, vals] }),
  isNotNull: () => ({ isNotNull: true }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings, values }),
    { raw: (s: string) => s },
  ),
}));

vi.mock("../../lib/voice-caller", () => ({
  isTwilioConfigured: () => true,
  fetchCallStatus: (callSid: string) =>
    Promise.resolve(callStatuses.get(callSid) ?? null),
}));

vi.mock("../../lib/site-content", () => ({
  getSiteContent:         async () => ({}),
  getSiteContentBlock:    async (key: string) =>
    siteContent.has(key) ? siteContent.get(key) : (key === "admin.voiceBackfillRecentFixes" ? [] : null),
  setSiteContentBlock:    async (key: string, value: unknown) => { siteContent.set(key, value); },
  getSiteContentAuditLog: async () => [],
  validateSiteContentBlock: (_key: string, v: unknown) => v,
  SITE_CONTENT_KEYS: [],
}));

vi.mock("../../lib/job-run-status", () => ({
  recordJobRun: async () => {},
}));

// Admin.ts side-dependencies not under test — wire as no-ops.
vi.mock("../../lib/vendor-keys",      () => ({ canAddPaymentKeys: () => false }));
vi.mock("../../lib/birthday-scheduler", () => ({
  resendBirthdayEmail: async () => ({ ok: true }),
  retryBirthdayCall:   async () => ({ ok: true }),
}));
vi.mock("../voice-campaigns", () => ({
  retryCampaignCall:           async () => ({ ok: true }),
  retryAllFailedCampaignCalls: async () => ({ ok: true }),
}));
vi.mock("../../lib/slack",      () => ({ sendSlackAlert: async () => {} }));
vi.mock("../../lib/sales-sync", () => ({ syncSaleFromPayment: async () => {} }));
vi.mock("../../lib/push",       () => ({ notifyVendorPaymentStatus: async () => {} }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildApp() {
  vi.resetModules();
  const { default: router } = await import("../admin");
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use((err: unknown, _req: Request, res: Response, _next: (e?: unknown) => void) => {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /admin/voice-backfill — route shape and auth", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    logRows = [];
    campaignRows = [];
    dbUpdates.length = 0;
    siteContent.clear();
    callStatuses.clear();
    app = await buildApp();
  });

  it("returns 200 with a recentFixes array for an admin user (empty when no runs have happened)", async () => {
    const { status, body } = await callApp(app, "GET", "/admin/voice-backfill");

    expect(status).toBe(200);
    expect(body).toHaveProperty("recentFixes");
    expect(Array.isArray((body as Record<string, unknown>).recentFixes)).toBe(true);
  });

  it("includes previously stored recentFixes in the GET response", async () => {
    const fix = {
      ranAt: "2026-07-01T00:00:00.000Z",
      callSid: "CA_STORED",
      fromStatus: "in-progress",
      toStatus: "completed",
      vendorId: null,
      vendorName: null,
      campaignId: null,
      campaignName: null,
    };
    siteContent.set("admin.voiceBackfillRecentFixes", [fix]);
    siteContent.set("admin.voiceBackfillLastRun", {
      ranAt: fix.ranAt,
      triggeredBy: "system",
      checked: 1,
      updated: 1,
      failed: 0,
    });

    const { status, body } = await callApp(app, "GET", "/admin/voice-backfill");
    const b = body as Record<string, unknown>;

    expect(status).toBe(200);
    expect(Array.isArray(b.recentFixes)).toBe(true);
    const fixes = b.recentFixes as typeof fix[];
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({ callSid: "CA_STORED", fromStatus: "in-progress", toStatus: "completed" });
  });

  it("returns 401 when no userId is present", async () => {
    const { status } = await callApp(app, "GET", "/admin/voice-backfill", {
      headers: { "x-test-user": "" },
    });
    // getAuth returns { userId: "" } which is falsy — route sends 401
    expect(status).toBe(401);
  });

  it("returns 403 for a non-admin user", async () => {
    const { status, body } = await callApp(app, "GET", "/admin/voice-backfill", {
      headers: { "x-test-user": "user_regular" },
    });
    expect(status).toBe(403);
    expect((body as Record<string, unknown>).error).toMatch(/admin/i);
  });
});

describe("POST /admin/voice-backfill/run — end-to-end with real backfill logic", () => {
  /**
   * These tests intentionally do NOT mock ../../lib/voice-backfill.
   * The real runVoiceBackfill implementation runs, only its external
   * dependencies (DB, Twilio, site-content, job-run-status) are mocked.
   */
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    logRows = [];
    campaignRows = [];
    dbUpdates.length = 0;
    siteContent.clear();
    callStatuses.clear();
    app = await buildApp();
  });

  it("reconciles a stuck log call: DB is updated and GET returns the fix in recentFixes", async () => {
    // Seed a call that has been stuck in "in-progress" since the epoch
    // (well past the 15-minute stuck threshold).
    logRows = [
      { callSid: "CA_STUCK_001", status: "in-progress", vendorId: 1, campaignId: null },
    ];
    // Twilio says it actually completed
    callStatuses.set("CA_STUCK_001", { status: "completed", durationSeconds: 30 });

    // Trigger the on-demand backfill pass
    const runRes = await callApp(app, "POST", "/admin/voice-backfill/run");

    expect(runRes.status).toBe(200);
    const runBody = runRes.body as Record<string, unknown>;
    expect(runBody.checked).toBe(1);
    expect(runBody.updated).toBe(1);
    expect(runBody.failed).toBe(0);

    // The log table row should have been updated in the mock DB
    const logUpdate = dbUpdates.find((u) => u.table === "log" && u.callSid === "CA_STUCK_001");
    expect(logUpdate).toBeDefined();
    expect(logUpdate!.status).toBe("completed");

    // Now confirm GET /admin/voice-backfill returns recentFixes with this fix
    const getRes = await callApp(app, "GET", "/admin/voice-backfill");
    expect(getRes.status).toBe(200);
    const getBody = getRes.body as Record<string, unknown>;
    expect(Array.isArray(getBody.recentFixes)).toBe(true);

    const fixes = getBody.recentFixes as Array<Record<string, unknown>>;
    expect(fixes.length).toBeGreaterThanOrEqual(1);
    const fix = fixes.find((f) => f.callSid === "CA_STUCK_001");
    expect(fix).toBeDefined();
    expect(fix!.fromStatus).toBe("in-progress");
    expect(fix!.toStatus).toBe("completed");
  });

  it("reconciles a stuck campaign call: both tables are updated and the fix appears in recentFixes", async () => {
    // Same callSid present in both tables (typical for campaign calls)
    const callSid = "CA_CAMPAIGN_002";
    logRows = [
      { callSid, status: "queued", vendorId: 2, campaignId: 7 },
    ];
    campaignRows = [
      { callSid, status: "queued", campaignId: 7 },
    ];
    callStatuses.set(callSid, { status: "failed" });

    const runRes = await callApp(app, "POST", "/admin/voice-backfill/run");
    expect(runRes.status).toBe(200);
    const runBody = runRes.body as Record<string, unknown>;
    expect(runBody.updated).toBe(1);

    // Both the log and campaign rows should be updated
    const logUpdate = dbUpdates.find((u) => u.table === "log" && u.callSid === callSid);
    const campaignUpdate = dbUpdates.find((u) => u.table === "campaign" && u.callSid === callSid);
    expect(logUpdate).toBeDefined();
    expect(logUpdate!.status).toBe("failed");
    expect(campaignUpdate).toBeDefined();
    expect(campaignUpdate!.status).toBe("failed");

    // GET should return the fix
    const getRes = await callApp(app, "GET", "/admin/voice-backfill");
    const getBody = getRes.body as Record<string, unknown>;
    const fixes = getBody.recentFixes as Array<Record<string, unknown>>;
    const fix = fixes.find((f) => f.callSid === callSid);
    expect(fix).toBeDefined();
    expect(fix!.fromStatus).toBe("queued");
    expect(fix!.toStatus).toBe("failed");
  });

  it("does not record a fix when Twilio reports the call is still genuinely in progress", async () => {
    logRows = [
      { callSid: "CA_STILL_LIVE", status: "in-progress", vendorId: null, campaignId: null },
    ];
    callStatuses.set("CA_STILL_LIVE", { status: "in-progress" });

    const runRes = await callApp(app, "POST", "/admin/voice-backfill/run");
    expect(runRes.status).toBe(200);
    const runBody = runRes.body as Record<string, unknown>;
    expect(runBody.checked).toBe(1);
    expect(runBody.updated).toBe(0);

    // No DB updates should have happened
    expect(dbUpdates).toHaveLength(0);

    // GET should return an empty recentFixes list
    const getRes = await callApp(app, "GET", "/admin/voice-backfill");
    const getBody = getRes.body as Record<string, unknown>;
    expect((getBody.recentFixes as unknown[]).length).toBe(0);
  });

  it("accumulates multiple fixes across runs, newest first, and caps the list at 50", async () => {
    // Pre-populate siteContent with 50 old fixes (simulating prior runs)
    const oldFixes = Array.from({ length: 50 }, (_, i) => ({
      ranAt: "2026-01-01T00:00:00.000Z",
      callSid: `CA_OLD_${i}`,
      fromStatus: "queued",
      toStatus: "completed",
      vendorId: null,
      vendorName: null,
      campaignId: null,
      campaignName: null,
    }));
    siteContent.set("admin.voiceBackfillRecentFixes", oldFixes);

    // Run again with one new stuck call
    logRows = [
      { callSid: "CA_NEW_001", status: "ringing", vendorId: null, campaignId: null },
    ];
    callStatuses.set("CA_NEW_001", { status: "completed" });

    await callApp(app, "POST", "/admin/voice-backfill/run");

    const getRes = await callApp(app, "GET", "/admin/voice-backfill");
    const getBody = getRes.body as Record<string, unknown>;
    const fixes = getBody.recentFixes as Array<Record<string, unknown>>;

    // Cap at 50
    expect(fixes).toHaveLength(50);
    // Newest fix is first
    expect(fixes[0]!.callSid).toBe("CA_NEW_001");
    expect(fixes[0]!.fromStatus).toBe("ringing");
    expect(fixes[0]!.toStatus).toBe("completed");
  });

  it("POST /admin/voice-backfill/run returns 403 for non-admin users", async () => {
    const { status } = await callApp(app, "POST", "/admin/voice-backfill/run", {
      headers: { "x-test-user": "user_regular" },
    });
    expect(status).toBe(403);
  });
});
