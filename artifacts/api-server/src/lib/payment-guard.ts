/**
 * Checkout idempotency guard — prevents duplicate payment sessions for the
 * same order when a customer double-clicks "Pay" or the frontend retries too
 * quickly.
 *
 * How it works:
 *   Before creating a new checkout session, each provider's route calls
 *   findActivePendingPayment(orderId). If a pending payment was created for
 *   that order within the last 30 minutes, the caller returns its stored
 *   checkout URL/reference instead of opening a second session.
 *
 * This doesn't replace the webhook-level dedup (logWebhookEvent), which
 * prevents double-recording a completed payment. This guard prevents
 * double-opening of payment windows in the first place.
 */

import { db, paymentsTable } from "@workspace/db";
import { eq, and, gte, isNull } from "drizzle-orm";

const DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export interface ActivePendingPayment {
  id: number;
  provider: string;
  providerReference: string;
  /** URL to redirect the customer to (extracted from metadata). */
  checkoutUrl: string | null;
}

/**
 * Returns the most recent pending payment for `orderId` if one was created
 * within the dedup window, or null if no such payment exists.
 *
 * Callers should return HTTP 200 with the existing checkout URL rather than
 * creating a second session.
 */
export async function findActivePendingPayment(
  orderId: number,
): Promise<ActivePendingPayment | null> {
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);

  const [existing] = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.orderId, orderId),
        eq(paymentsTable.status, "pending"),
        gte(paymentsTable.createdAt, cutoff),
      ),
    )
    .orderBy(paymentsTable.createdAt)
    .limit(1);

  if (!existing) return null;

  // Extract the checkout URL from provider-specific metadata shapes.
  const meta = (existing.metadata ?? {}) as Record<string, unknown>;
  const checkoutUrl =
    (meta.sessionUrl as string | undefined) ??   // Stripe
    (meta.authorization_url as string | undefined) ?? // Paystack
    (meta.link as string | undefined) ??         // Flutterwave
    (meta.approvalUrl as string | undefined) ??  // PayPal
    null;

  return {
    id: existing.id,
    provider: existing.provider,
    providerReference: existing.providerReference,
    checkoutUrl,
  };
}
