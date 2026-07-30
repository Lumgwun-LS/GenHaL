/**
 * Cart Reminder Scheduler
 *
 * Every hour, finds orders that are:
 *   - status = 'pending'  (not yet completed or cancelled)
 *   - paymentStatus = 'unpaid'  (customer hasn't attempted payment yet)
 *   - created between 1 h and 23 h ago  (long enough to be "abandoned", short
 *     enough to still be actionable — the order-expiry scheduler cancels them
 *     only when they also have a failed payment AND are >24 h old)
 *   - cartReminderSentAt IS NULL  (idempotency — send exactly once)
 *
 * Sends a single "you left something in your cart" email to the customer with
 * a link to /my-activity so they can see and complete all pending orders.
 */

import { db, ordersTable, orderItemsTable, vendorsTable } from "@workspace/db";
import { eq, and, lt, gt, isNull } from "drizzle-orm";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { recordJobRun } from "./job-run-status";
import { logger } from "./logger";

const JOB_NAME = "cart-reminder";
const REMINDER_AFTER_HOURS = 1;   // fire this many hours after order creation
const REMINDER_BEFORE_HOURS = 23; // stop reminding this many hours after creation
const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function getAppBaseUrl(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  return domain ? `https://${domain}` : "https://app.awabiz.com";
}

async function sendCartReminders(): Promise<{ checked: number; sent: number }> {
  const now = Date.now();
  const reminderAfter  = new Date(now - REMINDER_AFTER_HOURS  * 60 * 60 * 1000);
  const reminderBefore = new Date(now - REMINDER_BEFORE_HOURS * 60 * 60 * 1000);

  // Find abandoned-cart orders that haven't been reminded yet
  const candidates = await db
    .select({
      orderId:       ordersTable.id,
      vendorId:      ordersTable.vendorId,
      vendorName:    vendorsTable.name,
      customerEmail: ordersTable.customerEmail,
      customerName:  ordersTable.customerName,
      currency:      ordersTable.currency,
      totalAmount:   ordersTable.totalAmount,
      createdAt:     ordersTable.createdAt,
    })
    .from(ordersTable)
    .innerJoin(vendorsTable, eq(vendorsTable.id, ordersTable.vendorId))
    .where(and(
      eq(ordersTable.status, "pending"),
      eq(ordersTable.paymentStatus, "unpaid"),
      lt(ordersTable.createdAt, reminderAfter),
      gt(ordersTable.createdAt, reminderBefore),
      isNull(ordersTable.cartReminderSentAt),
    ));

  if (candidates.length === 0) {
    return { checked: 0, sent: 0 };
  }

  logger.info({ count: candidates.length }, "[cart-reminder] Found abandoned carts");

  let sent = 0;

  for (const order of candidates) {
    try {
      // Atomically claim the send slot — skip if another instance already claimed it
      const [claimed] = await db
        .update(ordersTable)
        .set({ cartReminderSentAt: new Date() })
        .where(and(
          eq(ordersTable.id, order.orderId),
          isNull(ordersTable.cartReminderSentAt),
        ))
        .returning({ id: ordersTable.id });

      if (!claimed) continue; // already claimed by a concurrent run

      // Fetch order items for the email
      const items = await db
        .select({
          productName: orderItemsTable.productName,
          quantity:    orderItemsTable.quantity,
          unitPrice:   orderItemsTable.unitPrice,
          totalPrice:  orderItemsTable.totalPrice,
        })
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, order.orderId));

      const activityUrl = `${getAppBaseUrl()}/vendor-hub/my-activity?email=${encodeURIComponent(order.customerEmail)}`;

      const itemsHtml = items.map((item) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
            ${escapeHtml(item.productName)}
            <span style="color:#888;font-size:12px;"> × ${item.quantity}</span>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;white-space:nowrap;">
            ${escapeHtml(order.currency)} ${Number(item.totalPrice).toFixed(2)}
          </td>
        </tr>`).join("");

      const bodyHtml = `
        <h2 style="font-size:20px;font-weight:700;margin:0 0 8px;">
          You left something behind, ${escapeHtml(order.customerName.split(" ")[0])}!
        </h2>
        <p style="color:#555;margin:0 0 20px;">
          Your order from <strong>${escapeHtml(order.vendorName)}</strong> is waiting.
          Complete your purchase before it expires.
        </p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          ${itemsHtml}
          <tr>
            <td style="padding:10px 0 0;font-weight:700;">Total</td>
            <td style="padding:10px 0 0;text-align:right;font-weight:700;white-space:nowrap;">
              ${escapeHtml(order.currency)} ${Number(order.totalAmount).toFixed(2)}
            </td>
          </tr>
        </table>`;

      const html = wrapVendorEmail({
        bodyHtml,
        action: { label: "Complete Your Order", url: activityUrl },
      });

      const result = await sendEmail({
        to:      order.customerEmail,
        subject: `Complete your order from ${order.vendorName}`,
        html,
      });

      if (result.status !== "failed") {
        sent++;
        logger.info({ orderId: order.orderId, to: order.customerEmail }, "[cart-reminder] Reminder sent");
      } else {
        logger.warn({ orderId: order.orderId, error: result.error }, "[cart-reminder] Email failed");
      }
    } catch (err) {
      logger.error({ err, orderId: order.orderId }, "[cart-reminder] Error sending reminder");
    }
  }

  return { checked: candidates.length, sent };
}

export function startCartReminderScheduler(): void {
  const tick = async () => {
    try {
      const result = await sendCartReminders();
      await recordJobRun(JOB_NAME, { success: true, checkedCount: result.checked, affectedCount: result.sent });
      logger.info(result, "[cart-reminder] Tick complete");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await recordJobRun(JOB_NAME, { success: false, error: msg }).catch(() => {});
      logger.error({ err }, "[cart-reminder] Tick failed");
    }
  };

  void tick();
  setInterval(tick, INTERVAL_MS);
  logger.info({ intervalHours: 1, reminderAfterHours: REMINDER_AFTER_HOURS }, "[cart-reminder] Scheduler started");
}
