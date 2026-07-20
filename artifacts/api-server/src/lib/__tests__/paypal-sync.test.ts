/**
 * Tests for reconcileVendorPayPalSubscription — the missed-ACTIVATED-webhook
 * recovery path.
 *
 * Key cases:
 * (a) Vendor approves PayPal checkout (paypalSubscriptionId is persisted) but
 *     BILLING.SUBSCRIPTION.ACTIVATED never arrives → sync fetches status from
 *     PayPal, finds ACTIVE, and upgrades vendor from free to target tier.
 * (b) Vendor mid-upgrade (starter→pro) and ACTIVATED is missed → sync applies
 *     the correct paid-to-paid tier transition.
 * (c) Subscription is ACTIVE and vendor is already on correct tier → no-op.
 * (d) Subscription is CANCELLED and vendor is on a paid tier → downgrade to free.
 * (e) Subscription is APPROVAL_PENDING → no tier change.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Vendor } from "@workspace/db/schema";

// ── In-memory vendor state ─────────────────────────────────────────────────────

type VendorRow = Partial<Vendor> & {
  id: number;
  subscriptionTier: string;
  paypalSubscriptionId: string | null;
  subscriptionProvider: string | null;
  email: string | null;
  name: string;
};

let vendorRows: Map<number, VendorRow> = new Map();
let notificationInserts: Array<{ vendorId: number; message: string; previousTier: string; newTier: string }> = [];

// ── Mock @workspace/db ─────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const vendorsRef = {
    id: "id",
    subscriptionTier: "subscriptionTier",
    paypalSubscriptionId: "paypalSubscriptionId",
    subscriptionProvider: "subscriptionProvider",
  } as const;

  const makeDb = () => ({
    select: () => ({
      from: (_table: unknown) => ({
        where: (_w: unknown) => Promise.resolve([]),
      }),
    }),
    update: (_table: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: (whereArg: { val?: unknown }) => ({
          returning: async (_cols?: unknown): Promise<VendorRow[]> => {
            const id = whereArg?.val as number;
            const row = vendorRows.get(id);
            if (!row) return [];
            Object.assign(row, vals);
            return [row];
          },
        }),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve(),
    }),
  });

  return {
    db: makeDb(),
    vendorsTable: vendorsRef,
  };
});

// ── Mock drizzle-orm ──────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: unknown) => ({ val }),
}));

// ── Mock paypal-catalog (getPayPalAccessToken + paypalBaseUrl) ────────────────

vi.mock("../paypal-catalog", () => ({
  getPayPalAccessToken: vi.fn(async () => "mock-access-token"),
  paypalBaseUrl: vi.fn(() => "https://api-m.sandbox.paypal.com"),
}));

// ── Mock subscription-sync ─────────────────────────────────────────────────────

let downgradeApplied = false;
vi.mock("../subscription-sync", () => ({
  applyVendorTierDowngrade: vi.fn(async (_vendor: VendorRow, _source: string) => {
    downgradeApplied = true;
    return { applied: true, tier: "free" };
  }),
}));

// ── Mock subscription-notifications ───────────────────────────────────────────

vi.mock("../subscription-notifications", () => ({
  insertTierChangeNotification: vi.fn(async (vendorId: number, message: string, previousTier: string, newTier: string) => {
    notificationInserts.push({ vendorId, message, previousTier, newTier });
  }),
}));

// ── Intercept fetch to return controlled PayPal API responses ─────────────────

let mockPayPalSubscription: Record<string, unknown> | null = null;

beforeEach(() => {
  vendorRows = new Map();
  notificationInserts = [];
  downgradeApplied = false;
  mockPayPalSubscription = null;
  vi.clearAllMocks();

  globalThis.fetch = vi.fn(async (url: string | URL) => {
    const urlStr = String(url);
    if (urlStr.includes("/v1/billing/subscriptions/")) {
      if (mockPayPalSubscription === null) {
        return { ok: false, status: 404, text: async () => "not found" } as Response;
      }
      return {
        ok: true,
        json: async () => mockPayPalSubscription,
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${urlStr}`);
  });
});

// ── Import SUT (after mocks are in place) ─────────────────────────────────────

const { reconcileVendorPayPalSubscription } = await import("../paypal-sync");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVendor(overrides: Partial<VendorRow> = {}): Vendor {
  const v: VendorRow = {
    id: 1,
    subscriptionTier: "free",
    paypalSubscriptionId: "I-TEST123",
    subscriptionProvider: null,
    email: "vendor@example.com",
    name: "Test Vendor",
    ...overrides,
  };
  vendorRows.set(v.id, v);
  return v as unknown as Vendor;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("reconcileVendorPayPalSubscription", () => {
  it("(a) upgrades vendor from free when ACTIVATED webhook was missed — no prior subscriptionProvider set", async () => {
    // The checkout route persists paypalSubscriptionId but not subscriptionProvider
    // (provider is set by the ACTIVATED webhook). If the webhook never arrived, the
    // vendor is still on free tier with subscriptionProvider=null.
    const vendor = makeVendor({
      subscriptionTier: "free",
      subscriptionProvider: null,        // webhook hasn't fired yet
      paypalSubscriptionId: "I-TEST123",
    });

    mockPayPalSubscription = {
      id: "I-TEST123",
      status: "ACTIVE",
      custom_id: JSON.stringify({ upgradeVendorId: "1", upgradeTier: "starter" }),
    };

    const result = await reconcileVendorPayPalSubscription(
      vendor, "test-client-id", "test-secret", "sandbox", "manual-sync",
    );

    expect(result.synced).toBe(true);
    expect(result.currentTier).toBe("starter");
    expect(notificationInserts).toHaveLength(1);
    expect(notificationInserts[0].previousTier).toBe("free");
    expect(notificationInserts[0].newTier).toBe("starter");

    // Verify DB was updated
    const row = vendorRows.get(1)!;
    expect(row.subscriptionTier).toBe("starter");
    expect(row.subscriptionProvider).toBe("paypal");
  });

  it("(b) applies paid-to-paid upgrade when ACTIVATED webhook was missed (starter → pro)", async () => {
    const vendor = makeVendor({
      subscriptionTier: "starter",
      subscriptionProvider: "paypal",
      paypalSubscriptionId: "I-UPGRADE-PRO",
    });

    mockPayPalSubscription = {
      id: "I-UPGRADE-PRO",
      status: "ACTIVE",
      custom_id: JSON.stringify({ upgradeVendorId: "1", upgradeTier: "pro" }),
    };

    const result = await reconcileVendorPayPalSubscription(
      vendor, "test-client-id", "test-secret", "sandbox", "manual-sync",
    );

    expect(result.synced).toBe(true);
    expect(result.currentTier).toBe("pro");
    expect(notificationInserts).toHaveLength(1);
    expect(notificationInserts[0].previousTier).toBe("starter");
    expect(notificationInserts[0].newTier).toBe("pro");

    const row = vendorRows.get(1)!;
    expect(row.subscriptionTier).toBe("pro");
  });

  it("(c) is a no-op when ACTIVE and vendor is already on the correct tier", async () => {
    const vendor = makeVendor({
      subscriptionTier: "starter",
      subscriptionProvider: "paypal",
      paypalSubscriptionId: "I-ALREADY-CORRECT",
    });

    mockPayPalSubscription = {
      id: "I-ALREADY-CORRECT",
      status: "ACTIVE",
      custom_id: JSON.stringify({ upgradeVendorId: "1", upgradeTier: "starter" }),
    };

    const result = await reconcileVendorPayPalSubscription(
      vendor, "test-client-id", "test-secret", "sandbox", "manual-sync",
    );

    expect(result.synced).toBe(true);
    expect(result.currentTier).toBe("starter");
    expect(notificationInserts).toHaveLength(0);
    expect(downgradeApplied).toBe(false);
  });

  it("(d) downgrades vendor when subscription is CANCELLED and vendor is on a paid tier", async () => {
    const vendor = makeVendor({
      subscriptionTier: "pro",
      subscriptionProvider: "paypal",
      paypalSubscriptionId: "I-CANCELLED",
    });

    mockPayPalSubscription = {
      id: "I-CANCELLED",
      status: "CANCELLED",
    };

    const result = await reconcileVendorPayPalSubscription(
      vendor, "test-client-id", "test-secret", "sandbox", "manual-sync",
    );

    expect(result.synced).toBe(true);
    expect(result.currentTier).toBe("free");
    expect(downgradeApplied).toBe(true);
  });

  it("(e) does not change tier when subscription is APPROVAL_PENDING", async () => {
    const vendor = makeVendor({
      subscriptionTier: "free",
      subscriptionProvider: null,
      paypalSubscriptionId: "I-PENDING",
    });

    mockPayPalSubscription = {
      id: "I-PENDING",
      status: "APPROVAL_PENDING",
    };

    const result = await reconcileVendorPayPalSubscription(
      vendor, "test-client-id", "test-secret", "sandbox", "manual-sync",
    );

    expect(result.synced).toBe(false);
    expect(result.currentTier).toBe("free");
    expect(result.reason).toMatch(/APPROVAL_PENDING/);
    expect(notificationInserts).toHaveLength(0);
    expect(downgradeApplied).toBe(false);
  });

  it("returns not-synced when vendor has no paypalSubscriptionId", async () => {
    const vendor = makeVendor({
      paypalSubscriptionId: null,
    });

    const result = await reconcileVendorPayPalSubscription(
      vendor, "test-client-id", "test-secret", "sandbox", "manual-sync",
    );

    expect(result.synced).toBe(false);
    expect(result.reason).toMatch(/No PayPal subscription/);
  });

  it("returns not-synced when custom_id is missing from ACTIVE subscription", async () => {
    const vendor = makeVendor({ subscriptionTier: "free" });

    mockPayPalSubscription = {
      id: "I-TEST123",
      status: "ACTIVE",
      // custom_id intentionally missing
    };

    const result = await reconcileVendorPayPalSubscription(
      vendor, "test-client-id", "test-secret", "sandbox", "manual-sync",
    );

    expect(result.synced).toBe(false);
    expect(result.reason).toMatch(/could not determine the target tier/);
  });

  it("(regression-b) upgrades a former Stripe subscriber who now has an ACTIVE PayPal subscription even though stripeCustomerId is still set", async () => {
    // applyVendorTierDowngrade clears subscriptionProvider but NOT stripeCustomerId.
    // A vendor who was on Stripe, got downgraded (subscriptionProvider=null, stripeCustomerId retained),
    // then started a PayPal checkout should be correctly recovered via PayPal sync.
    const vendor = makeVendor({
      subscriptionTier: "free",
      subscriptionProvider: null,       // cleared by downgrade
      paypalSubscriptionId: "I-NEWPAYPAL",
      // stripeCustomerId persists from legacy Stripe history
    } as unknown as Partial<VendorRow> & { stripeCustomerId: string });

    // Inject stripeCustomerId directly on the in-memory row
    const row = vendorRows.get(1)!;
    (row as Record<string, unknown>).stripeCustomerId = "cus_LEGACY";

    mockPayPalSubscription = {
      id: "I-NEWPAYPAL",
      status: "ACTIVE",
      custom_id: JSON.stringify({ upgradeVendorId: "1", upgradeTier: "starter" }),
    };

    const result = await reconcileVendorPayPalSubscription(
      { ...row, stripeCustomerId: "cus_LEGACY" } as unknown as import("@workspace/db/schema").Vendor,
      "test-client-id",
      "test-secret",
      "sandbox",
      "manual-sync",
    );

    expect(result.synced).toBe(true);
    expect(result.currentTier).toBe("starter");
    expect(notificationInserts).toHaveLength(1);
    expect(notificationInserts[0].previousTier).toBe("free");
    expect(notificationInserts[0].newTier).toBe("starter");
    expect(downgradeApplied).toBe(false);
  });

  it("(regression) does NOT downgrade a Stripe vendor who has a stale paypalSubscriptionId", async () => {
    // A vendor who tried PayPal (subscriptionId written at checkout) but completed
    // payment via Stripe instead. subscriptionProvider="stripe" — the stale PayPal
    // subscription being CANCELLED must never downgrade them.
    const vendor = makeVendor({
      subscriptionTier: "pro",
      subscriptionProvider: "stripe",    // actually managed by Stripe
      paypalSubscriptionId: "I-STALE",   // from an abandoned PayPal checkout attempt
    });

    mockPayPalSubscription = {
      id: "I-STALE",
      status: "CANCELLED",
    };

    const result = await reconcileVendorPayPalSubscription(
      vendor, "test-client-id", "test-secret", "sandbox", "manual-sync",
    );

    // Must NOT downgrade — vendor is managed by Stripe, not PayPal
    expect(result.synced).toBe(false);
    expect(result.currentTier).toBe("pro");
    expect(result.reason).toMatch(/managed by stripe/i);
    expect(downgradeApplied).toBe(false);

    // Vendor must still be on pro tier in DB
    const row = vendorRows.get(1)!;
    expect(row.subscriptionTier).toBe("pro");
  });
});
