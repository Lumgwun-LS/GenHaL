/**
 * Unit tests for tick() (token-refresh-scheduler.ts).
 *
 * Covers the two resilience properties that matter for a scheduler that
 * iterates many accounts in a single tick:
 *
 *   1. Per-account isolation — an unexpected (non-ReconnectRequiredError) error
 *      thrown by ensureFreshAccessToken for one account must not abort the
 *      loop; remaining accounts in the same tick must still be processed.
 *
 *   2. Outer-query failure — when the db.select() that fetches all renewable
 *      accounts throws (e.g. DB temporarily unreachable), recordJobRun is
 *      always called with success: false so the admin panel shows a failing
 *      banner instead of a silent gap.
 *
 * Both tests treat the DB as a seam: the mock controls what the select
 * returns or whether it throws.  The filtering WHERE clause is the DB layer's
 * responsibility and is not exercised here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared spy / stub state
// ---------------------------------------------------------------------------

/** Accounts the mock DB select returns. */
let queryResult: unknown[] = [];

/** When true the DB select throws instead of resolving. */
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
      set: () => ({ where: () => Promise.resolve([]) }),
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

// ReconnectRequiredError is a named class — expose it from the mock so tick()
// can do `err instanceof ReconnectRequiredError` correctly.
class ReconnectRequiredError extends Error {
  constructor(msg?: string) {
    super(msg ?? "reconnect required");
    this.name = "ReconnectRequiredError";
  }
}

const ensureFreshAccessToken = vi.fn().mockResolvedValue(undefined);
const notifyVendorExpiringSoon = vi.fn().mockResolvedValue(undefined);

vi.mock("../token-refresh", () => ({
  ensureFreshAccessToken,
  notifyVendorExpiringSoon,
  ReconnectRequiredError,
}));

const recordJobRun = vi.fn().mockResolvedValue(undefined);
vi.mock("../job-run-status", () => ({ recordJobRun }));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    vendorId: 10,
    platform: "Twitter",
    accountName: "Acme Corp",
    status: "active",
    connectedVia: "oauth_twitter",
    refreshTokenEncrypted: "enc:abc",
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour ahead
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("tick — token-refresh-scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryResult = [];
    dbSelectShouldThrow = false;
    ensureFreshAccessToken.mockResolvedValue(undefined);
  });

  it("continues processing remaining accounts when one ensureFreshAccessToken throws an unexpected error", async () => {
    const account1 = makeAccount({ id: 1, accountName: "First" });
    const account2 = makeAccount({ id: 2, accountName: "Second" });
    const account3 = makeAccount({ id: 3, accountName: "Third" });
    queryResult = [account1, account2, account3];

    // Middle account throws an unexpected (non-ReconnectRequired) error.
    ensureFreshAccessToken
      .mockResolvedValueOnce(undefined)                       // account1 → ok
      .mockRejectedValueOnce(new Error("network timeout"))   // account2 → unexpected
      .mockResolvedValueOnce(undefined);                     // account3 → ok

    const { tick } = await import("../token-refresh-scheduler");
    await tick();

    // All three accounts were attempted.
    expect(ensureFreshAccessToken).toHaveBeenCalledTimes(3);
    expect(ensureFreshAccessToken).toHaveBeenCalledWith(account1);
    expect(ensureFreshAccessToken).toHaveBeenCalledWith(account2);
    expect(ensureFreshAccessToken).toHaveBeenCalledWith(account3);

    // Job recorded as success=true (loop completed); failed count reflects the one error.
    expect(recordJobRun).toHaveBeenCalledTimes(1);
    expect(recordJobRun).toHaveBeenCalledWith(
      "social-token-refresh",
      expect.objectContaining({ success: true, checkedCount: 3, affectedCount: 1 }),
    );
  });

  it("continues processing remaining accounts when one ensureFreshAccessToken throws ReconnectRequiredError", async () => {
    const account1 = makeAccount({ id: 1 });
    const account2 = makeAccount({ id: 2 });
    queryResult = [account1, account2];

    ensureFreshAccessToken
      .mockRejectedValueOnce(new ReconnectRequiredError())  // account1 → reconnect
      .mockResolvedValueOnce(undefined);                   // account2 → ok

    const { tick } = await import("../token-refresh-scheduler");
    await tick();

    // Both accounts were attempted despite the first throwing.
    expect(ensureFreshAccessToken).toHaveBeenCalledTimes(2);

    // The ReconnectRequiredError counts as a failure in the affectedCount.
    expect(recordJobRun).toHaveBeenCalledWith(
      "social-token-refresh",
      expect.objectContaining({ success: true, checkedCount: 2, affectedCount: 1 }),
    );
  });

  it("calls recordJobRun with success: false when the outer db.select throws", async () => {
    dbSelectShouldThrow = true;

    const { tick } = await import("../token-refresh-scheduler");
    await tick();

    // No accounts were attempted — the select itself failed.
    expect(ensureFreshAccessToken).not.toHaveBeenCalled();

    // recordJobRun must still be called so the admin panel shows the failure.
    expect(recordJobRun).toHaveBeenCalledTimes(1);
    expect(recordJobRun).toHaveBeenCalledWith(
      "social-token-refresh",
      expect.objectContaining({ success: false, error: expect.stringContaining("DB unavailable") }),
    );
  });

  it("records success: true with zero counts when no renewable accounts exist", async () => {
    queryResult = [];

    const { tick } = await import("../token-refresh-scheduler");
    await tick();

    expect(ensureFreshAccessToken).not.toHaveBeenCalled();
    expect(recordJobRun).toHaveBeenCalledWith(
      "social-token-refresh",
      expect.objectContaining({ success: true, checkedCount: 0, affectedCount: 0 }),
    );
  });
});
