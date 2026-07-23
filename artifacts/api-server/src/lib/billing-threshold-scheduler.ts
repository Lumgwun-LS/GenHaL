/**
 * Billing Threshold Scheduler
 *
 * Runs every hour. Finds vendors with unsettled pay-as-you-go overage charges
 * that have reached or exceeded the platform charge-threshold ($60 USD).
 * For Stripe vendors an invoice is finalized and charged immediately.
 * For non-Stripe vendors an in-app notification is sent and the admin is alerted.
 *
 * This prevents any single vendor from accumulating more than ~$60 in unbilled
 * resource usage — protecting platform cash-flow while giving vendors a
 * predictable billing signal.
 */
import { db, vendorsTable, vendorOverageChargesTable, vendorNotificationsTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { callWithPlatformStripe } from "./platform-gateways";
import { recordJobRun } from "./job-run-status";
import { sendSlackAlert } from "./slack";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { logger } from "./logger";

const JOB_NAME = "billing-threshold-check";
const CHARGE_THRESHOLD_USD = 60;
const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function tick(): Promise<void> {
  // Sum unsettled overage charges per vendor
  const rows = await db
    .select({
      vendorId:        vendorOverageChargesTable.vendorId,
      totalUnsettled:  sql<number>`sum(${vendorOverageChargesTable.totalUsd})::float`,
    })
    .from(vendorOverageChargesTable)
    .where(isNull(vendorOverageChargesTable.settledAt))
    .groupBy(vendorOverageChargesTable.vendorId)
    .having(sql`sum(${vendorOverageChargesTable.totalUsd}) >= ${CHARGE_THRESHOLD_USD}`);

  if (rows.length === 0) return;

  logger.info({ count: rows.length, thresholdUsd: CHARGE_THRESHOLD_USD }, "[billing-threshold] Vendors crossing charge threshold");

  for (const row of rows) {
    try {
      await chargeVendor(row.vendorId, row.totalUnsettled);
    } catch (err) {
      logger.error({ err, vendorId: row.vendorId }, "[billing-threshold] Failed to process charge for vendor");
    }
  }
}

async function chargeVendor(vendorId: number, totalUsd: number): Promise<void> {
  const [vendor] = await db
    .select({
      id:                  vendorsTable.id,
      name:                vendorsTable.name,
      email:               vendorsTable.email,
      stripeCustomerId:    vendorsTable.stripeCustomerId,
      stripeSubscriptionId: vendorsTable.stripeSubscriptionId,
      subscriptionProvider: vendorsTable.subscriptionProvider,
    })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId));

  if (!vendor) return;

  const amountStr = `$${totalUsd.toFixed(2)}`;

  // ── Stripe vendors — create and immediately collect an off-cycle invoice ──
  if (vendor.stripeCustomerId && vendor.stripeSubscriptionId) {
    try {
      await callWithPlatformStripe(async (stripe) => {
        // Create the invoice
        const invoice = await stripe.invoices.create({
          customer:         vendor.stripeCustomerId as string,
          description:      `Platform resource overage — threshold collection (${amountStr})`,
          auto_advance:     true,
          metadata: {
            vendorId:  String(vendorId),
            trigger:   "threshold",
            threshold: String(CHARGE_THRESHOLD_USD),
          },
        });

        // Finalize & pay immediately
        await stripe.invoices.finalizeInvoice(invoice.id);
        await stripe.invoices.pay(invoice.id, { expand: ["payment_intent"] });

        // Mark the overage rows as settled
        await db
          .update(vendorOverageChargesTable)
          .set({ settledAt: new Date() })
          .where(and(
            eq(vendorOverageChargesTable.vendorId, vendorId),
            isNull(vendorOverageChargesTable.settledAt),
          ));

        logger.info({ vendorId, invoiceId: invoice.id, amountStr }, "[billing-threshold] Stripe invoice collected");
      });

      // Notify vendor
      await db.insert(vendorNotificationsTable).values({
        vendorId,
        type: "subscription",
        message: `Your resource usage has reached ${amountStr}. An invoice has been automatically charged to your card on file.`,
      });

      if (vendor.email) {
        const bodyHtml = `
          <h1 style="text-align:center;font-size:20px;color:#1a1a1a;margin:0 0 16px;">Resource Usage Charge</h1>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            Hi ${escapeHtml(vendor.name)}, your pay-as-you-go resource usage has reached
            <strong>${escapeHtml(amountStr)}</strong> and an invoice has been automatically
            charged to your card on file.
          </p>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            This charge covers AI image, video, voice, and other metered resources used beyond
            your plan's included credits. You can view the full breakdown in your billing dashboard.
          </p>`;
        await sendEmail({
          to: vendor.email,
          subject: `Resource usage charge of ${amountStr} processed`,
          html: wrapVendorEmail({ bodyHtml }),
        });
      }

    } catch (err) {
      logger.error({ err, vendorId }, "[billing-threshold] Stripe invoice collection failed — billing blocked");

      // Payment failed: block the vendor from further resource consumption
      await db.update(vendorsTable)
        .set({ billingBlocked: true, updatedAt: new Date() })
        .where(eq(vendorsTable.id, vendorId));

      await db.insert(vendorNotificationsTable).values({
        vendorId,
        type: "subscription",
        message: `We were unable to collect your outstanding balance of ${amountStr}. Resource access has been suspended until payment is resolved. Please update your payment method.`,
      });

      await sendSlackAlert(
        `:rotating_light: Billing threshold charge *FAILED* for vendor ${vendorId} — balance ${amountStr}. Vendor is now billing-blocked.`
      ).catch(() => {});
    }
    return;
  }

  // ── Non-Stripe vendors — notify and alert admin ──────────────────────────
  await db.insert(vendorNotificationsTable).values({
    vendorId,
    type: "subscription",
    message: `Your outstanding resource usage has reached ${amountStr}. Please contact support to settle your balance and avoid service interruption.`,
  });

  await sendSlackAlert(
    `:money_with_wings: Vendor ${vendorId} (${vendor.name}) has unsettled resource charges of ${amountStr} — no Stripe subscription on file. Manual collection required.`
  ).catch(() => {});

  if (vendor.email) {
    const bodyHtml = `
      <h1 style="text-align:center;font-size:20px;color:#1a1a1a;margin:0 0 16px;">Action Required: Outstanding Balance</h1>
      <p style="font-size:14px;line-height:1.6;color:#444;">
        Hi ${escapeHtml(vendor.name)}, your pay-as-you-go resource usage has reached
        <strong>${escapeHtml(amountStr)}</strong>.
      </p>
      <p style="font-size:14px;line-height:1.6;color:#444;">
        Please contact our support team to settle your balance and avoid service interruption.
      </p>`;
    await sendEmail({
      to: vendor.email,
      subject: `Action required: Outstanding balance of ${amountStr}`,
      html: wrapVendorEmail({ bodyHtml }),
    });
  }
}

export function startBillingThresholdScheduler(): void {
  logger.info(
    { thresholdUsd: CHARGE_THRESHOLD_USD, intervalMinutes: INTERVAL_MS / 60_000 },
    "[billing-threshold] Scheduler started — checks every hour",
  );

  setInterval(async () => {
    try {
      await tick();
      await recordJobRun(JOB_NAME, "ok");
    } catch (err) {
      logger.error({ err }, "[billing-threshold] Tick failed");
      await recordJobRun(JOB_NAME, "error", String(err)).catch(() => {});
    }
  }, INTERVAL_MS);
}
