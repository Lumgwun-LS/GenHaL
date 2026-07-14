/**
 * Tests for the export-alert threshold change history: PATCH
 * /admin/site-content/:key writes an audit row via setSiteContentBlock, and
 * GET /admin/site-content/:key/history returns it.
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
vi.mock("../../lib/birthday-scheduler", () => ({ resendBirthdayEmail: async () => ({ ok: true }), retryBirthdayCall: async () => ({ ok: true }) }));
vi.mock("../voice-campaigns", () => ({ retryCampaignCall: async () => ({ ok: true }) }));
vi.mock("../../lib/slack", () => ({ sendSlackAlert: async () => {} }));
vi.mock("../../lib/voice-backfill", () => ({ runVoiceBackfill: async () => ({}), getVoiceBackfillLastRun: async () => ({}), getVoiceBackfillRecentFixes: async () => [] }));
vi.mock("../../lib/sales-sync", () => ({ syncSaleFromPayment: async () => {} }));
vi.mock("../../lib/push", () => ({ notifyVendorPaymentStatus: async () => {} }));

let setSiteContentBlockCalls: Array<{ key: string; value: unknown; updatedBy: string; updatedByDisplayName: string | null }> = [];
let auditHistory: Array<Record<string, unknown>> = [];

vi.mock("../../lib/site-content", () => ({
  getSiteContent: async () => ({}),
  getSiteContentBlock: async () => ({ threshold: 5, windowMinutes: 15 }),
  setSiteContentBlock: async (key: string, value: unknown, updatedBy: string, updatedByDisplayName: string | null = null) => {
    setSiteContentBlockCalls.push({ key, value, updatedBy, updatedByDisplayName });
  },
  getSiteContentAuditLog: async (key: string) => auditHistory.filter((e) => e.contentKey === key),
  validateSiteContentBlock: (_key: string, v: unknown) => v,
  SITE_CONTENT_KEYS: ["admin.exportAlertSettings"],
}));

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

function callApp(app: express.Express, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      fetch(`http://localhost:${addr.port}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
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

describe("admin site-content history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSiteContentBlockCalls = [];
    auditHistory = [];
  });

  it("PATCH resolves the admin's display name and passes it through to setSiteContentBlock", async () => {
    const app = await buildApp();
    const { status, body } = await callApp(app, "PATCH", "/admin/site-content/admin.exportAlertSettings", {
      value: { threshold: 10, windowMinutes: 30 },
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(setSiteContentBlockCalls).toHaveLength(1);
    expect(setSiteContentBlockCalls[0]).toMatchObject({
      key: "admin.exportAlertSettings",
      value: { threshold: 10, windowMinutes: 30 },
      updatedBy: "user_admin",
      updatedByDisplayName: "Ada Admin",
    });
  });

  it("GET history returns entries recorded for the key, newest first", async () => {
    auditHistory = [
      {
        id: 1,
        contentKey: "admin.exportAlertSettings",
        adminUserId: "user_admin",
        adminDisplayName: "Ada Admin",
        oldValue: JSON.stringify({ threshold: 5, windowMinutes: 15 }),
        newValue: JSON.stringify({ threshold: 10, windowMinutes: 30 }),
        changedAt: "2026-07-14T00:00:00.000Z",
      },
    ];
    const app = await buildApp();
    const { status, body } = await callApp(app, "GET", "/admin/site-content/admin.exportAlertSettings/history");
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ adminDisplayName: "Ada Admin" });
  });

  it("GET history rejects an unknown content key", async () => {
    const app = await buildApp();
    const { status, body } = await callApp(app, "GET", "/admin/site-content/bogus.key/history");
    expect(status).toBe(400);
    expect(body.error).toMatch(/Unknown content key/);
  });

  it("rejects non-admins from both routes", async () => {
    const app = await buildApp();
    const patch = await new Promise<{ status: number }>((resolve, reject) => {
      const server = createServer(app);
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        fetch(`http://localhost:${addr.port}/admin/site-content/admin.exportAlertSettings/history`, {
          headers: { "x-test-user": "user_someone_else" },
        })
          .then((res) => { server.close(); resolve({ status: res.status }); })
          .catch((e) => { server.close(); reject(e); });
      });
    });
    expect(patch.status).toBe(403);
  });
});
