/**
 * Notifies a customer that their refund has been processed.
 * Sends both:
 *  1. An in-app notification (if they have a platform account)
 *  2. An email to their address
 *
 * Both operations are best-effort — failures are logged but never rethrow,
 * so a notification hiccup never rolls back the refund itself.
 */

import { db, customersTable, customerNotificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";

export async function notifyCustomerRefund(opts: {
  customerEmail: string;
  customerName: string | null | undefined;
  amount: string;
  currency: string;
  orderId: number | null | undefined;
  vendorName?: string | null;
}): Promise<void> {
  const { customerEmail, customerName, amount, currency, orderId, vendorName } = opts;
  const amountStr = `${parseFloat(amount).toFixed(2)} ${currency.toUpperCase()}`;
  const nameGreeting = customerName?.trim() ? ` ${escapeHtml(customerName.trim())}` : "";
  const orderRef = orderId ? ` for order #${orderId}` : "";

  // ── 1. In-app notification ───────────────────────────────────────────────────
  try {
    const [customer] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(eq(customersTable.email, customerEmail.toLowerCase().trim()))
      .limit(1);

    if (customer) {
      await db.insert(customerNotificationsTable).values({
        customerId: customer.id,
        type:       "order_refunded",
        title:      `💰 Refund of ${amountStr} processed`,
        message:    `Your refund of ${amountStr}${orderRef} is on its way back to your original payment method. Allow 3–10 business days.`,
        metadata:   { orderId: orderId ?? null, amount, currency, vendorName: vendorName ?? null },
      });
    }
  } catch (e) {
    console.warn("[customer-refund-notify] in-app notification failed:", e);
  }

  // ── 2. Email notification ────────────────────────────────────────────────────
  const bodyHtml = `
    <p style="font-size:16px;margin:0 0 16px">Hello${nameGreeting},</p>

    <p style="font-size:15px;line-height:1.7;margin:0 0 20px">
      Good news — your refund of <strong>${escapeHtml(amountStr)}</strong>${orderId ? ` for order <strong>#${escapeHtml(String(orderId))}</strong>` : ""} has been successfully processed.
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="margin:0;font-weight:700;color:#15803d;font-size:15px">💰 ${escapeHtml(amountStr)} refunded</p>
      <p style="margin:6px 0 0;font-size:13px;color:#166534">
        The money is on its way back to your original payment method.<br>
        Depending on your bank or card provider, it may take <strong>3–10 business days</strong> to appear.
      </p>
    </div>

    ${vendorName ? `<p style="font-size:14px;color:#6b7280;margin:0 0 12px">If you have any questions, please contact <strong>${escapeHtml(vendorName)}</strong> directly.</p>` : ""}

    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0">
      You received this email because a refund was issued for your purchase.
    </p>
  `;

  await sendEmail({
    to:      customerEmail,
    subject: `Your refund of ${amountStr} has been processed`,
    html:    wrapVendorEmail({ bodyHtml }),
  }).catch(e => console.warn("[customer-refund-notify] email failed:", e));
}
