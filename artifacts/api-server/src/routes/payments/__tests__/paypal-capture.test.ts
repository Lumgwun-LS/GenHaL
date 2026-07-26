/**
 * Tests for the PayPal capture flow:
 *
 * 1. Duplicate capture — if the local payment is already "paid", the route
 *    returns the already-paid status without calling PayPal a second time.
 * 2. Cancelled-before-capture — if the vendor cancelled the payment before
 *    the customer completed checkout, the route returns 409 and never calls
 *    PayPal (applyPaymentStatusTransition guards this for the webhook path too).
 * 3. PAYMENT.CAPTURE.COMPLETED webhook for a cancelled payment — treated as a
 *    reconciliation conflict (no-op, 200), status is NOT overwritten to "paid".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

// ── Shared state ──────────────────────────────────────────────────────────────

/** Keyed by providerReference (paypalOrderId). */
let paymentRows: Map<
  string,
  { id: number; vendorId: number; orderId: number | null; status: string; amount: string; currency: string; metadata: Record<string, unknown> }
> = new Map();

/** Tracks every db.update().set() call so tests can assert side-effects. */
let updateSetCalls: Array<Record<string, unknown>> = [];

/** Sentinel map shared between logWebhookEvent insert / update paths. */
let webhookEventRows: Map<string, { processedAt: Date | null; errorMessage: string | null }> = new Map();

/** Tracks which fetch() calls were actually made (to detect unwanted PayPal API calls). */
let fetchCalls: Array<{ url: string; method: string }> = [];

// ── Mock @workspace/db ────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const paymentsRef = { id: "id", providerReference: "providerReference", status: "status", vendorId: "vendorId", orderId: "orderId", amount: "amount", currency: "currency", metadata: "metadata" };
  const ordersRef = { id: "id" };
  const vendorsRef = { id: "id", paypalSubscriptionId: "paypalSubscriptionId" };
  const webhookRef = { id: "id", eventId: "eventId", processedAt: "processedAt", errorMessage: "errorMessage" };
  const notificationsRef = {};
  const vendorAddonRef = {};

  const makeDb = () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: (whereArg: { col?: string; val?: unknown }) => {
          if (table === paymentsRef) {
            const ref = whereArg?.val as string;
            const row = paymentRows.get(ref);
            return Promise.resolve(row ? [row] : []);
          }
          if (table === webhookRef) {
            const eventId = whereArg?.val as string;
            const row = webhookEventRows.get(eventId);
            return Promise.resolve(row ? [row] : []);
          }
          // vendors / others
          return Promise.resolve([]);
        },
      }),
    }),

    insert: (table: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        if (table === webhookRef) {
          const eventId = vals.eventId as string;
          if (webhookEventRows.has(eventId)) {
            const err = new Error('duplicate key value violates unique constraint "webhook_events_event_id_unique"') as Error & { code?: string };
            err.code = "23505";
            throw err;
          }
          webhookEventRows.set(eventId, {
            processedAt: null,
            errorMessage: vals.errorMessage as string | null ?? null,
          });
          return Promise.resolve();
        }
        // vendor_notifications, etc. — no-op
        return Promise.resolve();
      },
    }),

    update: (table: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: (whereArg: { col?: string; val?: unknown }) => {
          // Helper: apply the update to in-memory state and return rows.
          const applyUpdate = (): unknown[] => {
            if (table === paymentsRef) {
              const ref = whereArg?.val as string;
              const row = paymentRows.get(ref);
              if (!row) return [];
              updateSetCalls.push({ ...vals });
              if (vals.status) row.status = vals.status as string;
              if (vals.metadata) row.metadata = vals.metadata as Record<string, unknown>;
              return [{ id: row.id, vendorId: row.vendorId, orderId: row.orderId, amount: row.amount, currency: row.currency }];
            }
            if (table === webhookRef) {
              const eventId = whereArg?.val as string;
              const row = webhookEventRows.get(eventId);
              if (!row) return [];
              if (vals.processedAt) row.processedAt = vals.processedAt as Date;
              if ("errorMessage" in vals) row.errorMessage = vals.errorMessage as string | null;
              return [{ id: 1 }];
            }
            if (table === ordersRef) {
              return [{ id: whereArg?.val }];
            }
            return [];
          };

          return {
            returning: async (_cols?: Record<string, unknown>) => applyUpdate(),
            // When the caller awaits the where() directly (no .returning()),
            // execute the update so side-effects are still persisted.
            then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) => {
              try { resolve(applyUpdate()); } catch (e) { reject?.(e); }
            },
          };
        },
      }),
    }),
  });

  return {
    db: makeDb(),
    paymentsTable: paymentsRef,
    ordersTable: ordersRef,
    vendorsTable: vendorsRef,
    webhookEventsTable: webhookRef,
    vendorNotificationsTable: notificationsRef,
    vendorAddonCreditsTable: vendorAddonRef,
  };
});

// ── Mock drizzle-orm ──────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: unknown) => ({ val }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({ sql: strings.join("?"), vals }),
}));

// ── Mock platform-gateways ────────────────────────────────────────────────────

vi.mock("../../../lib/platform-gateways", () => ({
  getPlatformCredentials: async (_provider: string) => ({
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    mode: "sandbox",
  }),
  resolveGatewayField: async (provider: string, field: string) => {
    if (provider === "paypal" && field === "clientId") return "test-client-id";
    if (provider === "paypal" && field === "clientSecret") return "test-client-secret";
    if (provider === "paypal" && field === "mode") return "sandbox";
    if (provider === "paypal" && field === "webhookId") return "WH-TEST-ID";
    return undefined;
  },
}));

// ── Mock paypal-catalog ───────────────────────────────────────────────────────

vi.mock("../../../lib/paypal-catalog", () => ({
  getPayPalAccessToken: async () => "access-token-mock",
  paypalBaseUrl: () => "https://api-m.sandbox.paypal.com",
  verifyPayPalWebhookSignature: async () => true,
}));

// ── Mock sales-sync ───────────────────────────────────────────────────────────

vi.mock("../../../lib/sales-sync", () => ({
  syncSaleFromPayment: vi.fn(async () => {}),
}));

// ── Mock push notifications ───────────────────────────────────────────────────

vi.mock("../../../lib/push", () => ({
  notifyVendorPaymentStatus: vi.fn(async () => {}),
  sendPushToVendor: vi.fn(async () => {}),
}));

// ── Mock Slack ────────────────────────────────────────────────────────────────

vi.mock("../../../lib/slack", () => ({
  sendSlackAlert: vi.fn(async () => {}),
}));

// ── Mock webhook-buffer ───────────────────────────────────────────────────────

vi.mock("../../../lib/webhook-buffer", () => ({
  enqueueWebhookEvent: vi.fn(),
  registerSlackAlerter: vi.fn(),
}));

// ── Mock vendor-keys ──────────────────────────────────────────────────────────

vi.mock("../../../lib/vendor-keys", () => ({
  resolveStripeKey: vi.fn(async () => "sk_test_mock"),
  resolvePaystackKey: vi.fn(async () => "sk_paystack_mock"),
  canAddPaymentKeys: () => true,
}));

// ── Mock Stripe ───────────────────────────────────────────────────────────────

vi.mock("stripe", () => {
  class MockStripe {
    webhooks = { constructEvent: vi.fn(() => ({ type: "unknown" })) };
  }
  return { default: MockStripe };
});

// ── Mock subscription helpers ─────────────────────────────────────────────────

vi.mock("../../../lib/subscription-notifications", () => ({
  insertTierChangeNotification: vi.fn(async () => {}),
  sendSubscriptionCancelledEmail: vi.fn(async () => {}),
}));

vi.mock("../../../lib/mailer", () => ({
  sendEmail: vi.fn(async () => ({ status: "sent" })),
}));

vi.mock("../../../lib/email-branding", () => ({
  wrapVendorEmail: ({ bodyHtml }: { bodyHtml: string }) => bodyHtml,
  escapeHtml: (s: string) => s,
}));

vi.mock("../../../lib/subscription-plans", () => ({
  getSubscriptionPlan: vi.fn(async () => null),
  SUBSCRIPTION_PLANS: [],
}));

// ── Intercept global fetch ────────────────────────────────────────────────────
// Requests to the local test Express server (localhost) are passed through to
// the real fetch; requests to PayPal's sandbox API are intercepted so tests can
// assert whether a PayPal API call was (or was not) made.

const _realFetch = globalThis.fetch;

beforeEach(() => {
  paymentRows = new Map();
  updateSetCalls = [];
  webhookEventRows = new Map();
  fetchCalls = [];
  vi.clearAllMocks();

  globalThis.fetch = vi.fn(async (url: string | Request | URL, init?: RequestInit) => {
    const urlStr = String(url);

    // Pass localhost calls (test server) through to the real implementation.
    if (urlStr.startsWith("http://localhost")) {
      return _realFetch(url as Parameters<typeof _realFetch>[0], init);
    }

    // Intercept PayPal API calls.
    fetchCalls.push({ url: urlStr, method: (init?.method ?? "GET").toUpperCase() });

    // Return a successful capture response (only reached for non-guard tests).
    return new Response(
      JSON.stringify({
        status: "COMPLETED",
        purchase_units: [{ payments: { captures: [{ id: "cap-123", status: "COMPLETED" }] } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
});

// ── Express test helpers ──────────────────────────────────────────────────────

async function postCapture(
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { default: router } = await import("../paypal");
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use((_err: unknown, _req: Request, res: Response, _next: () => void) => {
    res.status(500).json({ error: "internal" });
  });

  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      fetch(`http://localhost:${addr.port}/payments/paypal/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(async (res) => {
          const json = (await res.json()) as Record<string, unknown>;
          server.close();
          resolve({ status: res.status, body: json });
        })
        .catch((err) => { server.close(); reject(err); });
    });
  });
}

async function postPayPalWebhook(
  event: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { default: router } = await import("../webhooks");
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use((_err: unknown, _req: Request, res: Response, _next: () => void) => {
    res.status(500).json({ error: "internal" });
  });

  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      fetch(`http://localhost:${addr.port}/payments/paypal/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "paypal-transmission-id": "test-tx-id",
          "paypal-transmission-time": "2026-01-01T00:00:00Z",
          "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/test",
          "paypal-transmission-sig": "test-sig",
          "paypal-auth-algo": "SHA256withRSA",
        },
        body: JSON.stringify(event),
      })
        .then(async (res) => {
          const json = (await res.json()) as Record<string, unknown>;
          server.close();
          resolve({ status: res.status, body: json });
        })
        .catch((err) => { server.close(); reject(err); });
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Suite 1 — POST /payments/paypal/capture
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /payments/paypal/capture — idempotency and cancellation guards", () => {
  it("returns already-paid status immediately when the payment is already paid, without calling PayPal", async () => {
    paymentRows.set("ORDER-ALREADY-PAID", {
      id: 42,
      vendorId: 5,
      orderId: 10,
      status: "paid",
      amount: "50.00",
      currency: "USD",
      metadata: {},
    });

    const { status, body } = await postCapture({ paypalOrderId: "ORDER-ALREADY-PAID" });

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, paymentId: 42, status: "paid" });

    // No PayPal capture API call should have been made.
    const paypalCaptureCalls = fetchCalls.filter((c) =>
      c.url.includes("/v2/checkout/orders/") && c.url.includes("/capture"),
    );
    expect(paypalCaptureCalls).toHaveLength(0);

    // The payment row must remain untouched.
    expect(paymentRows.get("ORDER-ALREADY-PAID")!.status).toBe("paid");
    expect(updateSetCalls).toHaveLength(0);
  });

  it("returns 409 when the payment was cancelled by the vendor, without calling PayPal", async () => {
    paymentRows.set("ORDER-CANCELLED", {
      id: 99,
      vendorId: 7,
      orderId: 20,
      status: "cancelled",
      amount: "75.00",
      currency: "USD",
      metadata: {},
    });

    const { status, body } = await postCapture({ paypalOrderId: "ORDER-CANCELLED" });

    expect(status).toBe(409);
    expect(body).toMatchObject({ error: expect.stringMatching(/cancelled/i) });

    // No PayPal capture API call should have been made.
    const paypalCaptureCalls = fetchCalls.filter((c) =>
      c.url.includes("/v2/checkout/orders/") && c.url.includes("/capture"),
    );
    expect(paypalCaptureCalls).toHaveLength(0);

    // Status must not have changed.
    expect(paymentRows.get("ORDER-CANCELLED")!.status).toBe("cancelled");
    expect(updateSetCalls).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Suite 2 — PAYMENT.CAPTURE.COMPLETED webhook for a cancelled payment
// ═════════════════════════════════════════════════════════════════════════════

describe("PayPal PAYMENT.CAPTURE.COMPLETED webhook — cancelled payment is a no-op conflict", () => {
  it("returns 200 and does not mark the payment as paid when the local row is cancelled", async () => {
    const paypalOrderId = "ORDER-WEBOOK-CANCELLED";

    paymentRows.set(paypalOrderId, {
      id: 77,
      vendorId: 3,
      orderId: 55,
      status: "cancelled",
      amount: "120.00",
      currency: "USD",
      metadata: {},
    });

    const event = {
      id: "paypal-evt-conflict-001",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAPTURE-ID-001",
        supplementary_data: {
          related_ids: { order_id: paypalOrderId },
        },
        amount: { value: "120.00", currency_code: "USD" },
      },
    };

    const { status, body } = await postPayPalWebhook(event);

    // Webhook handler must always return 200 so PayPal stops retrying.
    expect(status).toBe(200);
    expect(body).toMatchObject({ received: true });

    // The payment status must remain "cancelled" — applyPaymentStatusTransition
    // detected a conflict and preserved the existing status.
    const row = paymentRows.get(paypalOrderId)!;
    expect(row.status).toBe("cancelled");

    // The conflict must have been recorded in metadata for audit purposes.
    expect(row.metadata).toMatchObject({
      reconciliationConflict: expect.objectContaining({
        attemptedStatus: "paid",
        provider: "paypal",
      }),
    });
  });
});
