/**
 * Tests for POST /public/post-links/:token/orders/:orderId/cancel
 *
 * Covered cases:
 *   1. Wrong token (valid orderId but different link's token) → 404 because
 *      loadLinkOrder scopes by vendorId + sourcePostId, so the order is not
 *      found when the token resolves to a different post.
 *   2. Already-paid order → 409 (paymentStatus "paid" not in retryable set).
 *   3. Already-cancelled order → 409 (order.status === "cancelled").
 *   4. Successful cancel of an unpaid order with an open Stripe session →
 *      Stripe session expired, payment marked cancelled, order marked cancelled.
 *   5. Successful cancel of a failed order with a Paystack payment (no-op void)
 *      → payment marked cancelled, order marked cancelled.
 *   6. Successful cancel when there is no prior payment row → only the order
 *      is updated (no payment update).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

/** A *different* post resolved by a wrong token — same vendorId, different id. */
const MOCK_POST_OTHER = {
  ...MOCK_POST,
  id: 99,
  shareToken: "tok_other",
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

/** A pending Stripe payment for order 200. */
const MOCK_PAYMENT_STRIPE_PENDING = {
  id: 50,
  orderId: 200,
  vendorId: 1,
  provider: "stripe",
  providerReference: "cs_test_open",
  amount: "25.00",
  currency: "NGN",
  status: "pending",
  metadata: { sessionId: "cs_test_open", source: "social_post" },
  createdAt: new Date("2024-01-01"),
};

/** A pending Paystack payment for order 201. */
const MOCK_PAYMENT_PAYSTACK_PENDING = {
  id: 51,
  orderId: 201,
  vendorId: 1,
  provider: "paystack",
  providerReference: "ref_paystack_123",
  amount: "25.00",
  currency: "NGN",
  status: "pending",
  metadata: { source: "social_post" },
  createdAt: new Date("2024-01-01"),
};

// ── Mutable mock state ────────────────────────────────────────────────────────

// Each select() call drains one entry from this queue (FIFO).
let selectQueue: Array<unknown[]> = [];
let updatedPayments: Array<{ set: Record<string, unknown>; where: unknown }> = [];
let updatedOrders: Array<{ set: Record<string, unknown>; where: unknown }> = [];
let stripeExpireCalled = false;
let stripeExpireRef: string | null = null;

// ── Mock @workspace/db ────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const makeSelectChain = () => {
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

  return {
    db: {
      select: () => makeSelectChain(),
      insert: (_table: unknown) => ({
        values: (vals: unknown) => ({
          returning: async () => {
            const arr = Array.isArray(vals) ? vals : [vals];
            return arr.map((v: any, i: number) => ({ id: 9000 + i, ...v }));
          },
        }),
      }),
      update: (table: unknown) => ({
        set: (setVals: Record<string, unknown>) => ({
          where: (whereClause: unknown) => {
            // Distinguish order vs payment updates by the setVals keys
            if ("paymentStatus" in setVals || ("status" in setVals && "paymentStatus" in setVals)) {
              updatedOrders.push({ set: setVals, where: whereClause });
            } else {
              updatedPayments.push({ set: setVals, where: whereClause });
            }
            return Promise.resolve();
          },
        }),
      }),
    },
    postsTable: { shareToken: "posts.share_token", id: "posts.id", vendorId: "posts.vendor_id" },
    vendorsTable: { id: "vendors.id", status: "vendors.status" },
    productsTable: { id: "products.id", vendorId: "products.vendor_id" },
    ordersTable: {
      id: "orders.id",
      vendorId: "orders.vendor_id",
      sourcePostId: "orders.source_post_id",
      status: "orders.status",
      paymentStatus: "orders.payment_status",
    },
    orderItemsTable: {},
    leadsTable: {},
    paymentsTable: {
      id: "payments.id",
      orderId: "payments.order_id",
      status: "payments.status",
      createdAt: "payments.created_at",
      metadata: "payments.metadata",
    },
  };
});

// ── Mock drizzle-orm ──────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  and: (...args: unknown[]) => ({ and: args }),
  desc: (col: unknown) => ({ desc: col }),
  inArray: (col: unknown, vals: unknown[]) => ({ inArray: [col, vals] }),
}));

// ── Mock vendor-keys ──────────────────────────────────────────────────────────

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

// ── Mock provider checkout modules ────────────────────────────────────────────

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
          retrieve: async (_id: string) => ({ id: _id, status: "open" }),
          expire: async (ref: string) => {
            stripeExpireCalled = true;
            stripeExpireRef = ref;
            return {};
          },
        },
      },
    };
  };
  return { default: FakeStripe };
});

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

/** Prime selects for loadLink (3 selects: post, vendor, products). */
function primeLinkSelects(post = MOCK_POST, vendor = MOCK_VENDOR, products = [MOCK_PRODUCT]) {
  selectQueue.push([post], [vendor], products);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /public/post-links/:token/orders/:orderId/cancel", () => {
  let app: express.Express;

  beforeEach(async () => {
    selectQueue = [];
    updatedPayments = [];
    updatedOrders = [];
    stripeExpireCalled = false;
    stripeExpireRef = null;
    app = await buildApp();
  });

  // ── Access-control: token scoping ─────────────────────────────────────────

  it("returns 404 when a valid orderId is presented with the wrong link token", async () => {
    // "tok_other" resolves to MOCK_POST_OTHER (postId=99).
    // The order (id=200) has sourcePostId=10, so loadLinkOrder returns [].
    primeLinkSelects(MOCK_POST_OTHER);
    selectQueue.push([]); // loadLinkOrder finds no match → postId mismatch

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_other/orders/200/cancel",
    );

    expect(status).toBe(404);
    expect(body.error).toBeTruthy();
    // Order must not be touched
    expect(updatedPayments).toHaveLength(0);
    expect(updatedOrders).toHaveLength(0);
  });

  it("returns 404 when the link token itself does not exist", async () => {
    // loadLink: no post found for this token
    selectQueue.push([]); // no post row

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/nonexistent_token/orders/200/cancel",
    );

    expect(status).toBe(404);
    expect(body.error).toBeTruthy();
    expect(updatedPayments).toHaveLength(0);
    expect(updatedOrders).toHaveLength(0);
  });

  // ── State guards ──────────────────────────────────────────────────────────

  it("returns 409 when attempting to cancel an already-paid order", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_PAID]); // loadLinkOrder

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/202/cancel",
    );

    expect(status).toBe(409);
    expect(body.error).toMatch(/paid/);
    // Nothing should be modified
    expect(updatedPayments).toHaveLength(0);
    expect(updatedOrders).toHaveLength(0);
    expect(stripeExpireCalled).toBe(false);
  });

  it("returns 409 when attempting to cancel an already-cancelled order", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_CANCELLED]); // loadLinkOrder

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/203/cancel",
    );

    expect(status).toBe(409);
    expect(body.error).toMatch(/already cancelled/);
    expect(updatedPayments).toHaveLength(0);
    expect(updatedOrders).toHaveLength(0);
    expect(stripeExpireCalled).toBe(false);
  });

  // ── Successful cancellation ───────────────────────────────────────────────

  it("voids the open Stripe session, cancels the payment, and marks the order cancelled on a successful cancel", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_UNPAID]);           // loadLinkOrder
    selectQueue.push([MOCK_PAYMENT_STRIPE_PENDING]); // latest payment lookup

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/200/cancel",
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.orderId).toBe(200);

    // Stripe session must have been expired
    expect(stripeExpireCalled).toBe(true);
    expect(stripeExpireRef).toBe("cs_test_open");

    // Payment row marked cancelled
    expect(updatedPayments).toHaveLength(1);
    expect(updatedPayments[0].set).toMatchObject({ status: "cancelled" });

    // Order marked cancelled
    expect(updatedOrders).toHaveLength(1);
    expect(updatedOrders[0].set).toMatchObject({
      status: "cancelled",
      paymentStatus: "cancelled",
    });
  });

  it("cancels a failed Paystack payment (no Stripe void) and marks the order cancelled", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_FAILED]);               // loadLinkOrder
    selectQueue.push([MOCK_PAYMENT_PAYSTACK_PENDING]);   // latest payment lookup (status=pending → open)

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/201/cancel",
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.orderId).toBe(201);

    // Stripe must NOT have been called for a Paystack payment
    expect(stripeExpireCalled).toBe(false);

    // Payment row still gets marked cancelled in DB
    expect(updatedPayments).toHaveLength(1);
    expect(updatedPayments[0].set).toMatchObject({ status: "cancelled" });

    // Order marked cancelled
    expect(updatedOrders).toHaveLength(1);
    expect(updatedOrders[0].set).toMatchObject({
      status: "cancelled",
      paymentStatus: "cancelled",
    });
  });

  it("cancels the order without updating any payment when there is no prior payment row", async () => {
    primeLinkSelects();
    selectQueue.push([MOCK_ORDER_UNPAID]); // loadLinkOrder
    selectQueue.push([]);                  // no payment rows

    const { status, body } = await callApp(
      app,
      "POST",
      "/public/post-links/tok_abc/orders/200/cancel",
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.orderId).toBe(200);

    // No payment to cancel
    expect(stripeExpireCalled).toBe(false);
    expect(updatedPayments).toHaveLength(0);

    // Order still marked cancelled
    expect(updatedOrders).toHaveLength(1);
    expect(updatedOrders[0].set).toMatchObject({
      status: "cancelled",
      paymentStatus: "cancelled",
    });
  });
});
