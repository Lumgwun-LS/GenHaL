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

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

async function tick(): Promise<void> {
  const results = await recheckAllPlatformCredentials();
  for (const r of results) {
    if (r.becameFailing) {
      logger.error({ provider: r.provider, error: r.error }, "Platform gateway credentials started failing");
    } else if (r.recovered) {
      logger.info({ provider: r.provider }, "Platform gateway credentials recovered");
    }
  }
}

export function startGatewayHealthScheduler(): void {
  tick().catch((err) => logger.error({ err }, "Gateway health scheduler: initial tick failed"));
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, "Gateway health scheduler: tick failed"));
  }, CHECK_INTERVAL_MS);
}
