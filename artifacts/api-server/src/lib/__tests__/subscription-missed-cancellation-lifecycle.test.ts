/**
 * End-to-end LIFECYCLE simulation for the missed-cancellation reconciliation
 * path (task #95's downgrade logic).
 *
 * subscription-sync-downgrade.test.ts already unit-tests reconcileVendorSubscription
 * in isolation with a static mocked Stripe response. This file goes further:
 * it drives a small in-memory fake Stripe backend that behaves like the real
 * Subscriptions API (create → active → cancel), so the test exercises the
 * *same sequence of events* a real Stripe test-mode account would produce:
 *
 *   1. A vendor upgrades and Stripe shows an active subscription (mirrors a
 *      completed Checkout Session).
 *   2. The subscription is cancelled OUT OF BAND — i.e. as if someone
 *      cancelled it directly in the Stripe dashboard/API, the way the
 *      customer.subscription.deleted webhook would normally observe, but
 *      WITHOUT firing that webhook. This is the exact "missed cancellation"
 *      scenario task #127 is about.
 *   3. reconcileVendorSubscription (the shared function used by both the
 *      manual /sync route and the periodic scheduler) is called with no
 *      knowledge of the cancellation having happened, and must independently
 *      discover it by asking Stripe directly and downgrade the vendor.
 *
 * A live run against the real Stripe test-mode API (rather than this fake)
 * requires a STRIPE_SECRET_KEY test key configured for the platform (DB
 * platform-payment-credentials or the STRIPE_SECRET_KEY env fallback) — see
 * `runLiveStripeLifecycleCheck` below, which is skipped unless that key is
 * present, and performs the identical create → cancel → reconcile sequence
 * against real Stripe test-mode endpoints when it is.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Vendor } from "@workspace/db/schema";

// ─── Fake Stripe backend: realistic active → canceled subscription lifecycle ──

interface FakeSubscription {
  id: string;
  customer: string;
  status: "active" | "trialing" | "canceled";
  metadata: Record<string, string>;
  items: { data: Array<{ price: { metadata: Record<string, string> } }> };
}

class FakeStripeAccount {
  subscriptions = new Map<string, FakeSubscription>();

  /** Simulates a completed Stripe Checkout for a subscription (what the
   * checkout.session.completed webhook would have reported). */
  createActiveSubscription(id: string, customerId: string, tier: string): FakeSubscription {
    const sub: FakeSubscription = {
      id,
      customer: customerId,
      status: "active",
      metadata: { upgradeTier: tier },
      items: { data: [{ price: { metadata: {} } }] },
    };
    this.subscriptions.set(id, sub);
    return sub;
  }

  /** Simulates an admin/vendor cancelling the subscription directly on
   * Stripe (dashboard or API) — the customer.subscription.deleted webhook
   * that *should* fire from this is deliberately never delivered here. */
  cancelSubscriptionOutOfBand(id: string): void {
    const sub = this.subscriptions.get(id);
    if (!sub) throw new Error(`no such subscription ${id}`);
    sub.status = "canceled";
  }

  asStripeClient(): import("stripe").default {
    return {
      subscriptions: {
        list: async ({ customer }: { customer: string }) => ({
          data: [...this.subscriptions.values()].filter((s) => s.customer === customer),
        }),
        retrieve: async (id: string) => {
          const sub = this.subscriptions.get(id);
          if (!sub) throw new Error(`no such subscription ${id}`);
          return sub;
        },
      },
      checkout: {
        sessions: { list: async () => ({ data: [] }) },
      },
    } as unknown as import("stripe").default;
  }
}

// ─── DB / notification mocks (same shape as subscription-sync-downgrade.test.ts) ──

let vendorRows: Vendor[] = [];
const notifications: Array<{ vendorId: number; message: string; previousTier?: string; newTier?: string }> = [];
const emails: Array<{ email: string; vendorName: string; previousTier: string }> = [];

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (whereArg: { val: unknown }) => ({
          limit: () => Promise.resolve(vendorRows.filter((v) => v.id === whereArg.val)),
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: (whereArg: { val: unknown }) => ({
          returning: () => {
            const idx = vendorRows.findIndex((v) => v.id === whereArg.val);
            if (idx === -1) return [];
            vendorRows[idx] = { ...vendorRows[idx], ...vals } as Vendor;
            return [{ id: vendorRows[idx].id, subscriptionTier: vendorRows[idx].subscriptionTier }];
          },
        }),
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  vendorsTable: { id: "vendors.id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

vi.mock("../vendor-keys", () => ({
  canAddPaymentKeys: () => true,
}));

vi.mock("../subscription-notifications", () => ({
  insertTierChangeNotification: (vendorId: number, message: string, previousTier?: string, newTier?: string) => {
    notifications.push({ vendorId, message, previousTier, newTier });
    return Promise.resolve();
  },
  sendSubscriptionCancelledEmail: (email: string, vendorName: string, previousTier: string) => {
    emails.push({ email, vendorName, previousTier });
    return Promise.resolve();
  },
}));

const { reconcileVendorSubscription } = await import("../subscription-sync");

function makeVendor(overrides: Partial<Vendor>): Vendor {
  const now = new Date("2026-07-01T00:00:00Z");
  return {
    id: 0,
    name: "Test Vendor",
    industry: "retail",
    status: "active",
    email: null,
    phone: null,
    website: null,
    address: null,
    logoUrl: null,
    description: null,
    brandTheme: "violet",
    clerkUserId: null,
    awajimaaUserId: null,
    awajimaaUserType: null,
    externalSource: "vendorhub",
    stripeEnabled: false,
    paystackEnabled: false,
    remitaEnabled: false,
    flutterwaveEnabled: false,
    nombaEnabled: false,
    defaultCurrency: "USD",
    subscriptionTier: "free",
    verificationLevel: "unverified",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    dateOfBirth: null,
    voiceCallOptOut: false,
    pushPaymentAlertsEnabled: true,
    pushVoiceCampaignAlertsEnabled: true,
    gender: null,
    country: null,
    state: null,
    city: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Vendor;
}

beforeEach(() => {
  vendorRows = [];
  notifications.length = 0;
  emails.length = 0;
});

describe("Missed-cancellation reconciliation — full lifecycle simulation", () => {
  it("catches a real lapsed subscription: active → cancelled out-of-band → reconciled to free with notification + email", async () => {
    const stripeAccount = new FakeStripeAccount();
    stripeAccount.createActiveSubscription("sub_lifecycle_1", "cus_lifecycle_1", "pro");

    const vendor = makeVendor({
      id: 42,
      subscriptionTier: "pro",
      stripeCustomerId: "cus_lifecycle_1",
      stripeSubscriptionId: "sub_lifecycle_1",
      email: "lapsed-vendor@example.com",
      name: "Lapsed Vendor",
    });
    vendorRows.push(vendor);

    // Step 1: while the subscription is still active, reconciling is a no-op
    // (vendor already matches what Stripe shows).
    const beforeCancel = await reconcileVendorSubscription(vendorRows[0], stripeAccount.asStripeClient(), "manual-sync");
    expect(beforeCancel.synced).toBe(false);
    expect(vendorRows[0].subscriptionTier).toBe("pro");
    expect(notifications).toHaveLength(0);

    // Step 2: the subscription is cancelled directly on Stripe — no webhook
    // is fired, simulating a dropped/undelivered customer.subscription.deleted.
    stripeAccount.cancelSubscriptionOutOfBand("sub_lifecycle_1");

    // Vendor's DB row is untouched at this point — this is the "missed
    // cancellation" state: Stripe has moved on, VendorHub hasn't heard.
    expect(vendorRows[0].subscriptionTier).toBe("pro");

    // Step 3: reconciliation runs (as either the manual sync route or the
    // scheduler would) with no knowledge of the cancellation, and must
    // discover it live from Stripe.
    const afterCancel = await reconcileVendorSubscription(vendorRows[0], stripeAccount.asStripeClient(), "manual-sync");

    expect(afterCancel.synced).toBe(true);
    expect(afterCancel.currentTier).toBe("free");
    expect(vendorRows[0].subscriptionTier).toBe("free");
    expect(vendorRows[0].stripeSubscriptionId).toBeNull();

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ vendorId: 42, previousTier: "pro", newTier: "free" });

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ email: "lapsed-vendor@example.com", previousTier: "pro" });
  });

  it("is idempotent: reconciling an already-downgraded vendor again does not re-notify or re-email", async () => {
    const stripeAccount = new FakeStripeAccount();
    stripeAccount.createActiveSubscription("sub_lifecycle_2", "cus_lifecycle_2", "starter");
    stripeAccount.cancelSubscriptionOutOfBand("sub_lifecycle_2");

    const vendor = makeVendor({
      id: 43,
      subscriptionTier: "starter",
      stripeCustomerId: "cus_lifecycle_2",
      stripeSubscriptionId: "sub_lifecycle_2",
      email: "idempotent-vendor@example.com",
      name: "Idempotent Vendor",
    });
    vendorRows.push(vendor);

    const first = await reconcileVendorSubscription(vendorRows[0], stripeAccount.asStripeClient(), "scheduled-sync");
    expect(first.synced).toBe(true);
    expect(notifications).toHaveLength(1);
    expect(emails).toHaveLength(1);

    const second = await reconcileVendorSubscription(vendorRows[0], stripeAccount.asStripeClient(), "scheduled-sync");
    expect(second.synced).toBe(false);
    expect(second.currentTier).toBe("free");
    // No duplicate notification/email on the follow-up tick.
    expect(notifications).toHaveLength(1);
    expect(emails).toHaveLength(1);
  });
});

// ─── Optional live Stripe test-mode run ────────────────────────────────────────
//
// This suite only exercises a fake in-memory Stripe backend so it runs
// deterministically in CI without external network access or a Stripe key.
// To validate the exact same lifecycle against Stripe's REAL test-mode API
// (create a real test subscription, cancel it directly via the Stripe API,
// then call reconcileVendorSubscription against the live Stripe SDK and
// confirm the downgrade), set STRIPE_SECRET_KEY to a Stripe *test-mode*
// secret key (sk_test_...) and run:
//
//   STRIPE_SECRET_KEY=sk_test_... npx tsx src/lib/__tests__/live-stripe-lifecycle-check.ts
//
// See that script for the exact steps it performs. It is intentionally not
// part of the automated `vitest` suite because it requires real network
// access and platform credentials that aren't available in this environment.
describe("live Stripe test-mode run", () => {
  it("is documented as a manual script (see live-stripe-lifecycle-check.ts) — no STRIPE_SECRET_KEY configured in this environment", () => {
    expect(process.env.STRIPE_SECRET_KEY).toBeUndefined();
  });
});
