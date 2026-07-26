/**
 * Overdue invoice scheduler — runs daily.
 * Marks unpaid instalments as overdue when their due date has passed and
 * sends a reminder email to the customer + an in-app notification to the vendor.
 *
 * Uses recordJobRun so the admin Background Jobs panel shows last-run status.
 */
import { db, invoicesTable, invoiceInstalmentPaymentsTable, vendorsTable, vendorNotificationsTable } from "@workspace/db";
import { eq, and, lte, inArray } from "drizzle-orm";
import { recordJobRun } from "./job-run-status";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";

const JOB_NAME = "overdue-invoices";
const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function tick(): Promise<void> {
  const today = new Date().toISOString().split("T")[0]!;

  // Find all pending instalments past their due date (include reminderSentAt)
  const overdueInstalments = await db
    .select()
    .from(invoiceInstalmentPaymentsTable)
    .where(
      and(
        eq(invoiceInstalmentPaymentsTable.status, "pending"),
        lte(invoiceInstalmentPaymentsTable.dueDate, today),
      ),
    );

  if (overdueInstalments.length === 0) {
    await recordJobRun(JOB_NAME, { success: true, checkedCount: 0, affectedCount: 0 });
    return;
  }

  // Fetch invoices for these instalments
  const invoiceIds = [...new Set(overdueInstalments.map((i) => i.invoiceId))];
  const invoices = await db
    .select()
    .from(invoicesTable)
    .where(inArray(invoicesTable.id, invoiceIds));
  const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]));

  let markedOverdue = 0;
  let emailsSent = 0;

  for (const instalment of overdueInstalments) {
    const invoice = invoiceMap.get(instalment.invoiceId);
    if (!invoice || invoice.status === "paid" || invoice.status === "cancelled") continue;

    // Mark instalment as overdue
    await db
      .update(invoiceInstalmentPaymentsTable)
      .set({ status: "overdue" })
      .where(
        and(
          eq(invoiceInstalmentPaymentsTable.id, instalment.id),
          eq(invoiceInstalmentPaymentsTable.status, "pending"),
        ),
      );
    markedOverdue++;

    // Update invoice status to overdue if not already partially_paid
    if (invoice.status !== "partially_paid") {
      await db
        .update(invoicesTable)
        .set({ status: "overdue", updatedAt: new Date() })
        .where(eq(invoicesTable.id, invoice.id));
    }

    const amountStr = `${parseFloat(instalment.amount).toFixed(2)} ${(invoice.currency ?? "USD").toUpperCase()}`;
    const shareUrl = `${process.env.FRONTEND_URL ?? "https://awajimaaai.com"}/invoice/${invoice.shareToken}`;

    // Vendor in-app notification
    db.insert(vendorNotificationsTable)
      .values({
        vendorId: invoice.vendorId,
        type: "invoice_overdue",
        message: `Invoice #${invoice.id} to ${invoice.customerName} is overdue. ${amountStr} not yet collected.`,
      })
      .catch((e) => console.warn("[overdue-invoice] notification insert failed:", e));

    // Customer reminder email (skip if already reminded today)
    if (
      invoice.customerEmail &&
      !instalment.reminderSentAt // send once; reset by vendor "remind" button
    ) {
      const [vendor] = await db
        .select({ name: vendorsTable.name })
        .from(vendorsTable)
        .where(eq(vendorsTable.id, invoice.vendorId));

      const html = wrapVendorEmail({
        bodyHtml: `
          <h2 style="font-size:18px;color:#dc2626;margin:0 0 16px;">Payment Overdue</h2>
          <p style="font-size:14px;line-height:1.6;color:#374151;">Hi ${escapeHtml(invoice.customerName)},</p>
          <p style="font-size:14px;line-height:1.6;color:#374151;">
            This is a reminder that your payment of <strong>${escapeHtml(amountStr)}</strong>
            on Invoice #${invoice.id} from <strong>${escapeHtml(vendor?.name ?? "your vendor")}</strong>
            ${instalment.dueDate ? `was due on <strong>${escapeHtml(instalment.dueDate)}</strong> and ` : ""}is now overdue.
          </p>
          <p style="font-size:14px;line-height:1.6;color:#374151;">Please settle this at your earliest convenience.</p>
        `,
        action: { label: "Pay Now", url: shareUrl },
      });

      const result = await sendEmail({
        to: invoice.customerEmail,
        subject: `Payment Overdue — Invoice #${invoice.id}`,
        html,
      });

      if (result.status === "sent") {
        emailsSent++;
        await db
          .update(invoiceInstalmentPaymentsTable)
          .set({ reminderSentAt: new Date() })
          .where(eq(invoiceInstalmentPaymentsTable.id, instalment.id));
      }
    }
  }

  await recordJobRun(JOB_NAME, { success: true, checkedCount: overdueInstalments.length, affectedCount: markedOverdue });
  console.info(`[overdue-invoice] tick — markedOverdue=${markedOverdue} emailsSent=${emailsSent}`);
}

export function startOverdueInvoiceScheduler(): void {
  console.info("[overdue-invoice] Scheduler started — checks every 24 hours");

  // Run once immediately on startup (catches anything missed while server was down)
  void tick().catch((e) => {
    console.error("[overdue-invoice] initial tick failed:", e);
    recordJobRun(JOB_NAME, { success: false, error: String(e) }).catch(() => {});
  });

  setInterval(() => {
    tick().catch((e) => {
      console.error("[overdue-invoice] tick failed:", e);
      recordJobRun(JOB_NAME, { success: false, error: String(e) }).catch(() => {});
    });
  }, INTERVAL_MS);
}
