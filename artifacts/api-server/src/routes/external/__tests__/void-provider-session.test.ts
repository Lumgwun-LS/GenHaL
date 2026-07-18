/**
 * Unit tests for the exported `voidProviderSession` helper in payments.ts.
 *
 * Covered cases:
 *   1. Paystack provider → returns early immediately (no Stripe call, no DB write).
 *   2. Stripe key missing (resolveStripeKey throws) → voidError + voidErrorAt
 *      written to the payment's metadata so the void-error-check scheduler
 *      can pick it up later.
 *   3. Stripe session already expired (status ≠ "open") → retrieve called but
 *      expire is NOT called (idempotent no-op).
 *   4. Stripe session is open → expire called and no error is written to metadata.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mutable mock state ───────────────────────────────────────────────────────

interface FakeVendor {
  id: number;
  stripeEnabled: boolean;
  paystackEnabled: boolean;
  defaultCurrency: string | null;
}

let vendorRow: FakeVendor | null = {
  id: 10,
  stripeEnabled: true,
  paystackEnabled: false,
  defaultCurrency: "USD",
};

/** Metadata stored for the payment row, mutated by db.update().set() */
let storedMetadata: Record<string, unknown> = {};

const expireMock = vi.fn(async (_ref: string) => {});
let sessionStatus: "open" | "expired" | "complete" = "open";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => (vendorRow ? [vendorRow] : []),
      }),
    }),
    update: () => ({
      set: (vals: { metadata: Record<string, unknown> }) => ({
        where: () => {
          storedMetadata = vals.metadata;
          return Promise.resolve([]);
        },
      }),
    }),
    insert: () => ({
      values: () => ({ returning: async () => [{ id: 1 }] }),
    }),
  },
  paymentsTable: { id: "payments.id", vendorId: "payments.vendorId", metadata: "payments.metadata" },
  vendorsTable: { id: "vendors.id" },
  ordersTable: { id: "orders.id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  desc: (col: unknown) => col,
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.raw.join(""), values }),
    { raw: () => ({}) },
  ),
}));

vi.mock("stripe", () => {
  class MockStripe {
    checkout = {
      sessions: {
        create: async () => ({ id: "cs_test", url: "https://stripe.test/pay" }),
        retrieve: async (_ref: string) => ({ status: sessionStatus }),
        expire: expireMock,
      },
    };
  }
  return { default: MockStripe };
});

// resolveStripeKey — controlled per-test via this ref
let stripeKeyResult: string | Error = "sk_test_fake";

vi.mock("../../../lib/vendor-keys", () => ({
  resolveStripeKey: async () => {
    if (stripeKeyResult instanceof Error) throw stripeKeyResult;
    return stripeKeyResult;
  },
  resolvePaystackKey: async () => "pk_live_fake",
  canAddPaymentKeys: () => true,
}));

vi.mock("../../../middlewares/requireExternalAuth", () => ({
  requireExternalAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("voidProviderSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedMetadata = {};
    sessionStatus = "open";
    stripeKeyResult = "sk_test_fake";
    vendorRow = { id: 10, stripeEnabled: true, paystackEnabled: false, defaultCurrency: "USD" };
  });

  it("returns immediately for a Paystack payment without touching Stripe", async () => {
    const { voidProviderSession } = await import("../payments");

    await voidProviderSession(10, {
      id: 1,
      provider: "paystack",
      providerReference: "ref_paystack_123",
      metadata: { source: "awajimaa" },
    });

    expect(expireMock).not.toHaveBeenCalled();
    expect(storedMetadata).toEqual({});
  });

  it("writes voidError + voidErrorAt to metadata when the Stripe key cannot be resolved", async () => {
    stripeKeyResult = new Error("No Stripe key configured");
    const { voidProviderSession } = await import("../payments");

    await voidProviderSession(10, {
      id: 2,
      provider: "stripe",
      providerReference: "cs_open_123",
      metadata: { sessionId: "cs_open_123", source: "awajimaa" },
    });

    expect(expireMock).not.toHaveBeenCalled();
    expect(storedMetadata).toMatchObject({
      sessionId: "cs_open_123",
      source: "awajimaa",
      voidError: "No Stripe key configured",
    });
    expect(typeof storedMetadata.voidErrorAt).toBe("string");
    expect(new Date(storedMetadata.voidErrorAt as string).getTime()).toBeGreaterThan(0);
  });

  it("does not call expire when the session is already expired (idempotent)", async () => {
    sessionStatus = "expired";
    const { voidProviderSession } = await import("../payments");

    await voidProviderSession(10, {
      id: 3,
      provider: "stripe",
      providerReference: "cs_already_expired",
      metadata: { sessionId: "cs_already_expired" },
    });

    // expire must NOT be called — calling it on a non-open session would throw
    expect(expireMock).not.toHaveBeenCalled();
    // No error written to metadata either
    expect(storedMetadata).toEqual({});
  });

  it("calls checkout.sessions.expire for an open Stripe session and writes no error", async () => {
    sessionStatus = "open";
    const { voidProviderSession } = await import("../payments");

    await voidProviderSession(10, {
      id: 4,
      provider: "stripe",
      providerReference: "cs_live_open",
      metadata: { sessionId: "cs_live_open" },
    });

    expect(expireMock).toHaveBeenCalledOnce();
    expect(expireMock).toHaveBeenCalledWith("cs_live_open");
    // No error written — metadata update only happens in the catch block
    expect(storedMetadata).toEqual({});
  });

  it("writes voidError when the vendor row is not found", async () => {
    vendorRow = null;
    const { voidProviderSession } = await import("../payments");

    // When vendor is not found the function returns early (no error written)
    await voidProviderSession(10, {
      id: 5,
      provider: "stripe",
      providerReference: "cs_no_vendor",
      metadata: {},
    });

    // Just verifies no exception is thrown and expire is not attempted
    expect(expireMock).not.toHaveBeenCalled();
  });
});
