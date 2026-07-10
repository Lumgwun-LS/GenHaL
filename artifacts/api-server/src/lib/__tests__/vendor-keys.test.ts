/**
 * Tests for vendor gateway key resolution order:
 *   1. Vendor's own key (if tier-eligible and test-passed)
 *   2. Admin-configured platform key (DB)
 *   3. Legacy env var fallback
 *   4. Clear error if none available
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

let vendorCredsRow: {
  vendorId: number;
  stripeSecretEncrypted: string | null;
  stripeTestPassed: boolean;
  paystackSecretEncrypted: string | null;
  paystackTestPassed: boolean;
} | null = null;

let platformCreds: Record<string, Record<string, string> | null> = {};

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => (vendorCredsRow ? [vendorCredsRow] : []),
        }),
      }),
    }),
  },
  vendorPaymentCredentialsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

vi.mock("../encryption", () => ({
  decrypt: (v: string) => v.replace(/^enc:/, ""),
}));

vi.mock("../platform-gateways", () => ({
  getPlatformCredentials: async (provider: string) => platformCreds[provider] ?? null,
}));

async function importLib() {
  return await import("../vendor-keys");
}

const PRO_VENDOR = { subscriptionTier: "pro", verificationLevel: "unverified" };
const FREE_VENDOR = { subscriptionTier: "free", verificationLevel: "unverified" };

describe("vendor-keys resolution order", () => {
  beforeEach(() => {
    vendorCredsRow = null;
    platformCreds = {};
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.PAYSTACK_SECRET_KEY;
    vi.resetModules();
  });

  it("uses the vendor's own key when eligible and test-passed", async () => {
    vendorCredsRow = {
      vendorId: 1,
      stripeSecretEncrypted: "enc:sk_vendor_own",
      stripeTestPassed: true,
      paystackSecretEncrypted: null,
      paystackTestPassed: false,
    };
    platformCreds.stripe = { secretKey: "sk_admin_platform" };
    process.env.STRIPE_SECRET_KEY = "sk_env_fallback";

    const { resolveStripeKey } = await importLib();
    const key = await resolveStripeKey(1, PRO_VENDOR);
    expect(key).toBe("sk_vendor_own");
  });

  it("falls back to admin-configured key when vendor key is not test-passed", async () => {
    vendorCredsRow = {
      vendorId: 1,
      stripeSecretEncrypted: "enc:sk_vendor_own",
      stripeTestPassed: false,
      paystackSecretEncrypted: null,
      paystackTestPassed: false,
    };
    platformCreds.stripe = { secretKey: "sk_admin_platform" };
    process.env.STRIPE_SECRET_KEY = "sk_env_fallback";

    const { resolveStripeKey } = await importLib();
    const key = await resolveStripeKey(1, PRO_VENDOR);
    expect(key).toBe("sk_admin_platform");
  });

  it("ignores the vendor's own key when the vendor's tier is not eligible", async () => {
    vendorCredsRow = {
      vendorId: 1,
      stripeSecretEncrypted: "enc:sk_vendor_own",
      stripeTestPassed: true,
      paystackSecretEncrypted: null,
      paystackTestPassed: false,
    };
    platformCreds.stripe = { secretKey: "sk_admin_platform" };

    const { resolveStripeKey } = await importLib();
    const key = await resolveStripeKey(1, FREE_VENDOR);
    expect(key).toBe("sk_admin_platform");
  });

  it("falls back to the env var when no vendor or admin key exists", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_env_fallback";

    const { resolveStripeKey } = await importLib();
    const key = await resolveStripeKey(1, PRO_VENDOR);
    expect(key).toBe("sk_env_fallback");
  });

  it("throws a clear error when no key is available anywhere", async () => {
    const { resolveStripeKey } = await importLib();
    await expect(resolveStripeKey(1, PRO_VENDOR)).rejects.toThrow(
      /Stripe is not configured/,
    );
  });

  it("resolves Paystack keys with the same priority order", async () => {
    vendorCredsRow = {
      vendorId: 2,
      stripeSecretEncrypted: null,
      stripeTestPassed: false,
      paystackSecretEncrypted: "enc:sk_paystack_vendor",
      paystackTestPassed: true,
    };
    platformCreds.paystack = { secretKey: "sk_paystack_admin" };
    process.env.PAYSTACK_SECRET_KEY = "sk_paystack_env";

    const { resolvePaystackKey } = await importLib();
    expect(await resolvePaystackKey(2, PRO_VENDOR)).toBe("sk_paystack_vendor");

    vendorCredsRow.paystackTestPassed = false;
    expect(await resolvePaystackKey(2, PRO_VENDOR)).toBe("sk_paystack_admin");

    platformCreds.paystack = null;
    expect(await resolvePaystackKey(2, PRO_VENDOR)).toBe("sk_paystack_env");

    delete process.env.PAYSTACK_SECRET_KEY;
    await expect(resolvePaystackKey(2, PRO_VENDOR)).rejects.toThrow(
      /Paystack is not configured/,
    );
  });
});
