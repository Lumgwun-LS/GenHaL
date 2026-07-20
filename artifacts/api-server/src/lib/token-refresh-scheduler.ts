/**
 * Proactively renews OAuth-connected social account tokens before they
 * expire, so an account that never gets published to between renewal
 * windows (X's ~2h access token being the tightest case) doesn't quietly go
 * stale until the next publish attempt happens to trigger a refresh.
 *
 * Also runs a parallel check (tickExpiryWarnings) for accounts whose tokens
 * can't be auto-renewed (no refresh token stored) and are within
 * EXPIRY_WARNING_DAYS of expiry, sending a one-time vendor heads-up so they
 * can reconnect before posts start failing.
 *
 * Follows the standard VendorHub scheduled-job pattern: a plain setInterval
 * loop plus one immediate tick on boot (see gateway-health-scheduler.ts).
 * Runs every 10 minutes so X's 15-minute refresh margin (see
 * token-refresh.ts) is always caught with room to spare.
 */
import { eq, and, inArray, isNotNull, isNull, lte, gt } from "drizzle-orm";
import { db, socialAccountsTable } from "@workspace/db";
import { ensureFreshAccessToken, notifyVendorExpiringSoon, ReconnectRequiredError } from "./token-refresh";
import { recordJobRun } from "./job-run-status";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// How many days before expiry to warn vendors whose tokens can't be auto-renewed.
// LinkedIn/Meta tokens are ~60 days so a 7-day heads-up is comfortable.
// X access tokens are much shorter-lived (as little as 2 hours); a 48-hour
// window keeps the warning actionable without crying wolf a week early.
const EXPIRY_WARNING_DAYS_DEFAULT = 7;
const EXPIRY_WARNING_DAYS_X = 2; // 48 hours

/** Returns the per-platform warning window in days. */
function expiryWarningDaysFor(connectedVia: string): number {
  return connectedVia === "oauth_twitter" ? EXPIRY_WARNING_DAYS_X : EXPIRY_WARNING_DAYS_DEFAULT;
}

// Name this tick's state is recorded under in job_run_status, for the admin panel.
export const TOKEN_REFRESH_JOB_NAME = "social-token-refresh";
export const TOKEN_EXPIRY_WARNING_JOB_NAME = "social-token-expiry-warning";

const RENEWABLE_CONNECTIONS = ["oauth_twitter", "oauth_linkedin", "oauth_meta"] as const;

export async function tick(): Promise<void> {
  try {
    const accounts = await db
      .select()
      .from(socialAccountsTable)
      .where(and(eq(socialAccountsTable.status, "active"), inArray(socialAccountsTable.connectedVia, [...RENEWABLE_CONNECTIONS]), isNotNull(socialAccountsTable.refreshTokenEncrypted)));

    let refreshed = 0;
    let failed = 0;
    for (const account of accounts) {
      // ensureFreshAccessToken itself decides whether this account is close
      // enough to expiry to actually need a refresh right now — calling it
      // for every renewable account is cheap for the ones that don't.
      try {
        await ensureFreshAccessToken(account);
        refreshed++;
      } catch (err) {
        failed++;
        if (err instanceof ReconnectRequiredError) {
          logger.warn({ accountId: account.id, platform: account.platform }, "[token-refresh-scheduler] Account flipped to needs_reconnect");
        } else {
          logger.error({ err, accountId: account.id }, "[token-refresh-scheduler] Unexpected error refreshing account");
        }
      }
    }
    await recordJobRun(TOKEN_REFRESH_JOB_NAME, { success: true, checkedCount: accounts.length, affectedCount: failed });
    if (failed > 0) logger.warn({ failed, refreshed }, "[token-refresh-scheduler] Some accounts could not be renewed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "[token-refresh-scheduler] Tick failed");
    await recordJobRun(TOKEN_REFRESH_JOB_NAME, { success: false, error: message });
  }
}

/**
 * Finds OAuth-connected accounts that cannot auto-renew (no refresh token) and
 * whose access token will expire within EXPIRY_WARNING_DAYS. Sends each vendor
 * a one-time in-app + email heads-up so they can reconnect before publishing
 * breaks. The `expiryWarningSentAt` sentinel prevents duplicate warnings for
 * the same expiry window; it's cleared by persistRefresh when the vendor
 * successfully reconnects and a new token is stored.
 */
export async function tickExpiryWarnings(): Promise<void> {
  try {
    // Use the widest warning window for the DB query so we pull all candidates
    // in one round-trip, then filter per-platform in the loop below.
    const maxWarningCutoff = new Date(Date.now() + EXPIRY_WARNING_DAYS_DEFAULT * 24 * 60 * 60 * 1000);

    const accounts = await db
      .select()
      .from(socialAccountsTable)
      .where(
        and(
          // Only OAuth-connected accounts — manual accounts have no stored token at all.
          inArray(socialAccountsTable.connectedVia, [...RENEWABLE_CONNECTIONS]),
          // Active accounts only; needs_reconnect ones already have a notice.
          eq(socialAccountsTable.status, "active"),
          // No refresh token stored means we can't silently renew this one.
          isNull(socialAccountsTable.refreshTokenEncrypted),
          // Token expires within the widest warning window.
          isNotNull(socialAccountsTable.tokenExpiresAt),
          lte(socialAccountsTable.tokenExpiresAt, maxWarningCutoff),
          // Token hasn't already expired (those will surface as needs_reconnect
          // via ensureFreshAccessToken once a publish is attempted).
          gt(socialAccountsTable.tokenExpiresAt, new Date()),
          // One warning per expiry window — skip if already warned.
          isNull(socialAccountsTable.expiryWarningSentAt),
        ),
      );

    let warned = 0;
    for (const account of accounts) {
      // Apply the per-platform window: X gets a tighter 48-hour threshold so
      // the warning only fires when there's actually time to act on it.
      const platformWindowMs = expiryWarningDaysFor(account.connectedVia) * 24 * 60 * 60 * 1000;
      const platformCutoff = new Date(Date.now() + platformWindowMs);
      if (!account.tokenExpiresAt || account.tokenExpiresAt > platformCutoff) {
        // Not yet within this platform's warning window — check again next tick.
        continue;
      }

      try {
        await notifyVendorExpiringSoon(account);
        // Stamp the sentinel so we don't warn again for this expiry cycle.
        await db
          .update(socialAccountsTable)
          .set({ expiryWarningSentAt: new Date() })
          .where(eq(socialAccountsTable.id, account.id));
        warned++;
        logger.info({ accountId: account.id, platform: account.platform, vendorId: account.vendorId }, "[token-expiry-warning] Expiry warning sent");
      } catch (err) {
        logger.error({ err, accountId: account.id }, "[token-expiry-warning] Failed to send expiry warning");
      }
    }

    await recordJobRun(TOKEN_EXPIRY_WARNING_JOB_NAME, { success: true, checkedCount: accounts.length, affectedCount: warned });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "[token-expiry-warning] Tick failed");
    await recordJobRun(TOKEN_EXPIRY_WARNING_JOB_NAME, { success: false, error: message });
  }
}

export function startTokenRefreshScheduler(): void {
  tick().catch((err) => logger.error({ err }, "Token refresh scheduler: initial tick failed"));
  tickExpiryWarnings().catch((err) => logger.error({ err }, "Token expiry warning scheduler: initial tick failed"));
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, "Token refresh scheduler: tick failed"));
    tickExpiryWarnings().catch((err) => logger.error({ err }, "Token expiry warning scheduler: tick failed"));
  }, CHECK_INTERVAL_MS);
}
