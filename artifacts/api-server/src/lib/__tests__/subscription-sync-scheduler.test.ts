/**
 * Confirms subscription-sync-scheduler's periodic tick() independently
 * catches a missed subscription cancellation — i.e. the same lapsed-Stripe-
 * subscription scenario as subscription-missed-cancellation-lifecycle.test.ts,
 * but driven purely through tick() with NO HTTP route call involved, the way
 * it runs unattended every 30 minutes in production.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface FakeVendor {
  id: number;
  subscriptionTier: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  email: string | null;
  name: string;
}

let vendorRows: FakeVendor[] = [];
let platformStripeKey: string | undefined = "sk_test_platform";
let recordedRuns: Array<{ jobName: string; input: unknown }> = [];

// Subscriptions the fake Stripe backend currently considers active for a
// given customer — reconcileVendorSubscription's real implementation is
// used (not mocked), only the Stripe SDK itself is faked, so this test
// exercises the real reconciliation logic exactly like the lifecycle test.
let activeSubscriptionsByCustomer = new Map<string, { id: string; tier: string }>();

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (whereArg?: { val: unknown } | string) => {
          // subscription-sync-scheduler's candidate query uses isNotNull(...)
          // (mocked below as the literal string "isNotNull") with no .limit()
          // chained — it awaits the where() result directly. Per-vendor
          // lookups inside reconcileVendorSubscription use eq(...) (mocked
          // as an object) followed by .limit().
          if (typeof whereArg === "object" && whereArg !== null && "val" in whereArg) {
            return {
              limit: () => Promise.resolve(vendorRows.filter((v) => v.id === whereArg.val)),
            };
          }
          return Promise.resolve(vendorRows);
        },
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: (whereArg: { val: unknown }) => ({
          returning: () => {
            const idx = vendorRows.findIndex((v) => v.id === whereArg.val);
            if (idx === -1) return [];
            vendorRows[idx] = { ...vendorRows[idx], ...vals } as FakeVendor;
            return [{ id: vendorRows[idx].id, subscriptionTier: vendorRows[idx].subscriptionTier }];
          },
        }),
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  vendorsTable: { id: "vendors.id", stripeCustomerId: "vendors.stripeCustomerId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  isNotNull: () => "isNotNull",
}));

vi.mock("../vendor-keys", () => ({
  canAddPaymentKeys: () => true,
}));

const notifications: Array<{ vendorId: number }> = [];
const emails: Array<{ email: string }> = [];
vi.mock("../subscription-notifications", () => ({
  insertTierChangeNotification: (vendorId: number) => {
    notifications.push({ vendorId });
    return Promise.resolve();
  },
  sendSubscriptionCancelledEmail: (email: string) => {
    emails.push({ email });
    return Promise.resolve();
  },
}));

vi.mock("../logger", () => ({
  logger: { info: () => {}, error: () => {}, warn: () => {} },
}));

vi.mock("../job-run-status", () => ({
  recordJobRun: (jobName: string, input: unknown) => {
    recordedRuns.push({ jobName, input });
    return Promise.resolve();
  },
}));

vi.mock("../platform-gateways", () => ({
  resolveGatewayField: async () => platformStripeKey,
}));

vi.mock("stripe", () => {
  class MockStripe {
    subscriptions = {
      list: async ({ customer }: { customer: string }) => {
        const sub = activeSubscriptionsByCustomer.get(customer);
        return { data: sub ? [{ id: sub.id, status: "active", metadata: { upgradeTier: sub.tier }, items: { data: [{ price: { metadata: {} } }] } }] : [] };
      },
    };
    checkout = {
      sessions: { list: async () => ({ data: [] }) },
    };
  }
  return { default: MockStripe };
});

const { tick, SUBSCRIPTION_SYNC_JOB_NAME } = await import("../subscription-sync-scheduler");

beforeEach(() => {
  vendorRows = [];
  activeSubscriptionsByCustomer = new Map();
  notifications.length = 0;
  emails.length = 0;
  recordedRuns = [];
  platformStripeKey = "sk_test_platform";
});

describe("subscription-sync-scheduler tick() — missed cancellation, no route involved", () => {
  it("downgrades a vendor whose Stripe subscription lapsed, purely from the periodic tick", async () => {
    vendorRows.push({
      id: 55,
      subscriptionTier: "pro",
      stripeCustomerId: "cus_scheduler_1",
      stripeSubscriptionId: "sub_scheduler_1",
      email: "scheduler-vendor@example.com",
      name: "Scheduler Vendor",
    });
    // No entry in activeSubscriptionsByCustomer for cus_scheduler_1 — this
    // simulates the subscription having been cancelled out-of-band; Stripe
    // reports no active subscription for this customer.

    await tick();

    expect(vendorRows[0].subscriptionTier).toBe("free");
    expect(vendorRows[0].stripeSubscriptionId).toBeNull();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ vendorId: 55 });
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ email: "scheduler-vendor@example.com" });

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: SUBSCRIPTION_SYNC_JOB_NAME,
      input: { success: true, checkedCount: 1, affectedCount: 1 },
    });
  });

  it("leaves an unaffected vendor with a still-active subscription untouched", async () => {
    activeSubscriptionsByCustomer.set("cus_scheduler_2", { id: "sub_scheduler_2", tier: "starter" });
    vendorRows.push({
      id: 56,
      subscriptionTier: "starter",
      stripeCustomerId: "cus_scheduler_2",
      stripeSubscriptionId: "sub_scheduler_2",
      email: "still-active@example.com",
      name: "Still Active Vendor",
    });

    await tick();

    expect(vendorRows[0].subscriptionTier).toBe("starter");
    expect(notifications).toHaveLength(0);
    expect(emails).toHaveLength(0);
    expect(recordedRuns[0]).toMatchObject({ input: { success: true, checkedCount: 1, affectedCount: 0 } });
  });

  it("processes multiple vendors independently in a single tick, catching only the lapsed one", async () => {
    activeSubscriptionsByCustomer.set("cus_ok", { id: "sub_ok", tier: "pro" });
    vendorRows.push(
      { id: 60, subscriptionTier: "pro", stripeCustomerId: "cus_ok", stripeSubscriptionId: "sub_ok", email: "ok@example.com", name: "OK Vendor" },
      { id: 61, subscriptionTier: "enterprise", stripeCustomerId: "cus_lapsed", stripeSubscriptionId: "sub_lapsed", email: "lapsed@example.com", name: "Lapsed Vendor" },
    );

    await tick();

    expect(vendorRows.find((v) => v.id === 60)!.subscriptionTier).toBe("pro");
    expect(vendorRows.find((v) => v.id === 61)!.subscriptionTier).toBe("free");
    expect(notifications.map((n) => n.vendorId)).toEqual([61]);
    expect(recordedRuns[0]).toMatchObject({ input: { success: true, checkedCount: 2, affectedCount: 1 } });
  });

  it("records a successful no-op run when Stripe isn't configured on the platform", async () => {
    platformStripeKey = undefined;
    vendorRows.push({
      id: 70,
      subscriptionTier: "pro",
      stripeCustomerId: "cus_no_key",
      stripeSubscriptionId: "sub_no_key",
      email: "vendor@example.com",
      name: "Vendor",
    });

    await tick();

    expect(vendorRows[0].subscriptionTier).toBe("pro");
    expect(recordedRuns).toEqual([{ jobName: SUBSCRIPTION_SYNC_JOB_NAME, input: { success: true, checkedCount: 0, affectedCount: 0 } }]);
  });
});
