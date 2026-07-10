/**
 * Self-service account deletion eligibility + one-time code helpers.
 *
 * A vendor may only request deletion when they have no unpaid/pending order
 * and no active (non-canceled) paid subscription — i.e. nothing owed to the
 * platform. Deletion itself is confirmed via two independent one-time codes:
 * one emailed, one texted. Both must be verified before the vendor row (and
 * everything cascading from it) is permanently deleted.
 */
import { createHash, randomInt } from "node:crypto";
import { db, vendorsTable, ordersTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

export const DELETION_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_VERIFY_ATTEMPTS = 5;

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export type DeletionEligibility = {
  eligible: boolean;
  reasons: string[];
};

/**
 * A vendor is blocked from deleting their data if they have:
 *  - any order that is unpaid/pending payment, or
 *  - an active (non-free, non-canceled-effectively) paid subscription.
 */
export async function checkDeletionEligibility(vendorId: number): Promise<DeletionEligibility> {
  const reasons: string[] = [];

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) {
    return { eligible: false, reasons: ["Vendor not found"] };
  }

  const unpaidOrders = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.vendorId, vendorId), inArray(ordersTable.paymentStatus, ["unpaid", "pending"])));
  if (unpaidOrders.length > 0) {
    reasons.push(`${unpaidOrders.length} order(s) with an unpaid or pending payment`);
  }

  // Either signal alone means a paid relationship still exists — checking both would
  // wrongly allow deletion if the two fields ever drift out of sync (e.g. webhook lag).
  const hasActiveSubscription = vendor.subscriptionTier !== "free" || Boolean(vendor.stripeSubscriptionId);
  if (hasActiveSubscription) {
    reasons.push("An active paid subscription must be cancelled first");
  }

  return { eligible: reasons.length === 0, reasons };
}
