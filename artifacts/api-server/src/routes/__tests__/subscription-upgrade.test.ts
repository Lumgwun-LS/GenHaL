/**
 * Tests for POST /vendors/:id/subscription/checkout and
 * POST /vendors/:id/subscription/portal.
 *
 * Verifies that:
 * 1. Attempting to "upgrade" to the vendor's current tier or lower is rejected with 409
 * 2. Missing Stripe platform key returns 503 instead of crashing
 * 3. A valid upgrade creates a checkout session against a catalog Price (not price_data)
 * 4. The portal route 409s when the vendor has no Stripe customer yet, and otherwise
 *    creates a portal session against a catalog-backed configuration
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const MOCK_VENDOR = {
  id: 1,
  email: "vendor@example.com",
  clerkUserId: "user_vendor",
  subscriptionTier: "pro",
  stripeCustomerId: null as string | null,
};

let sessionsCreate = vi.fn(async () => ({ id: "cs_new", url: "https://stripe.test/cs_new" }));
let portalSessionsCreate = vi.fn(async () => ({ url: "https://stripe.test/portal" }));
let platformStripeKey: string | undefined = "sk_test_platform";

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
      set: () => ({
        where: () => Promise.resolve([]),
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

// Platform Stripe key resolution is tested separately (platform-gateways.ts);
// here we just control whether a key is "configured".
vi.mock("../../lib/platform-gateways", () => ({
  resolveGatewayField: async () => platformStripeKey,
}));

const TEST_PLANS = [
  { tier: "starter", name: "Starter", price: 29, currency: "usd", description: "d", features: ["a"], highlight: false, quotas: { aiImages: 5, aiVideos: 2, aiCaptions: 25, voiceMinutes: 10, sms: 25, email: 150 } },
  { tier: "pro", name: "Pro", price: 79, currency: "usd", description: "d", features: ["a"], highlight: true, quotas: { aiImages: 15, aiVideos: 7, aiCaptions: 100, voiceMinutes: 40, sms: 100, email: 500 } },
  { tier: "enterprise", name: "Enterprise", price: 199, currency: "usd", description: "d", features: ["a"], highlight: false, quotas: { aiImages: 40, aiVideos: 20, aiCaptions: 300, voiceMinutes: 120, sms: 300, email: 1500 } },
];

vi.mock("../../lib/subscription-plans", () => ({
  getSubscriptionPlans: async () => TEST_PLANS,
  getSubscriptionPlan: async (tier: string) => TEST_PLANS.find((p) => p.tier === tier),
}));

// Catalog/portal-configuration creation hits real Stripe Product/Price/portal
// APIs — stub them so route tests stay fast and deterministic.
vi.mock("../../lib/stripe-catalog", () => ({
  ensureStripeCatalog: async () => [
    { tier: "starter", productId: "prod_starter", priceId: "price_starter" },
    { tier: "pro", productId: "prod_pro", priceId: "price_pro" },
    { tier: "enterprise", productId: "prod_enterprise", priceId: "price_enterprise" },
  ],
  ensurePortalConfiguration: async () => "bpc_test_config",
}));

vi.mock("stripe", () => {
  class MockStripe {
    checkout = {
      sessions: {
        create: (...args: unknown[]) => sessionsCreate(...(args as [])),
      },
    };
    billingPortal = {
      sessions: {
        create: (...args: unknown[]) => portalSessionsCreate(...(args as [])),
      },
    };
    customers = {
      create: async () => ({ id: "cus_new" }),
    };
  }
  return { default: MockStripe };
});

import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

async function post(
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
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
        body: JSON.stringify(body),
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

const postCheckout = (body: unknown) => post("/vendors/1/subscription/checkout", body);
const postPortal = (body: unknown) => post("/vendors/1/subscription/portal", body);

describe("POST /vendors/:id/subscription/checkout", () => {
  beforeEach(() => {
    sessionsCreate = vi.fn(async () => ({ id: "cs_new", url: "https://stripe.test/cs_new" }));
    portalSessionsCreate = vi.fn(async () => ({ url: "https://stripe.test/portal" }));
    platformStripeKey = "sk_test_platform";
    MOCK_VENDOR.stripeCustomerId = null;
    vi.resetModules();
  });

  it("rejects with 409 when the vendor is already on this tier or higher", async () => {
    const { status, body } = await postCheckout({
      tier: "starter",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
    });

    expect(status).toBe(409);
    expect(body).toMatchObject({ currentTier: "pro" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 503 when Stripe is not configured on the platform", async () => {
    platformStripeKey = undefined;

    const { status, body } = await postCheckout({
      tier: "enterprise",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
    });

    expect(status).toBe(503);
    expect(body).toMatchObject({ error: expect.stringContaining("Stripe") });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("creates a subscription-mode checkout session against a catalog Price when upgrading", async () => {
    const { status, body } = await postCheckout({
      tier: "enterprise",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ sessionId: "cs_new" });
    expect(sessionsCreate).toHaveBeenCalledTimes(1);

    const args = (sessionsCreate.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(args.mode).toBe("subscription");
    expect(args.line_items).toMatchObject([{ price: "price_enterprise", quantity: 1 }]);
  });
});

describe("POST /vendors/:id/subscription/portal", () => {
  beforeEach(() => {
    portalSessionsCreate = vi.fn(async () => ({ url: "https://stripe.test/portal" }));
    platformStripeKey = "sk_test_platform";
    MOCK_VENDOR.stripeCustomerId = null;
    vi.resetModules();
  });

  it("returns 409 when the vendor has no Stripe customer yet", async () => {
    const { status, body } = await postPortal({ returnUrl: "https://app.test/billing" });

    expect(status).toBe(409);
    expect(body).toMatchObject({ error: expect.stringContaining("billing account") });
    expect(portalSessionsCreate).not.toHaveBeenCalled();
  });

  it("creates a portal session against the catalog-backed configuration", async () => {
    MOCK_VENDOR.stripeCustomerId = "cus_existing";

    const { status, body } = await postPortal({ returnUrl: "https://app.test/billing" });

    expect(status).toBe(200);
    expect(body).toMatchObject({ url: "https://stripe.test/portal" });
    expect(portalSessionsCreate).toHaveBeenCalledWith({
      customer: "cus_existing",
      return_url: "https://app.test/billing",
      configuration: "bpc_test_config",
    });
  });
});
