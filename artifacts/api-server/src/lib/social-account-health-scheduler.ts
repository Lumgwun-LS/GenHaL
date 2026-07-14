/**
 * Periodically re-validates every OAuth-connected Facebook/Instagram
 * account's stored access token so an expiry or vendor-side revocation is
 * caught proactively, instead of only surfacing the next time a post fails
 * to publish. Follows the standard VendorHub scheduled-job pattern: a plain
 * setInterval loop plus one immediate tick on boot (see
 * gateway-health-scheduler.ts).
 */
import { logger } from "./logger";
import { recheckAllSocialAccountsHealth } from "./social-account-health";
import { recordJobRun } from "./job-run-status";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly — tokens are long-lived (~60 days), no need to check more often

// Name this tick's state is recorded under in job_run_status, for the admin panel.
export const SOCIAL_ACCOUNT_HEALTH_JOB_NAME = "social-account-health";

export async function tick(): Promise<void> {
  try {
    const results = await recheckAllSocialAccountsHealth();
    let affected = 0;
    for (const r of results) {
      if (r.becameInvalid) {
        affected++;
        logger.error({ accountId: r.accountId, error: r.error }, "Social account access token started failing");
      } else if (r.recovered) {
        affected++;
        logger.info({ accountId: r.accountId }, "Social account access token recovered");
      }
    }
    await recordJobRun(SOCIAL_ACCOUNT_HEALTH_JOB_NAME, { success: true, checkedCount: results.length, affectedCount: affected });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "[social-account-health-scheduler] Tick failed");
    await recordJobRun(SOCIAL_ACCOUNT_HEALTH_JOB_NAME, { success: false, error: message });
  }
}

export function startSocialAccountHealthScheduler(): void {
  tick().catch((err) => logger.error({ err }, "Social account health scheduler: initial tick failed"));
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, "Social account health scheduler: tick failed"));
  }, CHECK_INTERVAL_MS);
}
