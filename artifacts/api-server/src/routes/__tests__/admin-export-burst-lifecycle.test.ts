/**
 * Tests for the export-burst banner lifecycle:
 *  1. Below threshold → not blocked
 *  2. At/above threshold → blocked
 *  3. Acknowledge → clears the block
 *  4. Fresh burst after acknowledgment → re-blocks
 *  5. Old ack before crossing export does NOT clear
 *
 * Status is probed via GET /admin/vendors/export:
 *   - 429 → blocked (burst banner should show)
 *   - non-429 → not blocked (banner should be hidden)
 *
 * Clearing is exercised via POST /admin/export-alerts/:adminUserId/acknowledge,
 * which requires a *different* admin (self-acknowledge is rejected with 403).
 *
 * Covers:
 *  GET  /admin/vendors/export         (burst guard)
 *  POST /admin/export-alerts/:adminUserId/acknowledge
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

// Two admins: user_flagged is the one being tracked; user_reviewer clears the flag.
process.env.ADMIN_USER_IDS = "user_flagged,user_reviewer";

// ─── Module-level state controlled by each test ───────────────────────────────

/** Exports returned by the SELECT on adminExportLogsTable, ordered desc. */
let recentExports: Array<{ exportedAt: Date }> = [];

/** The current singleton acknowledgment row (null = never acknowledged). */
let ackRow: { adminUserId: string; acknowledgedAt: Date; acknowledgedBy: string } | null = null;

/** Append-only acknowledgment log. */
let logRows: Array<Record<string, unknown>> = [];
let nextLogId = 1;

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@clerk/express", () => ({
  getAuth: (req: Request) => ({ userId: (req.headers["x-test-user"] as string) ?? "user_flagged" }),
  clerkClient: {
    users: {
      getUser: async () => ({
        firstName: "Rev",
        lastName: "Iewer",
        username: null,
        primaryEmailAddress: { emailAddress: "reviewer@example.com" },
        emailAddresses: [{ emailAddress: "reviewer@example.com" }],
      }),
    },
  },
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: (cols?: unknown) => ({
      from: (table: unknown) => {
        // adminExportLogsTable — recent exports for the burst check
        if (table === "EXPORT_LOGS") {
          return {
            where: (_cond: unknown) => ({
              orderBy: (_ord: unknown) => Promise.resolve([...recentExports]),
              // for GET /admin/export-alerts aggregate (groupBy/having path)
              groupBy: (_col: unknown) => ({
                having: (_cond: unknown) => Promise.resolve([]),
              }),
            }),
            orderBy: (_ord: unknown) => Promise.resolve([...recentExports]),
            // aggregate variant used by GET /admin/export-alerts
            groupBy: (_col: unknown) => ({
              having: (_cond: unknown) => Promise.resolve([]),
            }),
          };
        }
        // adminExportAcknowledgmentsTable — singleton ack row
        if (table === "EXPORT_ACK") {
          return {
            where: (_cond: unknown) => Promise.resolve(ackRow ? [{ ...ackRow }] : []),
            // used by GET /admin/export-alerts to fetch all acks
            then: (resolve: (v: unknown) => unknown) =>
              resolve(ackRow ? [{ ...ackRow }] : []),
          };
        }
        // adminExportAcknowledgmentLogTable — history
        if (table === "EXPORT_ACK_LOG") {
          return {
            where: (_cond: unknown) => ({
              orderBy: (_ord: unknown) =>
                Promise.resolve(
                  [...logRows].sort((a, b) =>
                    (a.id as number) > (b.id as number) ? -1 : 1,
                  ),
                ),
            }),
          };
        }
        // vendorsTable — used in:
        //   1. GET /admin/vendors/export batch loop: .where(...).orderBy(...).limit(n)
        //   2. POST acknowledge vendor-notification lookup: .where(...).limit(1)
        if (table === "VENDORS") {
          const emptyChain = {
            orderBy: (_ord: unknown) => ({
              limit: (_n: number) => Promise.resolve([]),
            }),
            limit: (_n: number) => Promise.resolve([]),
          };
          return {
            where: (_cond: unknown) => emptyChain,
            orderBy: (_ord: unknown) => ({
              limit: (_n: number) => Promise.resolve([]),
            }),
          };
        }
        // vendorPaymentCredentialsTable — used in GET /admin/vendors/export batch
        if (table === "VENDOR_CREDS") {
          return {
            where: (_cond: unknown) => Promise.resolve([]),
          };
        }
        // Fallback — any other table (audit log, sent alerts, notifications, etc.)
        return {
          where: (_c: unknown) => ({
            orderBy: (_o: unknown) => Promise.resolve([]),
            limit: (_n: number) => Promise.resolve([]),
          }),
          orderBy: (_o: unknown) => ({
            limit: (_n: number) => Promise.resolve([]),
          }),
          limit: (_n: number) => Promise.resolve([]),
          then: (resolve: (v: unknown) => unknown) => resolve([]),
        };
      },
    }),

    insert: (table: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        if (table === "EXPORT_ACK") {
          return {
            onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
              ackRow = {
                adminUserId: vals.adminUserId as string,
                acknowledgedAt: (set.acknowledgedAt ?? vals.acknowledgedAt) as Date,
                acknowledgedBy: (set.acknowledgedBy ?? vals.acknowledgedBy) as string,
              };
              return Promise.resolve();
            },
          };
        }
        if (table === "EXPORT_ACK_LOG") {
          logRows.push({ id: nextLogId++, ...vals });
          return Promise.resolve();
        }
        // vendorNotificationsTable, adminAuditLogTable, adminExportBurstSentAlertsTable, etc.
        return {
          onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
          onConflictDoUpdate: (_opts: unknown) => Promise.resolve(),
          returning: () => Promise.resolve([]),
        };
      },
    }),

    update: (_table: unknown) => ({
      set: (_vals: unknown) => ({
        where: (_cond: unknown) => Promise.resolve(),
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  vendorsTable: "VENDORS",
  vendorPaymentCredentialsTable: "VENDOR_CREDS",
  birthdayMessageLogsTable: {},
  voiceCallLogsTable: {},
  adminAuditLogTable: {},
  adminExportLogsTable: "EXPORT_LOGS",
  adminExportAcknowledgmentsTable: "EXPORT_ACK",
  adminExportAcknowledgmentLogTable: "EXPORT_ACK_LOG",
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
  asc: (col: unknown) => ({ asc: col }),
  and: (...args: unknown[]) => ({ and: args }),
  gte: (col: unknown, val: unknown) => ({ gte: [col, val] }),
  lte: (col: unknown, val: unknown) => ({ lte: [col, val] }),
  gt: (col: unknown, val: unknown) => ({ gt: [col, val] }),
  inArray: (col: unknown, vals: unknown[]) => ({ inArray: [col, vals] }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings, values }),
    { raw: (s: string) => s },
  ),
}));

vi.mock("../../lib/voice-caller", () => ({ isTwilioConfigured: () => true }));
vi.mock("../../lib/vendor-keys", () => ({ canAddPaymentKeys: () => false }));
vi.mock("../../lib/site-content", () => ({
  getSiteContent: async () => ({}),
  // threshold = 3 exports within 15 minutes
  getSiteContentBlock: async () => ({ threshold: 3, windowMinutes: 15 }),
  setSiteContentBlock: async () => {},
  getSiteContentAuditLog: async () => [],
  validateSiteContentBlock: (_key: string, v: unknown) => v,
  SITE_CONTENT_KEYS: ["admin.exportAlertSettings", "admin.voiceSignatureFailureAlertSettings"],
}));
vi.mock("../../lib/birthday-scheduler", () => ({
  resendBirthdayEmail: async () => ({ ok: true }),
  retryBirthdayCall: async () => ({ ok: true }),
}));
vi.mock("../voice-campaigns", () => ({
  retryCampaignCall: async () => ({ ok: true }),
  retryAllFailedCampaignCalls: async () => ({ ok: true }),
}));
vi.mock("../../lib/slack", () => ({ sendSlackAlert: async () => {} }));
vi.mock("../../lib/voice-backfill", () => ({
  runVoiceBackfill: async () => ({}),
  getVoiceBackfillLastRun: async () => ({}),
  getVoiceBackfillRecentFixes: async () => [],
}));
vi.mock("../../lib/sales-sync", () => ({ syncSaleFromPayment: async () => {} }));
vi.mock("../../lib/push", () => ({ notifyVendorPaymentStatus: async () => {} }));

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
  opts: { headers?: Record<string, string> } = {},
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      fetch(`http://localhost:${addr.port}${path}`, {
        method,
        headers: opts.headers ?? {},
      })
        .then(async (res) => {
          const text = await res.text();
          let body: any = null;
          try {
            body = JSON.parse(text);
          } catch {
            body = null;
          }
          server.close();
          resolve({ status: res.status, body });
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("export-burst banner lifecycle", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    recentExports = [];
    ackRow = null;
    logRows = [];
    nextLogId = 1;
    app = await buildApp();
  });

  // 1. Below threshold → not blocked
  it("does not block when export count is below the threshold", async () => {
    // 2 exports, threshold = 3
    const now = new Date();
    recentExports = [
      { exportedAt: new Date(now.getTime() - 10_000) },
      { exportedAt: new Date(now.getTime() - 20_000) },
    ];

    // export route returns 429 when blocked; anything else means not blocked
    const { status } = await callApp(app, "GET", "/admin/vendors/export", {
      headers: { "x-test-user": "user_flagged" },
    });
    expect(status).not.toBe(429);
  });

  // 2. At/above threshold → blocked
  it("blocks exports once the count meets the threshold", async () => {
    const now = new Date();
    recentExports = [
      { exportedAt: new Date(now.getTime() - 5_000) },
      { exportedAt: new Date(now.getTime() - 10_000) },
      { exportedAt: new Date(now.getTime() - 15_000) }, // 3rd = crossing export
    ];

    const { status, body } = await callApp(app, "GET", "/admin/vendors/export", {
      headers: { "x-test-user": "user_flagged" },
    });
    expect(status).toBe(429);
    expect(body.count).toBe(3);
    expect(body.threshold).toBe(3);
  });

  // 3. Acknowledge → clears the block
  it("clears the block after a different admin acknowledges", async () => {
    const now = new Date();
    const crossingExportAt = new Date(now.getTime() - 15_000);
    recentExports = [
      { exportedAt: new Date(now.getTime() - 5_000) },
      { exportedAt: new Date(now.getTime() - 10_000) },
      { exportedAt: crossingExportAt },
    ];

    // Before acknowledge: blocked
    const before = await callApp(app, "GET", "/admin/vendors/export", {
      headers: { "x-test-user": "user_flagged" },
    });
    expect(before.status).toBe(429);

    // Acknowledge as a different admin (user_reviewer)
    const ack = await callApp(app, "POST", "/admin/export-alerts/user_flagged/acknowledge", {
      headers: { "x-test-user": "user_reviewer" },
    });
    expect(ack.status).toBe(200);
    expect(ack.body.success).toBe(true);

    // After acknowledge: no longer blocked
    const after = await callApp(app, "GET", "/admin/vendors/export", {
      headers: { "x-test-user": "user_flagged" },
    });
    expect(after.status).not.toBe(429);
  });

  // 4. Fresh burst after acknowledgment → re-blocks
  it("re-blocks when a new burst arrives after the acknowledgment", async () => {
    // Simulate: earlier burst was acknowledged 10 s ago, then 3 fresh exports
    // arrived after the ack — so the crossing export (3rd) is after the ack.
    const ackTime = new Date(Date.now() - 10_000);
    ackRow = { adminUserId: "user_flagged", acknowledgedAt: ackTime, acknowledgedBy: "user_reviewer" };

    recentExports = [
      { exportedAt: new Date(ackTime.getTime() + 3_000) },
      { exportedAt: new Date(ackTime.getTime() + 2_000) },
      { exportedAt: new Date(ackTime.getTime() + 1_000) }, // crossing export (index 2)
    ];

    const { status } = await callApp(app, "GET", "/admin/vendors/export", {
      headers: { "x-test-user": "user_flagged" },
    });
    // The crossing export happened AFTER the ack, so the burst is not cleared
    expect(status).toBe(429);
  });

  // 5. Old ack before crossing export does NOT clear
  it("does not clear the block when the acknowledgment predates the crossing export", async () => {
    const oldAckTime = new Date(Date.now() - 20_000); // ack happened 20 s ago
    ackRow = { adminUserId: "user_flagged", acknowledgedAt: oldAckTime, acknowledgedBy: "user_reviewer" };

    // New exports with the crossing export (3rd) occurring AFTER the old ack
    recentExports = [
      { exportedAt: new Date(Date.now() - 1_000) },
      { exportedAt: new Date(Date.now() - 2_000) },
      { exportedAt: new Date(oldAckTime.getTime() + 1_000) }, // crossing export after ack → not cleared
    ];

    const { status } = await callApp(app, "GET", "/admin/vendors/export", {
      headers: { "x-test-user": "user_flagged" },
    });
    expect(status).toBe(429);
  });

  // 6. Self-acknowledge is rejected
  it("rejects an admin trying to acknowledge their own export-burst flag", async () => {
    const { status, body } = await callApp(
      app,
      "POST",
      "/admin/export-alerts/user_flagged/acknowledge",
      { headers: { "x-test-user": "user_flagged" } },
    );
    expect(status).toBe(403);
    expect(body.error).toMatch(/cannot acknowledge your own/i);
  });

  // 7. Multiple acknowledges each append a log row
  it("appends a log row on every acknowledge, not just the latest", async () => {
    const ack1 = await callApp(app, "POST", "/admin/export-alerts/user_flagged/acknowledge", {
      headers: { "x-test-user": "user_reviewer" },
    });
    expect(ack1.status).toBe(200);
    const ack2 = await callApp(app, "POST", "/admin/export-alerts/user_flagged/acknowledge", {
      headers: { "x-test-user": "user_reviewer" },
    });
    expect(ack2.status).toBe(200);

    expect(logRows).toHaveLength(2);
    expect(logRows.every((r) => r.adminUserId === "user_flagged" && r.acknowledgedBy === "user_reviewer")).toBe(true);
  });

  // 8. Ack exactly at the crossing export time clears the block
  it("clears the block when the acknowledgment is exactly at the crossing export time", async () => {
    const crossingTime = new Date(Date.now() - 5_000);
    // ack timestamp equals the crossing export timestamp exactly
    ackRow = { adminUserId: "user_flagged", acknowledgedAt: crossingTime, acknowledgedBy: "user_reviewer" };

    recentExports = [
      { exportedAt: new Date(crossingTime.getTime() + 2_000) },
      { exportedAt: new Date(crossingTime.getTime() + 1_000) },
      { exportedAt: crossingTime }, // crossing export = exactly at ack time
    ];

    const { status } = await callApp(app, "GET", "/admin/vendors/export", {
      headers: { "x-test-user": "user_flagged" },
    });
    // ack.acknowledgedAt >= flaggedAt → cleared
    expect(status).not.toBe(429);
  });

  // 9. Non-admin is rejected
  it("rejects non-admin users with 403", async () => {
    const { status } = await callApp(app, "GET", "/admin/vendors/export", {
      headers: { "x-test-user": "user_random" },
    });
    expect(status).toBe(403);
  });
});
