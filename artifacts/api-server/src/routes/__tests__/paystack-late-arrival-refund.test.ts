/**
 * Tests for the Paystack late-arrival refund guard in
 * POST /payments/paystack/webhook (charge.success on a cancelled payment).
 *
 * Three scenarios:
 *  1. Happy path   — refund API returns status:true  → lateArrivalRefunded:true written to metadata.
 *  2. Failure path — refund API returns status:false → lateArrivalRefundFailed:true + Slack alert + vendor notification.
 *  3. Key check    — verifies the refund POST is made with the correct Paystack key and reference.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

// ── Constants ─────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = "whsec_test_paystack_secret";
const PAYSTACK_KEY   = "sk_test_paystack_vendor_key";
const REFERENCE      = "ps_ref_cancelled_123";
const PAYMENT_ID     = 42;
const VENDOR_ID      = 7;

const CANCELLED_PAYMENT = {
  id:                PAYMENT_ID,
  vendorId:          VENDOR_ID,
  orderId:           null,
  provider:          "paystack",
  providerReference: REFERENCE,
  amount:            "5000.00",
  currency:          "NGN",
  status:            "cancelled",
  metadata:          { someExisting: true },
  updatedAt:         new Date("2026-07-01T00:00:00.000Z"),
};

const MOCK_VENDOR = {
  id:                VENDOR_ID,
  subscriptionTier:  "free",
  verificationLevel: "basic",
};

// ── Mutable state shared across tests ─────────────────────────────────────────

let selectQueue: Array<unknown[]> = [];
let updateCalls: Array<{ table: string; set: Record<string, unknown> }> = [];
let insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];
let slackAlerts: string[] = [];
let fetchCalls: Array<{ url: string; body: Record<string, unknown>; authHeader: string }> = [];

// Will be set per-test to control what /refund returns.
let refundApiResponse: { status: boolean; message: string } = { status: true, message: "Refund queued" };

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  // A chainable builder that drains `selectQueue` when awaited.
  const makeSelectChain = () => {
    const inner: any = {
      from:    () => inner,
      where:   () => inner,
      orderBy: () => inner,
      limit:   async () => selectQueue.shift() ?? [],
      then: (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(resolve, reject),
    };
    return inner;
  };

  return {
    db: {
      select: () => makeSelectChain(),

      insert: (table: { [k: string]: string }) => ({
        values: (vals: Record<string, unknown> | Record<string, unknown>[]) => {
          const tableName = Object.keys(table)[0] ?? "unknown";
          const arr = Array.isArray(vals) ? vals : [vals];
          arr.forEach((v) => insertCalls.push({ table: tableName, values: v }));
          return { returning: async () => arr.map((v, i) => ({ id: 9000 + i, ...v })) };
        },
      }),

      update: (table: { [k: string]: string }) => ({
        set: (setVals: Record<string, unknown>) => ({
          where: (whereClause: unknown) => {
            const tableName = Object.keys(table)[0] ?? "unknown";
            updateCalls.push({ table: tableName, set: setVals });
            return { returning: async () => [] };
          },
        }),
      }),
    },

    // Table objects — just need keys so column references don't crash.
    paymentsTable:            { id: "payments.id", vendorId: "payments.vendor_id", providerReference: "payments.provider_reference", status: "payments.status", metadata: "payments.metadata", updatedAt: "payments.updated_at" },
    ordersTable:              { id: "orders.id", paymentStatus: "orders.payment_status", updatedAt: "orders.updated_at" },
    vendorsTable:             { id: "vendors.id", subscriptionTier: "vendors.subscription_tier", verificationLevel: "vendors.verification_level" },
    webhookEventsTable:       { id: "webhook_events.id", eventId: "webhook_events.event_id", processedAt: "webhook_events.processed_at", errorMessage: "webhook_events.error_message" },
    vendorNotificationsTable: { id: "vendor_notifications.id" },
    vendorAddonCreditsTable:  { id: "vendor_addon_credits.id" },
  };
});

vi.mock("@workspace/db/schema", () => ({
  vendorPaymentCredentialsTable:   {},
  platformPaymentCredentialsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq:  (col: unknown, val: unknown) => ({ eq: [col, val] }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings, values }),
    { raw: (s: string) => s },
  ),
  and: (...args: unknown[]) => ({ and: args }),
  desc: (col: unknown) => ({ desc: col }),
  inArray: (col: unknown, vals: unknown[]) => ({ inArray: [col, vals] }),
}));

// resolveGatewayField("paystack", "webhookSecret") → WEBHOOK_SECRET so we can sign requests.
vi.mock("../../lib/platform-gateways", () => ({
  resolveGatewayField: async (_gateway: string, _field: string) => WEBHOOK_SECRET,
  getPlatformCredentials: async () => null,
  GATEWAY_DEFS: { stripe: {}, paystack: {}, remita: {}, flutterwave: {}, nomba: {}, paypal: {} },
}));

// resolvePaystackKey → PAYSTACK_KEY (the key that should appear in the refund Authorization header).
vi.mock("../../lib/vendor-keys", () => ({
  resolvePaystackKey: async () => PAYSTACK_KEY,
  canAddPaymentKeys:  () => false,
}));

// The DB-driven select in resolvePaystackKey uses @workspace/db/schema imports —
// stub them so the key-resolution path doesn't crash looking up credentials.
vi.mock("../../lib/encryption", () => ({
  decrypt: (s: string) => s,
  encrypt: (s: string) => s,
}));

vi.mock("../../lib/slack", () => ({
  sendSlackAlert: async (msg: string) => { slackAlerts.push(msg); },
}));

vi.mock("../../lib/webhook-buffer", () => ({
  enqueueWebhookEvent:  () => {},
  registerSlackAlerter: () => {},
}));

vi.mock("../../lib/sales-sync", () => ({
  syncSaleFromPayment: async () => {},
}));

vi.mock("../../lib/push", () => ({
  notifyVendorPaymentStatus: async () => {},
}));

vi.mock("../../lib/mailer", () => ({
  sendEmail: async () => ({ status: "sent" }),
}));

vi.mock("../../lib/email-branding", () => ({
  wrapVendorEmail: (opts: { bodyHtml: string }) => opts.bodyHtml,
  escapeHtml:      (s: string) => s,
}));

vi.mock("../../lib/subscription-plans", () => ({
  getSubscriptionPlan:  async () => null,
  getSubscriptionPlans: async () => [],
}));

vi.mock("../../lib/subscription-notifications", () => ({
  insertTierChangeNotification:      async () => {},
  sendSubscriptionCancelledEmail:    async () => {},
}));

vi.mock("../../lib/subscription-sync", () => ({
  applyVendorPaystackTierUpgrade: async () => ({ applied: false, reason: "stub" }),
}));

vi.mock("stripe", () => {
  const FakeStripe = function () { return {}; };
  return { default: FakeStripe };
});

// ── Mock global fetch — intercept Paystack /refund calls ──────────────────────

// Capture the real fetch BEFORE we stub it so the test-HTTP helper keeps working.
const realFetch = globalThis.fetch;

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  // Let calls to the local test server (loopback) pass through to the real fetch.
  if (typeof url === "string" && url.startsWith("http://localhost")) {
    return realFetch(url, init);
  }

  const body = init?.body ? JSON.parse(init.body as string) : {};
  const authHeader = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
  fetchCalls.push({ url, body, authHeader });

  // Paystack /refund → return the per-test response.
  if (typeof url === "string" && url.includes("/refund")) {
    return {
      ok:   refundApiResponse.status,
      json: async () => refundApiResponse,
    } as unknown as Response;
  }

  return { ok: false, json: async () => ({}) } as unknown as Response;
});

// ── App factory ───────────────────────────────────────────────────────────────

async function buildWebhookApp() {
  vi.resetModules();
  const { default: router } = await import("../payments/webhooks");
  const app = express();
  // Paystack webhook handler needs the raw body as a Buffer for HMAC verification.
  app.use(
    express.raw({ type: "*/*" }),
  );
  app.use(router);
  app.use((_err: unknown, _req: Request, res: Response, _next: (e?: unknown) => void) => {
    res.status(500).json({ error: _err instanceof Error ? _err.message : "Internal error" });
  });
  return app;
}

/** Signs a Paystack webhook payload and posts it to the running app. */
function postPaystackWebhook(
  app: express.Express,
  payload: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const raw  = JSON.stringify(payload);
    const sig  = crypto.createHmac("sha512", WEBHOOK_SECRET).update(raw).digest("hex");
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      fetch(`http://localhost:${addr.port}/payments/paystack/webhook`, {
        method:  "POST",
        headers: {
          "Content-Type":         "application/json",
          "x-paystack-signature": sig,
        },
        body: raw,
      })
        .then(async (res) => {
          const text = await res.text();
          let json: unknown = null;
          try { json = JSON.parse(text); } catch { json = null; }
          server.close();
          resolve({ status: res.status, body: json });
        })
        .catch((err) => { server.close(); reject(err); });
    });
  });
}

/** Builds the standard charge.success event for a regular (non-subscription) order. */
function chargeSuccessEvent(reference: string) {
  return {
    event: "charge.success",
    data:  {
      id:        12345,
      reference,
      metadata:  { orderId: "99" },
      plan:      null,
      plan_object: null,
      customer:  { customer_code: "CUS_abc" },
    },
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

/**
 * Queues the DB responses needed for every cancelled-payment scenario:
 *
 *  Select 1: applyPaymentStatusTransition  → SELECT from payments → cancelled payment
 *  Select 2: attemptPaystackLateArrivalRefund → SELECT from payments → cancelled payment
 *  Select 3: attemptPaystackLateArrivalRefund → SELECT from vendors  → vendor row
 *
 * (logWebhookEvent uses INSERT, not SELECT; markWebhookProcessed uses UPDATE.)
 */
function queueCancelledPaymentSelects() {
  selectQueue.push([CANCELLED_PAYMENT]);  // applyPaymentStatusTransition
  selectQueue.push([CANCELLED_PAYMENT]);  // attemptPaystackLateArrivalRefund — payment
  selectQueue.push([MOCK_VENDOR]);        // attemptPaystackLateArrivalRefund — vendor
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Paystack late-arrival refund guard", () => {
  beforeEach(() => {
    selectQueue  = [];
    updateCalls  = [];
    insertCalls  = [];
    slackAlerts  = [];
    fetchCalls   = [];
    refundApiResponse = { status: true, message: "Refund queued" };
    vi.clearAllMocks();
  });

  // ── Test 1: Paystack /refund API is called with the correct reference and key ──

  it("calls the Paystack /refund API with the resolved key and the original reference", async () => {
    queueCancelledPaymentSelects();
    const app = await buildWebhookApp();

    const res = await postPaystackWebhook(app, chargeSuccessEvent(REFERENCE));
    expect(res.status).toBe(200);

    // The fetch to Paystack /refund must have been made exactly once.
    const refundCall = fetchCalls.find((c) => c.url.includes("/refund"));
    expect(refundCall).toBeDefined();

    // Body must carry the original transaction reference.
    expect(refundCall!.body).toMatchObject({ transaction: REFERENCE });

    // Authorization header must carry the resolved Paystack key.
    expect(refundCall!.authHeader).toBe(`Bearer ${PAYSTACK_KEY}`);
  });

  // ── Test 2: Happy path — lateArrivalRefunded:true written to metadata ─────────

  it("stamps lateArrivalRefunded:true on the payment metadata when the refund succeeds", async () => {
    refundApiResponse = { status: true, message: "Refund queued" };
    queueCancelledPaymentSelects();
    const app = await buildWebhookApp();

    const res = await postPaystackWebhook(app, chargeSuccessEvent(REFERENCE));
    expect(res.status).toBe(200);

    // Find the metadata update for the refund success stamp (not the reconciliationConflict one).
    const refundSuccessUpdate = updateCalls.find(
      (c) => c.set.metadata && (c.set.metadata as Record<string, unknown>).lateArrivalRefunded === true,
    );
    expect(refundSuccessUpdate).toBeDefined();
    expect((refundSuccessUpdate!.set.metadata as Record<string, unknown>).lateArrivalRefundedAt).toBeDefined();

    // No failure flag should be present on any update.
    const failureUpdate = updateCalls.find(
      (c) => c.set.metadata && (c.set.metadata as Record<string, unknown>).lateArrivalRefundFailed === true,
    );
    expect(failureUpdate).toBeUndefined();

    // No Slack alert should fire on the happy path (the reconciliation-conflict
    // alert from applyPaymentStatusTransition fires, but NOT the refund-failure one).
    const refundFailureAlert = slackAlerts.find((a) => a.includes("automatic refund") || a.includes("refund failed") || a.includes("Automatic refund attempt failed"));
    expect(refundFailureAlert).toBeUndefined();
  });

  // ── Test 3: Failure path — refund API returns status:false ───────────────────

  it("stamps lateArrivalRefundFailed:true, fires a Slack alert, and inserts a vendor notification when the refund API returns status:false", async () => {
    refundApiResponse = { status: false, message: "Transaction not found or already refunded" };
    queueCancelledPaymentSelects();
    const app = await buildWebhookApp();

    const res = await postPaystackWebhook(app, chargeSuccessEvent(REFERENCE));
    expect(res.status).toBe(200);

    // lateArrivalRefundFailed:true must be written to the payment metadata.
    const failureUpdate = updateCalls.find(
      (c) => c.set.metadata && (c.set.metadata as Record<string, unknown>).lateArrivalRefundFailed === true,
    );
    expect(failureUpdate).toBeDefined();
    expect((failureUpdate!.set.metadata as Record<string, unknown>).lateArrivalRefundFailedAt).toBeDefined();
    expect((failureUpdate!.set.metadata as Record<string, unknown>).lateArrivalRefundError).toBeDefined();

    // A Slack alert must fire mentioning the failure.
    const refundFailureAlert = slackAlerts.find(
      (a) => a.includes("late-arrival refund failed") || a.includes("manual action required"),
    );
    expect(refundFailureAlert).toBeDefined();
    expect(refundFailureAlert).toContain(String(PAYMENT_ID));
    expect(refundFailureAlert).toContain(REFERENCE);

    // An in-app vendor notification must be inserted.
    const notification = insertCalls.find(
      (c) =>
        (c.values.vendorId === VENDOR_ID || c.values.vendorId === undefined) &&
        typeof c.values.message === "string" &&
        (c.values.message as string).includes(REFERENCE),
    );
    expect(notification).toBeDefined();
    expect(notification!.values.type).toBe("payment");

    // The happy-path flag must NOT be set.
    const successUpdate = updateCalls.find(
      (c) => c.set.metadata && (c.set.metadata as Record<string, unknown>).lateArrivalRefunded === true,
    );
    expect(successUpdate).toBeUndefined();
  });
});
