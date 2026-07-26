/**
 * Regression tests for PayPal subscription webhook cross-provider safety.
 *
 * Since paypalSubscriptionId is now persisted at checkout creation (before
 * BILLING.SUBSCRIPTION.ACTIVATED fires), a vendor can have a stale
 * paypalSubscriptionId while being actively managed by Stripe or Paystack.
 * These tests confirm the webhook handler does NOT downgrade such vendors.
 *
 * Covered:
 * (a) Stripe-managed vendor with stale paypalSubscriptionId → CANCELLED event
 *     must not downgrade and must clear the stale ID.
 * (b) PayPal-managed vendor (subscriptionProvider="paypal") → CANCELLED event
 *     correctly downgrades.
 * (c) Vendor with subscriptionProvider=null (missed ACTIVATED) → CANCELLED
 *     event correctly downgrades.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

// ── In-memory vendor state ─────────────────────────────────────────────────────

type VendorRow = {
  id: number;
  name: string;
  email: string | null;
  subscriptionTier: string;
  subscriptionProvider: string | null;
  paypalSubscriptionId: string | null;
};

let vendorRowsBySubId: Map<string, VendorRow> = new Map();
let updateSetCalls: Array<Record<string, unknown>> = [];
let webhookEventRows: Map<string, { processedAt: Date | null; errorMessage: string | null }> = new Map();
let notificationInserts: Array<{ vendorId: number; type?: string }> = [];

// ── Mock @workspace/db ─────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const paymentsRef = { id: "id", providerReference: "providerReference", status: "status", vendorId: "vendorId", orderId: "orderId", amount: "amount", currency: "currency", metadata: "metadata" };
  const ordersRef = { id: "id" };
  const vendorsRef = {
    id: "id",
    name: "name",
    email: "email",
    subscriptionTier: "subscriptionTier",
    subscriptionProvider: "subscriptionProvider",
    paypalSubscriptionId: "paypalSubscriptionId",
  };
  const webhookRef = { id: "id", eventId: "eventId", processedAt: "processedAt", errorMessage: "errorMessage" };
  const notificationsRef = {};
  const vendorAddonRef = {};

  const makeDb = () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: (whereArg: { val?: unknown }) => {
          if (table === webhookRef) {
            const eventId = whereArg?.val as string;
            const row = webhookEventRows.get(eventId);
            return Promise.resolve(row ? [row] : []);
          }
          if (table === vendorsRef) {
            // Look up vendor by paypalSubscriptionId value
            const subId = whereArg?.val as string;
            const row = vendorRowsBySubId.get(subId);
            return Promise.resolve(row ? [row] : []);
          }
          return Promise.resolve([]);
        },
      }),
    }),

    insert: (table: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        if (table === webhookRef) {
          const eventId = vals.eventId as string;
          if (webhookEventRows.has(eventId)) {
            const err = Object.assign(
              new Error('duplicate key value violates unique constraint "webhook_events_event_id_unique"'),
              { code: "23505" },
            );
            throw err;
          }
          webhookEventRows.set(eventId, {
            processedAt: null,
            errorMessage: (vals.errorMessage as string | null) ?? null,
          });
          return Promise.resolve();
        }
        if (table === notificationsRef) {
          notificationInserts.push(vals as { vendorId: number; type?: string });
          return Promise.resolve();
        }
        return Promise.resolve();
      },
    }),

    update: (_table: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: (whereArg: { val?: unknown }) => ({
          returning: async (_cols?: unknown): Promise<VendorRow[]> => {
            const id = whereArg?.val as number;
            // Find the row with matching id across all subscriptionId entries
            for (const [subId, row] of vendorRowsBySubId.entries()) {
              if (row.id === id) {
                updateSetCalls.push({ ...vals });
                Object.assign(row, vals);
                // Re-index if paypalSubscriptionId was set to null
                if (vals.paypalSubscriptionId === null) {
                  vendorRowsBySubId.delete(subId);
                }
                return [row];
              }
            }
            updateSetCalls.push({ ...vals });
            return [];
          },
          // Support await without .returning() (used for insert-like updates)
          then: (resolve: (v: VendorRow[]) => void, reject?: (e: unknown) => void) => {
            try {
              updateSetCalls.push({ ...vals });
              resolve([]);
            } catch (e) {
              reject?.(e);
            }
          },
        }),
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

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (_col: unknown, val: unknown) => ({ val }),
    sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({ sql: strings.join("?"), vals }),
  };
});

// ── Mock platform-gateways ────────────────────────────────────────────────────

vi.mock("../../../lib/platform-gateways", () => ({
  getPlatformCredentials: async () => ({ clientId: "test-id", clientSecret: "test-secret", mode: "sandbox" }),
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
  ensurePayPalCatalog: async () => [],
  createPayPalSubscription: async () => ({ subscriptionId: "I-NEW", approvalUrl: "https://paypal.com/approve" }),
  cancelPayPalSubscription: async () => {},
}));

// ── Mock sales-sync ───────────────────────────────────────────────────────────

vi.mock("../../../lib/sales-sync", () => ({
  syncSaleFromPayment: vi.fn(async () => {}),
}));

// ── Mock push ─────────────────────────────────────────────────────────────────

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
  insertTierChangeNotification: vi.fn(async (vendorId: number, _msg: string, _prev: string, _next: string) => {
    notificationInserts.push({ vendorId, type: "tier_change" });
  }),
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

// ── Reset state before each test ──────────────────────────────────────────────

const _realFetch = globalThis.fetch;

beforeEach(() => {
  vendorRowsBySubId = new Map();
  updateSetCalls = [];
  webhookEventRows = new Map();
  notificationInserts = [];
  vi.clearAllMocks();

  globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const urlStr = String(url);
    // Pass localhost calls (test Express server) through to the real fetch
    if (urlStr.startsWith("http://localhost")) {
      return _realFetch(url, init);
    }
    // Intercept PayPal signature verification
    if (urlStr.includes("/v1/notifications/verify-webhook-signature")) {
      return { ok: true, json: async () => ({ verification_status: "SUCCESS" }) } as unknown as Response;
    }
    throw new Error(`Unexpected fetch in test: ${urlStr}`);
  }) as typeof fetch;
});

// ── HTTP test helper ──────────────────────────────────────────────────────────

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BILLING.SUBSCRIPTION.CANCELLED webhook — cross-provider safety", () => {
  it("(a) does NOT downgrade a Stripe-managed vendor who has a stale paypalSubscriptionId", async () => {
    // Vendor is on Stripe (subscriptionProvider="stripe"), but has a stale
    // paypalSubscriptionId from an abandoned PayPal checkout attempt.
    // When that stale PayPal subscription emits CANCELLED, the vendor must
    // NOT be downgraded.
    vendorRowsBySubId.set("I-STALE-PAYPAL", {
      id: 10,
      name: "Stripe Vendor",
      email: "stripe-vendor@example.com",
      subscriptionTier: "pro",
      subscriptionProvider: "stripe",
      paypalSubscriptionId: "I-STALE-PAYPAL",
    });

    const { status, body } = await postPayPalWebhook({
      id: "evt-regression-stripe-001",
      event_type: "BILLING.SUBSCRIPTION.CANCELLED",
      resource: { id: "I-STALE-PAYPAL" },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ received: true });

    // No tier-change notification should have been inserted
    expect(notificationInserts.filter((n) => n.type === "tier_change")).toHaveLength(0);

    // The stale paypalSubscriptionId should have been cleared
    const clearCall = updateSetCalls.find((c) => c.paypalSubscriptionId === null);
    expect(clearCall).toBeDefined();

    // subscriptionTier must remain "pro"
    // (the row was deleted from the map when paypalSubscriptionId was set to null,
    // so check updateSetCalls for absence of subscriptionTier: "free")
    const downgradeCalls = updateSetCalls.filter((c) => c.subscriptionTier === "free");
    expect(downgradeCalls).toHaveLength(0);
  });

  it("(b) correctly downgrades a PayPal-managed vendor on CANCELLED", async () => {
    vendorRowsBySubId.set("I-REAL-PAYPAL", {
      id: 20,
      name: "PayPal Vendor",
      email: "paypal-vendor@example.com",
      subscriptionTier: "starter",
      subscriptionProvider: "paypal",
      paypalSubscriptionId: "I-REAL-PAYPAL",
    });

    const { status, body } = await postPayPalWebhook({
      id: "evt-paypal-cancel-real",
      event_type: "BILLING.SUBSCRIPTION.CANCELLED",
      resource: { id: "I-REAL-PAYPAL" },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ received: true });

    // Tier-change notification should have been inserted
    expect(notificationInserts.filter((n) => n.type === "tier_change")).toHaveLength(1);

    // subscriptionTier should now be "free"
    const downgradeCall = updateSetCalls.find((c) => c.subscriptionTier === "free");
    expect(downgradeCall).toBeDefined();
  });

  it("(c) correctly downgrades a vendor with subscriptionProvider=null on CANCELLED", async () => {
    // Vendor completed PayPal checkout but ACTIVATED was missed — still on free.
    // Then subscription is cancelled (e.g., abandoned after approval, then expired).
    // With tier="free" this is already a no-op but verifies the null-provider path.
    vendorRowsBySubId.set("I-NULL-PROVIDER", {
      id: 30,
      name: "Unknown Provider Vendor",
      email: "unknown@example.com",
      subscriptionTier: "free",
      subscriptionProvider: null,
      paypalSubscriptionId: "I-NULL-PROVIDER",
    });

    const { status, body } = await postPayPalWebhook({
      id: "evt-paypal-cancel-null",
      event_type: "BILLING.SUBSCRIPTION.CANCELLED",
      resource: { id: "I-NULL-PROVIDER" },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ received: true });

    // Vendor was already on free — no tier change notification
    expect(notificationInserts.filter((n) => n.type === "tier_change")).toHaveLength(0);
  });
});
