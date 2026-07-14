/**
 * Tests for the full export-burst review history: POST
 * /admin/export-alerts/:adminUserId/acknowledge appends a row to the
 * append-only log (in addition to upserting the "latest" table used for the
 * block check), and GET /admin/export-alerts/:adminUserId/history returns
 * every past review, not just the most recent one.
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

let latestAcknowledgment: Record<string, unknown> | null = null;
let logRows: Array<Record<string, unknown>> = [];
let nextLogId = 1;

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (_cond: unknown) => {
          // Both "latest ack" and "log history" selects go through this
          // path; distinguish by which table object was passed.
          if (table === "adminExportAcknowledgmentsTable") {
            return Promise.resolve(latestAcknowledgment ? [latestAcknowledgment] : []);
          }
          return {
            orderBy: () => Promise.resolve([...logRows].sort((a, b) => (a.id as number) < (b.id as number) ? 1 : -1)),
          };
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        if (table === "adminExportAcknowledgmentsTable") {
          return {
            onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
              latestAcknowledgment = { ...(latestAcknowledgment ?? vals), ...vals, ...set };
              return Promise.resolve();
            },
          };
        }
        // adminExportAcknowledgmentLogTable: plain append, no conflict handling.
        logRows.push({ id: nextLogId++, ...vals });
        return Promise.resolve();
      },
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
  adminExportAcknowledgmentsTable: "adminExportAcknowledgmentsTable",
  adminExportAcknowledgmentLogTable: "adminExportAcknowledgmentLogTable",
  voiceCampaignsTable: {},
  voiceCampaignCallsTable: {},
  voiceSignatureFailuresTable: {},
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
vi.mock("../../lib/site-content", () => ({
  getSiteContent: async () => ({}),
  getSiteContentBlock: async () => ({ threshold: 5, windowMinutes: 15 }),
  setSiteContentBlock: async () => {},
  getSiteContentAuditLog: async () => [],
  validateSiteContentBlock: (_key: string, v: unknown) => v,
  SITE_CONTENT_KEYS: ["admin.exportAlertSettings"],
}));
vi.mock("../../lib/birthday-scheduler", () => ({ resendBirthdayEmail: async () => ({ ok: true }), retryBirthdayCall: async () => ({ ok: true }) }));
vi.mock("../voice-campaigns", () => ({ retryCampaignCall: async () => ({ ok: true }) }));
vi.mock("../../lib/slack", () => ({ sendSlackAlert: async () => {} }));
vi.mock("../../lib/voice-backfill", () => ({ runVoiceBackfill: async () => ({}), getVoiceBackfillLastRun: async () => ({}) }));
vi.mock("../../lib/sales-sync", () => ({ syncSaleFromPayment: async () => {} }));
vi.mock("../../lib/push", () => ({ notifyVendorPaymentStatus: async () => {} }));

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

function callApp(app: express.Express, method: string, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      fetch(`http://localhost:${addr.port}${path}`, { method })
        .then(async (res) => {
          const text = await res.text();
          let json: any = null;
          try { json = JSON.parse(text); } catch { json = null; }
          server.close();
          resolve({ status: res.status, body: json });
        })
        .catch((err) => { server.close(); reject(err); });
    });
  });
}

describe("export-burst acknowledgment history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestAcknowledgment = null;
    logRows = [];
    nextLogId = 1;
  });

  it("appends a log row on every acknowledge, not just the latest", async () => {
    const app = await buildApp();

    const first = await callApp(app, "POST", "/admin/export-alerts/user_flagged/acknowledge");
    expect(first.status).toBe(200);
    const second = await callApp(app, "POST", "/admin/export-alerts/user_flagged/acknowledge");
    expect(second.status).toBe(200);

    expect(logRows).toHaveLength(2);
    expect(logRows.every((r) => r.adminUserId === "user_flagged" && r.acknowledgedBy === "user_admin")).toBe(true);
  });

  it("GET history returns every past review, newest first", async () => {
    logRows = [
      { id: 1, adminUserId: "user_flagged", acknowledgedBy: "user_admin_a", acknowledgedByDisplayName: "Admin A", acknowledgedAt: "2026-07-01T00:00:00.000Z" },
      { id: 2, adminUserId: "user_flagged", acknowledgedBy: "user_admin_b", acknowledgedByDisplayName: "Admin B", acknowledgedAt: "2026-07-10T00:00:00.000Z" },
    ];
    const app = await buildApp();
    const { status, body } = await callApp(app, "GET", "/admin/export-alerts/user_flagged/history");
    expect(status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].acknowledgedByDisplayName).toBe("Admin B");
    expect(body[1].acknowledgedByDisplayName).toBe("Admin A");
  });

  it("rejects non-admins", async () => {
    const app = await buildApp();
    const server = createServer(app);
    const result = await new Promise<{ status: number }>((resolve, reject) => {
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        fetch(`http://localhost:${addr.port}/admin/export-alerts/user_flagged/history`, {
          headers: { "x-test-user": "user_someone_else" },
        })
          .then((res) => { server.close(); resolve({ status: res.status }); })
          .catch((e) => { server.close(); reject(e); });
      });
    });
    expect(result.status).toBe(403);
  });
});
