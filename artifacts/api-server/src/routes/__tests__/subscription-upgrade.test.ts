/**
 * Tests for POST /vendors/:id/subscription/checkout
 *
 * Verifies that:
 * 1. Attempting to "upgrade" to the vendor's current tier or lower is rejected with 409
 * 2. Missing STRIPE_SECRET_KEY returns 503 instead of crashing
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const MOCK_VENDOR = {
  id: 1,
  email: "vendor@example.com",
  clerkUserId: "user_vendor",
  subscriptionTier: "pro",
};

let sessionsCreate = vi.fn(async () => ({ id: "cs_new", url: "https://stripe.test/cs_new" }));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => [MOCK_VENDOR],
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

vi.mock("stripe", () => {
  class MockStripe {
    checkout = {
      sessions: {
        create: (...args: unknown[]) => sessionsCreate(...(args as [])),
      },
    };
  }
  return { default: MockStripe };
});

import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

async function postCheckout(
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
      fetch(`http://localhost:${addr.port}/vendors/1/subscription/checkout`, {
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

describe("POST /vendors/:id/subscription/checkout", () => {
  const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    sessionsCreate = vi.fn(async () => ({ id: "cs_new", url: "https://stripe.test/cs_new" }));
    process.env.STRIPE_SECRET_KEY = "sk_test_platform";
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

  it("returns 503 when STRIPE_SECRET_KEY is not configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const { status, body } = await postCheckout({
      tier: "enterprise",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
    });

    expect(status).toBe(503);
    expect(body).toMatchObject({ error: expect.stringContaining("Stripe") });
    expect(sessionsCreate).not.toHaveBeenCalled();

    process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE_KEY;
  });

  it("creates a checkout session when upgrading to a higher tier", async () => {
    const { status, body } = await postCheckout({
      tier: "enterprise",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ sessionId: "cs_new" });
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });
});
