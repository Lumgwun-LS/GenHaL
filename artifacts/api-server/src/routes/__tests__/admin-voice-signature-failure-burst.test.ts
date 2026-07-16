/**
 * Tests for the Twilio signature-failure burst alert lifecycle:
 *  1. No burst → not flagged
 *  2. Burst crosses threshold → flagged
 *  3. Acknowledge → clears (not flagged)
 *  4. Fresh burst after acknowledgment → re-flags
 *
 * Covers:
 *  GET  /admin/voice/signature-failures/alert
 *  POST /admin/voice/signature-failures/acknowledge
 *  GET  /admin/voice/signature-failures/history
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

process.env.ADMIN_USER_IDS = "user_admin";

// ─── Module-level state controlled by each test ───────────────────────────────

/** Failures returned by the SELECT on voiceSignatureFailuresTable, ordered desc. */
let recentFailures: Array<{ createdAt: Date }> = [];

/** The current singleton acknowledgment row (null = never acknowledged). */
let ackRow: { id: number; acknowledgedAt: Date; acknowledgedBy: string } | null = null;

/** Append-only acknowledgment log. */
let logRows: Array<Record<string, unknown>> = [];
let nextLogId = 1;

// ─── Mocks ────────────────────────────────────────────────────────────────────

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
    select: (cols?: unknown) => ({
      from: (table: unknown) => {
        // voiceSignatureFailuresTable — returns recent failures
        if (table === "VOICE_SIG_FAILURES") {
          return {
            where: (_cond: unknown) => ({
              orderBy: (_ord: unknown) => Promise.resolve([...recentFailures]),
            }),
          };
        }
        // voiceSignatureFailureAcknowledgmentsTable — singleton ack
        if (table === "VOICE_SIG_ACK") {
          return {
            limit: (_n: number) => Promise.resolve(ackRow ? [{ ...ackRow }] : []),
          };
        }
        // voiceSignatureFailureAcknowledgmentLogTable — history
        if (table === "VOICE_SIG_ACK_LOG") {
          return {
            orderBy: (_ord: unknown) => ({
              limit: (_n: number) =>
                Promise.resolve(
                  [...logRows].sort((a, b) => ((a.id as number) > (b.id as number) ? -1 : 1)),
                ),
            }),
          };
        }
        // fallback (other tables not needed for these tests)
        return {
          where: (_c: unknown) => Promise.resolve([]),
          limit: (_n: number) => Promise.resolve([]),
          orderBy: (_o: unknown) => ({ limit: (_n: number) => Promise.resolve([]) }),
        };
      },
    }),

    insert: (table: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        if (table === "VOICE_SIG_ACK") {
          // First-time insert path (no existing row)
          ackRow = {
            id: 1,
            acknowledgedAt: vals.acknowledgedAt as Date,
            acknowledgedBy: vals.acknowledgedBy as string,
          };
          return Promise.resolve();
        }
        if (table === "VOICE_SIG_ACK_LOG") {
          logRows.push({ id: nextLogId++, ...vals });
          return Promise.resolve();
        }
        // Other inserts (audit log, export burst, etc.) — no-op
        return {
          onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
          onConflictDoUpdate: (_opts: unknown) => Promise.resolve(),
          returning: () => Promise.resolve([]),
        };
      },
    }),

    update: (table: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: (_cond: unknown) => {
          if (table === "VOICE_SIG_ACK" && ackRow) {
            ackRow = {
              ...ackRow,
              acknowledgedAt: vals.acknowledgedAt as Date,
              acknowledgedBy: vals.acknowledgedBy as string,
            };
          }
          return Promise.resolve();
        },
      }),
    }),
  },
}));

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
  voiceSignatureFailuresTable: "VOICE_SIG_FAILURES",
  voiceSignatureFailureAcknowledgmentsTable: "VOICE_SIG_ACK",
  voiceSignatureFailureAcknowledgmentLogTable: "VOICE_SIG_ACK_LOG",
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
  // threshold = 3 failures within 60 minutes
  getSiteContentBlock: async () => ({ threshold: 3, windowMinutes: 60 }),
  setSiteContentBlock: async () => {},
  getSiteContentAuditLog: async () => [],
  validateSiteContentBlock: (_key: string, v: unknown) => v,
  SITE_CONTENT_KEYS: ["admin.voiceSignatureFailureAlertSettings", "admin.exportAlertSettings"],
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

describe("Twilio signature-failure burst alert lifecycle", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    recentFailures = [];
    ackRow = null;
    logRows = [];
    nextLogId = 1;
    app = await buildApp();
  });

  // 1. No burst → not flagged
  it("reports not flagged when the failure count is below the threshold", async () => {
    // 2 failures, threshold = 3
    const now = new Date();
    recentFailures = [
      { createdAt: new Date(now.getTime() - 10_000) },
      { createdAt: new Date(now.getTime() - 20_000) },
    ];

    const { status, body } = await callApp(app, "GET", "/admin/voice/signature-failures/alert");

    expect(status).toBe(200);
    expect(body.flagged).toBe(false);
    expect(body.count).toBe(2);
    expect(body.threshold).toBe(3);
  });

  // 2. Burst crosses threshold → flagged
  it("flags the alert once failure count meets or exceeds the threshold", async () => {
    const now = new Date();
    recentFailures = [
      { createdAt: new Date(now.getTime() - 5_000) },
      { createdAt: new Date(now.getTime() - 10_000) },
      { createdAt: new Date(now.getTime() - 15_000) }, // 3rd = crossing failure
    ];

    const { status, body } = await callApp(app, "GET", "/admin/voice/signature-failures/alert");

    expect(status).toBe(200);
    expect(body.flagged).toBe(true);
    expect(body.count).toBe(3);
    // flaggedAt must be the timestamp of the Nth (threshold-th) most recent failure
    expect(new Date(body.flaggedAt).getTime()).toBe(recentFailures[2]!.createdAt.getTime());
  });

  // 3. Acknowledge → clears
  it("clears the flag after an admin acknowledges, so the banner no longer shows", async () => {
    const now = new Date();
    const crossingFailureAt = new Date(now.getTime() - 15_000);
    recentFailures = [
      { createdAt: new Date(now.getTime() - 5_000) },
      { createdAt: new Date(now.getTime() - 10_000) },
      { createdAt: crossingFailureAt },
    ];

    // Before acknowledge: flagged
    const before = await callApp(app, "GET", "/admin/voice/signature-failures/alert");
    expect(before.body.flagged).toBe(true);

    // Acknowledge
    const ack = await callApp(app, "POST", "/admin/voice/signature-failures/acknowledge");
    expect(ack.status).toBe(200);
    expect(ack.body.success).toBe(true);

    // After acknowledge: not flagged (ackRow.acknowledgedAt is now, which is >= crossingFailureAt)
    const after = await callApp(app, "GET", "/admin/voice/signature-failures/alert");
    expect(after.body.flagged).toBe(false);
    expect(after.body.acknowledgedBy).toBe("user_admin");
  });

  // 4. Fresh burst after acknowledgment → re-flags
  it("re-flags after a new burst arrives after the acknowledgment", async () => {
    const past = new Date(Date.now() - 30_000);

    // Simulate: earlier failures crossed the threshold, admin acknowledged, then
    // new failures arrived after the acknowledgment.
    const ackTime = new Date(Date.now() - 5_000); // ack happened 5 s ago
    ackRow = { id: 1, acknowledgedAt: ackTime, acknowledgedBy: "user_admin" };

    // Three new failures ALL after the ack — the crossing failure (3rd most recent)
    // has createdAt > ackTime, so it's a fresh burst
    recentFailures = [
      { createdAt: new Date(ackTime.getTime() + 3_000) },
      { createdAt: new Date(ackTime.getTime() + 2_000) },
      { createdAt: new Date(ackTime.getTime() + 1_000) }, // crossing failure (threshold = 3, index 2)
    ];

    const { status, body } = await callApp(app, "GET", "/admin/voice/signature-failures/alert");

    expect(status).toBe(200);
    expect(body.flagged).toBe(true);
    expect(body.count).toBe(3);
    // The crossing failure must be after the ack for the burst to re-flag
    const flaggedAt = new Date(body.flaggedAt);
    expect(flaggedAt.getTime()).toBeGreaterThan(ackTime.getTime());
  });

  // 5. Old ack does NOT clear a new burst
  it("does not clear a new burst when the acknowledgment predates the crossing failure", async () => {
    const oldAckTime = new Date(Date.now() - 10_000); // ack happened 10 s ago
    ackRow = { id: 1, acknowledgedAt: oldAckTime, acknowledgedBy: "user_admin" };

    // New failures, with the crossing failure (3rd) occurring AFTER the old ack
    recentFailures = [
      { createdAt: new Date(Date.now() - 1_000) },
      { createdAt: new Date(Date.now() - 2_000) },
      { createdAt: new Date(oldAckTime.getTime() + 1_000) }, // crossing failure after ack → not cleared
    ];

    const { status, body } = await callApp(app, "GET", "/admin/voice/signature-failures/alert");
    expect(status).toBe(200);
    expect(body.flagged).toBe(true);
  });

  // 6. Stale ack before crossing failure clears the burst
  it("clears a burst if the acknowledgment is at or after the crossing failure", async () => {
    const crossingTime = new Date(Date.now() - 10_000);
    // Ack happened AFTER the crossing failure
    const freshAckTime = new Date(crossingTime.getTime() + 2_000);
    ackRow = { id: 1, acknowledgedAt: freshAckTime, acknowledgedBy: "user_admin" };

    recentFailures = [
      { createdAt: new Date(Date.now() - 5_000) },
      { createdAt: new Date(Date.now() - 7_000) },
      { createdAt: crossingTime }, // crossing failure happened before ack
    ];

    const { status, body } = await callApp(app, "GET", "/admin/voice/signature-failures/alert");
    expect(status).toBe(200);
    expect(body.flagged).toBe(false);
  });

  // 7. History endpoint returns every past acknowledgment (append-only log)
  it("GET /history returns every past acknowledgment, newest first", async () => {
    const t1 = new Date("2026-07-01T00:00:00Z");
    const t2 = new Date("2026-07-10T00:00:00Z");
    logRows = [
      { id: 1, acknowledgedBy: "user_admin_a", acknowledgedByDisplayName: "Admin A", acknowledgedAt: t1 },
      { id: 2, acknowledgedBy: "user_admin_b", acknowledgedByDisplayName: "Admin B", acknowledgedAt: t2 },
    ];

    const { status, body } = await callApp(
      app,
      "GET",
      "/admin/voice/signature-failures/history",
    );
    expect(status).toBe(200);
    expect(body).toHaveLength(2);
    // Newest first
    expect(body[0].acknowledgedByDisplayName).toBe("Admin B");
    expect(body[1].acknowledgedByDisplayName).toBe("Admin A");
  });

  // 8. Multiple acknowledge calls append multiple log rows
  it("appends a log row on every acknowledge, not just the latest", async () => {
    const ack1 = await callApp(app, "POST", "/admin/voice/signature-failures/acknowledge");
    expect(ack1.status).toBe(200);
    const ack2 = await callApp(app, "POST", "/admin/voice/signature-failures/acknowledge");
    expect(ack2.status).toBe(200);

    expect(logRows).toHaveLength(2);
    expect(logRows.every((r) => r.acknowledgedBy === "user_admin")).toBe(true);
  });

  // 9. Non-admins are rejected
  it("rejects non-admin users with 403", async () => {
    const server = createServer(app);
    const result = await new Promise<{ status: number }>((resolve, reject) => {
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        fetch(`http://localhost:${addr.port}/admin/voice/signature-failures/alert`, {
          headers: { "x-test-user": "user_regular" },
        })
          .then((res) => {
            server.close();
            resolve({ status: res.status });
          })
          .catch((e) => {
            server.close();
            reject(e);
          });
      });
    });
    expect(result.status).toBe(403);
  });
});
