/**
 * Periodically re-tests every configured platform payment gateway's
 * credentials so a key revoked/expired on the provider's side (after it
 * passed at save time) gets caught before a real checkout fails on it.
 *
 * Follows the standard VendorHub scheduled-job pattern: a plain setInterval
 * loop plus one immediate tick on boot, since a payment gateway could have
 * silently started failing while the server was down.
 */
import { logger } from "./logger";
import { recheckAllPlatformCredentials } from "./platform-gateways";
import { recordJobRun } from "./job-run-status";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// Name this tick's state is recorded under in job_run_status, for the admin panel.
export const GATEWAY_HEALTH_JOB_NAME = "gateway-health";

async function tick(): Promise<void> {
  try {
    const results = await recheckAllPlatformCredentials();
    let affected = 0;
    for (const r of results) {
      if (r.becameFailing) {
        affected++;
        logger.error({ provider: r.provider, error: r.error }, "Platform gateway credentials started failing");
      } else if (r.recovered) {
        affected++;
        logger.info({ provider: r.provider }, "Platform gateway credentials recovered");
      }
    }
    await recordJobRun(GATEWAY_HEALTH_JOB_NAME, { success: true, checkedCount: results.length, affectedCount: affected });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordJobRun(GATEWAY_HEALTH_JOB_NAME, { success: false, error: message });
    throw err;
  }
}

export function startGatewayHealthScheduler(): void {
  tick().catch((err) => logger.error({ err }, "Gateway health scheduler: initial tick failed"));
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, "Gateway health scheduler: tick failed"));
  }, CHECK_INTERVAL_MS);
}
