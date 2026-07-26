/**
 * Invoice instalment payment reconciliation.
 * Called from the webhook pipeline after a payment linked to an invoice
 * instalment is confirmed paid.
 *
 * Contract:
 * - Idempotent: safe to re-run; only transitions pending → paid once.
 * - Never throws: all errors are logged and swallowed so the webhook
 *   pipeline's own success path is not disrupted.
 */
import { db, vendorsTable, vendorNotificationsTable, invoicesTable, invoiceInstalmentPaymentsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

export async function reconcileInstalmentPayment(
  instalmentId: number,
  paymentId: number,
): Promise<void> {
  try {
    // 1. Fetch instalment
    const [instalment] = await db
      .select()
      .from(invoiceInstalmentPaymentsTable)
      .where(eq(invoiceInstalmentPaymentsTable.id, instalmentId));
    if (!instalment) {
      console.warn("[invoice-reconcile] instalment not found:", instalmentId);
      return;
    }

    // 2. Fetch invoice
    const [invoice] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, instalment.invoiceId));
    if (!invoice) {
      console.warn("[invoice-reconcile] invoice not found:", instalment.invoiceId);
      return;
    }

    // 3. Atomically claim the transition (pending → paid)
    const [marked] = await db
      .update(invoiceInstalmentPaymentsTable)
      .set({ status: "paid", paymentId, paidAt: new Date() })
      .where(
        and(
          eq(invoiceInstalmentPaymentsTable.id, instalmentId),
          // Accept both pending and overdue — the public pay route allows paying either
          inArray(invoiceInstalmentPaymentsTable.status, ["pending", "overdue"]),
        ),
      )
      .returning({ id: invoiceInstalmentPaymentsTable.id });

    if (!marked) {
      // Already paid (duplicate webhook or retry)
      console.info("[invoice-reconcile] instalment already reconciled, skipping:", instalmentId);
      return;
    }

    // 4. Re-check all instalments to derive the new invoice status
    const allInstalments = await db
      .select({ status: invoiceInstalmentPaymentsTable.status })
      .from(invoiceInstalmentPaymentsTable)
      .where(eq(invoiceInstalmentPaymentsTable.invoiceId, invoice.id));

    const allPaid = allInstalments.every((i) => i.status === "paid");
    const anyPaid = allInstalments.some((i) => i.status === "paid");
    const newInvoiceStatus = allPaid
      ? "paid"
      : anyPaid
        ? "partially_paid"
        : "sent";

    await db
      .update(invoicesTable)
      .set({ status: newInvoiceStatus, updatedAt: new Date() })
      .where(eq(invoicesTable.id, invoice.id));

    const amountNum = parseFloat(instalment.amount);
    const amountStr = `${amountNum.toFixed(2)} ${(invoice.currency ?? "USD").toUpperCase()}`;
    const remainingCount = allInstalments.filter((i) => i.status === "pending").length;

    // 5. Vendor in-app notification
    await db
      .insert(vendorNotificationsTable)
      .values({
        vendorId: invoice.vendorId,
        type: "invoice_payment_received",
        message: `Payment of ${amountStr} received from ${invoice.customerName} (Invoice #${invoice.id}).${allPaid ? " Invoice fully paid." : ` ${remainingCount} instalment(s) remaining.`}`,
      })
      .catch((e) => console.warn("[invoice-reconcile] notification insert failed:", e));

    // 6. Vendor push notification
    const { sendPushToVendor } = await import("./push");
    sendPushToVendor(
      invoice.vendorId,
      "Invoice payment received",
      `${amountStr} from ${invoice.customerName}`,
      { screen: "invoices", invoiceId: invoice.id },
      "payments",
    ).catch((e) => console.warn("[invoice-reconcile] push failed:", e));

    // 7. Customer receipt email
    if (invoice.customerEmail) {
      const { sendEmail } = await import("./mailer");
      const { wrapVendorEmail, escapeHtml } = await import("./email-branding");
      const [vendor] = await db
        .select({ name: vendorsTable.name })
        .from(vendorsTable)
        .where(eq(vendorsTable.id, invoice.vendorId));

      const statusNote = allPaid
        ? `<p style="font-size:14px;color:#16a34a;font-weight:600;margin:12px 0 0;">✓ This invoice is now fully paid. Thank you!</p>`
        : `<p style="font-size:14px;color:#d97706;margin:12px 0 0;">Instalment ${instalment.instalmentNumber} paid. ${remainingCount} instalment(s) still outstanding.</p>`;

      const html = wrapVendorEmail({
        bodyHtml: `
          <h2 style="font-size:18px;color:#111827;margin:0 0 16px;">Payment Receipt</h2>
          <p style="font-size:14px;line-height:1.6;color:#374151;">Hi ${escapeHtml(invoice.customerName)},</p>
          <p style="font-size:14px;line-height:1.6;color:#374151;">
            Your payment of <strong>${escapeHtml(amountStr)}</strong> for
            Invoice #${invoice.id} from <strong>${escapeHtml(vendor?.name ?? "your vendor")}</strong> has been received.
          </p>
          ${statusNote}
          <p style="font-size:12px;color:#9ca3af;margin-top:24px;">Invoice ID: #${invoice.id} · Instalment ${instalment.instalmentNumber} of ${allInstalments.length}</p>
        `,
      });

      sendEmail({
        to: invoice.customerEmail,
        subject: `Payment Receipt — Invoice #${invoice.id}`,
        html,
      }).catch((e) => console.warn("[invoice-reconcile] customer receipt email failed:", e));
    }

    // 8. Vendor email notification
    const [vendor] = await db
      .select({ email: vendorsTable.email, name: vendorsTable.name })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, invoice.vendorId));

    if (vendor?.email) {
      const { sendEmail } = await import("./mailer");
      const { wrapVendorEmail, escapeHtml } = await import("./email-branding");

      const statusNote = allPaid
        ? `<p style="font-size:14px;color:#16a34a;font-weight:600;margin:12px 0 0;">🎉 This invoice is now fully paid.</p>`
        : `<p style="font-size:14px;color:#d97706;margin:12px 0 0;">Instalment ${instalment.instalmentNumber} of ${allInstalments.length} paid. ${remainingCount} remaining.</p>`;

      const html = wrapVendorEmail({
        bodyHtml: `
          <h2 style="font-size:18px;color:#111827;margin:0 0 16px;">Invoice Payment Received</h2>
          <p style="font-size:14px;line-height:1.6;color:#374151;">Hi ${escapeHtml(vendor.name ?? "there")},</p>
          <p style="font-size:14px;line-height:1.6;color:#374151;">
            <strong>${escapeHtml(invoice.customerName)}</strong> just paid
            <strong>${escapeHtml(amountStr)}</strong> on Invoice #${invoice.id}.
          </p>
          ${statusNote}
        `,
      });

      sendEmail({
        to: vendor.email,
        subject: `Payment received — Invoice #${invoice.id}`,
        html,
      }).catch((e) => console.warn("[invoice-reconcile] vendor email failed:", e));
    }

    console.info(
      `[invoice-reconcile] instalment ${instalmentId} reconciled — invoice ${invoice.id} status → ${newInvoiceStatus}`,
    );
  } catch (err) {
    console.error("[invoice-reconcile] unexpected error:", err);
  }
}
