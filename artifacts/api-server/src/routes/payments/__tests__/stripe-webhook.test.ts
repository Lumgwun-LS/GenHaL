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
// Models the webhook_events table: eventId -> whether it finished successfully.
let webhookEventRows: Map<string, { processedAt: Date | null }> = new Map();

const webhookEventsTableRef = { eventId: "eventId", processedAt: "processedAt" };
const vendorsTableRef = { id: "id" };

// ── Mock @workspace/db ────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (whereArg: unknown) => {
          if (table === webhookEventsTableRef) {
            const eventId = (whereArg as { val: string }).val;
            const row = webhookEventRows.get(eventId);
            return Promise.resolve(row ? [{ processedAt: row.processedAt }] : []);
          }
          return { limit: () => vendorRows };
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: (whereArg: unknown) => {
          if (table === webhookEventsTableRef) {
            const eventId = (whereArg as { val: string }).val;
            const row = webhookEventRows.get(eventId);
            if (row) row.processedAt = (vals.processedAt as Date | null) ?? row.processedAt;
            return Promise.resolve();
          }
          return {
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
          };
        },
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        const eventId = vals.eventId as string;
        if (webhookEventRows.has(eventId)) {
          const err = new Error(
            'duplicate key value violates unique constraint "webhook_events_event_id_unique"',
          ) as Error & { code?: string };
          err.code = "23505";
          throw err;
        }
        webhookEventRows.set(eventId, { processedAt: (vals.processedAt as Date | null) ?? null });
        return Promise.resolve();
      },
    }),
  },
  paymentsTable: {},
  ordersTable: {},
  vendorsTable: vendorsTableRef,
  webhookEventsTable: webhookEventsTableRef,
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
    webhookEventRows = new Map();
    vi.clearAllMocks();
  });

  it("activates the vendor's plan from checkout.session.completed metadata", async () => {
    const { status, body } = await postWebhook({
      id: "evt_test_123",
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
      id: "evt_test_456",
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
      id: "evt_test_789",
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

  it("does not re-apply the tier upgrade when Stripe retries the same event id", async () => {
    const event = {
      id: "evt_test_dup",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_dup",
          metadata: {
            upgradeVendorId: "7",
            upgradeTier: "pro",
          },
        },
      },
    };

    const first = await postWebhook(event);
    expect(first.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(vendorRows[0].subscriptionTier).toBe("pro");

    // Simulate a manual downgrade in between deliveries — a duplicate
    // delivery must NOT re-apply "pro" over this.
    vendorRows[0].subscriptionTier = "free";

    const second = await postWebhook(event);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ received: true });
    // No new update call was issued for the duplicate delivery.
    expect(updateCalls).toHaveLength(1);
    expect(vendorRows[0].subscriptionTier).toBe("free");
  });

  it("reprocesses on retry if the first delivery failed before finishing (not treated as duplicate)", async () => {
    const event = {
      id: "evt_test_retry",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_retry",
          metadata: {
            upgradeVendorId: "7",
            upgradeTier: "pro",
          },
        },
      },
    };

    // Simulate a crashed first attempt: the event got claimed (row inserted)
    // but never finished, so processedAt stayed NULL.
    webhookEventRows.set("evt_test_retry", { processedAt: null });

    const retry = await postWebhook(event);

    expect(retry.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(vendorRows[0].subscriptionTier).toBe("pro");
    expect(webhookEventRows.get("evt_test_retry")?.processedAt).not.toBeNull();
  });
});
