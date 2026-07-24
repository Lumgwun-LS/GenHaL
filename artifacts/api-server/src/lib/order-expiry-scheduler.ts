/**
 * Order Expiry Scheduler
 *
 * Finds shop-link orders that are stuck in "pending" status with a failed
 * payment and are older than ORDER_EXPIRY_HOURS. Auto-cancels them and
 * restores product stock so inventory isn't held indefinitely by abandoned
 * checkouts.
 *
 * Design notes:
 *   - Only targets orders with paymentStatus='failed' (not 'unpaid' — those
 *     are new orders where the customer hasn't attempted payment yet).
 *   - Stock restoration uses `stock_quantity + quantity` (additive), never
 *     setting an absolute value, to be safe under concurrent updates.
 *   - Runs every hour; idempotent — re-running on an already-cancelled order
 *     is a no-op because the WHERE clause filters for status='pending'.
 */

import { db, ordersTable, orderItemsTable, productsTable, paymentsTable, vendorNotificationsTable } from "@workspace/db";
import { eq, and, lt, sql, inArray } from "drizzle-orm";
import { recordJobRun } from "./job-run-status";
import { logger } from "./logger";

const JOB_NAME = "order-expiry";
const ORDER_EXPIRY_HOURS = 24;
const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function expireAbandonedOrders(): Promise<{ checked: number; expired: number }> {
  const cutoff = new Date(Date.now() - ORDER_EXPIRY_HOURS * 60 * 60 * 1000);

  // Find pending orders with a failed payment that are older than the cutoff.
  // We join on paymentsTable to confirm there's at least one "failed" payment —
  // meaning the customer attempted checkout but never succeeded.
  const staleOrders = await db
    .selectDistinct({
      orderId: ordersTable.id,
      vendorId: ordersTable.vendorId,
    })
    .from(ordersTable)
    .innerJoin(
      paymentsTable,
      and(
        eq(paymentsTable.orderId, ordersTable.id),
        eq(paymentsTable.status, "failed"),
      ),
    )
    .where(
      and(
        eq(ordersTable.status, "pending"),
        lt(ordersTable.createdAt, cutoff),
      ),
    );

  if (staleOrders.length === 0) {
    return { checked: 0, expired: 0 };
  }

  logger.info({ count: staleOrders.length, cutoffHours: ORDER_EXPIRY_HOURS }, "[order-expiry] Found stale pending orders with failed payments");

  let expired = 0;
  for (const { orderId, vendorId } of staleOrders) {
    try {
      // Fetch order items so we can restore stock atomically per product.
      const items = await db
        .select({ productId: orderItemsTable.productId, quantity: orderItemsTable.quantity })
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, orderId));

      // Cancel the order first (atomic claim — skip if already cancelled by a
      // concurrent tick or manual action).
      const [cancelled] = await db
        .update(ordersTable)
        .set({ status: "cancelled", paymentStatus: "failed", updatedAt: new Date() })
        .where(and(eq(ordersTable.id, orderId), eq(ordersTable.status, "pending")))
        .returning({ id: ordersTable.id });

      if (!cancelled) {
        // Another process already cancelled it — skip stock restoration.
        continue;
      }

      // Restore stock for each item.
      for (const item of items) {
        await db
          .update(productsTable)
          .set({ stockQuantity: sql`${productsTable.stockQuantity} + ${item.quantity}` })
          .where(eq(productsTable.id, item.productId));
      }

      // In-app notification so the vendor knows the order was auto-expired.
      await db.insert(vendorNotificationsTable).values({
        vendorId,
        type: "payment",
        message: `Order #${orderId} was automatically cancelled after remaining unpaid for ${ORDER_EXPIRY_HOURS} hours. Product stock has been restored.`,
      }).onConflictDoNothing();

      expired++;
      logger.info({ orderId, vendorId, itemCount: items.length }, "[order-expiry] Cancelled stale order and restored stock");
    } catch (err) {
      logger.error({ err, orderId, vendorId }, "[order-expiry] Failed to expire order");
    }
  }

  return { checked: staleOrders.length, expired };
}

export function startOrderExpiryScheduler(): void {
  logger.info(
    { expiryHours: ORDER_EXPIRY_HOURS, intervalMinutes: INTERVAL_MS / 60_000 },
    "[order-expiry] Abandoned order expiry scheduler started — checks every hour",
  );

  const run = async () => {
    try {
      const counts = await expireAbandonedOrders();
      await recordJobRun(JOB_NAME, { success: true, checkedCount: counts.checked, affectedCount: counts.expired });
    } catch (err) {
      logger.error({ err }, "[order-expiry] Scheduler tick failed");
      await recordJobRun(JOB_NAME, { success: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  void run();
  setInterval(() => void run(), INTERVAL_MS);
}
