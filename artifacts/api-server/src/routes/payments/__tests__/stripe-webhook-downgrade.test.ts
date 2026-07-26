/**
 * Tests for POST /payments/stripe/webhook in webhooks.ts (the live,
 * publicly-mounted webhook pipeline — see routes/index.ts) covering:
 *
 *  - charge.refunded: reverts a vendor's paid subscription tier to "free"
 *    and records a vendor_notifications row.
 *  - charge.refunded with no matching vendor customer id: must not crash.
 *  - checkout.session.expired: both the subscription-upgrade path (no-op,
 *    just observability logging) and the order-checkout path (marks the
 *    pending payment as failed).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.STRIPE_SECRET_KEY = "sk_test_platform";

// ── Shared mock state ────────────────────────────────────────────────────────

type VendorRow = {
  id: number;
  subscriptionTier: string;
  stripeCustomerId: string | null;
  email: string | null;
  name: string;
};

let vendorRows: VendorRow[] = [];
let paymentRows: Array<{ providerReference: string; vendorId: number; amount: string; currency: string; status: string }> = [];
let notificationRows: Array<Record<string, unknown>> = [];
let webhookEventRows: Map<string, { processedAt: Date | null; errorMessage: string | null }> = new Map();
let constructedEvent: unknown = null;

const vendorsTableRef = { id: "vendors.id", stripeCustomerId: "vendors.stripeCustomerId" };
const paymentsTableRef = { providerReference: "payments.providerReference", vendorId: "payments.vendorId" };
const webhookEventsTableRef = { eventId: "webhookEvents.eventId", id: "webhookEvents.id" };
const vendorNotificationsTableRef = { id: "vendorNotifications.id" };
const ordersTableRef = { id: "orders.id" };

// ── Mock @workspace/db ────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (whereArg: { col: unknown; val: unknown }) => {
          if (table === vendorsTableRef) {
            const rows = vendorRows.filter((v) => v.stripeCustomerId === whereArg.val || v.id === whereArg.val);
            return Promise.resolve(rows);
          }
          if (table === webhookEventsTableRef) {
            const row = webhookEventRows.get(whereArg.val as string);
            return Promise.resolve(row ? [row] : []);
          }
          if (table === paymentsTableRef) {
            const row = paymentRows.find((p) => p.providerReference === whereArg.val);
            return Promise.resolve(row ? [row] : []);
          }
          return Promise.resolve([]);
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: (whereArg: { col: unknown; val: unknown }) => {
          const apply = (): unknown[] => {
            if (table === vendorsTableRef) {
              const idx = vendorRows.findIndex((v) => v.id === whereArg.val || v.stripeCustomerId === whereArg.val);
              if (idx === -1) return [];
              vendorRows[idx] = { ...vendorRows[idx], ...vals } as VendorRow;
              return [vendorRows[idx]];
            }
            if (table === paymentsTableRef) {
              const idx = paymentRows.findIndex((p) => p.providerReference === whereArg.val);
              if (idx === -1) return [];
              paymentRows[idx] = { ...paymentRows[idx], ...vals } as (typeof paymentRows)[number];
              return [paymentRows[idx]];
            }
            if (table === ordersTableRef) {
              return [];
            }
            if (table === webhookEventsTableRef) {
              const row = webhookEventRows.get(whereArg.val as string);
              if (row) {
                if ("processedAt" in vals) row.processedAt = vals.processedAt as Date | null;
                if ("errorMessage" in vals) row.errorMessage = vals.errorMessage as string | null;
              }
              return [];
            }
            return [];
          };

          // Support both `await db.update(...).where(...)` and
          // `await db.update(...).where(...).returning(...)`.
          const result = apply();
          return {
            returning: () => result,
            then: (resolve: (v: unknown) => void) => resolve(result),
          };
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        if (table === webhookEventsTableRef) {
          const eventId = vals.eventId as string;
          if (webhookEventRows.has(eventId)) {
            const err = new Error(
              'duplicate key value violates unique constraint "webhook_events_event_id_unique"',
            ) as Error & { code?: string };
            err.code = "23505";
            throw err;
          }
          webhookEventRows.set(eventId, {
            processedAt: (vals.processedAt as Date | null) ?? null,
            errorMessage: (vals.errorMessage as string | null) ?? null,
          });
          return Promise.resolve();
        }
        if (table === vendorNotificationsTableRef) {
          notificationRows.push(vals);
          return Promise.resolve();
        }
        return Promise.resolve();
      },
    }),
  },
  paymentsTable: paymentsTableRef,
  ordersTable: ordersTableRef,
  vendorsTable: vendorsTableRef,
  webhookEventsTable: webhookEventsTableRef,
  vendorNotificationsTable: vendorNotificationsTableRef,
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  sql: (strings: readonly string[], ...values: unknown[]) => ({ strings, values }),
}));

// ── Mock supporting libs so the route handler can run in isolation ───────────

const resolveGatewayFieldMock = vi.fn(async (_provider: string, field: string) => {
  if (field === "webhookSecret") return "whsec_test";
  if (field === "secretKey") return "sk_test_platform";
  return undefined;
});
vi.mock("../../../lib/platform-gateways", () => ({
  resolveGatewayField: resolveGatewayFieldMock,
}));

const notifyVendorPaymentStatusMock = vi.fn(async () => {});
vi.mock("../../../lib/push", () => ({
  notifyVendorPaymentStatus: notifyVendorPaymentStatusMock,
}));

const sendEmailMock = vi.fn(async () => ({ status: "sent" as const }));
vi.mock("../../../lib/mailer", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("../../../lib/email-branding", () => ({
  wrapVendorEmail: (opts: { bodyHtml: string }) => `<html>${opts.bodyHtml}</html>`,
  escapeHtml: (s: string) => s,
}));

const sendSlackAlertMock = vi.fn(async () => {});
vi.mock("../../../lib/slack", () => ({
  sendSlackAlert: sendSlackAlertMock,
}));

const enqueueWebhookEventMock = vi.fn();
vi.mock("../../../lib/webhook-buffer", () => ({
  registerSlackAlerter: vi.fn(),
  enqueueWebhookEvent: enqueueWebhookEventMock,
}));

const TEST_PLANS = [
  { tier: "starter", name: "Starter", features: ["Feature A"] },
  { tier: "pro", name: "Pro", features: ["Feature B", "Feature C"] },
  { tier: "enterprise", name: "Enterprise", features: ["Feature D"] },
];

vi.mock("../../../lib/subscription-plans", () => ({
  getSubscriptionPlan: vi.fn(async (tier: string) => TEST_PLANS.find((p) => p.tier === tier)),
  getSubscriptionPlans: vi.fn(async () => TEST_PLANS),
}));

// ── Mock the Stripe SDK ───────────────────────────────────────────────────────

vi.mock("stripe", () => {
  class MockStripe {
    webhooks = {
      constructEvent: vi.fn(() => constructedEvent),
    };
  }
  return { default: MockStripe };
});

// ── Minimal Express test helper ───────────────────────────────────────────────

import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

async function postWebhook(
  event: unknown,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  constructedEvent = event;

  const { default: router } = await import("../webhooks");

  const app = express();
  app.use("/payments/stripe/webhook", express.raw({ type: "*/*" }));
  app.use(router);
  app.use((err: unknown, _req: Request, res: Response, _next: (e?: unknown) => void) => {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  });

  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      fetch(`http://localhost:${addr.port}/payments/stripe/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": "t=1,v1=fake",
        },
        body: JSON.stringify({ dummy: true }),
      })
        .then(async (res) => {
          const text = await res.text();
          let json: Record<string, unknown> | null = null;
          try {
            json = JSON.parse(text) as Record<string, unknown>;
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

beforeEach(() => {
  vendorRows = [];
  paymentRows = [];
  notificationRows = [];
  webhookEventRows = new Map();
  vi.clearAllMocks();
  resolveGatewayFieldMock.mockImplementation(async (_provider: string, field: string) => {
    if (field === "webhookSecret") return "whsec_test";
    if (field === "secretKey") return "sk_test_platform";
    return undefined;
  });
});

describe("POST /payments/stripe/webhook — charge.refunded", () => {
  it("downgrades a vendor's paid tier to free and records a notification", async () => {
    vendorRows = [
      { id: 42, subscriptionTier: "pro", stripeCustomerId: "cus_abc", email: "vendor@example.com", name: "Acme Co" },
    ];

    const { status, body } = await postWebhook({
      id: "evt_refund_1",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_test_1",
          customer: "cus_abc",
        },
      },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ received: true });

    expect(vendorRows[0].subscriptionTier).toBe("free");
    expect(notificationRows).toHaveLength(1);
    expect(notificationRows[0]).toMatchObject({ vendorId: 42, type: "tier_change" });
  });

  it("does not crash when the refunded charge has no matching vendor customer id", async () => {
    vendorRows = [];

    const { status, body } = await postWebhook({
      id: "evt_refund_2",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_test_2",
          customer: "cus_unknown",
        },
      },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ received: true });
    expect(notificationRows).toHaveLength(0);
  });
});

describe("POST /payments/stripe/webhook — customer.subscription.updated", () => {
  it("notifies the vendor by email and in-app when their plan changes via the portal", async () => {
    vendorRows = [
      { id: 42, subscriptionTier: "starter", stripeCustomerId: "cus_abc", email: "vendor@example.com", name: "Acme Co" },
    ];

    const { status, body } = await postWebhook({
      id: "evt_sub_updated_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_abc",
          items: { data: [{ price: { metadata: { tier: "pro" } } }] },
        },
      },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ received: true });

    expect(vendorRows[0].subscriptionTier).toBe("pro");
    expect(notificationRows).toHaveLength(1);
    expect(notificationRows[0]).toMatchObject({ vendorId: 42, type: "tier_change" });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect((sendEmailMock.mock.calls[0] as unknown[])[0]).toMatchObject({ to: "vendor@example.com" });
  });

  it("does not notify when the plan switch resolves to the same tier", async () => {
    vendorRows = [
      { id: 43, subscriptionTier: "pro", stripeCustomerId: "cus_same", email: "same@example.com", name: "Same Co" },
    ];

    const { status, body } = await postWebhook({
      id: "evt_sub_updated_2",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_456",
          customer: "cus_same",
          items: { data: [{ price: { metadata: { tier: "pro" } } }] },
        },
      },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ received: true });
    expect(notificationRows).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("POST /payments/stripe/webhook — checkout.session.expired", () => {
  it("logs and no-ops for an abandoned subscription-upgrade checkout", async () => {
    vendorRows = [
      { id: 5, subscriptionTier: "free", stripeCustomerId: "cus_upgrade", email: "v5@example.com", name: "Vendor Five" },
    ];

    const { status, body } = await postWebhook({
      id: "evt_expired_upgrade",
      type: "checkout.session.expired",
      data: {
        object: {
          id: "cs_expired_upgrade",
          metadata: { upgradeVendorId: "5", upgradeTier: "pro" },
        },
      },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ received: true });
    // No tier was ever granted on an expired upgrade checkout, so nothing changes.
    expect(vendorRows[0].subscriptionTier).toBe("free");
    expect(notificationRows).toHaveLength(0);
  });

  it("marks an abandoned order checkout's payment as failed", async () => {
    paymentRows = [
      { providerReference: "cs_expired_order", vendorId: 9, amount: "50.00", currency: "USD", status: "pending" },
    ];

    const { status, body } = await postWebhook({
      id: "evt_expired_order",
      type: "checkout.session.expired",
      data: {
        object: {
          id: "cs_expired_order",
          metadata: { orderId: "123" },
        },
      },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ received: true });
    expect(paymentRows[0].status).toBe("failed");
    expect(notifyVendorPaymentStatusMock).toHaveBeenCalledWith(9, "failed", "50.00", "USD");
  });
});

describe("POST /payments/stripe/webhook — cancelled payment reconciliation conflict", () => {
  it("does not resurrect a vendor-cancelled payment when checkout.session.completed arrives late", async () => {
    paymentRows = [
      { providerReference: "cs_cancelled_order", vendorId: 9, amount: "50.00", currency: "USD", status: "cancelled" },
    ];
    notifyVendorPaymentStatusMock.mockClear();
    sendSlackAlertMock.mockClear();

    const { status, body } = await postWebhook({
      id: "evt_late_completed",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_cancelled_order",
          metadata: { orderId: "123" },
        },
      },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ received: true });
    // Status must stay "cancelled" — a late webhook must never silently flip it back to paid.
    expect(paymentRows[0].status).toBe("cancelled");
    expect(notifyVendorPaymentStatusMock).not.toHaveBeenCalled();
    expect(sendSlackAlertMock).toHaveBeenCalledTimes(1);
    expect((sendSlackAlertMock.mock.calls[0] as unknown[])[0]).toMatch(/reconciliation conflict/i);
  });

  it("does not resurrect a vendor-cancelled payment when checkout.session.expired arrives late", async () => {
    paymentRows = [
      { providerReference: "cs_cancelled_order_2", vendorId: 9, amount: "25.00", currency: "USD", status: "cancelled" },
    ];
    notifyVendorPaymentStatusMock.mockClear();
    sendSlackAlertMock.mockClear();

    const { status, body } = await postWebhook({
      id: "evt_late_expired",
      type: "checkout.session.expired",
      data: {
        object: {
          id: "cs_cancelled_order_2",
          metadata: { orderId: "123" },
        },
      },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ received: true });
    expect(paymentRows[0].status).toBe("cancelled");
    expect(notifyVendorPaymentStatusMock).not.toHaveBeenCalled();
    expect(sendSlackAlertMock).toHaveBeenCalledTimes(1);
  });
});
