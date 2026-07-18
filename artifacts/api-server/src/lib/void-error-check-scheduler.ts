/**
 * Periodically scans for cancelled payments where voidProviderSession failed
 * to expire the underlying Stripe checkout session. This means the customer's
 * original checkout link is still technically payable — a live, open session
 * that the vendor thought was cancelled.
 *
 * On each tick, the scheduler runs two passes:
 *
 * PASS 1 — Alert pass
 *   1. Finds newly-flagged void errors (voidError set, voidErrorAlertedAt not
 *      set, voidErrorAcknowledgedAt not set).
 *   2. Sends a Slack alert for each newly-found error and stamps
 *      voidErrorAlertedAt so it is not re-alerted on future ticks.
 *
 * PASS 2 — Retry pass
 *   1. Finds all unacknowledged void errors (voidError set,
 *      voidErrorAcknowledgedAt not set), regardless of voidErrorAlertedAt.
 *   2. For each, tries to resolve a Stripe key. If one is now available, it
 *      attempts checkout.sessions.expire again.
 *   3. On success: clears voidError / voidErrorAlertedAt from metadata and
 *      sends a Slack success notice so the team knows the session was
 *      eventually expired without manual intervention.
 *   4. On continued failure: leaves existing state intact — no new alert is
 *      sent so admins are not double-notified.
 *
 * Admins acknowledge individual errors via POST /admin/void-errors/:id/acknowledge,
 * which sets voidErrorAcknowledgedAt and removes them from the live list.
 */

import { db, paymentsTable, vendorsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import { logger } from "./logger";
import { recordJobRun } from "./job-run-status";
import { sendSlackAlert } from "./slack";
import { resolveStripeKey } from "./vendor-keys";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

export const VOID_ERROR_JOB_NAME = "void-error-check";

/** PASS 1: alert on newly-flagged void errors. */
async function alertPass(): Promise<{ checkedCount: number; alertedCount: number }> {
  const rows = await db
    .select({
      id: paymentsTable.id,
      vendorId: paymentsTable.vendorId,
      vendorName: vendorsTable.name,
      provider: paymentsTable.provider,
      providerReference: paymentsTable.providerReference,
      amount: paymentsTable.amount,
      currency: paymentsTable.currency,
      metadata: paymentsTable.metadata,
    })
    .from(paymentsTable)
    .leftJoin(vendorsTable, eq(paymentsTable.vendorId, vendorsTable.id))
    .where(
      sql`
        ${paymentsTable.metadata} ->> 'voidError' IS NOT NULL
        AND (${paymentsTable.metadata} ->> 'voidErrorAlertedAt') IS NULL
        AND (${paymentsTable.metadata} ->> 'voidErrorAcknowledgedAt') IS NULL
      `,
    )
    .limit(50);

  let alertedCount = 0;
  const now = new Date().toISOString();

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const voidError = String(meta.voidError ?? "Unknown error");
    const voidErrorAt = meta.voidErrorAt
      ? new Date(meta.voidErrorAt as string).toLocaleString()
      : "unknown time";

    await sendSlackAlert(
      `:warning: Checkout session void failed for *payment #${row.id}* ` +
        `(${row.provider}, ref: \`${row.providerReference}\`) ` +
        `for vendor *${row.vendorName ?? `#${row.vendorId}`}* ` +
        `(${row.currency} ${Number(row.amount).toFixed(2)}) at ${voidErrorAt}.\n` +
        `Error: ${voidError}\n` +
        `The provider's checkout link may still be payable. ` +
        `Review in the admin *Void Errors* panel.`,
    );

    await db
      .update(paymentsTable)
      .set({
        metadata: { ...meta, voidErrorAlertedAt: now },
      })
      .where(eq(paymentsTable.id, row.id));

    alertedCount++;
    logger.warn(
      { paymentId: row.id, vendorId: row.vendorId, error: voidError },
      "[void-error-check] Slacked void-error payment",
    );
  }

  return { checkedCount: rows.length, alertedCount };
}

/** PASS 2: retry voiding sessions for all unacknowledged void errors. */
async function retryPass(): Promise<{ retriedCount: number; recoveredCount: number }> {
  const rows = await db
    .select({
      id: paymentsTable.id,
      vendorId: paymentsTable.vendorId,
      vendorName: vendorsTable.name,
      provider: paymentsTable.provider,
      providerReference: paymentsTable.providerReference,
      amount: paymentsTable.amount,
      currency: paymentsTable.currency,
      metadata: paymentsTable.metadata,
    })
    .from(paymentsTable)
    .leftJoin(vendorsTable, eq(paymentsTable.vendorId, vendorsTable.id))
    .where(
      sql`
        ${paymentsTable.metadata} ->> 'voidError' IS NOT NULL
        AND (${paymentsTable.metadata} ->> 'voidErrorAcknowledgedAt') IS NULL
      `,
    )
    .limit(50);

  let retriedCount = 0;
  let recoveredCount = 0;

  for (const row of rows) {
    if (row.provider !== "stripe") continue; // only Stripe supports session expiry

    const meta = (row.metadata ?? {}) as Record<string, unknown>;

    // Try to resolve a Stripe key for this vendor. If none is available yet,
    // skip silently — no new alert, we'll try again on the next tick.
    let stripeKey: string;
    try {
      const [vendor] = await db
        .select()
        .from(vendorsTable)
        .where(eq(vendorsTable.id, row.vendorId));
      if (!vendor) continue;

      stripeKey = await resolveStripeKey(row.vendorId, vendor);
    } catch {
      // Key still not available — leave existing alert in place, try again later.
      logger.debug(
        { paymentId: row.id },
        "[void-error-check] Stripe key still unavailable for retry, skipping",
      );
      continue;
    }

    retriedCount++;

    try {
      const stripe = new Stripe(stripeKey);
      const session = await stripe.checkout.sessions.retrieve(row.providerReference);
      if (session.status === "open") {
        await stripe.checkout.sessions.expire(row.providerReference);
      }

      // Success — clear the void error fields so the payment drops out of the
      // Void Errors panel and admins know it was resolved automatically.
      const { voidError: _ve, voidErrorAt: _vea, voidErrorAlertedAt: _veaa, ...cleanMeta } = meta as Record<string, unknown>;
      await db
        .update(paymentsTable)
        .set({ metadata: cleanMeta })
        .where(eq(paymentsTable.id, row.id));

      recoveredCount++;
      logger.info(
        { paymentId: row.id, vendorId: row.vendorId, reference: row.providerReference },
        "[void-error-check] Successfully expired Stripe session on retry",
      );

      await sendSlackAlert(
        `:white_check_mark: Stripe checkout session for *payment #${row.id}* ` +
          `(ref: \`${row.providerReference}\`) ` +
          `for vendor *${row.vendorName ?? `#${row.vendorId}`}* ` +
          `(${row.currency} ${Number(row.amount).toFixed(2)}) ` +
          `has been automatically expired — no further action needed.`,
      );
    } catch (retryErr: unknown) {
      // Still failing — leave existing alert in place; do NOT send a new one.
      logger.warn(
        { paymentId: row.id, err: retryErr },
        "[void-error-check] Retry void failed again, leaving existing alert",
      );
    }
  }

  return { retriedCount, recoveredCount };
}

export async function tick(): Promise<void> {
  const alert = await alertPass();
  const retry = await retryPass();

  await recordJobRun(VOID_ERROR_JOB_NAME, {
    success: true,
    checkedCount: alert.checkedCount + retry.retriedCount,
    affectedCount: alert.alertedCount + retry.recoveredCount,
  });
}

export function startVoidErrorCheckScheduler(): void {
  tick().catch((err) => {
    logger.error({ err }, "Void error check scheduler: initial tick failed");
    recordJobRun(VOID_ERROR_JOB_NAME, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
  });
  setInterval(() => {
    tick().catch((err) => {
      logger.error({ err }, "Void error check scheduler: tick failed");
      recordJobRun(VOID_ERROR_JOB_NAME, {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }).catch(() => {});
    });
  }, CHECK_INTERVAL_MS);
}
