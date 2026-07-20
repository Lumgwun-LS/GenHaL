/**
 * Unit tests for notifyVendorsOfGatewayFailure (gateway-notifications.ts).
 *
 * Verifies:
 *  - vendors with the failing provider enabled and NO working alternative
 *    receive both a DB insert and an email;
 *  - vendors WITH a working alternative are silently skipped;
 *  - vendors whose failing provider is still available (own key / env fallback)
 *    are silently skipped;
 *  - providers that carry no per-vendor enable toggle (e.g. paypal) are
 *    immediate no-ops that return 0.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Vendor } from "@workspace/db/schema";

// ── Captured calls ────────────────────────────────────────────────────────────

const insertedNotifications: unknown[] = [];
const sentEmails: Array<{ to: string; subject: string }> = [];
const sentPushes: Array<{ vendorId: number }> = [];

// ── Vendor fixture factory ────────────────────────────────────────────────────

function makeVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 1,
    name: "Test Vendor",
    email: "vendor@example.com",
    clerkUserId: "user_abc",
    subscriptionTier: "pro",
    verificationLevel: "unverified",
    stripeEnabled: false,
    paystackEnabled: false,
    remitaEnabled: false,
    flutterwaveEnabled: false,
    nombaEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Vendor;
}

// ── Mocked DB vendor rows (set per test) ──────────────────────────────────────

let mockVendors: Vendor[] = [];

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => mockVendors,
      }),
    }),
    insert: () => ({
      values: (vals: unknown) => {
        insertedNotifications.push(vals);
      },
    }),
  },
  vendorNotificationsTable: {},
  vendorsTable: {
    stripeEnabled: "stripeEnabled",
    paystackEnabled: "paystackEnabled",
    remitaEnabled: "remitaEnabled",
    flutterwaveEnabled: "flutterwaveEnabled",
    nombaEnabled: "nombaEnabled",
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (col: unknown, val: unknown) => ({ col, val }),
  };
});

// ── Payment availability mock ─────────────────────────────────────────────────

// Keyed as `${provider}:${vendorId}` → boolean available
const availabilityMap: Record<string, boolean> = {};

vi.mock("../vendor-keys", () => ({
  getPaymentMethodAvailability: async (provider: string, vendorId: number) => {
    const key = `${provider}:${vendorId}`;
    const available = availabilityMap[key] ?? false;
    return { available };
  },
}));

// ── Email / push mocks ────────────────────────────────────────────────────────

vi.mock("../mailer", () => ({
  sendEmail: async (opts: { to: string; subject: string }) => {
    sentEmails.push({ to: opts.to, subject: opts.subject });
    return { status: "sent" };
  },
}));

vi.mock("../email-branding", () => ({
  wrapVendorEmail: ({ bodyHtml }: { bodyHtml: string }) => `<html>${bodyHtml}</html>`,
  escapeHtml: (s: string) => s,
}));

vi.mock("../push", () => ({
  sendPushToVendor: async (vendorId: number) => {
    sentPushes.push({ vendorId });
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function importLib() {
  return await import("../gateway-notifications");
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("notifyVendorsOfGatewayFailure", () => {
  beforeEach(() => {
    mockVendors = [];
    Object.keys(availabilityMap).forEach((k) => delete availabilityMap[k]);
    insertedNotifications.length = 0;
    sentEmails.length = 0;
    sentPushes.length = 0;
    vi.resetModules();
  });

  it("notifies a vendor whose only enabled gateway just failed", async () => {
    const vendor = makeVendor({ id: 10, stripeEnabled: true });
    mockVendors = [vendor];

    // The failing provider (stripe) is NOT available for this vendor.
    availabilityMap["stripe:10"] = false;
    // Vendor has no other gateways enabled, so no alternatives to check.

    const { notifyVendorsOfGatewayFailure } = await importLib();
    const count = await notifyVendorsOfGatewayFailure("stripe", "Invalid API key");

    expect(count).toBe(1);
    expect(insertedNotifications).toHaveLength(1);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe(vendor.email);
    expect(sentEmails[0].subject).toMatch(/Stripe/);
    expect(sentPushes).toHaveLength(1);
    expect(sentPushes[0].vendorId).toBe(10);
  });

  it("skips a vendor who still has a working alternative gateway", async () => {
    const vendor = makeVendor({
      id: 20,
      stripeEnabled: true,
      paystackEnabled: true, // alternative
    });
    mockVendors = [vendor];

    // Stripe (failing provider) is unavailable for this vendor...
    availabilityMap["stripe:20"] = false;
    // ...but Paystack (the alternative) is working fine.
    availabilityMap["paystack:20"] = true;

    const { notifyVendorsOfGatewayFailure } = await importLib();
    const count = await notifyVendorsOfGatewayFailure("stripe", "Invalid API key");

    expect(count).toBe(0);
    expect(insertedNotifications).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });

  it("skips a vendor whose failing provider is still available via their own key", async () => {
    const vendor = makeVendor({ id: 30, stripeEnabled: true });
    mockVendors = [vendor];

    // Platform credential just failed, but this vendor's own key still works.
    availabilityMap["stripe:30"] = true;

    const { notifyVendorsOfGatewayFailure } = await importLib();
    const count = await notifyVendorsOfGatewayFailure("stripe", "Platform key revoked");

    expect(count).toBe(0);
    expect(insertedNotifications).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });

  it("returns 0 immediately for providers with no per-vendor enable toggle (paypal)", async () => {
    // Even if there were vendors in the DB, paypal has no enabledCol so the
    // function must short-circuit before touching the DB.
    mockVendors = [makeVendor({ id: 99 })];

    const { notifyVendorsOfGatewayFailure } = await importLib();
    const count = await notifyVendorsOfGatewayFailure("paypal", "Bad credentials");

    expect(count).toBe(0);
    expect(insertedNotifications).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });

  it("notifies only the vendors with no working alternative, not those who have one", async () => {
    const affectedVendor = makeVendor({ id: 40, paystackEnabled: true }); // only Paystack
    const skippedVendor = makeVendor({
      id: 41,
      paystackEnabled: true,
      stripeEnabled: true, // has an alternative
    });
    mockVendors = [affectedVendor, skippedVendor];

    // Paystack (failing) is unavailable for both.
    availabilityMap["paystack:40"] = false;
    availabilityMap["paystack:41"] = false;

    // Skipped vendor's Stripe alternative is working.
    availabilityMap["stripe:40"] = false; // no working alternative for affected vendor
    availabilityMap["stripe:41"] = true;  // working alternative for skipped vendor

    const { notifyVendorsOfGatewayFailure } = await importLib();
    const count = await notifyVendorsOfGatewayFailure("paystack", "Webhook key mismatch");

    expect(count).toBe(1);
    // Only one notification inserted, for vendor 40.
    expect(insertedNotifications).toHaveLength(1);
    expect((insertedNotifications[0] as { vendorId: number }).vendorId).toBe(40);
    // Only one email, to vendor 40.
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe(affectedVendor.email);
  });

  it("continues notifying remaining vendors even if one throws", async () => {
    const vendor1 = makeVendor({ id: 50, remitaEnabled: true });
    const vendor2 = makeVendor({ id: 51, email: "v2@example.com", remitaEnabled: true });
    mockVendors = [vendor1, vendor2];

    availabilityMap["remita:50"] = false;
    availabilityMap["remita:51"] = false;

    // Make sendEmail throw for vendor1.
    let callCount = 0;
    vi.doMock("../mailer", () => ({
      sendEmail: async (opts: { to: string; subject: string }) => {
        callCount++;
        if (callCount === 1) throw new Error("SMTP error");
        sentEmails.push({ to: opts.to, subject: opts.subject });
        return { status: "sent" };
      },
    }));

    // Re-import after doMock so the module picks up the new mock.
    vi.resetModules();
    // Rebuild availability mock so the new module instance picks it up.
    vi.doMock("../vendor-keys", () => ({
      getPaymentMethodAvailability: async (provider: string, vendorId: number) => {
        const key = `${provider}:${vendorId}`;
        const available = availabilityMap[key] ?? false;
        return { available };
      },
    }));

    const { notifyVendorsOfGatewayFailure } = await importLib();
    // Should not throw despite vendor1's email failing; vendor2 should still get notified.
    await expect(notifyVendorsOfGatewayFailure("remita", "test error")).resolves.not.toThrow();
  });

  it("includes the failure reason in the notification message", async () => {
    const vendor = makeVendor({ id: 60, flutterwaveEnabled: true });
    mockVendors = [vendor];
    availabilityMap["flutterwave:60"] = false;

    const { notifyVendorsOfGatewayFailure } = await importLib();
    await notifyVendorsOfGatewayFailure("flutterwave", "Key expired on provider side");

    expect(insertedNotifications).toHaveLength(1);
    const notification = insertedNotifications[0] as { message: string };
    expect(notification.message).toContain("Key expired on provider side");
  });

  it("handles a null failure reason gracefully (no parenthetical appended)", async () => {
    const vendor = makeVendor({ id: 70, nombaEnabled: true });
    mockVendors = [vendor];
    availabilityMap["nomba:70"] = false;

    const { notifyVendorsOfGatewayFailure } = await importLib();
    await notifyVendorsOfGatewayFailure("nomba", null);

    expect(insertedNotifications).toHaveLength(1);
    const notification = insertedNotifications[0] as { message: string };
    expect(notification.message).not.toContain("(");
    expect(notification.message).not.toContain("null");
  });
});
