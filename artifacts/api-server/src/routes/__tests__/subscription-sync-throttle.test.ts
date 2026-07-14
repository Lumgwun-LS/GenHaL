/**
 * Tests for POST /vendors/:id/subscription/sync's throttling guard.
 *
 * The route makes several live Stripe API calls via reconcileVendorSubscription
 * (subscriptions.list / checkout.sessions.list / subscriptions.retrieve). A
 * vendor mashing "Refresh billing status" — or the UI polling it repeatedly
 * right after returning from Stripe Checkout — must not multiply those calls.
 *
 * Verifies that:
 * 1. Several concurrent/rapid requests for the same vendor only trigger one
 *    underlying reconcile call (in-flight de-duplication).
 * 2. A request made again immediately after the first completes is served
 *    from the cooldown cache instead of hitting Stripe again.
 * 3. Once the cooldown window elapses, a fresh request does trigger another
 *    reconcile call.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const MOCK_VENDOR = {
  id: 1,
  email: "vendor@example.com",
  clerkUserId: "user_vendor",
  subscriptionTier: "pro",
  stripeCustomerId: "cus_existing",
};

let reconcileCalls = 0;
let reconcileImpl: () => Promise<{ synced: boolean; currentTier: string; reason?: string }> = async () => {
  reconcileCalls++;
  return { synced: false, currentTier: MOCK_VENDOR.subscriptionTier };
};

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

vi.mock("../../lib/platform-gateways", () => ({
  resolveGatewayField: async () => "sk_test_platform",
}));

vi.mock("../../lib/stripe-catalog", () => ({
  ensureStripeCatalog: async () => [],
  ensurePortalConfiguration: async () => "bpc_test_config",
}));

vi.mock("../../lib/subscription-sync", () => ({
  reconcileVendorSubscription: (...args: unknown[]) => reconcileImpl(...(args as [])),
}));

vi.mock("stripe", () => {
  class MockStripe {}
  return { default: MockStripe };
});

import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

async function post(
  path: string,
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

describe("POST /vendors/:id/subscription/sync — throttling", () => {
  beforeEach(() => {
    reconcileCalls = 0;
    reconcileImpl = async () => {
      reconcileCalls++;
      return { synced: false, currentTier: MOCK_VENDOR.subscriptionTier };
    };
    MOCK_VENDOR.stripeCustomerId = "cus_existing";
    MOCK_VENDOR.subscriptionTier = "pro";
    vi.resetModules();
  });

  it("only reconciles once when several requests race concurrently", async () => {
    // Make the reconcile call slow enough that concurrent requests are
    // guaranteed to land while the first one is still in flight.
    reconcileImpl = async () => {
      reconcileCalls++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { synced: false, currentTier: MOCK_VENDOR.subscriptionTier };
    };

    const results = await Promise.all([postSync(), postSync(), postSync(), postSync(), postSync()]);

    expect(reconcileCalls).toBe(1);
    for (const { status } of results) {
      expect(status).toBe(200);
    }
    // Exactly one of the five responses should be the "fresh" one; the rest
    // must be flagged as piggybacking on the in-flight/cached result.
    const throttledCount = results.filter((r) => r.body?.throttled === true).length;
    expect(throttledCount).toBe(4);
  });

  it("serves the cached result during the cooldown window instead of reconciling again", async () => {
    const first = await postSync();
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ throttled: false });
    expect(reconcileCalls).toBe(1);

    const second = await postSync();
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ throttled: true });
    expect(reconcileCalls).toBe(1);

    const third = await postSync();
    expect(third.body).toMatchObject({ throttled: true });
    expect(reconcileCalls).toBe(1);
  });

  it("reconciles again once the cooldown window has elapsed", async () => {
    vi.useFakeTimers();
    try {
      const firstPromise = postSync();
      await vi.runAllTimersAsync();
      const first = await firstPromise;
      expect(first.body).toMatchObject({ throttled: false });
      expect(reconcileCalls).toBe(1);

      // Still within the cooldown window: served from cache.
      const withinCooldownPromise = postSync();
      await vi.advanceTimersByTimeAsync(5_000);
      const withinCooldown = await withinCooldownPromise;
      expect(withinCooldown.body).toMatchObject({ throttled: true });
      expect(reconcileCalls).toBe(1);

      // Advance well past the 20s cooldown window.
      await vi.advanceTimersByTimeAsync(20_000);

      const afterCooldownPromise = postSync();
      await vi.runAllTimersAsync();
      const afterCooldown = await afterCooldownPromise;
      expect(afterCooldown.body).toMatchObject({ throttled: false });
      expect(reconcileCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
