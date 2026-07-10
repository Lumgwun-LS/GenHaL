/**
 * Confirms that payment routes fail loudly with a 503 (never a crash / 500)
 * when a gateway's credentials are not configured anywhere (no admin key,
 * no env fallback).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

const MOCK_VENDOR = { id: 1, subscriptionTier: "free", verificationLevel: "unverified" };

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => [MOCK_VENDOR],
      }),
    }),
    update: () => ({
      set: () => ({ where: () => ({ returning: () => [] }) }),
    }),
  },
  paymentsTable: {},
  ordersTable: {},
  vendorsTable: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  desc: (col: unknown) => ({ desc: col }),
}));

// No provider has credentials configured anywhere in these tests.
vi.mock("../../../lib/platform-gateways", () => ({
  resolveGatewayField: async () => undefined,
}));

vi.mock("../../../lib/vendor-keys", () => ({
  resolveStripeKey: async () => {
    throw new Error("Stripe is not configured. Add a platform Stripe key in Admin \u2192 Payment Gateways.");
  },
  resolvePaystackKey: async () => {
    throw new Error("Paystack is not configured. Add a platform Paystack key in Admin \u2192 Payment Gateways.");
  },
  canAddPaymentKeys: () => false,
}));

async function callRoute(
  routerImportPath: string,
  method: string,
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const { default: router } = await import(routerImportPath);

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
        method,
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

describe("payment routes when a gateway is not configured", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Flutterwave checkout returns 503 with a clear message, not a crash", async () => {
    const { status, body } = await callRoute("../flutterwave", "POST", "/payments/flutterwave/checkout", {
      vendorId: 1,
      amount: 1000,
      email: "buyer@example.com",
      redirectUrl: "https://example.com/return",
    });

    expect(status).toBe(503);
    expect(body?.error).toMatch(/Flutterwave is not configured/);
  });

  it("Nomba checkout returns 503 with a clear message, not a crash", async () => {
    const { status, body } = await callRoute("../nomba", "POST", "/payments/nomba/checkout", {
      vendorId: 1,
      amount: 1000,
      callbackUrl: "https://example.com/return",
    });

    expect(status).toBe(503);
    expect(body?.error).toMatch(/Nomba is not configured/);
  });

  it("Remita checkout returns 503 with a clear message, not a crash", async () => {
    const { status, body } = await callRoute("../remita", "POST", "/payments/remita/checkout", {
      vendorId: 1,
      amount: 1000,
      payerName: "Jane Buyer",
      payerEmail: "buyer@example.com",
    });

    expect(status).toBe(503);
    expect(body?.error).toMatch(/Remita is not configured/);
  });

  it("Refund route returns 503 for Stripe when Stripe is not configured", async () => {
    vi.doMock("@workspace/db", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => [{ id: 1, provider: "stripe", status: "paid", providerReference: "cs_1", vendorId: 1, orderId: null }],
          }),
        }),
        update: () => ({ set: () => ({ where: () => ({ returning: () => [] }) }) }),
      },
      paymentsTable: {},
      ordersTable: {},
      webhookEventsTable: {},
      vendorsTable: { id: "id" },
    }));
    vi.doMock("@clerk/express", () => ({ getAuth: () => ({ userId: null }) }));
    vi.doMock("../webhooks", () => ({ retryWebhookEventById: vi.fn() }));
    vi.doMock("../../../lib/push", () => ({ notifyVendorPaymentStatus: vi.fn() }));
    vi.doMock("../stripe", () => ({ default: express.Router() }));
    vi.doMock("../paystack", () => ({ default: express.Router() }));
    vi.doMock("../flutterwave", () => ({ default: express.Router() }));
    vi.doMock("../nomba", () => ({ default: express.Router() }));
    vi.doMock("../remita", () => ({ default: express.Router() }));

    const { status, body } = await callRoute("../index", "POST", "/payments/1/refund", {});

    expect(status).toBe(503);
    expect(body?.error).toMatch(/Stripe is not configured/);
  });
});
