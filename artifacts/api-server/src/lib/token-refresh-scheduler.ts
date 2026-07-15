/**
 * Proactively renews OAuth-connected social account tokens before they
 * expire, so an account that never gets published to between renewal
 * windows (X's ~2h access token being the tightest case) doesn't quietly go
 * stale until the next publish attempt happens to trigger a refresh.
 *
 * Follows the standard VendorHub scheduled-job pattern: a plain setInterval
 * loop plus one immediate tick on boot (see gateway-health-scheduler.ts).
 * Runs every 10 minutes so X's 15-minute refresh margin (see
 * token-refresh.ts) is always caught with room to spare.
 */
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { db, socialAccountsTable } from "@workspace/db";
import { ensureFreshAccessToken, ReconnectRequiredError } from "./token-refresh";
import { recordJobRun } from "./job-run-status";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Name this tick's state is recorded under in job_run_status, for the admin panel.
export const TOKEN_REFRESH_JOB_NAME = "social-token-refresh";

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

export function startTokenRefreshScheduler(): void {
  tick().catch((err) => logger.error({ err }, "Token refresh scheduler: initial tick failed"));
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, "Token refresh scheduler: tick failed"));
  }, CHECK_INTERVAL_MS);
}
