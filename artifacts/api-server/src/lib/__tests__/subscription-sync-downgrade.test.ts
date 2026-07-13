/**
 * Tests for reconcileVendorSubscription's downgrade path: a vendor sitting
 * on a paid tier in our DB whose Stripe account shows no active/trialing
 * subscription (missed customer.subscription.deleted / charge.refunded)
 * should be reconciled back to free, not left stale.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Vendor } from "@workspace/db/schema";

let vendorRows: Vendor[] = [];
const vendorsTableRef = { id: "vendors.id" };

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
  vendorsTable: vendorsTableRef,
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

function makeStripe(opts: { subscriptions?: unknown[]; sessions?: unknown[] } = {}) {
  return {
    subscriptions: {
      list: () => Promise.resolve({ data: opts.subscriptions ?? [] }),
      retrieve: () => Promise.resolve({ status: "canceled" }),
    },
    checkout: {
      sessions: { list: () => Promise.resolve({ data: opts.sessions ?? [] }) },
    },
  } as unknown as import("stripe").default;
}

beforeEach(() => {
  vendorRows = [];
  notifications.length = 0;
  emails.length = 0;
});

describe("reconcileVendorSubscription — missed cancellation", () => {
  it("downgrades a paid vendor to free when Stripe shows no active/trialing subscription", async () => {
    vendorRows.push(
      makeVendor({
        id: 7,
        subscriptionTier: "pro",
        stripeCustomerId: "cus_7",
        stripeSubscriptionId: "sub_old",
        email: "vendor7@example.com",
        name: "Vendor Seven",
      }),
    );

    const result = await reconcileVendorSubscription(vendorRows[0], makeStripe(), "scheduled-sync");

    expect(result.synced).toBe(true);
    expect(result.currentTier).toBe("free");
    expect(vendorRows[0].subscriptionTier).toBe("free");
    expect(vendorRows[0].stripeSubscriptionId).toBeNull();

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ vendorId: 7 });
    expect(notifications[0].message).toContain("pro");

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ email: "vendor7@example.com", previousTier: "pro" });
  });

  it("does not downgrade or notify a vendor already on the free tier", async () => {
    vendorRows.push(
      makeVendor({
        id: 8,
        subscriptionTier: "free",
        stripeCustomerId: "cus_8",
        email: "vendor8@example.com",
        name: "Vendor Eight",
      }),
    );

    const result = await reconcileVendorSubscription(vendorRows[0], makeStripe(), "scheduled-sync");

    expect(result.synced).toBe(false);
    expect(result.currentTier).toBe("free");
    expect(notifications).toHaveLength(0);
    expect(emails).toHaveLength(0);
  });

  it("does not downgrade a paid vendor whose Stripe subscription is still active", async () => {
    vendorRows.push(
      makeVendor({
        id: 9,
        subscriptionTier: "starter",
        stripeCustomerId: "cus_9",
        stripeSubscriptionId: "sub_9",
        email: "vendor9@example.com",
        name: "Vendor Nine",
      }),
    );

    const stripe = makeStripe({
      subscriptions: [
        {
          id: "sub_9",
          status: "active",
          metadata: { upgradeTier: "starter" },
          items: { data: [{ price: { metadata: {} } }] },
        },
      ],
    });

    const result = await reconcileVendorSubscription(vendorRows[0], stripe, "scheduled-sync");

    expect(result.synced).toBe(false);
    expect(result.currentTier).toBe("starter");
    expect(notifications).toHaveLength(0);
    expect(emails).toHaveLength(0);
  });
});
