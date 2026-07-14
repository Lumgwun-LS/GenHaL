/**
 * Tests for GET/POST /admin/payment-conflicts — the admin-facing surface for
 * reconciliation conflicts recorded on payments/webhooks.ts's
 * applyPaymentStatusTransition (metadata.reconciliationConflict).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

process.env.ADMIN_USER_IDS = "user_admin";

const CONFLICT_PAYMENT = {
  id: 42,
  vendorId: 7,
  orderId: null,
  provider: "stripe",
  providerReference: "cs_test_123",
  amount: "50.00",
  currency: "USD",
  status: "cancelled",
  metadata: {
    reconciliationConflict: {
      attemptedStatus: "paid",
      provider: "stripe",
      detectedAt: "2026-07-10T00:00:00.000Z",
    },
  },
  updatedAt: new Date("2026-07-10T00:00:00.000Z"),
};

let updateCalls: Array<{ set: Record<string, unknown> }> = [];
let syncSaleCalls: unknown[] = [];
let notifyCalls: unknown[] = [];

vi.mock("@clerk/express", () => ({
  getAuth: (req: Request) => ({ userId: (req.headers["x-test-user"] as string) ?? "user_admin" }),
}));

vi.mock("@workspace/db", () => ({ db: {} }));

vi.mock("@workspace/db/schema", () => ({
  vendorsTable: { id: "vendors.id", name: "vendors.name" },
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
  paymentsTable: { id: "payments.id", vendorId: "payments.vendor_id", metadata: "payments.metadata", updatedAt: "payments.updated_at", status: "payments.status" },
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
  getSiteContentBlock: async () => ({ threshold: 5, windowMinutes: 60 }),
  setSiteContentBlock: async () => {},
  validateSiteContentBlock: (v: unknown) => v,
  SITE_CONTENT_KEYS: [],
}));
vi.mock("../../lib/birthday-scheduler", () => ({ resendBirthdayEmail: async () => ({ ok: true }), retryBirthdayCall: async () => ({ ok: true }) }));
vi.mock("../voice-campaigns", () => ({ retryCampaignCall: async () => ({ ok: true }) }));
vi.mock("../../lib/slack", () => ({ sendSlackAlert: async () => {} }));
vi.mock("../../lib/voice-backfill", () => ({ runVoiceBackfill: async () => ({}), getVoiceBackfillLastRun: async () => ({}), getVoiceBackfillRecentFixes: async () => [] }));
vi.mock("../../lib/sales-sync", () => ({
  syncSaleFromPayment: async (args: unknown) => {
    syncSaleCalls.push(args);
  },
}));
vi.mock("../../lib/push", () => ({
  notifyVendorPaymentStatus: async (...args: unknown[]) => {
    notifyCalls.push(args);
  },
}));

async function buildApp(dbImpl: Record<string, unknown>) {
  vi.doMock("@workspace/db", () => ({ db: dbImpl }));
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

describe("admin payment conflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls = [];
    syncSaleCalls = [];
    notifyCalls = [];
  });

  it("GET /admin/payment-conflicts lists unresolved conflicts and requires admin", async () => {
    const app = await buildApp({
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => [{ ...CONFLICT_PAYMENT, vendorName: "Acme" }],
              }),
            }),
          }),
        }),
      }),
    });

    const nonAdmin = await callApp(app, "GET", "/admin/payment-conflicts");
    // Default mocked getAuth returns user_admin — verify a non-admin header is rejected instead.
    const rejected = await new Promise<{ status: number }>((resolve, reject) => {
      const server = createServer(app);
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        fetch(`http://localhost:${addr.port}/admin/payment-conflicts`, { headers: { "x-test-user": "user_someone_else" } })
          .then((res) => { server.close(); resolve({ status: res.status }); })
          .catch((e) => { server.close(); reject(e); });
      });
    });
    expect(rejected.status).toBe(403);

    expect(nonAdmin.status).toBe(200);
    expect(nonAdmin.body).toHaveLength(1);
    expect(nonAdmin.body[0]).toMatchObject({
      id: 42,
      vendorName: "Acme",
      currentStatus: "cancelled",
      attemptedStatus: "paid",
      webhookProvider: "stripe",
    });
  });

  it("POST resolve with dismiss keeps status and marks resolved, no side effects", async () => {
    const app = await buildApp({
      select: () => ({ from: () => ({ where: async () => [CONFLICT_PAYMENT] }) }),
      update: () => ({
        set: (vals: Record<string, unknown>) => {
          updateCalls.push({ set: vals });
          return {
            where: () => ({
              returning: async () => [{ ...CONFLICT_PAYMENT, ...vals }],
            }),
          };
        },
      }),
    });

    const { status, body } = await callApp(app, "POST", "/admin/payment-conflicts/42/resolve", { resolution: "dismiss" });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(updateCalls[0]!.set.status).toBe("cancelled");
    const meta = updateCalls[0]!.set.metadata as any;
    expect(meta.reconciliationConflict.resolution).toBe("dismiss");
    expect(meta.reconciliationConflict.resolvedBy).toBe("user_admin");
    expect(syncSaleCalls).toHaveLength(0);
    expect(notifyCalls).toHaveLength(0);
  });

  it("POST resolve with paid flips status and triggers sale sync + notification", async () => {
    const app = await buildApp({
      select: () => ({ from: () => ({ where: async () => [CONFLICT_PAYMENT] }) }),
      update: () => ({
        set: (vals: Record<string, unknown>) => {
          updateCalls.push({ set: vals });
          return {
            where: () => ({
              returning: async () => [{ ...CONFLICT_PAYMENT, ...vals }],
            }),
          };
        },
      }),
    });

    const { status, body } = await callApp(app, "POST", "/admin/payment-conflicts/42/resolve", { resolution: "paid" });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(updateCalls[0]!.set.status).toBe("paid");
    expect(syncSaleCalls).toHaveLength(1);
    expect(notifyCalls).toHaveLength(1);
  });

  it("rejects resolving a conflict that was already resolved", async () => {
    const alreadyResolved = {
      ...CONFLICT_PAYMENT,
      metadata: {
        reconciliationConflict: { ...CONFLICT_PAYMENT.metadata.reconciliationConflict, resolvedAt: "2026-07-11T00:00:00.000Z" },
      },
    };
    const app = await buildApp({
      select: () => ({ from: () => ({ where: async () => [alreadyResolved] }) }),
    });

    const { status, body } = await callApp(app, "POST", "/admin/payment-conflicts/42/resolve", { resolution: "dismiss" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/already resolved/);
  });

  it("rejects an invalid resolution value", async () => {
    const app = await buildApp({
      select: () => ({ from: () => ({ where: async () => [CONFLICT_PAYMENT] }) }),
    });

    const { status, body } = await callApp(app, "POST", "/admin/payment-conflicts/42/resolve", { resolution: "bogus" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/resolution must be one of/);
  });
});
