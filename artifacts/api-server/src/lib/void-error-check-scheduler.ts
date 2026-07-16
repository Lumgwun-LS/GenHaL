/**
 * Periodically scans for cancelled payments where voidProviderSession failed
 * to expire the underlying Stripe checkout session. This means the customer's
 * original checkout link is still technically payable — a live, open session
 * that the vendor thought was cancelled.
 *
 * On each tick, the scheduler:
 *   1. Finds newly-flagged void errors (voidError set, voidErrorAlertedAt not
 *      set, voidErrorAcknowledgedAt not set).
 *   2. Sends a Slack alert for each newly-found error and stamps
 *      voidErrorAlertedAt so it is not re-alerted on future ticks.
 *   3. Records job health via recordJobRun for the admin Background Jobs panel.
 *
 * Admins acknowledge individual errors via POST /admin/void-errors/:id/acknowledge,
 * which sets voidErrorAcknowledgedAt and removes them from the live list.
 */

import { db, paymentsTable, vendorsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { recordJobRun } from "./job-run-status";
import { sendSlackAlert } from "./slack";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

export const VOID_ERROR_JOB_NAME = "void-error-check";

async function tick(): Promise<void> {
  // Find payments with a void error that haven't been alerted yet and haven't
  // been acknowledged by an admin. The voidErrorAlertedAt stamp prevents
  // re-alerting the same payment every tick.
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
    const voidErrorAt = meta.voidErrorAt ? new Date(meta.voidErrorAt as string).toLocaleString() : "unknown time";

    await sendSlackAlert(
      `:warning: Checkout session void failed for *payment #${row.id}* ` +
        `(${row.provider}, ref: \`${row.providerReference}\`) ` +
        `for vendor *${row.vendorName ?? `#${row.vendorId}`}* ` +
        `(${row.currency} ${Number(row.amount).toFixed(2)}) at ${voidErrorAt}.\n` +
        `Error: ${voidError}\n` +
        `The provider's checkout link may still be payable. ` +
        `Review in the admin *Void Errors* panel.`,
    );

    // Stamp voidErrorAlertedAt so future ticks skip this payment.
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

  await recordJobRun(VOID_ERROR_JOB_NAME, {
    success: true,
    checkedCount: rows.length,
    affectedCount: alertedCount,
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
