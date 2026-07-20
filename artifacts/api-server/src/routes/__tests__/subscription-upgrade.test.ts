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
 * 5. Concurrent Paystack checkout requests are de-duplicated the same way Stripe's are
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  // callWithPlatformStripe mirrors the real implementation but skips the DB
  // key-resolution step — it reads the module-scope `platformStripeKey` flag
  // instead, making it trivial to simulate "key configured" vs "not configured".
  callWithPlatformStripe: async <T>(
    fn: (stripe: InstanceType<typeof import("stripe").default>, key: string) => Promise<T>,
  ): Promise<T> => {
    if (!platformStripeKey) {
      throw Object.assign(
        new Error(
          "Stripe is not configured on this platform. Add a Stripe key in Admin → Payment Gateways.",
        ),
        { statusCode: 503 },
      );
    }
    const { default: Stripe } = await import("stripe");
    return fn(new Stripe(platformStripeKey), platformStripeKey);
  },
}));

const TEST_PLANS = [
  { tier: "starter", name: "Starter", price: 29, currency: "usd", description: "d", features: ["a"], highlight: false, quotas: { aiImages: 5, aiVideos: 2, aiCaptions: 25, voiceMinutes: 10, sms: 25, email: 150 } },
  { tier: "pro", name: "Pro", price: 79, currency: "usd", description: "d", features: ["a"], highlight: true, quotas: { aiImages: 15, aiVideos: 7, aiCaptions: 100, voiceMinutes: 40, sms: 100, email: 500 } },
  { tier: "enterprise", name: "Enterprise", price: 199, currency: "usd", description: "d", features: ["a"], highlight: false, quotas: { aiImages: 40, aiVideos: 20, aiCaptions: 300, voiceMinutes: 120, sms: 300, email: 1500 } },
];

vi.mock("../../lib/subscription-plans", () => ({
  getSubscriptionPlans: async () => TEST_PLANS,
  getSubscriptionPlan: async (tier: string) => TEST_PLANS.find((p) => p.tier === tier),
  getEnabledSubscriptionGateways: async () => ({ stripe: true, paystack: true, paypal: true }),
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

// Paystack catalog is also fetched from an external API — stub it.
vi.mock("../../lib/paystack-catalog", () => ({
  ensurePaystackCatalog: async () => [
    { tier: "starter", planCode: "PLN_starter", amount: 2900_00 },
    { tier: "pro", planCode: "PLN_pro", amount: 7900_00 },
    { tier: "enterprise", planCode: "PLN_enterprise", amount: 19900_00 },
  ],
}));

// PayPal catalog — stub to avoid real network calls.
vi.mock("../../lib/paypal-catalog", () => ({
  ensurePayPalCatalog: async () => [],
  createPayPalSubscription: async () => ({ subscriptionId: "sub_pp", approvalUrl: "https://paypal.test/approve" }),
  cancelPayPalSubscription: async () => {},
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

// ── Helper: single server, N concurrent POSTs ────────────────────────────────
async function postCheckoutConcurrent(
  bodies: unknown[],
): Promise<Array<{ status: number; body: Record<string, unknown> | null }>> {
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
      const url = `http://localhost:${addr.port}/vendors/1/subscription/checkout`;
      Promise.all(
        bodies.map((body) =>
          fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }).then(async (r) => {
            const text = await r.text();
            let json: Record<string, unknown> | null = null;
            try {
              json = JSON.parse(text) as Record<string, unknown>;
            } catch {
              json = null;
            }
            return { status: r.status, body: json };
          }),
        ),
      )
        .then((results) => {
          server.close();
          resolve(results);
        })
        .catch((err: unknown) => {
          server.close();
          reject(err);
        });
    });
  });
}

describe("POST /vendors/:id/subscription/checkout — de-duplication", () => {
  const CHECKOUT_BODY = {
    tier: "enterprise",
    successUrl: "https://app.test/success",
    cancelUrl: "https://app.test/cancel",
  };

  beforeEach(() => {
    sessionsCreate = vi.fn(async () => ({ id: "cs_new", url: "https://stripe.test/cs_new" }));
    portalSessionsCreate = vi.fn(async () => ({ url: "https://stripe.test/portal" }));
    platformStripeKey = "sk_test_platform";
    MOCK_VENDOR.stripeCustomerId = null;
    vi.resetModules();
  });

  it("fires two concurrent requests but only calls Stripe once, returning the same sessionId to both", async () => {
    // Delay the Stripe call by 50 ms so the second HTTP request is fully
    // received and its handler starts executing before the first one resolves.
    sessionsCreate = vi.fn(
      () =>
        new Promise<{ id: string; url: string }>((resolve) =>
          setTimeout(() => resolve({ id: "cs_dedup", url: "https://stripe.test/cs_dedup" }), 50),
        ),
    );

    const results = await postCheckoutConcurrent([CHECKOUT_BODY, CHECKOUT_BODY]);

    expect(results).toHaveLength(2);

    // Both responses must be successful.
    expect(results[0].status).toBe(200);
    expect(results[1].status).toBe(200);

    // Both must carry the same session id.
    expect(results[0].body).toMatchObject({ sessionId: "cs_dedup" });
    expect(results[1].body).toMatchObject({ sessionId: "cs_dedup" });

    // Exactly one response is the original; the other is the deduplicated piggyback.
    const original = results.filter((r) => r.body?.deduplicated === false);
    const deduped = results.filter((r) => r.body?.deduplicated === true);
    expect(original).toHaveLength(1);
    expect(deduped).toHaveLength(1);

    // Stripe was only called once despite two concurrent requests.
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });

  it("clears the in-flight lock after an error so a genuine retry is not stuck", async () => {
    // First attempt: Stripe is not configured → 503.
    platformStripeKey = undefined;

    const { status: status1, body: body1 } = await postCheckout(CHECKOUT_BODY);

    expect(status1).toBe(503);
    expect(body1).toMatchObject({ error: expect.stringContaining("Stripe") });

    // Configure Stripe and retry — the lock must have been cleared by the
    // finally block so this second request creates a new session normally.
    platformStripeKey = "sk_test_platform";
    sessionsCreate = vi.fn(async () => ({ id: "cs_retry", url: "https://stripe.test/cs_retry" }));

    const { status: status2, body: body2 } = await postCheckout(CHECKOUT_BODY);

    expect(status2).toBe(200);
    expect(body2).toMatchObject({ sessionId: "cs_retry", deduplicated: false });
    // A fresh Stripe call was made — not a piggyback on the failed one.
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });
});

describe("POST /vendors/:id/subscription/checkout — Paystack de-duplication", () => {
  const PAYSTACK_CHECKOUT_BODY = {
    tier: "enterprise",
    provider: "paystack",
    successUrl: "https://app.test/success",
    cancelUrl: "https://app.test/cancel",
  };

  // Tracks calls to the Paystack /transaction/initialize endpoint only.
  // The actual fetch stub delegates non-Paystack URLs to the real fetch so
  // that the test helper's HTTP calls to the local Express server still work.
  let paystackApiCall: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  function makePaystackResponse(reference: string, delayMs = 0) {
    const respond = () => ({
      ok: true,
      json: async () => ({
        status: true,
        message: "Authorization URL created",
        data: {
          authorization_url: `https://paystack.test/pay/${reference}`,
          reference,
        },
      }),
      text: async () => JSON.stringify({ status: true, data: { reference } }),
      status: 200,
    });

    if (delayMs === 0) return Promise.resolve(respond());
    return new Promise<ReturnType<typeof respond>>((resolve) =>
      setTimeout(() => resolve(respond()), delayMs),
    );
  }

  beforeEach(() => {
    sessionsCreate = vi.fn(async () => ({ id: "cs_new", url: "https://stripe.test/cs_new" }));
    portalSessionsCreate = vi.fn(async () => ({ url: "https://stripe.test/portal" }));
    // resolveGatewayField returns platformStripeKey for every gateway — set it
    // to a truthy value so the Paystack "key configured" check passes.
    platformStripeKey = "sk_paystack_test";
    MOCK_VENDOR.stripeCustomerId = null;
    vi.resetModules();

    originalFetch = globalThis.fetch;

    // Default Paystack API handler — succeeds immediately.
    paystackApiCall = vi.fn(() => makePaystackResponse("ps_ref_new"));

    // Intercept only calls to the Paystack API; forward everything else
    // (including the test helper's calls to the local Express server) to the
    // real fetch so the helper's `res.text()` etc. still work.
    vi.stubGlobal(
      "fetch",
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
        if (url.includes("paystack.co")) {
          return paystackApiCall(url, init);
        }
        return originalFetch(input, init);
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fires two concurrent Paystack requests but only calls /transaction/initialize once, returning the same sessionId to both", async () => {
    // Delay the Paystack API response so the second HTTP request is fully
    // received before the first one resolves — same technique as the Stripe test.
    paystackApiCall = vi.fn(() => makePaystackResponse("ps_ref_dedup", 50));

    const results = await postCheckoutConcurrent([PAYSTACK_CHECKOUT_BODY, PAYSTACK_CHECKOUT_BODY]);

    expect(results).toHaveLength(2);

    // Both responses must be successful.
    expect(results[0].status).toBe(200);
    expect(results[1].status).toBe(200);

    // Both must carry the same Paystack reference as the sessionId.
    expect(results[0].body).toMatchObject({ sessionId: "ps_ref_dedup" });
    expect(results[1].body).toMatchObject({ sessionId: "ps_ref_dedup" });

    // Exactly one response is the original; the other is the deduplicated piggyback.
    const original = results.filter((r) => r.body?.deduplicated === false);
    const deduped = results.filter((r) => r.body?.deduplicated === true);
    expect(original).toHaveLength(1);
    expect(deduped).toHaveLength(1);

    // The Paystack API was only called once despite two concurrent requests.
    expect(paystackApiCall).toHaveBeenCalledTimes(1);
  });

  it("clears the Paystack in-flight lock after an error so a genuine retry is not stuck", async () => {
    // First attempt: Paystack key is missing → 503.
    platformStripeKey = undefined;

    const { status: status1, body: body1 } = await postCheckout(PAYSTACK_CHECKOUT_BODY);

    expect(status1).toBe(503);
    expect(body1).toMatchObject({ error: expect.stringContaining("Paystack") });
    // The Paystack API should NOT have been called — we failed before reaching it.
    expect(paystackApiCall).not.toHaveBeenCalled();

    // Restore key and retry — the lock must have been cleared by the finally
    // block so this second request creates a new session normally.
    platformStripeKey = "sk_paystack_test";
    paystackApiCall = vi.fn(() => makePaystackResponse("ps_ref_retry"));

    const { status: status2, body: body2 } = await postCheckout(PAYSTACK_CHECKOUT_BODY);

    expect(status2).toBe(200);
    expect(body2).toMatchObject({ sessionId: "ps_ref_retry", deduplicated: false });
    // A fresh Paystack call was made — not a piggyback on the failed one.
    expect(paystackApiCall).toHaveBeenCalledTimes(1);
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
