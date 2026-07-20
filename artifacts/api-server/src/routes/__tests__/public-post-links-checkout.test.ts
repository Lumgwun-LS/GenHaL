/**
 * Tests for the shop-link initial checkout flow:
 *
 * POST /public/post-links/:token/checkout
 *   - missing required fields (name / email / items) → 400 before any DB write
 *   - negative or zero quantity → 400 before any DB write
 *   - requesting more stock than available → 409 before any DB write
 *   - duplicate productId entries are merged before the stock check (not applied twice)
 *   - provider with no working credentials is rejected → 503 before any DB write
 *   - valid request creates an order, inserts order items, and calls the payment provider
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

// ── Shared DB state ───────────────────────────────────────────────────────────

const MOCK_POST = {
  id: 10,
  vendorId: 1,
  shareToken: "tok_abc",
  linkMode: "checkout",
  productIds: [100, 101],
  status: "published",
};

const MOCK_VENDOR = {
  id: 1,
  name: "Test Vendor",
  status: "active",
  subscriptionTier: "free",
  verificationLevel: "unverified",
  stripeEnabled: false,
  paystackEnabled: true,
  remitaEnabled: false,
  flutterwaveEnabled: false,
  nombaEnabled: false,
  defaultCurrency: "NGN",
  logoUrl: null,
  brandTheme: null,
};

/** Product with generous stock. */
const MOCK_PRODUCT_A = {
  id: 100,
  vendorId: 1,
  name: "Widget",
  price: "25.00",
  stockQuantity: 10,
  status: "active",
  description: null,
  imageUrl: null,
  unit: "each",
};

/** Product with only 3 units in stock. */
const MOCK_PRODUCT_B = {
  id: 101,
  vendorId: 1,
  name: "Gadget",
  price: "50.00",
  stockQuantity: 3,
  status: "active",
  description: null,
  imageUrl: null,
  unit: "each",
};

// ── Mutable mock state ─────────────────────────────────────────────────────────

let selectQueue: Array<unknown[]> = [];
let insertedRows: unknown[] = [];
let updatedRows: Array<{ set: Record<string, unknown>; where: unknown }> = [];

// ── Mock @workspace/db ────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
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

  return {
    db: {
      select: () => makeAwaitable(),
      insert: (_table: unknown) => ({
        values: (vals: unknown) => {
          const arr = Array.isArray(vals) ? vals : [vals];
          const rows = arr.map((v: any, i: number) => ({ id: 9000 + i, ...v }));
          insertedRows.push(...rows);
          return {
            returning: async () => rows,
          };
        },
      }),
      update: (_table: unknown) => ({
        set: (setVals: Record<string, unknown>) => ({
          where: (whereClause: unknown) => {
            updatedRows.push({ set: setVals, where: whereClause });
            return Promise.resolve();
          },
        }),
      }),
    },
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

// ── Mock vendor-keys: paystack available, stripe unavailable ──────────────────

vi.mock("../../lib/vendor-keys", () => ({
  resolveStripeKey: async () => null,
  resolvePaystackKey: async () => "sk_test_paystack",
  getPaymentMethodAvailability: async (provider: string) => {
    if (provider === "paystack") return { provider, available: true, reason: null };
    if (provider === "stripe") return { provider, available: false, reason: "No Stripe key configured." };
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

// ── Mock provider checkout modules (not under test here) ──────────────────────

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
          expire: async () => ({}),
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
  return originalFetch(url as RequestInfo, opts as RequestInit);
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

// ── Helper: prime the 3 selects loadLink always performs ─────────────────────

function primeLinkSelects(
  post = MOCK_POST,
  vendor = MOCK_VENDOR,
  products: unknown[] = [MOCK_PRODUCT_A, MOCK_PRODUCT_B],
) {
  selectQueue.push([post], [vendor], products);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /public/post-links/:token/checkout — validation before any DB write", () => {
  let app: express.Express;

  beforeEach(async () => {
    selectQueue = [];
    insertedRows = [];
    updatedRows = [];
    paystackShouldFail = false;
    app = await buildApp();
  });

  // ── Missing required fields ───────────────────────────────────────────────

  it("returns 400 when name is missing", async () => {
    primeLinkSelects();

    const { status, body } = await callApp(app, "POST", "/public/post-links/tok_abc/checkout", {
      email: "buyer@example.com",
      items: [{ productId: 100, quantity: 1 }],
    });

    expect(status).toBe(400);
    expect(body.error).toMatch(/name/i);
    // No order or payment rows should have been inserted
    expect(insertedRows).toHaveLength(0);
  });

  it("returns 400 when email is missing", async () => {
    primeLinkSelects();

    const { status, body } = await callApp(app, "POST", "/public/post-links/tok_abc/checkout", {
      name: "Alice",
      items: [{ productId: 100, quantity: 1 }],
    });

    expect(status).toBe(400);
    expect(body.error).toMatch(/email/i);
    expect(insertedRows).toHaveLength(0);
  });

  it("returns 400 when items array is missing", async () => {
    primeLinkSelects();

    const { status, body } = await callApp(app, "POST", "/public/post-links/tok_abc/checkout", {
      name: "Alice",
      email: "buyer@example.com",
    });

    expect(status).toBe(400);
    expect(body.error).toMatch(/items/i);
    expect(insertedRows).toHaveLength(0);
  });

  it("returns 400 when items array is empty", async () => {
    primeLinkSelects();

    const { status, body } = await callApp(app, "POST", "/public/post-links/tok_abc/checkout", {
      name: "Alice",
      email: "buyer@example.com",
      items: [],
    });

    expect(status).toBe(400);
    expect(body.error).toMatch(/items/i);
    expect(insertedRows).toHaveLength(0);
  });

  // ── Invalid quantities ────────────────────────────────────────────────────

  it("returns 400 when a quantity is zero", async () => {
    primeLinkSelects();

    const { status, body } = await callApp(app, "POST", "/public/post-links/tok_abc/checkout", {
      name: "Alice",
      email: "buyer@example.com",
      items: [{ productId: 100, quantity: 0 }],
    });

    expect(status).toBe(400);
    expect(body.error).toMatch(/quantity/i);
    expect(insertedRows).toHaveLength(0);
  });

  it("returns 400 when a quantity is negative", async () => {
    primeLinkSelects();

    const { status, body } = await callApp(app, "POST", "/public/post-links/tok_abc/checkout", {
      name: "Alice",
      email: "buyer@example.com",
      items: [{ productId: 100, quantity: -5 }],
    });

    expect(status).toBe(400);
    expect(body.error).toMatch(/quantity/i);
    expect(insertedRows).toHaveLength(0);
  });

  // ── Stock enforcement ─────────────────────────────────────────────────────

  it("returns 409 when the requested quantity exceeds available stock", async () => {
    // MOCK_PRODUCT_B has stockQuantity: 3 — request 4
    primeLinkSelects();

    const { status, body } = await callApp(app, "POST", "/public/post-links/tok_abc/checkout", {
      name: "Alice",
      email: "buyer@example.com",
      items: [{ productId: 101, quantity: 4 }],
    });

    expect(status).toBe(409);
    expect(body.error).toMatch(/stock/i);
    // No order must have been created
    expect(insertedRows).toHaveLength(0);
  });

  it("returns 409 when stock is exactly one below the requested quantity", async () => {
    // stockQuantity: 3, request 4 — off by one edge case
    primeLinkSelects();

    const { status, body } = await callApp(app, "POST", "/public/post-links/tok_abc/checkout", {
      name: "Alice",
      email: "buyer@example.com",
      items: [{ productId: 101, quantity: 4 }],
    });

    expect(status).toBe(409);
    expect(insertedRows).toHaveLength(0);
  });

  // ── Duplicate productId merging ───────────────────────────────────────────

  it("merges duplicate productId entries before the stock check and returns 409 when the combined quantity exceeds stock", async () => {
    // MOCK_PRODUCT_B has stockQuantity: 3.
    // Send two separate line items that each pass the per-line check (2 < 3)
    // but together sum to 4, which exceeds the limit.
    primeLinkSelects();

    const { status, body } = await callApp(app, "POST", "/public/post-links/tok_abc/checkout", {
      name: "Alice",
      email: "buyer@example.com",
      items: [
        { productId: 101, quantity: 2 },
        { productId: 101, quantity: 2 },
      ],
    });

    expect(status).toBe(409);
    expect(body.error).toMatch(/stock/i);
    // Crucially no order was created — the merge happened before the DB write
    expect(insertedRows).toHaveLength(0);
  });

  it("merges duplicate productId entries and succeeds when the combined quantity is within stock", async () => {
    // MOCK_PRODUCT_B has stockQuantity: 3.
    // Two lines summing to 3 exactly — should succeed.
    primeLinkSelects();

    const { status } = await callApp(app, "POST", "/public/post-links/tok_abc/checkout", {
      name: "Alice",
      email: "buyer@example.com",
      items: [
        { productId: 101, quantity: 1 },
        { productId: 101, quantity: 2 },
      ],
    });

    expect(status).toBe(200);
    // An order row and at least one order-item row should have been inserted
    expect(insertedRows.length).toBeGreaterThanOrEqual(2);
    // Only ONE unique order-item for product 101 (merged, not two rows)
    const orderItemsInserted = insertedRows.filter((r: any) => r.productId === 101);
    expect(orderItemsInserted).toHaveLength(1);
    expect((orderItemsInserted[0] as any).quantity).toBe(3);
  });

  // ── Provider availability ──────────────────────────────────────────────────

  it("returns 503 before creating an order when the requested provider has no working credentials", async () => {
    // stripe is mocked as unavailable (no key configured)
    primeLinkSelects();

    const { status, body } = await callApp(app, "POST", "/public/post-links/tok_abc/checkout", {
      name: "Alice",
      email: "buyer@example.com",
      items: [{ productId: 100, quantity: 1 }],
      provider: "stripe",
    });

    expect(status).toBe(503);
    expect(body.error).toBeTruthy();
    // No order must have been created
    expect(insertedRows).toHaveLength(0);
  });

  it("returns 503 before creating an order when no provider is configured at all", async () => {
    // Vendor with all gateways disabled
    const noGatewayVendor = {
      ...MOCK_VENDOR,
      stripeEnabled: false,
      paystackEnabled: false,
    };
    primeLinkSelects(MOCK_POST, noGatewayVendor, [MOCK_PRODUCT_A, MOCK_PRODUCT_B]);

    // Override vendor-keys mock for this test so paystack also reports unavailable
    const vendorKeysMod = await import("../../lib/vendor-keys");
    const original = (vendorKeysMod as any).getPaymentMethodAvailability;
    (vendorKeysMod as any).getPaymentMethodAvailability = async (_provider: string) => ({
      provider: _provider,
      available: false,
      reason: "Not configured.",
    });

    try {
      const { default: router } = await import("../public-post-links");
      const localApp = express();
      localApp.use(express.json());
      localApp.use(router);
      localApp.use((err: unknown, _req: Request, res: Response, _next: (e?: unknown) => void) => {
        res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
      });

      const { status } = await callApp(localApp, "POST", "/public/post-links/tok_abc/checkout", {
        name: "Alice",
        email: "buyer@example.com",
        items: [{ productId: 100, quantity: 1 }],
      });

      expect(status).toBe(503);
      expect(insertedRows).toHaveLength(0);
    } finally {
      (vendorKeysMod as any).getPaymentMethodAvailability = original;
    }
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("creates an order and order items, then calls the payment provider for a valid request", async () => {
    primeLinkSelects();

    const { status, body } = await callApp(app, "POST", "/public/post-links/tok_abc/checkout", {
      name: "Alice",
      email: "buyer@example.com",
      items: [{ productId: 100, quantity: 2 }],
    });

    expect(status).toBe(200);
    // Payment provider should have returned a redirect URL
    expect(body).toBeDefined();

    // insertedRows contains the order row and the order-item rows
    // Order row: has customerName
    const orderRow = insertedRows.find((r: any) => r.customerName);
    expect(orderRow).toBeDefined();
    expect((orderRow as any).customerName).toBe("Alice");
    expect((orderRow as any).customerEmail).toBe("buyer@example.com");

    // Order-item row: has productId and quantity
    const itemRow = insertedRows.find((r: any) => r.productId === 100);
    expect(itemRow).toBeDefined();
    expect((itemRow as any).quantity).toBe(2);
  });

  it("returns 404 when the link token is not found", async () => {
    selectQueue.push([]); // loadLink: no post

    const { status } = await callApp(app, "POST", "/public/post-links/bad_token/checkout", {
      name: "Alice",
      email: "buyer@example.com",
      items: [{ productId: 100, quantity: 1 }],
    });

    expect(status).toBe(404);
    expect(insertedRows).toHaveLength(0);
  });
});
