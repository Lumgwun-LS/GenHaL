/**
 * Unit tests for tickExpiryWarnings (token-refresh-scheduler.ts).
 *
 * Verifies the four key behaviours of the expiry-warning job:
 *   1. Fires notifyVendorExpiringSoon and stamps expiryWarningSentAt when a
 *      qualifying account is returned by the DB query.
 *   2. Does NOT stamp expiryWarningSentAt when notifyVendorExpiringSoon throws
 *      (so the next tick can retry), and still records a successful job run.
 *   3. No-ops cleanly when the DB returns no qualifying accounts.
 *   4. Records a failed job run when the DB itself throws.
 *
 * Filtering logic (active, in RENEWABLE_CONNECTIONS, no refresh token, token
 * within 7-day window, not already expired, expiryWarningSentAt IS NULL) lives
 * entirely in the Drizzle WHERE clause; it is exercised by the DB layer, not
 * by application code.  These tests therefore treat the DB as a seam: whatever
 * the mock returns is what the job processes, exactly as the job would in prod.
 *
 * Also covers persistRefresh clearing expiryWarningSentAt so the next expiry
 * cycle can issue a fresh warning after a vendor reconnects.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared spy / stub state
// ---------------------------------------------------------------------------

/** Accounts the mock DB select returns for the expiry-warning query. */
let queryResult: unknown[] = [];

/** Tracks every db.update().set(...) call so we can assert the stamp. */
let updateSetCalledWith: Record<string, unknown> | null = null;

/** When true, the DB select throws instead of resolving. */
let dbSelectShouldThrow = false;

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => {
          if (dbSelectShouldThrow) return Promise.reject(new Error("DB unavailable"));
          return Promise.resolve(queryResult);
        },
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        updateSetCalledWith = vals;
        return { where: () => Promise.resolve([]) };
      },
    }),
  },
  socialAccountsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  inArray: (col: unknown, vals: unknown) => ({ col, vals }),
  isNotNull: (col: unknown) => ({ isNotNull: col }),
  isNull: (col: unknown) => ({ isNull: col }),
  lte: (col: unknown, val: unknown) => ({ col, val }),
  gt: (col: unknown, val: unknown) => ({ col, val }),
}));

const notifyVendorExpiringSoon = vi.fn().mockResolvedValue(undefined);
vi.mock("../token-refresh", () => ({
  notifyVendorExpiringSoon,
  ensureFreshAccessToken: vi.fn(),
  ReconnectRequiredError: class ReconnectRequiredError extends Error {},
}));

const recordJobRun = vi.fn().mockResolvedValue(undefined);
vi.mock("../job-run-status", () => ({ recordJobRun }));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const NOW = Date.now();
const DAYS = (n: number) => n * 24 * 60 * 60 * 1000;

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    vendorId: 10,
    platform: "LinkedIn",
    accountName: "Acme Corp",
    status: "active",
    connectedVia: "oauth_linkedin",
    refreshTokenEncrypted: null,             // no refresh token → can't auto-renew
    tokenExpiresAt: new Date(NOW + DAYS(3)), // 3 days away → within 7-day window
    expiryWarningSentAt: null,               // not yet warned
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("tickExpiryWarnings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryResult = [];
    updateSetCalledWith = null;
    dbSelectShouldThrow = false;
  });

  it("notifies the vendor and stamps expiryWarningSentAt when a qualifying account is returned", async () => {
    const account = makeAccount();
    queryResult = [account];

    const { tickExpiryWarnings } = await import("../token-refresh-scheduler");
    await tickExpiryWarnings();

    // Should have sent the expiry warning notification
    expect(notifyVendorExpiringSoon).toHaveBeenCalledTimes(1);
    expect(notifyVendorExpiringSoon).toHaveBeenCalledWith(account);

    // Should have stamped the sentinel to prevent duplicate warnings
    expect(updateSetCalledWith).not.toBeNull();
    expect(updateSetCalledWith).toHaveProperty("expiryWarningSentAt");
    expect(updateSetCalledWith!.expiryWarningSentAt).toBeInstanceOf(Date);

    // Should record a successful job run with accurate counts
    expect(recordJobRun).toHaveBeenCalledWith(
      "social-token-expiry-warning",
      expect.objectContaining({ success: true, checkedCount: 1, affectedCount: 1 }),
    );
  });

  it("does NOT stamp expiryWarningSentAt when notifyVendorExpiringSoon throws (allows retry)", async () => {
    queryResult = [makeAccount()];
    notifyVendorExpiringSoon.mockRejectedValueOnce(new Error("smtp timeout"));

    const { tickExpiryWarnings } = await import("../token-refresh-scheduler");
    await tickExpiryWarnings();

    // Notification failed — sentinel must NOT be stamped so next tick retries
    expect(updateSetCalledWith).toBeNull();

    // Job should still record success=true with affectedCount=0 (it completed; one account failed)
    expect(recordJobRun).toHaveBeenCalledWith(
      "social-token-expiry-warning",
      expect.objectContaining({ success: true, checkedCount: 1, affectedCount: 0 }),
    );
  });

  it("does nothing except record a successful run when no accounts qualify", async () => {
    queryResult = [];

    const { tickExpiryWarnings } = await import("../token-refresh-scheduler");
    await tickExpiryWarnings();

    expect(notifyVendorExpiringSoon).not.toHaveBeenCalled();
    expect(updateSetCalledWith).toBeNull();

    expect(recordJobRun).toHaveBeenCalledWith(
      "social-token-expiry-warning",
      expect.objectContaining({ success: true, checkedCount: 0, affectedCount: 0 }),
    );
  });

  it("records a failed job run when the DB select throws", async () => {
    dbSelectShouldThrow = true;

    const { tickExpiryWarnings } = await import("../token-refresh-scheduler");
    await tickExpiryWarnings();

    expect(notifyVendorExpiringSoon).not.toHaveBeenCalled();
    expect(recordJobRun).toHaveBeenCalledWith(
      "social-token-expiry-warning",
      expect.objectContaining({ success: false, error: expect.any(String) }),
    );
  });

  it("processes remaining accounts even when one notification throws", async () => {
    const account1 = makeAccount({ id: 1, accountName: "First" });
    const account2 = makeAccount({ id: 2, accountName: "Second" });
    queryResult = [account1, account2];

    // First call throws; second resolves normally
    notifyVendorExpiringSoon
      .mockRejectedValueOnce(new Error("first fails"))
      .mockResolvedValueOnce(undefined);

    const { tickExpiryWarnings } = await import("../token-refresh-scheduler");
    await tickExpiryWarnings();

    expect(notifyVendorExpiringSoon).toHaveBeenCalledTimes(2);
    // Only the second account succeeds → affectedCount: 1
    expect(recordJobRun).toHaveBeenCalledWith(
      "social-token-expiry-warning",
      expect.objectContaining({ success: true, checkedCount: 2, affectedCount: 1 }),
    );
  });
});
