/**
 * Tests for the site-content threshold change history:
 *   PATCH /admin/site-content/:key  →  writes an audit row via setSiteContentBlock
 *   GET   /admin/site-content/:key/history  →  returns rows newest-first
 *
 * Coverage:
 *  1. PATCH resolves the admin's display name and passes it to setSiteContentBlock
 *  2. GET history returns pre-existing entries for the key
 *  3. GET history rejects an unknown content key with 400
 *  4. Non-admins are rejected from both routes (403)
 *  5. PATCH to voiceSignatureFailureAlertSettings → GET history returns the row
 *     with the correct adminUserId, oldValue, and newValue (no prior edits)
 *  6. A second PATCH → GET history returns both rows ordered newest-first
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

process.env.ADMIN_USER_IDS = "user_admin";

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

vi.mock("@workspace/db", () => ({ db: {} }));

vi.mock("@workspace/db/schema", () => ({
  vendorsTable: {},
  vendorPaymentCredentialsTable: {},
  birthdayMessageLogsTable: {},
  voiceCallLogsTable: {},
  adminAuditLogTable: {},
  adminExportLogsTable: {},
  adminExportAcknowledgmentsTable: {},
  adminExportAcknowledgmentLogTable: {},
  adminExportBurstSentAlertsTable: {},
  voiceCampaignsTable: {},
  voiceCampaignCallsTable: {},
  voiceSignatureFailuresTable: {},
  voiceSignatureFailureAcknowledgmentsTable: {},
  voiceSignatureFailureAcknowledgmentLogTable: {},
  vendorNotificationsTable: {},
  paymentsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  desc: (col: unknown) => ({ desc: col }),
  and: (...args: unknown[]) => ({ and: args }),
  gte: (col: unknown, val: unknown) => ({ gte: [col, val] }),
  lte: (col: unknown, val: unknown) => ({ lte: [col, val] }),
  gt: (col: unknown, val: unknown) => ({ gt: [col, val] }),
  asc: (col: unknown) => ({ asc: col }),
  inArray: (col: unknown, vals: unknown[]) => ({ inArray: [col, vals] }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings, values }),
    { raw: (s: string) => s },
  ),
}));

vi.mock("../../lib/voice-caller", () => ({ isTwilioConfigured: () => true }));
vi.mock("../../lib/vendor-keys", () => ({ canAddPaymentKeys: () => false }));
vi.mock("../../lib/birthday-scheduler", () => ({
  resendBirthdayEmail: async () => ({ ok: true }),
  retryBirthdayCall: async () => ({ ok: true }),
}));
vi.mock("../voice-campaigns", () => ({
  retryCampaignCall: async () => ({ ok: true }),
  retryAllFailedCampaignCalls: async () => ({ attempted: 0, succeeded: 0, failed: 0 }),
}));
vi.mock("../../lib/slack", () => ({ sendSlackAlert: async () => {} }));
vi.mock("../../lib/voice-backfill", () => ({
  runVoiceBackfill: async () => ({}),
  getVoiceBackfillLastRun: async () => ({}),
  getVoiceBackfillRecentFixes: async () => [],
}));
vi.mock("../../lib/sales-sync", () => ({ syncSaleFromPayment: async () => {} }));
vi.mock("../../lib/push", () => ({ notifyVendorPaymentStatus: async () => {} }));

// ─── In-memory audit log ──────────────────────────────────────────────────────
// setSiteContentBlock appends a row so the GET-history mock can return it.

type AuditRow = {
  id: number;
  contentKey: string;
  adminUserId: string;
  adminDisplayName: string | null;
  oldValue: string;
  newValue: string;
  changedAt: string;
};

let auditHistory: AuditRow[] = [];
let nextAuditId = 1;

// Per-key "current value" store so getSiteContentBlock returns the right prior
// value on a second PATCH call, matching real setSiteContentBlock behaviour.
const currentValues: Record<string, unknown> = {};

const VOICE_KEY = "admin.voiceSignatureFailureAlertSettings";
const EXPORT_KEY = "admin.exportAlertSettings";
const DEFAULT_VOICE = { threshold: 3, windowMinutes: 10 };
const DEFAULT_EXPORT = { threshold: 5, windowMinutes: 15 };

vi.mock("../../lib/site-content", () => ({
  getSiteContent: async () => ({}),
  getSiteContentBlock: async (key: string) => {
    if (key in currentValues) return currentValues[key];
    if (key === VOICE_KEY) return DEFAULT_VOICE;
    if (key === EXPORT_KEY) return DEFAULT_EXPORT;
    return null;
  },
  setSiteContentBlock: async (
    key: string,
    value: unknown,
    updatedBy: string,
    updatedByDisplayName: string | null = null,
  ) => {
    // Capture the old value before updating.
    const oldValue =
      key in currentValues
        ? currentValues[key]
        : key === VOICE_KEY
          ? DEFAULT_VOICE
          : DEFAULT_EXPORT;

    // Persist new value so a subsequent getSiteContentBlock sees it.
    currentValues[key] = value;

    // Append to in-memory audit log (newest-first order is maintained by
    // getSiteContentAuditLog's filter+sort below).
    auditHistory.push({
      id: nextAuditId++,
      contentKey: key,
      adminUserId: updatedBy,
      adminDisplayName: updatedByDisplayName,
      oldValue: JSON.stringify(oldValue),
      newValue: JSON.stringify(value),
      changedAt: new Date().toISOString(),
    });
  },
  getSiteContentAuditLog: async (key: string) =>
    auditHistory
      .filter((e) => e.contentKey === key)
      .slice()
      .sort((a, b) => (a.changedAt > b.changedAt ? -1 : 1)),
  validateSiteContentBlock: (_key: string, v: unknown) => v,
  SITE_CONTENT_KEYS: [EXPORT_KEY, VOICE_KEY],
}));

// ─── App factory ──────────────────────────────────────────────────────────────

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
  opts: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: any }> {
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
          let json: any = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          server.close();
          resolve({ status: res.status, body: json });
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("admin site-content history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditHistory = [];
    nextAuditId = 1;
    // Reset current-value store so each test starts from defaults.
    for (const k of Object.keys(currentValues)) delete currentValues[k];
  });

  // ── Existing coverage ──────────────────────────────────────────────────────

  it("PATCH resolves the admin's display name and passes it through to setSiteContentBlock", async () => {
    const app = await buildApp();
    const { status, body } = await callApp(app, "PATCH", `/admin/site-content/${EXPORT_KEY}`, {
      body: { value: { threshold: 10, windowMinutes: 30 } },
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(auditHistory).toHaveLength(1);
    expect(auditHistory[0]).toMatchObject({
      contentKey: EXPORT_KEY,
      adminUserId: "user_admin",
      adminDisplayName: "Ada Admin",
    });
  });

  it("GET history returns pre-existing entries for the key", async () => {
    auditHistory = [
      {
        id: 1,
        contentKey: EXPORT_KEY,
        adminUserId: "user_admin",
        adminDisplayName: "Ada Admin",
        oldValue: JSON.stringify({ threshold: 5, windowMinutes: 15 }),
        newValue: JSON.stringify({ threshold: 10, windowMinutes: 30 }),
        changedAt: "2026-07-14T00:00:00.000Z",
      },
    ];
    const app = await buildApp();
    const { status, body } = await callApp(app, "GET", `/admin/site-content/${EXPORT_KEY}/history`);
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ adminDisplayName: "Ada Admin" });
  });

  it("GET history rejects an unknown content key with 400", async () => {
    const app = await buildApp();
    const { status, body } = await callApp(app, "GET", "/admin/site-content/bogus.key/history");
    expect(status).toBe(400);
    expect(body.error).toMatch(/Unknown content key/);
  });

  it("rejects non-admins from both routes with 403", async () => {
    const app = await buildApp();
    const { status } = await callApp(
      app,
      "GET",
      `/admin/site-content/${EXPORT_KEY}/history`,
      { headers: { "x-test-user": "user_someone_else" } },
    );
    expect(status).toBe(403);
  });

  // ── Task-specific coverage: voiceSignatureFailureAlertSettings ────────────

  it("PATCH voiceSignatureFailureAlertSettings with no prior edits → GET history returns exactly one row with correct adminUserId, oldValue, and newValue", async () => {
    const app = await buildApp();

    // Write the first change — no prior DB row exists.
    const patch = await callApp(app, "PATCH", `/admin/site-content/${VOICE_KEY}`, {
      body: { value: { threshold: 7, windowMinutes: 20 } },
    });
    expect(patch.status).toBe(200);
    expect(patch.body.success).toBe(true);

    // Read the history immediately after.
    const get = await callApp(app, "GET", `/admin/site-content/${VOICE_KEY}/history`);
    expect(get.status).toBe(200);

    expect(get.body).toHaveLength(1);
    const [row] = get.body;

    expect(row.adminUserId).toBe("user_admin");

    // oldValue must reflect the default (no prior edit exists).
    expect(JSON.parse(row.oldValue)).toEqual(DEFAULT_VOICE);

    // newValue must match what we sent.
    expect(JSON.parse(row.newValue)).toEqual({ threshold: 7, windowMinutes: 20 });
  });

  it("a second PATCH → GET history returns both rows ordered newest-first", async () => {
    const app = await buildApp();

    // First edit.
    await callApp(app, "PATCH", `/admin/site-content/${VOICE_KEY}`, {
      body: { value: { threshold: 7, windowMinutes: 20 } },
    });

    // Small delay so changedAt timestamps are strictly ordered.
    await new Promise((r) => setTimeout(r, 5));

    // Second edit.
    const patch2 = await callApp(app, "PATCH", `/admin/site-content/${VOICE_KEY}`, {
      body: { value: { threshold: 12, windowMinutes: 30 } },
    });
    expect(patch2.status).toBe(200);

    // Read history.
    const get = await callApp(app, "GET", `/admin/site-content/${VOICE_KEY}/history`);
    expect(get.status).toBe(200);

    expect(get.body).toHaveLength(2);

    const [newest, older] = get.body;

    // Newest row: second edit.
    expect(newest.adminUserId).toBe("user_admin");
    expect(JSON.parse(newest.oldValue)).toEqual({ threshold: 7, windowMinutes: 20 });
    expect(JSON.parse(newest.newValue)).toEqual({ threshold: 12, windowMinutes: 30 });

    // Older row: first edit.
    expect(older.adminUserId).toBe("user_admin");
    expect(JSON.parse(older.oldValue)).toEqual(DEFAULT_VOICE);
    expect(JSON.parse(older.newValue)).toEqual({ threshold: 7, windowMinutes: 20 });

    // Confirm newest-first ordering.
    expect(newest.changedAt >= older.changedAt).toBe(true);
  });
});
