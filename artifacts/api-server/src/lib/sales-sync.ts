/**
 * Keeps the unified Sales ledger (see lib/db/src/schema/sales.ts) in sync with
 * payments as they're marked "paid". Called from the single, centralized
 * applyPaymentStatusTransition helper in payments/webhooks.ts so every
 * provider's webhook path (Stripe, Paystack, Flutterwave, Nomba, Remita) and
 * admin retry produce exactly one sales row per payment.
 *
 * Idempotent via the DB-level unique constraint on sales.source_payment_id —
 * a payment can only ever produce one auto-synced sales row, no matter how
 * many times a webhook retries or an admin re-triggers reconciliation.
 */
import { db, salesTable } from "@workspace/db";

export async function syncSaleFromPayment(payment: {
  id: number;
  vendorId: number;
  amount: string;
  currency: string;
}): Promise<void> {
  try {
    await db
      .insert(salesTable)
      .values({
        vendorId: payment.vendorId,
        source: "order_payment",
        sourcePaymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        description: "Payment received",
      })
      .onConflictDoNothing({ target: salesTable.sourcePaymentId });
  } catch (err) {
    // Never let sales-sync break the payment webhook pipeline itself.
    console.error(`[sales-sync] failed to sync sale for payment=${payment.id}:`, err);
  }
}
