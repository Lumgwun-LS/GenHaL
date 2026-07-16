/**
 * Tests for PATCH /vendors/:id/tier
 *
 * Verifies that:
 * 1. A successful tier change updates the vendor AND writes an audit row atomically
 * 2. If the audit insert fails the vendor update is also rolled back (no partial commit)
 * 3. A no-op change (same value) does not create an audit row
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mock state ────────────────────────────────────────────────────────

// Track what the "transaction" committed
const committed: Array<{ vendorUpdate: Record<string, unknown>; auditRows: unknown[]; notificationRows: unknown[] }> = [];

// Controls whether the audit insert throws on the next call
let failNextAuditInsert = false;

// The mock vendor returned from the transaction select
const MOCK_VENDOR = {
  id: 1,
  name: "Acme",
  subscriptionTier: "free",
  verificationLevel: "unverified",
  stripeEnabled: false,
  paystackEnabled: false,
  clerkUserId: "user_vendor",
  status: "active",
  industry: "tech",
  email: "acme@example.com",
  phone: null,
  website: null,
  address: null,
  logoUrl: null,
  description: null,
  awajimaaUserId: null,
  awajimaaUserType: null,
  externalSource: "vendorhub",
  defaultCurrency: "USD",
  dateOfBirth: null,
  voiceCallOptOut: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Mock @workspace/db ────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const buildTx = (vendorOverrides: Record<string, unknown> = {}) => {
    const capturedUpdate: Record<string, unknown> = {};
    const capturedAuditRows: unknown[] = [];
    const capturedNotificationRows: unknown[] = [];

    return {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{ ...MOCK_VENDOR, ...vendorOverrides }],
          }),
        }),
      }),
      update: () => ({
        set: (vals: Record<string, unknown>) => {
          Object.assign(capturedUpdate, vals);
          return {
            where: () => ({
              returning: () => [{ ...MOCK_VENDOR, ...vendorOverrides, ...vals }],
            }),
          };
        },
      }),
      // `table` distinguishes adminAuditLogTable rows (shape: { field, oldValue, newValue })
      // from vendorNotificationsTable rows (shape: { type, message }) — both are inserted
      // in the same transaction by the route under test.
      insert: () => ({
        values: async (rows: unknown) => {
          if (failNextAuditInsert) {
            failNextAuditInsert = false;
            throw new Error("Simulated audit insert failure");
          }
          const list = Array.isArray(rows) ? rows : [rows];
          const isNotificationRow = (r: unknown) => !!r && typeof r === "object" && "type" in r;
          if (list.every(isNotificationRow)) {
            capturedNotificationRows.push(...list);
          } else {
            capturedAuditRows.push(...list);
          }
        },
      }),
      _capturedUpdate: capturedUpdate,
      _capturedAuditRows: capturedAuditRows,
      _capturedNotificationRows: capturedNotificationRows,
    };
  };

  return {
    db: {
      transaction: async (fn: (tx: ReturnType<typeof buildTx>) => Promise<unknown>) => {
        // Each transaction gets a fresh builder
        const tx = buildTx();
        try {
          const result = await fn(tx);
          // Only "commit" on success
          committed.push({
            vendorUpdate: tx._capturedUpdate,
            auditRows: tx._capturedAuditRows,
            notificationRows: tx._capturedNotificationRows,
          });
          return result;
        } catch (err) {
          // Rolled back — do NOT push to committed
          throw err;
        }
      },
    },
  };
});

// ── Mock @workspace/db/schema ────────────────────────────────────────────────

vi.mock("@workspace/db/schema", () => ({
  vendorsTable: { id: "id" },
  vendorPaymentCredentialsTable: {},
  adminAuditLogTable: {},
  vendorNotificationsTable: {},
}));

// ── Mock drizzle-orm helpers ─────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  desc: (col: unknown) => ({ desc: col }),
}));

// ── Mock Clerk so getAuth returns a fixed admin userId ────────────────────────

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: "user_admin" }),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ── Mock env: user_admin is an admin ─────────────────────────────────────────

process.env.ADMIN_USER_IDS = "user_admin";

// ── Mock local dependencies ───────────────────────────────────────────────────

vi.mock("../../../lib/encryption", () => ({
  encrypt: (v: string) => `enc:${v}`,
  maskEncryptedKey: () => "***",
}));

vi.mock("../../../lib/vendor-keys", () => ({
  canAddPaymentKeys: () => false,
}));

// ── Minimal Express test helper ───────────────────────────────────────────────

import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

async function callRoute(
  method: string,
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  // Lazy-import the router after all mocks are registered
  const { default: router } = await import("../vendor-payment-credentials");

  const app = express();
  app.use(express.json());
  app.use(router);
  // Minimal error handler so thrown/rejected errors surface as 500 JSON,
  // mirroring how the real app.ts error middleware behaves.
  app.use((err: unknown, _req: Request, res: Response, _next: (e?: unknown) => void) => {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  });

  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      fetch(`http://localhost:${addr.port}${path}`, {
        method,
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PATCH /vendors/:id/tier", () => {
  beforeEach(() => {
    committed.length = 0;
    failNextAuditInsert = false;
  });

  it("updates tier and writes an audit row in the same transaction", async () => {
    const { status, body } = await callRoute("PATCH", "/vendors/1/tier", {
      subscriptionTier: "pro",
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ id: 1, subscriptionTier: "pro" });

    expect(committed).toHaveLength(1);
    const [commit] = committed;
    expect(commit.auditRows).toHaveLength(1);
    expect(commit.auditRows[0]).toMatchObject({
      adminUserId: "user_admin",
      vendorId: 1,
      field: "subscriptionTier",
      oldValue: "free",
      newValue: "pro",
    });
  });

  it("rolls back the vendor update when the audit insert fails", async () => {
    failNextAuditInsert = true;

    const { status } = await callRoute("PATCH", "/vendors/1/tier", {
      subscriptionTier: "enterprise",
    });

    // The route should propagate the error as a 500
    expect(status).toBe(500);
    // Nothing committed — transaction rolled back
    expect(committed).toHaveLength(0);
  });

  it("does not write an audit row when the value did not change", async () => {
    // MOCK_VENDOR already has subscriptionTier = "free"
    const { status } = await callRoute("PATCH", "/vendors/1/tier", {
      subscriptionTier: "free",
    });

    expect(status).toBe(200);
    expect(committed).toHaveLength(1);
    // No change → no audit row
    expect(committed[0].auditRows).toHaveLength(0);
  });

  // ── Notification-type correctness tests ──────────────────────────────────

  it("inserts a verification_change notification (not tier_change) when only verificationLevel changes", async () => {
    // MOCK_VENDOR has verificationLevel = "unverified"
    const { status, body } = await callRoute("PATCH", "/vendors/1/tier", {
      verificationLevel: "basic",
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ id: 1 });

    expect(committed).toHaveLength(1);
    const [commit] = committed;

    // Exactly one notification row, typed correctly
    expect(commit.notificationRows).toHaveLength(1);
    expect(commit.notificationRows[0]).toMatchObject({
      vendorId: 1,
      type: "verification_change",
    });
    // Must NOT carry tier-change fields
    expect((commit.notificationRows[0] as Record<string, unknown>).previousTier).toBeUndefined();
    expect((commit.notificationRows[0] as Record<string, unknown>).newTier).toBeUndefined();
    // No tier_change notification at all
    const tierChangeRows = commit.notificationRows.filter(
      (r: unknown) => (r as Record<string, unknown>).type === "tier_change",
    );
    expect(tierChangeRows).toHaveLength(0);
  });

  it("inserts a tier_change notification with previousTier/newTier when only subscriptionTier changes", async () => {
    // MOCK_VENDOR has subscriptionTier = "free"
    const { status } = await callRoute("PATCH", "/vendors/1/tier", {
      subscriptionTier: "pro",
    });

    expect(status).toBe(200);
    expect(committed).toHaveLength(1);
    const [commit] = committed;

    expect(commit.notificationRows).toHaveLength(1);
    expect(commit.notificationRows[0]).toMatchObject({
      vendorId: 1,
      type: "tier_change",
      previousTier: "free",
      newTier: "pro",
    });
    // Must NOT be a verification_change
    expect((commit.notificationRows[0] as Record<string, unknown>).type).not.toBe("verification_change");
  });

  it("inserts one tier_change and one verification_change notification when both fields change", async () => {
    // MOCK_VENDOR has subscriptionTier = "free" and verificationLevel = "unverified"
    const { status } = await callRoute("PATCH", "/vendors/1/tier", {
      subscriptionTier: "starter",
      verificationLevel: "verified",
    });

    expect(status).toBe(200);
    expect(committed).toHaveLength(1);
    const [commit] = committed;

    expect(commit.notificationRows).toHaveLength(2);

    const tierRow = commit.notificationRows.find(
      (r: unknown) => (r as Record<string, unknown>).type === "tier_change",
    ) as Record<string, unknown> | undefined;
    const verRow = commit.notificationRows.find(
      (r: unknown) => (r as Record<string, unknown>).type === "verification_change",
    ) as Record<string, unknown> | undefined;

    expect(tierRow).toBeDefined();
    expect(tierRow).toMatchObject({ vendorId: 1, type: "tier_change", previousTier: "free", newTier: "starter" });

    expect(verRow).toBeDefined();
    expect(verRow).toMatchObject({ vendorId: 1, type: "verification_change" });
    expect(verRow!.previousTier).toBeUndefined();
    expect(verRow!.newTier).toBeUndefined();
  });
});
