/**
 * Tests for POST /payments/stripe/webhook — subscription upgrade path.
 *
 * Verifies that a vendor's plan activates purely from the webhook event,
 * independent of any client-side state (so it still works even if the
 * server restarted mid-payment and lost track of the checkout session).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.STRIPE_SECRET_KEY = "sk_test_platform";

// ── Shared mock state ────────────────────────────────────────────────────────

let vendorRows: Array<{ id: number; subscriptionTier: string }> = [];
let updateCalls: Array<{ set: Record<string, unknown>; whereId: unknown }> = [];
let constructedEvent: unknown = null;

// ── Mock @workspace/db ────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => vendorRows,
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: (whereArg: unknown) => ({
          returning: () => {
            updateCalls.push({ set: vals, whereId: whereArg });
            const match = vendorRows.find(
              (v) => v.id === (whereArg as { val: number }).val,
            );
            if (!match) return [];
            const updated = { ...match, ...vals };
            // reflect the update so subsequent reads see it
            const idx = vendorRows.findIndex((v) => v.id === match.id);
            vendorRows[idx] = { ...vendorRows[idx], ...vals } as typeof match;
            return [updated];
          },
        }),
      }),
    }),
  },
  paymentsTable: {},
  ordersTable: {},
  vendorsTable: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

vi.mock("../../../lib/vendor-keys", () => ({
  resolveStripeKey: vi.fn(),
  canAddPaymentKeys: () => true,
}));

// ── Mock the Stripe SDK ───────────────────────────────────────────────────────

vi.mock("stripe", () => {
  class MockStripe {
    webhooks = {
      constructEvent: vi.fn(() => constructedEvent),
    };
    checkout = { sessions: { create: vi.fn() } };
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

  const { default: router } = await import("../stripe");

  const app = express();
  // Mirror the real app: raw body for the webhook route.
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

describe("POST /payments/stripe/webhook — subscription upgrade", () => {
  beforeEach(() => {
    vendorRows = [{ id: 7, subscriptionTier: "free" }];
    updateCalls = [];
    vi.clearAllMocks();
  });

  it("activates the vendor's plan from checkout.session.completed metadata", async () => {
    const { status, body } = await postWebhook({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          metadata: {
            upgradeVendorId: "7",
            upgradeTier: "pro",
          },
        },
      },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ received: true });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set).toMatchObject({ subscriptionTier: "pro" });
    expect(vendorRows[0].subscriptionTier).toBe("pro");
  });

  it("ignores an invalid tier in the metadata without crashing", async () => {
    const { status } = await postWebhook({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_456",
          metadata: {
            upgradeVendorId: "7",
            upgradeTier: "not-a-real-tier",
          },
        },
      },
    });

    expect(status).toBe(200);
    expect(updateCalls).toHaveLength(0);
    expect(vendorRows[0].subscriptionTier).toBe("free");
  });

  it("logs a warning but still returns 200 when the vendor no longer exists", async () => {
    vendorRows = [];

    const { status } = await postWebhook({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_789",
          metadata: {
            upgradeVendorId: "999",
            upgradeTier: "enterprise",
          },
        },
      },
    });

    expect(status).toBe(200);
  });
});
