/**
 * End-to-end HTTP simulation of the missed-cancellation reconciliation flow
 * through the actual POST /vendors/:id/subscription/sync route (the route a
 * vendor's "Refresh billing status" button calls) — not just the underlying
 * reconcileVendorSubscription function.
 *
 * Uses a small fake Stripe backend that behaves like the real Subscriptions
 * API (active → cancelled) so the route is driven through the same
 * "missed cancellation" sequence a real Stripe test-mode account would
 * produce: an active subscription, cancelled directly on Stripe with no
 * webhook delivered, then discovered by the route's live reconciliation call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface FakeVendor {
  id: number;
  email: string;
  clerkUserId: string;
  subscriptionTier: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

const MOCK_VENDOR: FakeVendor = {
  id: 1,
  email: "vendor@example.com",
  clerkUserId: "user_vendor",
  subscriptionTier: "pro",
  stripeCustomerId: "cus_route_lifecycle",
  stripeSubscriptionId: "sub_route_lifecycle",
};

let activeSubscription: { id: string; customer: string; tier: string } | null = {
  id: "sub_route_lifecycle",
  customer: "cus_route_lifecycle",
  tier: "pro",
};

const notifications: Array<{ vendorId: number }> = [];
const emails: Array<{ email: string }> = [];

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => [MOCK_VENDOR],
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: () => {
            Object.assign(MOCK_VENDOR, vals);
            return Promise.resolve([{ id: MOCK_VENDOR.id, subscriptionTier: MOCK_VENDOR.subscriptionTier }]);
          },
        }),
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  vendorsTable: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: "user_vendor" }),
}));

vi.mock("../../lib/platform-gateways", () => ({
  resolveGatewayField: async () => "sk_test_platform",
}));

vi.mock("../../lib/stripe-catalog", () => ({
  ensureStripeCatalog: async () => [],
  ensurePortalConfiguration: async () => "bpc_test_config",
}));

vi.mock("../../lib/vendor-keys", () => ({
  canAddPaymentKeys: () => true,
}));

vi.mock("../../lib/subscription-notifications", () => ({
  insertTierChangeNotification: (vendorId: number) => {
    notifications.push({ vendorId });
    return Promise.resolve();
  },
  sendSubscriptionCancelledEmail: (email: string) => {
    emails.push({ email });
    return Promise.resolve();
  },
}));

// Real reconcileVendorSubscription is used (not mocked) — only the Stripe
// SDK itself is faked — so the route test exercises the real reconciliation
// logic end-to-end, exactly like the lifecycle unit test.
vi.mock("stripe", () => {
  class MockStripe {
    subscriptions = {
      list: async ({ customer }: { customer: string }) => ({
        data: activeSubscription && activeSubscription.customer === customer
          ? [{ id: activeSubscription.id, status: "active", metadata: { upgradeTier: activeSubscription.tier }, items: { data: [{ price: { metadata: {} } }] } }]
          : [],
      }),
    };
    checkout = {
      sessions: { list: async () => ({ data: [] }) },
    };
  }
  return { default: MockStripe };
});

import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

async function post(path: string): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const { default: router } = await import("../subscription-upgrade");

  const app = express();
  app.use(express.json());
  app.use(router);
  app.use((err: unknown, _req: Request, res: Response, _next: (e?: unknown) => void) => {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  });

  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      fetch(`http://localhost:${addr.port}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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

const postSync = () => post("/vendors/1/subscription/sync");

describe("POST /vendors/:id/subscription/sync — missed cancellation lifecycle", () => {
  beforeEach(() => {
    MOCK_VENDOR.subscriptionTier = "pro";
    MOCK_VENDOR.stripeCustomerId = "cus_route_lifecycle";
    MOCK_VENDOR.stripeSubscriptionId = "sub_route_lifecycle";
    activeSubscription = { id: "sub_route_lifecycle", customer: "cus_route_lifecycle", tier: "pro" };
    notifications.length = 0;
    emails.length = 0;
    vi.resetModules();
  });

  it("no-ops while the subscription is still active on Stripe", async () => {
    const { status, body } = await postSync();
    expect(status).toBe(200);
    expect(body).toMatchObject({ synced: false, currentTier: "pro" });
    expect(MOCK_VENDOR.subscriptionTier).toBe("pro");
  });

  it("downgrades the vendor via the real HTTP route once the subscription is cancelled out-of-band on Stripe", async () => {
    // Simulate the out-of-band cancellation: Stripe now reports no active
    // subscription for this customer (no webhook was delivered for this).
    activeSubscription = null;

    const { status, body } = await postSync();

    expect(status).toBe(200);
    expect(body).toMatchObject({ synced: true, currentTier: "free" });
    expect(MOCK_VENDOR.subscriptionTier).toBe("free");
    expect(MOCK_VENDOR.stripeSubscriptionId).toBeNull();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ vendorId: 1 });
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ email: "vendor@example.com" });
  });
});
