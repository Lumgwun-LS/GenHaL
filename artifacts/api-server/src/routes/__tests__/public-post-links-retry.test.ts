/**
 * Tests for the shop-link checkout retry flow:
 *
 * GET  /public/post-links/:token/orders/:orderId
 *   - paid order: canRetry=false, canCancel=false
 *   - unpaid/failed order with providers available: canRetry=true, canCancel=true
 *   - order not found: 404
 *
 * POST /public/post-links/:token/orders/:orderId/retry
 *   - pending/failed order: creates a new payment, cancels the old open one
 *   - already-paid order is rejected (409)
 *   - retrying a cancelled order is rejected (409)
 *   - unavailable/invalid provider is rejected (503) with the specific reason
 *   - no prior open payment: new payment created, no update to old payment
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted Stripe spy state (must be vi.hoisted so the mock factory can close over it) ──
const stripeState = vi.hoisted(() => ({
  expireCalls: [] as string[],
  retrieveCalls: [] as string[],
  expireShouldThrow: false,
}));
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

// ── Shared DB state ──────────────────────────────────────────────────────────

const MOCK_POST = {
  id: 10,
  vendorId: 1,
  shareToken: "tok_abc",
  linkMode: "checkout",
  productIds: [100],
  status: "published",
};

const MOCK_VENDOR = {
  id: 1,
  name: "Test Vendor",
  status: "active",
  subscriptionTier: "free",
  verificationLevel: "unverified",
  stripeEnabled: true,
  paystackEnabled: true,
  remitaEnabled: false,
  flutterwaveEnabled: false,
  nombaEnabled: false,
  defaultCurrency: "NGN",
  logoUrl: null,
  brandTheme: null,
};

const MOCK_PRODUCT = {
  id: 100,
  vendorId: 1,
  name: "Widget",
  price: "25.00",
  stockQuantity: 50,
  status: "active",
  description: null,
  imageUrl: null,
  unit: "each",
};

const MOCK_ORDER_UNPAID = {
  id: 200,
  vendorId: 1,
  sourcePostId: 10,
  customerName: "Jane",
  customerEmail: "jane@example.com",
  customerPhone: null,
  status: "pending",
  paymentStatus: "unpaid",
  currency: "NGN",
  totalAmount: "25.00",
};

const MOCK_ORDER_FAILED = {
  ...MOCK_ORDER_UNPAID,
  id: 201,
  paymentStatus: "failed",
};

const MOCK_ORDER_PAID = {
  ...MOCK_ORDER_UNPAID,
  id: 202,
  paymentStatus: "paid",
  status: "processing",
};

const MOCK_ORDER_CANCELLED = {
  ...MOCK_ORDER_UNPAID,
  id: 203,
  status: "cancelled",
  paymentStatus: "cancelled",
};

const MOCK_PAYMENT_PENDING = {
  id: 50,
  orderId: 200,
  vendorId: 1,
  provider: "paystack",
  providerReference: "ref_old",
  amount: "25.00",
  currency: "NGN",
  status: "pending",
  metadata: {},
};

const MOCK_PAYMENT_FAILED = {
  ...MOCK_PAYMENT_PENDING,
  id: 51,
  orderId: 201,
  status: "failed",
};

const MOCK_PAYMENT_STRIPE = {
  id: 52,
  orderId: 200,
  vendorId: 1,
  provider: "stripe",
  providerReference: "cs_old_session",
  amount: "25.00",
  currency: "NGN",
  status: "pending",
  metadata: {},
};

// ── Mutable mock state ────────────────────────────────────────────────────────

// Each select() call drains one entry from this queue (FIFO).
let selectQueue: Array<unknown[]> = [];
let insertedPayments: unknown[] = [];
let updatedPayments: Array<{ set: Record<string, unknown>; where: unknown }> = [];

// ── Mock @workspace/db ────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const makeSelectChain = () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => {
        const next = selectQueue.shift();
        return next ?? [];
      },
      then: async (resolve: (v: unknown[]) => unknown) => {
        const next = selectQueue.shift();
        return resolve(next ?? []);
      },
    };
    // Make it awaitable directly too (for the products query without .limit())
    Object.defineProperty(chain, Symbol.asyncIterator, { value: undefined });
    // Monkey-patch: make "where" return the same chainable that also settles as a Promise
    // by implementing thenable in the base object so await db.select().from().where() works.
    const makeAwaitable = () => {
      const inner: any = {
        from: () => inner,
        where: () => inner,
        orderBy: () => inner,
        limit: async () => {
          const next = selectQueue.shift();
          return next ?? [];
        },
        then: (
          resolve: (v: unknown[]) => unknown,
          reject?: (e: unknown) => unknown,
        ) => {
          const next = selectQueue.shift();
          return Promise.resolve(next ?? []).then(resolve, reject);
        },
      };
      return inner;
    };
    return makeAwaitable();
  };

  return {
    db: {
      select: () => makeSelectChain(),
      insert: (_table: unknown) => ({
        values: (vals: unknown) => {
          // Capture immediately — the paystack and stripe paths in the route call
          // db.insert(...).values({...}) WITHOUT .returning(), so we must record
          // the insert here rather than waiting for a .returning() call.
          const arr = Array.isArray(vals) ? vals : [vals];
          const rows = arr.map((v: any, i: number) => ({ id: 9000 + i, ...v }));
          insertedPayments.push(...rows);
          return {
            returning: async () => rows,
          };
        },
      }),
      update: (_table: unknown) => ({
        set: (setVals: Record<string, unknown>) => ({
          where: (whereClause: unknown) => {
            updatedPayments.push({ set: setVals, where: whereClause });
            return Promise.resolve();
          },
        }),
      }),
    },
    // Named table exports used as identifiers in the route
    postsTable: { shareToken: "posts.share_token", id: "posts.id", vendorId: "posts.vendor_id" },
    vendorsTable: { id: "vendors.id", status: "vendors.status" },
    productsTable: { id: "products.id", vendorId: "products.vendor_id" },
    ordersTable: { id: "orders.id", vendorId: "orders.vendor_id", sourcePostId: "orders.source_post_id", status: "orders.status", paymentStatus: "orders.payment_status" },
    orderItemsTable: {},
    leadsTable: {},
    paymentsTable: { id: "payments.id", orderId: "payments.order_id", status: "payments.status", createdAt: "payments.created_at" },
  };
});

// ── Mock drizzle-orm ──────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  and: (...args: unknown[]) => ({ and: args }),
  desc: (col: unknown) => ({ desc: col }),
  inArray: (col: unknown, vals: unknown[]) => ({ inArray: [col, vals] }),
}));

// ── Mock vendor-keys: paystack always available ───────────────────────────────

vi.mock("../../lib/vendor-keys", () => ({
  resolveStripeKey: async () => "sk_test_mock",
  resolvePaystackKey: async () => "sk_test_paystack",
  getPaymentMethodAvailability: async (provider: string) => {
    if (provider === "paystack") return { provider, available: true, reason: null };
    if (provider === "stripe") return { provider, available: true, reason: null };
    return { provider, available: false, reason: "Not configured." };
  },
  canAddPaymentKeys: () => false,
}));

// ── Mock platform-gateways ────────────────────────────────────────────────────

vi.mock("../../lib/platform-gateways", () => ({
  GATEWAY_DEFS: {
    stripe: { label: "Stripe" },
    paystack: { label: "Paystack" },
    remita: { label: "Remita" },
    flutterwave: { label: "Flutterwave" },
    nomba: { label: "Nomba" },
    paypal: { label: "PayPal" },
  },
}));

// ── Mock provider checkout modules (unused for paystack tests) ─────────────────

vi.mock("../payments/remita", () => ({
  createRemitaCheckout: async () => ({ ok: false, status: 503, error: "Not available" }),
}));
vi.mock("../payments/flutterwave", () => ({
  createFlutterwaveCheckout: async () => ({ ok: false, status: 503, error: "Not available" }),
}));
vi.mock("../payments/nomba", () => ({
  createNombaCheckout: async () => ({ ok: false, status: 503, error: "Not available" }),
}));

// ── Mock Stripe SDK ───────────────────────────────────────────────────────────

vi.mock("stripe", () => {
  const FakeStripe = function () {
    return {
      checkout: {
        sessions: {
          create: async () => ({
            id: "cs_test_new",
            url: "https://checkout.stripe.com/pay/cs_test_new",
            status: "open",
          }),
          retrieve: async (_id: string) => {
            stripeState.retrieveCalls.push(_id);
            return { id: _id, status: "open" };
          },
          expire: async (_id: string) => {
            stripeState.expireCalls.push(_id);
            if (stripeState.expireShouldThrow) {
              throw new Error("Stripe session already expired");
            }
            return {};
          },
        },
      },
    };
  };
  return { default: FakeStripe };
});

// ── Mock fetch for Paystack API calls ─────────────────────────────────────────

let paystackShouldFail = false;

const originalFetch = global.fetch;
global.fetch = (async (url: string, opts: unknown) => {
  if (typeof url === "string" && url.includes("paystack.co")) {
    if (paystackShouldFail) {
      return {
        json: async () => ({ status: false, message: "Invalid key" }),
      } as unknown as Response;
    }
    return {
      json: async () => ({
        status: true,
        data: {
          authorization_url: "https://paystack.com/pay/ref_new",
          reference: "ref_new",
        },
      }),
    } as unknown as Response;
  }
  return originalFetch(url as string, opts as RequestInit);
}) as typeof fetch;

// ── Express app builder ───────────────────────────────────────────────────────

async function buildApp() {
  const { default: router } = await import("../public-post-links");
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
          try { json = JSON.parse(text); } catch { json = null; }
          server.close();
          resolve({ status: res.status, body: json });
        })
        .catch((err) => { server.close(); reject(err); });
    });
  });
}

// ── Helpers to prime the select queue ─────────────────────────────────────────

/** Prime selects for loadLink (3 selects: post, vendor, products). */
function primeLinkSelects(post = MOCK_POST, vendor = MOCK_VENDOR, products = [MOCK_PRODUCT]) {
  selectQueue.push([post], [vendor], products);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /public/post-links/:token/orders/:orderId — canRetry reporting", () => {
  let app: express.Express;

  beforeEach(async () => {
    selectQueue = [];
    insertedPayments = [];
    updatedPayments = [];
    paystackShouldFail = false;
    app = await buildApp();
  });

  it("reports canRetry=true and canCancel=true for an unpaid order with available providers", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_UNPAID]); // loadLinkOrder

    const { status, body } = await callApp(
      app,
      "GET",
      "/public/post-links/tok_abc/orders/200",
    );

    expect(status).toBe(200);
    expect(body.paymentStatus).toBe("unpaid");
    expect(body.canRetry).toBe(true);
    expect(body.canCancel).toBe(true);
  });

  it("reports canRetry=true and canCancel=true for a failed-payment order", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_FAILED]); // loadLinkOrder

    const { status, body } = await callApp(
      app,
      "GET",
      "/public/post-links/tok_abc/orders/201",
    );

    expect(status).toBe(200);
    expect(body.paymentStatus).toBe("failed");
    expect(body.canRetry).toBe(true);
    expect(body.canCancel).toBe(true);
  });

  it("reports canRetry=false and canCancel=false for a paid order", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_PAID]); // loadLinkOrder

    const { status, body } = await callApp(
      app,
      "GET",
      "/public/post-links/tok_abc/orders/202",
    );

    expect(status).toBe(200);
    expect(body.paymentStatus).toBe("paid");
    expect(body.canRetry).toBe(false);
    expect(body.canCancel).toBe(false);
  });

  it("returns 404 when the order does not belong to this link", async () => {
    primeLinkSelects();
    selectQueue.push([]); // loadLinkOrder returns nothing

    const { status } = await callApp(
      app,
      "GET",
      "/public/post-links/tok_abc/orders/999",
    );

    expect(status).toBe(404);
  });

  it("returns 404 when the link token is not found", async () => {
    selectQueue.push([]); // loadLink: no post found

    const { status } = await callApp(
      app,
      "GET",
      "/public/post-links/bad_token/orders/200",
    );

    expect(status).toBe(404);
  });
});

describe("POST /public/post-links/:token/orders/:orderId/retry", () => {
  let app: express.Express;

  beforeEach(async () => {
    selectQueue = [];
    insertedPayments = [];
    updatedPayments = [];
    paystackShouldFail = false;
    stripeState.expireCalls = [];
    stripeState.retrieveCalls = [];
    stripeState.expireShouldThrow = false;
    app = await buildApp();
  });

  it("creates a new payment and cancels the prior open payment when retrying an unpaid order", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_UNPAID]);       // loadLinkOrder
    selectQueue.push([MOCK_PAYMENT_PENDING]);    // prior payment lookup

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/200/retry",
      { provider: "paystack" },
    );

    expect(status).toBe(200);
    expect(body.orderId).toBe(200);
    expect(body.provider).toBe("paystack");

    // A new payment row was inserted
    expect(insertedPayments).toHaveLength(1);
    const inserted = insertedPayments[0] as any;
    expect(inserted.orderId).toBe(200);
    expect(inserted.provider).toBe("paystack");
    expect(inserted.status).toBe("pending");

    // The old pending payment was marked cancelled
    expect(updatedPayments).toHaveLength(1);
    expect(updatedPayments[0].set).toMatchObject({ status: "cancelled" });
  });

  it("creates a new payment and cancels the prior failed payment when retrying a failed order", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_FAILED]);       // loadLinkOrder
    selectQueue.push([MOCK_PAYMENT_FAILED]);     // prior payment lookup

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/201/retry",
      { provider: "paystack" },
    );

    expect(status).toBe(200);
    expect(body.orderId).toBe(201);

    // New payment inserted
    expect(insertedPayments).toHaveLength(1);
    // Old failed payment cancelled
    expect(updatedPayments).toHaveLength(1);
    expect(updatedPayments[0].set).toMatchObject({ status: "cancelled" });
  });

  it("does not update any prior payment when there is no prior open payment", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_UNPAID]);  // loadLinkOrder
    selectQueue.push([]);                   // no prior payment

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/200/retry",
      { provider: "paystack" },
    );

    expect(status).toBe(200);
    expect(body.orderId).toBe(200);

    // New payment inserted
    expect(insertedPayments).toHaveLength(1);
    // No prior payment to cancel
    expect(updatedPayments).toHaveLength(0);
  });

  it("rejects retrying an already-paid order with 409", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_PAID]); // loadLinkOrder

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/202/retry",
      {},
    );

    expect(status).toBe(409);
    expect(body.error).toMatch(/paid/);
    // No new payment inserted
    expect(insertedPayments).toHaveLength(0);
    // No prior payment touched
    expect(updatedPayments).toHaveLength(0);
  });

  it("rejects retrying a cancelled order with 409", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_CANCELLED]); // loadLinkOrder

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/203/retry",
      {},
    );

    expect(status).toBe(409);
    expect(body.error).toMatch(/cancelled/);
    expect(insertedPayments).toHaveLength(0);
    expect(updatedPayments).toHaveLength(0);
  });

  it("rejects an explicitly requested provider that is unavailable (503) with the specific reason", async () => {
    // Override vendor-keys mock to report stripe as unavailable for this test
    const vendorKeysMod = await import("../../lib/vendor-keys");
    const original = vendorKeysMod.getPaymentMethodAvailability;
    (vendorKeysMod as any).getPaymentMethodAvailability = async (provider: string) => {
      if (provider === "stripe") {
        return { provider, available: false, reason: "Stripe credentials haven't passed verification yet." };
      }
      if (provider === "paystack") return { provider, available: true, reason: null };
      return { provider, available: false, reason: "Not configured." };
    };

    try {
      // Rebuild app so the route picks up the overridden function
      const { default: router } = await import("../public-post-links");
      const localApp = express();
      localApp.use(express.json());
      localApp.use(router);
      localApp.use((err: unknown, _req: Request, res: Response, _next: (e?: unknown) => void) => {
        res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
      });

      primeLinkSelects();
      selectQueue.push([MOCK_ORDER_UNPAID]); // loadLinkOrder

      const { status, body } = await callApp(localApp, "POST", "/public/post-links/tok_abc/orders/200/retry", {
        provider: "stripe",
      });

      expect(status).toBe(503);
      expect(body.error).toContain("Stripe");
      expect(body.error).toContain("verification");

      expect(insertedPayments).toHaveLength(0);
      expect(updatedPayments).toHaveLength(0);
    } finally {
      (vendorKeysMod as any).getPaymentMethodAvailability = original;
    }
  });

  it("rejects a provider that is not enabled for the vendor (not in available list) with 503", async () => {
    // remita is not enabled (remitaEnabled: false on MOCK_VENDOR) so it won't appear in available[]
    // The mock vendor-keys mock returns available:false for remita → correct 503 path
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_UNPAID]); // loadLinkOrder

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/200/retry",
      { provider: "remita" },
    );

    expect(status).toBe(503);
    expect(body.error).toBeTruthy();
    expect(insertedPayments).toHaveLength(0);
    expect(updatedPayments).toHaveLength(0);
  });

  it("retrying falls back to an auto-selected provider when none is specified", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_UNPAID]); // loadLinkOrder
    selectQueue.push([]);                  // no prior payment

    // No 'provider' in body → should auto-select paystack (NGN currency)
    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/200/retry",
      {},
    );

    expect(status).toBe(200);
    expect(body.provider).toBe("paystack");
    expect(insertedPayments).toHaveLength(1);
  });

  it("returns 404 when the order does not belong to this link", async () => {
    primeLinkSelects();
    selectQueue.push([]); // loadLinkOrder returns nothing

    const { status } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/999/retry",
      {},
    );

    expect(status).toBe(404);
    expect(insertedPayments).toHaveLength(0);
  });

  it("returns 503 with a gateway error message when the payment provider call fails", async () => {
    paystackShouldFail = true;

    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_UNPAID]); // loadLinkOrder
    // No prior-payment select needed — chargeProvider fails before we get there

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/200/retry",
      { provider: "paystack" },
    );

    expect(status).toBe(502);
    expect(body.error).toMatch(/Paystack/);
    expect(insertedPayments).toHaveLength(0);
    // No prior payment cancel since the new charge failed
    expect(updatedPayments).toHaveLength(0);
  });

  it("calls stripe.checkout.sessions.expire on the old session when retrying a Stripe-provider pending payment", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_UNPAID]);       // loadLinkOrder
    selectQueue.push([MOCK_PAYMENT_STRIPE]);     // prior payment lookup

    // Switch to paystack on retry
    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/200/retry",
      { provider: "paystack" },
    );

    expect(status).toBe(200);
    expect(body.provider).toBe("paystack");

    // A new payment row was inserted with the new provider
    expect(insertedPayments).toHaveLength(1);
    expect((insertedPayments[0] as any).provider).toBe("paystack");

    // The old Stripe session was expired
    expect(stripeState.expireCalls).toHaveLength(1);
    expect(stripeState.expireCalls[0]).toBe("cs_old_session");

    // The old payment was also marked cancelled in the DB
    expect(updatedPayments).toHaveLength(1);
    expect(updatedPayments[0].set).toMatchObject({ status: "cancelled" });
  });

  it("records voidError in payment metadata when stripe.expire() throws but still completes the retry", async () => {
    stripeState.expireShouldThrow = true;

    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_UNPAID]);       // loadLinkOrder
    selectQueue.push([MOCK_PAYMENT_STRIPE]);     // prior payment lookup

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/200/retry",
      { provider: "paystack" },
    );

    // Retry still succeeds — void failure is best-effort
    expect(status).toBe(200);
    expect(body.provider).toBe("paystack");

    // New payment was still inserted
    expect(insertedPayments).toHaveLength(1);

    // Two DB updates: first the voidError metadata write (from catch), then status: "cancelled"
    expect(updatedPayments).toHaveLength(2);
    const metadataUpdate = updatedPayments.find((u) => u.set.metadata !== undefined);
    expect(metadataUpdate).toBeDefined();
    expect((metadataUpdate!.set.metadata as any).voidError).toMatch(/expired/i);
    expect((metadataUpdate!.set.metadata as any).voidErrorAt).toBeDefined();
    const cancelUpdate = updatedPayments.find((u) => u.set.status === "cancelled");
    expect(cancelUpdate).toBeDefined();
  });

  it("cancels a non-Stripe prior payment in the DB without calling stripe.expire()", async () => {
    // MOCK_PAYMENT_PENDING has provider: "paystack" — voidProviderSession is a no-op for non-stripe
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_UNPAID]);       // loadLinkOrder
    selectQueue.push([MOCK_PAYMENT_PENDING]);    // prior paystack payment

    // Retry, switching to stripe
    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/200/retry",
      { provider: "stripe" },
    );

    expect(status).toBe(200);
    expect(body.provider).toBe("stripe");

    // New payment inserted with stripe
    expect(insertedPayments).toHaveLength(1);
    expect((insertedPayments[0] as any).provider).toBe("stripe");

    // No Stripe API was called — expire list must be empty
    expect(stripeState.expireCalls).toHaveLength(0);

    // Old paystack payment was still cancelled in the DB
    expect(updatedPayments).toHaveLength(1);
    expect(updatedPayments[0].set).toMatchObject({ status: "cancelled" });
  });
});
