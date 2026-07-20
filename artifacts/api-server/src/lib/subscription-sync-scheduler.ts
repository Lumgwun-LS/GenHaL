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
import { and, eq, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
import { recordJobRun } from "./job-run-status";
import { resolveGatewayField, callWithPlatformStripe } from "./platform-gateways";
import { reconcileVendorSubscription } from "./subscription-sync";
import { reconcileVendorPaystackSubscription } from "./paystack-sync";
import { reconcileVendorPayPalSubscription } from "./paypal-sync";

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// Name this tick's state is recorded under in job_run_status, for the admin panel.
export const SUBSCRIPTION_SYNC_JOB_NAME = "subscription-sync";

export async function tick(): Promise<void> {
  try {
    let checkedCount = 0;
    let syncedCount = 0;

    const primaryStripeKey = await resolveGatewayField("stripe", "secretKey");
    const fallbackStripeKey = await resolveGatewayField("stripe", "fallbackSecretKey");
    if (primaryStripeKey || fallbackStripeKey) {
      // Only vendors who have ever started checkout have a Stripe customer to
      // reconcile against; everyone else has nothing on Stripe's side.
      const candidates = await db
        .select()
        .from(vendorsTable)
        .where(isNotNull(vendorsTable.stripeCustomerId));

      checkedCount += candidates.length;
      for (const vendor of candidates) {
        try {
          const result = await callWithPlatformStripe((stripe) => reconcileVendorSubscription(vendor, stripe, "scheduled-sync"));
          if (result.synced) {
            syncedCount++;
            logger.info(
              { vendorId: vendor.id, tier: result.currentTier },
              result.currentTier === "free"
                ? "[subscription-sync-scheduler] Caught a missed Stripe subscription cancellation — downgraded to free"
                : "[subscription-sync-scheduler] Caught a missed Stripe subscription upgrade",
            );
          }
        } catch (err) {
          // Per-vendor failures don't fail the whole tick — they're logged and retried next tick.
          logger.error({ err, vendorId: vendor.id }, "[subscription-sync-scheduler] Error reconciling Stripe vendor — will retry next tick");
        }
      }
    }

    const paystackKey = await resolveGatewayField("paystack", "secretKey");
    if (paystackKey) {
      const paystackCandidates = await db
        .select()
        .from(vendorsTable)
        .where(isNotNull(vendorsTable.paystackSubscriptionCode));

      checkedCount += paystackCandidates.length;
      for (const vendor of paystackCandidates) {
        try {
          const result = await reconcileVendorPaystackSubscription(vendor, paystackKey, "scheduled-sync");
          if (result.synced) {
            syncedCount++;
            logger.info(
              { vendorId: vendor.id, tier: result.currentTier },
              result.currentTier === "free"
                ? "[subscription-sync-scheduler] Caught a missed Paystack subscription cancellation — downgraded to free"
                : "[subscription-sync-scheduler] Caught a missed Paystack subscription upgrade",
            );
          }
        } catch (err) {
          logger.error({ err, vendorId: vendor.id }, "[subscription-sync-scheduler] Error reconciling Paystack vendor — will retry next tick");
        }
      }
    }

    const paypalClientId = await resolveGatewayField("paypal", "clientId");
    const paypalClientSecret = await resolveGatewayField("paypal", "clientSecret");
    const paypalMode = (await resolveGatewayField("paypal", "mode")) ?? "sandbox";
    if (paypalClientId && paypalClientSecret) {
      const paypalCandidates = await db
        .select()
        .from(vendorsTable)
        .where(and(isNotNull(vendorsTable.paypalSubscriptionId), eq(vendorsTable.subscriptionProvider, "paypal")));

      checkedCount += paypalCandidates.length;
      for (const vendor of paypalCandidates) {
        try {
          const result = await reconcileVendorPayPalSubscription(
            vendor,
            paypalClientId,
            paypalClientSecret,
            paypalMode,
            "scheduled-sync",
          );
          if (result.synced) {
            syncedCount++;
            logger.info(
              { vendorId: vendor.id, tier: result.currentTier },
              "[subscription-sync-scheduler] Caught a missed PayPal subscription cancellation — downgraded to free",
            );
          }
        } catch (err) {
          logger.error({ err, vendorId: vendor.id }, "[subscription-sync-scheduler] Error reconciling PayPal vendor — will retry next tick");
        }
      }
    }

    if (!primaryStripeKey && !fallbackStripeKey && !paystackKey && !paypalClientId) {
      // No gateway is configured on this platform yet — nothing to
      // reconcile against. Still a "successful" run: nothing to check.
      await recordJobRun(SUBSCRIPTION_SYNC_JOB_NAME, { success: true, checkedCount: 0, affectedCount: 0 });
      return;
    }

    if (syncedCount > 0) {
      logger.info({ syncedCount, checked: checkedCount }, "[subscription-sync-scheduler] Tick complete");
    }

    await recordJobRun(SUBSCRIPTION_SYNC_JOB_NAME, {
      success: true,
      checkedCount,
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
