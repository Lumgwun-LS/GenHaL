/**
 * Unit tests for ensureFreshAccessToken — the silent OAuth token renewal
 * path used by the scheduled proactive refresher and by publishToPlatform's
 * auth-error retry. Covers all four key outcomes:
 *   1. Token far from expiry → no-op, returns stored token
 *   2. Token near expiry + working refresh → persists new token/expiry, returns new token
 *   3. Token near expiry + no stored refresh credential → flips to needs_reconnect + notifies vendor
 *   4. Refresh call failure → same reconnect outcome
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.PAYMENT_CREDS_ENCRYPTION_KEY = "0".repeat(64);

// ---------------------------------------------------------------------------
// DB mock — chainable select/insert/update stubs; select result is overridden
// per test to exercise the vendor-lookup used by notifyVendorToReconnect.
// ---------------------------------------------------------------------------
let selectResult: unknown[] = [];
let updateSetCalledWith: Record<string, unknown> | null = null;
let insertValuesCalledWith: unknown = null;

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => selectResult,
      }),
    }),
    insert: () => ({
      values: (rows: unknown) => {
        insertValuesCalledWith = rows;
        return { returning: async () => [] };
      },
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        updateSetCalledWith = vals;
        return {
          where: () => Promise.resolve([]),
        };
      },
    }),
  },
  socialAccountsTable: {},
  vendorsTable: {},
  vendorNotificationsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  isNotNull: (col: unknown) => ({ isNotNull: col }),
}));

// ---------------------------------------------------------------------------
// Platform refresh call mocks — each is a spy whose behaviour is overridden
// per test (e.g. resolves fresh tokens or rejects with an error).
// ---------------------------------------------------------------------------
const refreshTwitterAccessToken = vi.fn();
const refreshLinkedInAccessToken = vi.fn();
const refreshLongLivedUserToken = vi.fn();
const listManagedPages = vi.fn();

vi.mock("../twitter", () => ({ refreshTwitterAccessToken }));
vi.mock("../linkedin", () => ({ refreshLinkedInAccessToken }));
vi.mock("../meta", () => ({ refreshLongLivedUserToken, listManagedPages }));

vi.mock("../encryption", () => ({
  encrypt: (v: string) => `enc:${v}`,
  decrypt: (v: string) => v.replace(/^enc:/, ""),
}));

const sendSlackAlert = vi.fn().mockResolvedValue(undefined);
vi.mock("../slack", () => ({ sendSlackAlert }));

const sendEmail = vi.fn().mockResolvedValue({ status: "sent" });
vi.mock("../mailer", () => ({ sendEmail }));

vi.mock("../email-branding", () => ({
  wrapVendorEmail: ({ bodyHtml }: { bodyHtml: string }) => `<html>${bodyHtml}</html>`,
  escapeHtml: (s: string) => s,
}));

vi.mock("../logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const NOW = Date.now();
const REFRESH_MARGIN_MS = 15 * 60 * 1000;

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    vendorId: 10,
    platform: "X (Twitter)",
    accountName: "@acme",
    accountId: "twitter-123",
    status: "active",
    connectedVia: "oauth_twitter",
    accessTokenEncrypted: "enc:old-access-token",
    refreshTokenEncrypted: "enc:old-refresh-token",
    // Default: far from expiry (1 hour away — no refresh needed)
    tokenExpiresAt: new Date(NOW + 60 * 60 * 1000),
    healthCheckFailingSince: null,
    lastHealthCheckAt: null,
    lastHealthCheckError: null,
    expiryWarningSentAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("ensureFreshAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResult = [{ name: "Acme Vendor", email: "vendor@acme.example" }];
    updateSetCalledWith = null;
    insertValuesCalledWith = null;
  });

  it("returns the stored decrypted token when it is far from expiry (no-op path)", async () => {
    const { ensureFreshAccessToken } = await import("../token-refresh");
    const account = makeAccount(); // tokenExpiresAt 1h away → no refresh needed

    const token = await ensureFreshAccessToken(account as any);

    expect(token).toBe("old-access-token"); // decrypt("enc:old-access-token")
    expect(refreshTwitterAccessToken).not.toHaveBeenCalled();
    expect(updateSetCalledWith).toBeNull();
  });

  it("returns the stored token when there is no expiry date at all (e.g. manual connections)", async () => {
    const { ensureFreshAccessToken } = await import("../token-refresh");
    const account = makeAccount({ tokenExpiresAt: null });

    const token = await ensureFreshAccessToken(account as any);

    expect(token).toBe("old-access-token");
    expect(refreshTwitterAccessToken).not.toHaveBeenCalled();
  });

  it("refreshes an X token near expiry, persists the new token/expiry, and returns the new access token", async () => {
    const { ensureFreshAccessToken } = await import("../token-refresh");
    const nearExpiry = new Date(NOW + 5 * 60 * 1000); // 5 min → within 15 min margin
    const account = makeAccount({ connectedVia: "oauth_twitter", tokenExpiresAt: nearExpiry });

    refreshTwitterAccessToken.mockResolvedValue({
      accessToken: "new-twitter-access",
      refreshToken: "new-twitter-refresh",
      expiresInSeconds: 7200,
    });

    const token = await ensureFreshAccessToken(account as any);

    expect(token).toBe("new-twitter-access");
    expect(refreshTwitterAccessToken).toHaveBeenCalledWith("old-refresh-token");
    // persistRefresh should have written the new encrypted token
    expect(updateSetCalledWith).toMatchObject({
      accessTokenEncrypted: "enc:new-twitter-access",
      refreshTokenEncrypted: "enc:new-twitter-refresh",
    });
  });

  it("refreshes a LinkedIn token near expiry, persists the new token, and returns the new access token", async () => {
    const { ensureFreshAccessToken } = await import("../token-refresh");
    const account = makeAccount({
      connectedVia: "oauth_linkedin",
      platform: "LinkedIn",
      accountId: "li-123",
      tokenExpiresAt: new Date(NOW + 5 * 60 * 1000),
    });

    refreshLinkedInAccessToken.mockResolvedValue({
      accessToken: "new-li-access",
      refreshToken: "new-li-refresh",
      expiresInSeconds: 5184000, // 60 days
    });

    const token = await ensureFreshAccessToken(account as any);

    expect(token).toBe("new-li-access");
    expect(refreshLinkedInAccessToken).toHaveBeenCalledWith("old-refresh-token");
    expect(updateSetCalledWith).toMatchObject({
      accessTokenEncrypted: "enc:new-li-access",
    });
  });

  it("refreshes a Meta account near expiry via user-token re-exchange + re-derive page token", async () => {
    const { ensureFreshAccessToken } = await import("../token-refresh");
    const account = makeAccount({
      connectedVia: "oauth_meta",
      platform: "Facebook",
      accountId: "page-456",
      tokenExpiresAt: new Date(NOW + 5 * 60 * 1000),
    });

    refreshLongLivedUserToken.mockResolvedValue({
      accessToken: "fresh-user-token",
      expiresInSeconds: 5184000,
    });
    listManagedPages.mockResolvedValue([
      { id: "page-456", accessToken: "fresh-page-token", instagramBusinessAccountId: null },
    ]);

    const token = await ensureFreshAccessToken(account as any);

    expect(token).toBe("fresh-page-token");
    expect(refreshLongLivedUserToken).toHaveBeenCalledWith("old-refresh-token");
    expect(listManagedPages).toHaveBeenCalledWith("fresh-user-token");
    expect(updateSetCalledWith).toMatchObject({
      accessTokenEncrypted: "enc:fresh-page-token",
      refreshTokenEncrypted: "enc:fresh-user-token",
    });
  });

  it("flips account to needs_reconnect and notifies vendor when token is near expiry but no refresh credential is stored", async () => {
    const { ensureFreshAccessToken, ReconnectRequiredError } = await import("../token-refresh");
    const account = makeAccount({
      refreshTokenEncrypted: null,
      tokenExpiresAt: new Date(NOW + 5 * 60 * 1000),
    });

    await expect(ensureFreshAccessToken(account as any)).rejects.toBeInstanceOf(ReconnectRequiredError);

    // Should have written needs_reconnect status to the DB
    expect(updateSetCalledWith).toMatchObject({ status: "needs_reconnect" });
    // Should have fired a Slack alert
    expect(sendSlackAlert).toHaveBeenCalledTimes(1);
    // Should have sent a vendor notification (DB insert)
    expect(insertValuesCalledWith).toMatchObject({ type: "social_reconnect" });
    // Should have emailed the vendor
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does NOT flip to needs_reconnect when there is no refresh token but the token is far from expiry", async () => {
    const { ensureFreshAccessToken } = await import("../token-refresh");
    const account = makeAccount({
      refreshTokenEncrypted: null,
      tokenExpiresAt: new Date(NOW + 60 * 60 * 1000), // 1 hour away
    });

    const token = await ensureFreshAccessToken(account as any);

    // Falls through to the stored token — no reconnect needed yet
    expect(token).toBe("old-access-token");
    expect(updateSetCalledWith).toBeNull();
    expect(sendSlackAlert).not.toHaveBeenCalled();
  });

  it("flips account to needs_reconnect and notifies vendor when the refresh API call fails", async () => {
    const { ensureFreshAccessToken, ReconnectRequiredError } = await import("../token-refresh");
    const account = makeAccount({
      tokenExpiresAt: new Date(NOW + 5 * 60 * 1000),
    });

    refreshTwitterAccessToken.mockRejectedValue(new Error("invalid_grant: token has been revoked"));

    await expect(ensureFreshAccessToken(account as any)).rejects.toBeInstanceOf(ReconnectRequiredError);

    expect(updateSetCalledWith).toMatchObject({ status: "needs_reconnect" });
    expect(sendSlackAlert).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("force=true triggers a refresh even when the token is far from expiry", async () => {
    const { ensureFreshAccessToken } = await import("../token-refresh");
    const account = makeAccount(); // 1 hour away — normally no refresh needed

    refreshTwitterAccessToken.mockResolvedValue({
      accessToken: "forced-new-access",
      refreshToken: "forced-new-refresh",
      expiresInSeconds: 7200,
    });

    const token = await ensureFreshAccessToken(account as any, { force: true });

    expect(token).toBe("forced-new-access");
    expect(refreshTwitterAccessToken).toHaveBeenCalledWith("old-refresh-token");
  });

  it("throws ReconnectRequiredError immediately when accessTokenEncrypted is absent", async () => {
    const { ensureFreshAccessToken, ReconnectRequiredError } = await import("../token-refresh");
    const account = makeAccount({ accessTokenEncrypted: null });

    await expect(ensureFreshAccessToken(account as any)).rejects.toBeInstanceOf(ReconnectRequiredError);
    expect(refreshTwitterAccessToken).not.toHaveBeenCalled();
  });

  it("persistRefresh clears expiryWarningSentAt so the next expiry cycle can warn again after reconnect", async () => {
    // Simulate a vendor who received an expiry warning, then successfully reconnected.
    // ensureFreshAccessToken → persistRefresh must set expiryWarningSentAt: null so
    // the warning sentinel is cleared and the next expiry window issues a fresh heads-up.
    const { ensureFreshAccessToken } = await import("../token-refresh");
    const account = makeAccount({
      connectedVia: "oauth_twitter",
      tokenExpiresAt: new Date(NOW + 5 * 60 * 1000), // near expiry → triggers refresh
      expiryWarningSentAt: new Date(NOW - 24 * 60 * 60 * 1000), // was warned yesterday
    });

    refreshTwitterAccessToken.mockResolvedValue({
      accessToken: "reconnected-access",
      refreshToken: "reconnected-refresh",
      expiresInSeconds: 7200,
    });

    await ensureFreshAccessToken(account as any);

    // persistRefresh must write expiryWarningSentAt: null so the sentinel is cleared
    expect(updateSetCalledWith).not.toBeNull();
    expect(updateSetCalledWith).toHaveProperty("expiryWarningSentAt", null);
    // And the new access token must be persisted
    expect(updateSetCalledWith).toMatchObject({
      accessTokenEncrypted: "enc:reconnected-access",
    });
  });
});
