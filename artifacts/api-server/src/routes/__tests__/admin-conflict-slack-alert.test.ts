/**
 * Confirms the Slack alert for POST /admin/payment-conflicts/:id/resolve fires
 * with the correct message content for every resolution type, and does NOT
 * re-fire when someone attempts to resolve an already-resolved conflict.
 *
 * Verified fields per the task spec:
 *   - payment ID
 *   - vendor name
 *   - resolution type / human-readable label
 *   - attempted status (what the provider had reported)
 *   - admin display name
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

process.env.ADMIN_USER_IDS = "user_admin";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONFLICT_PAYMENT = {
  id: 99,
  vendorId: 5,
  orderId: null,
  provider: "paystack",
  providerReference: "ps_ref_abc",
  amount: "120.00",
  currency: "NGN",
  status: "cancelled",
  metadata: {
    reconciliationConflict: {
      attemptedStatus: "paid",
      provider: "paystack",
      detectedAt: "2026-07-15T10:00:00.000Z",
      // no resolvedAt — this is an open conflict
    },
  },
  updatedAt: new Date("2026-07-15T10:00:00.000Z"),
};

const VENDOR_ROW = { name: "Lagos Traders Co." };

// ─── Captured calls ────────────────────────────────────────────────────────────

const slackMessages: string[] = [];

// ─── Module-level mocks ────────────────────────────────────────────────────────

vi.mock("@clerk/express", () => ({
  getAuth: (req: Request) => ({
    userId: (req.headers["x-test-user"] as string) ?? "user_admin",
  }),
  clerkClient: {
    users: {
      getUser: async (userId: string) => ({
        firstName: userId === "user_admin" ? "Chidi" : null,
        lastName: userId === "user_admin" ? "Okeke" : null,
        username: null,
        primaryEmailAddress: null,
        emailAddresses: [],
      }),
    },
  },
}));

vi.mock("@workspace/db", () => ({ db: {} }));

vi.mock("@workspace/db/schema", () => ({
  vendorsTable: { id: "vendors.id", name: "vendors.name", clerkUserId: "vendors.clerk_user_id", email: "vendors.email" },
  vendorPaymentCredentialsTable: {},
  birthdayMessageLogsTable: {},
  voiceCallLogsTable: {},
  adminAuditLogTable: {},
  adminExportLogsTable: {},
  adminExportAcknowledgmentsTable: {},
  adminExportAcknowledgmentLogTable: {},
  voiceCampaignsTable: {},
  voiceCampaignCallsTable: {},
  voiceSignatureFailuresTable: {},
  voiceSignatureFailureAcknowledgmentsTable: {},
  voiceSignatureFailureAcknowledgmentLogTable: {},
  vendorNotificationsTable: {},
  paymentsTable: {
    id: "payments.id",
    vendorId: "payments.vendor_id",
    metadata: "payments.metadata",
    updatedAt: "payments.updated_at",
    status: "payments.status",
  },
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
  getSiteContentAuditLog: async () => [],
  SITE_CONTENT_KEYS: [],
}));
vi.mock("../../lib/birthday-scheduler", () => ({
  resendBirthdayEmail: async () => ({ ok: true }),
  retryBirthdayCall: async () => ({ ok: true }),
}));
vi.mock("../voice-campaigns", () => ({
  retryCampaignCall: async () => ({ ok: true }),
  retryAllFailedCampaignCalls: async () => ({ ok: true }),
}));
vi.mock("../../lib/slack", () => ({
  sendSlackAlert: async (msg: string) => {
    slackMessages.push(msg);
  },
}));
vi.mock("../../lib/voice-backfill", () => ({
  runVoiceBackfill: async () => ({}),
  getVoiceBackfillLastRun: async () => ({}),
  getVoiceBackfillRecentFixes: async () => [],
}));
vi.mock("../../lib/sales-sync", () => ({
  syncSaleFromPayment: async () => {},
}));
vi.mock("../../lib/push", () => ({
  notifyVendorPaymentStatus: async () => {},
  sendPushToVendor: async () => {},
}));
vi.mock("../../lib/mailer", () => ({ sendEmail: async () => {} }));
vi.mock("../../lib/email-branding", () => ({
  wrapVendorEmail: (opts: { bodyHtml: string }) => opts.bodyHtml,
  escapeHtml: (s: string) => s,
}));
vi.mock("../../lib/admin-export-burst", () => ({
  getExportAlertSettings: async () => ({ threshold: 5, windowMinutes: 60 }),
  getExportBurstStatus: async () => ({ blocked: false, count: 0, threshold: 5, windowMinutes: 60 }),
  checkExportBurst: async () => {},
}));

// ─── App builder ──────────────────────────────────────────────────────────────

/**
 * Builds a fresh Express app with a per-test db stub. The db stub handles:
 *   - select → from → where  (payment lookup + vendor name lookup)
 *   - update → set → where → returning  (status flip)
 *   - insert → values  (audit log insert)
 *
 * The select chain is called twice during a successful resolve:
 *   1. Load the payment row (from paymentsTable, returns CONFLICT_PAYMENT)
 *   2. Load vendor name (from vendorsTable, returns VENDOR_ROW)
 */
function makeDbForPayment(payment: typeof CONFLICT_PAYMENT | (typeof CONFLICT_PAYMENT & { metadata: { reconciliationConflict: { resolvedAt: string; resolution: string; resolvedBy: string; attemptedStatus: string; provider: string; detectedAt: string } } })) {
  let selectCallCount = 0;
  return {
    select: () => ({
      from: () => ({
        where: async () => {
          selectCallCount += 1;
          // First call = payment lookup, second = vendor name lookup
          if (selectCallCount === 1) return [payment];
          return [VENDOR_ROW];
        },
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => [{ ...payment, ...vals }],
        }),
      }),
    }),
    insert: () => ({
      values: async () => {},
    }),
  };
}

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

function callApp(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
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

describe("payment-conflict Slack alert", () => {
  beforeEach(() => {
    slackMessages.length = 0;
  });

  it("fires Slack on dismiss — includes payment ID, vendor name, resolution label, attempted status, and admin name", async () => {
    const app = await buildApp(makeDbForPayment(CONFLICT_PAYMENT));
    const { status } = await callApp(app, "POST", "/admin/payment-conflicts/99/resolve", {
      resolution: "dismiss",
    });
    expect(status).toBe(200);

    expect(slackMessages).toHaveLength(1);
    const msg = slackMessages[0]!;

    // Payment ID
    expect(msg).toContain("#99");
    // Vendor name
    expect(msg).toContain("Lagos Traders Co.");
    // Resolution label (dismiss → "dismissed (kept local cancelled status)")
    expect(msg).toContain("dismissed");
    // Attempted status from the conflict record
    expect(msg).toContain("paid");
    // Admin display name (firstName + lastName returned by clerkClient mock)
    expect(msg).toContain("Chidi Okeke");
  });

  it("fires Slack on paid — message says manually set to paid", async () => {
    const app = await buildApp(makeDbForPayment(CONFLICT_PAYMENT));
    const { status } = await callApp(app, "POST", "/admin/payment-conflicts/99/resolve", {
      resolution: "paid",
    });
    expect(status).toBe(200);

    expect(slackMessages).toHaveLength(1);
    const msg = slackMessages[0]!;

    expect(msg).toContain("#99");
    expect(msg).toContain("Lagos Traders Co.");
    expect(msg).toContain("paid"); // both "manually set to *paid*" and "provider had reported: *paid*"
    expect(msg).toContain("Chidi Okeke");
  });

  it("fires Slack on failed — message says manually set to failed", async () => {
    const conflictWithFailed = {
      ...CONFLICT_PAYMENT,
      metadata: {
        reconciliationConflict: {
          ...CONFLICT_PAYMENT.metadata.reconciliationConflict,
          attemptedStatus: "failed",
        },
      },
    };
    const app = await buildApp(makeDbForPayment(conflictWithFailed as typeof CONFLICT_PAYMENT));
    const { status } = await callApp(app, "POST", "/admin/payment-conflicts/99/resolve", {
      resolution: "failed",
    });
    expect(status).toBe(200);

    expect(slackMessages).toHaveLength(1);
    const msg = slackMessages[0]!;

    expect(msg).toContain("#99");
    expect(msg).toContain("Lagos Traders Co.");
    expect(msg).toContain("failed");
    expect(msg).toContain("Chidi Okeke");
  });

  it("fires Slack on refunded — message says manually set to refunded", async () => {
    const conflictWithRefunded = {
      ...CONFLICT_PAYMENT,
      metadata: {
        reconciliationConflict: {
          ...CONFLICT_PAYMENT.metadata.reconciliationConflict,
          attemptedStatus: "refunded",
        },
      },
    };
    const app = await buildApp(makeDbForPayment(conflictWithRefunded as typeof CONFLICT_PAYMENT));
    const { status } = await callApp(app, "POST", "/admin/payment-conflicts/99/resolve", {
      resolution: "refunded",
    });
    expect(status).toBe(200);

    expect(slackMessages).toHaveLength(1);
    const msg = slackMessages[0]!;

    expect(msg).toContain("#99");
    expect(msg).toContain("Lagos Traders Co.");
    expect(msg).toContain("refunded");
    expect(msg).toContain("Chidi Okeke");
  });

  it("returns 400 and does NOT fire Slack when the conflict was already resolved", async () => {
    const alreadyResolved = {
      ...CONFLICT_PAYMENT,
      metadata: {
        reconciliationConflict: {
          ...CONFLICT_PAYMENT.metadata.reconciliationConflict,
          resolution: "dismiss",
          resolvedAt: "2026-07-16T08:00:00.000Z",
          resolvedBy: "user_admin",
        },
      },
    };

    // Only one select call here (payment lookup — vendor lookup never reached because
    // we 400 before querying the vendor name).
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [alreadyResolved],
        }),
      }),
      insert: () => ({ values: async () => {} }),
    };

    const app = await buildApp(db);
    const { status, body } = await callApp(app, "POST", "/admin/payment-conflicts/99/resolve", {
      resolution: "paid",
    });

    expect(status).toBe(400);
    expect(body.error).toMatch(/already resolved/i);

    // No Slack message should have been sent for this rejected request
    expect(slackMessages).toHaveLength(0);
  });
});
