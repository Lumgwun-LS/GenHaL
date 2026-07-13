/**
 * Periodic background reconciliation for vendor subscriptions.
 *
 * The /vendors/:id/subscription/sync route (subscription-upgrade.ts) only
 * reconciles a vendor's tier against Stripe when someone calls it — the
 * vendor clicking "Refresh billing status" on the billing page, or the UI
 * polling after a Stripe Checkout redirect. If a vendor never revisits that
 * page after an extended outage (dropped webhook, server downtime), a paid
 * subscription can stay unapplied indefinitely.
 *
 * This job runs the same reconciliation (reconcileVendorSubscription) for
 * every vendor with a stripeCustomerId on a timer, so missed upgrades get
 * caught automatically. Follows the standard VendorHub scheduled-job
 * pattern: a plain setInterval loop plus one immediate tick on boot (see
 * gateway-health-scheduler.ts / voice-campaign-scheduler.ts).
 */
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";
import { isNotNull } from "drizzle-orm";
import Stripe from "stripe";
import { logger } from "./logger";
import { recordJobRun } from "./job-run-status";
import { resolveGatewayField } from "./platform-gateways";
import { reconcileVendorSubscription } from "./subscription-sync";

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// Name this tick's state is recorded under in job_run_status, for the admin panel.
export const SUBSCRIPTION_SYNC_JOB_NAME = "subscription-sync";

export async function tick(): Promise<void> {
  try {
    const stripeKey = await resolveGatewayField("stripe", "secretKey");
    if (!stripeKey) {
      // Stripe isn't configured on this platform yet — nothing to reconcile against.
      // Still a "successful" run: there was simply nothing to check.
      await recordJobRun(SUBSCRIPTION_SYNC_JOB_NAME, { success: true, checkedCount: 0, affectedCount: 0 });
      return;
    }

    const stripe = new Stripe(stripeKey);

    // Only vendors who have ever started checkout have a Stripe customer to
    // reconcile against; everyone else has nothing on Stripe's side.
    const candidates = await db
      .select()
      .from(vendorsTable)
      .where(isNotNull(vendorsTable.stripeCustomerId));

    let syncedCount = 0;
    for (const vendor of candidates) {
      try {
        const result = await reconcileVendorSubscription(vendor, stripe, "scheduled-sync");
        if (result.synced) {
          syncedCount++;
          logger.info(
            { vendorId: vendor.id, tier: result.currentTier },
            result.currentTier === "free"
              ? "[subscription-sync-scheduler] Caught a missed subscription cancellation — downgraded to free"
              : "[subscription-sync-scheduler] Caught a missed subscription upgrade",
          );
        }
      } catch (err) {
        // Per-vendor failures don't fail the whole tick — they're logged and retried next tick.
        logger.error({ err, vendorId: vendor.id }, "[subscription-sync-scheduler] Error reconciling vendor — will retry next tick");
      }
    }

    if (syncedCount > 0) {
      logger.info({ syncedCount, checked: candidates.length }, "[subscription-sync-scheduler] Tick complete");
    }

    await recordJobRun(SUBSCRIPTION_SYNC_JOB_NAME, {
      success: true,
      checkedCount: candidates.length,
      affectedCount: syncedCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordJobRun(SUBSCRIPTION_SYNC_JOB_NAME, { success: false, error: message });
    throw err;
  }
}

/** Starts the periodic subscription reconciliation job: checks every 30 minutes. */
export function startSubscriptionSyncScheduler(): void {
  tick().catch((err) => logger.error({ err }, "[subscription-sync-scheduler] Initial tick failed"));
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, "[subscription-sync-scheduler] Tick failed"));
  }, CHECK_INTERVAL_MS);
  logger.info("[subscription-sync-scheduler] Scheduled subscription reconciliation started — checks every 30 minutes");
}
