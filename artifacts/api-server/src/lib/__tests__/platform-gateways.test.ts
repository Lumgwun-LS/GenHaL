/**
 * Tests for platform (admin-managed) gateway credential save/list/remove,
 * and that invalid credentials are rejected before being persisted.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mock state ────────────────────────────────────────────────────────

let rows: Array<{
  provider: string;
  credentialsEncrypted: string;
  testPassed: boolean;
  updatedAt: Date;
}> = [];

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => {
        // Support both `await db.select().from(t)` (bare array) and
        // `db.select().from(t).where(...).limit(...)` chains.
        const arr = [...rows] as typeof rows & {
          where: (whereArg: { val: string }) => { limit: () => typeof rows };
        };
        arr.where = (whereArg: { val: string }) => ({
          limit: () => rows.filter((r) => r.provider === whereArg.val),
        });
        return arr;
      },
    }),
    insert: () => ({
      values: (vals: { provider: string; credentialsEncrypted: string; testPassed: boolean }) => {
        rows.push({ ...vals, updatedAt: new Date() });
      },
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: (whereArg: { val: string }) => {
          const idx = rows.findIndex((r) => r.provider === whereArg.val);
          if (idx !== -1) rows[idx] = { ...rows[idx], ...vals } as (typeof rows)[number];
        },
      }),
    }),
    delete: () => ({
      where: (whereArg: { val: string }) => {
        rows = rows.filter((r) => r.provider !== whereArg.val);
      },
    }),
  },
  platformPaymentCredentialsTable: { provider: "provider" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

// Real AES round-trip would need a valid 64-char hex key; simplest to
// substitute a transparent codec so we can assert on stored/decrypted shape.
vi.mock("../encryption", () => ({
  encrypt: (v: string) => `enc:${v}`,
  decrypt: (v: string) => v.replace(/^enc:/, ""),
}));

// Prevent real network calls from provider `test` fns leaking through.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

async function importLib() {
  return await import("../platform-gateways");
}

describe("platform-gateways", () => {
  beforeEach(() => {
    rows = [];
    fetchMock.mockReset();
    vi.resetModules();
  });

  it("rejects saving credentials that are missing required fields", async () => {
    const { savePlatformCredentials } = await importLib();

    await expect(
      savePlatformCredentials("paystack", { secretKey: "" }),
    ).rejects.toThrow(/Missing required field/);

    expect(rows).toHaveLength(0);
  });

  it("rejects saving credentials that fail the live connectivity test", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Invalid key" }),
    });

    const { savePlatformCredentials } = await importLib();

    await expect(
      savePlatformCredentials("paystack", { secretKey: "sk_bad", webhookSecret: "whsec_bad" }),
    ).rejects.toThrow(/Invalid key/);

    // Nothing should be persisted when the test call fails.
    expect(rows).toHaveLength(0);
  });

  it("saves valid credentials after a successful test call", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    const { savePlatformCredentials, getPlatformCredentials, hasPlatformCredentials } = await importLib();

    const result = await savePlatformCredentials("paystack", {
      secretKey: "sk_good",
      webhookSecret: "whsec_good",
    });

    expect(result).toMatchObject({ testPassed: true, liveVerification: true });
    expect(rows).toHaveLength(1);

    const creds = await getPlatformCredentials("paystack");
    expect(creds).toMatchObject({ secretKey: "sk_good", webhookSecret: "whsec_good" });
    expect(await hasPlatformCredentials("paystack")).toBe(true);
  });

  it("updates existing credentials in place instead of duplicating rows", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const { savePlatformCredentials, getPlatformCredentials } = await importLib();

    await savePlatformCredentials("paystack", { secretKey: "sk_1", webhookSecret: "whsec_1" });
    await savePlatformCredentials("paystack", { secretKey: "sk_2", webhookSecret: "whsec_2" });

    expect(rows).toHaveLength(1);
    const creds = await getPlatformCredentials("paystack");
    expect(creds).toMatchObject({ secretKey: "sk_2" });
  });

  it("validates format-only providers (Remita) without a network call", async () => {
    const { savePlatformCredentials } = await importLib();

    await expect(
      savePlatformCredentials("remita", { merchantId: "m1", apiKey: "", apiToken: "t1", serviceTypeId: "s1" }),
    ).rejects.toThrow(/Missing required field/);

    const result = await savePlatformCredentials("remita", {
      merchantId: "m1",
      apiKey: "k1",
      apiToken: "t1",
      serviceTypeId: "s1",
    });
    expect(result).toMatchObject({ testPassed: true, liveVerification: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown provider", async () => {
    const { savePlatformCredentials } = await importLib();
    await expect(savePlatformCredentials("unknownpay", { secretKey: "x" })).rejects.toThrow(
      /Unknown gateway provider/,
    );
  });

  it("removes stored credentials entirely", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const { savePlatformCredentials, removePlatformCredentials, getPlatformCredentials } = await importLib();

    await savePlatformCredentials("paystack", { secretKey: "sk_1", webhookSecret: "whsec_1" });
    expect(rows).toHaveLength(1);

    await removePlatformCredentials("paystack");
    expect(rows).toHaveLength(0);
    expect(await getPlatformCredentials("paystack")).toBeNull();
  });

  it("lists masked status for every provider, unconfigured providers included", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const { savePlatformCredentials, listPlatformGatewayStatus } = await importLib();

    await savePlatformCredentials("paystack", { secretKey: "sk_livekey1234", webhookSecret: "whsec_1" });

    const statuses = await listPlatformGatewayStatus();
    expect(statuses).toHaveLength(5);

    const paystack = statuses.find((s) => s.provider === "paystack")!;
    expect(paystack.configured).toBe(true);
    expect(paystack.testPassed).toBe(true);
    // Secret fields must be masked, never returned in full.
    expect(paystack.maskedValues.secretKey).toBe("...1234");
    expect(paystack.maskedValues.secretKey).not.toContain("sk_livekey1234");

    const stripe = statuses.find((s) => s.provider === "stripe")!;
    expect(stripe.configured).toBe(false);
    expect(stripe.maskedValues.secretKey).toBeNull();
  });

  it("testPlatformCredentials validates without persisting", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const { testPlatformCredentials } = await importLib();

    const result = await testPlatformCredentials("paystack", {
      secretKey: "sk_x",
      webhookSecret: "whsec_x",
    });
    expect(result).toMatchObject({ liveVerification: true });
    expect(rows).toHaveLength(0);
  });
});
