/**
 * Billing Threshold Scheduler
 *
 * Runs every hour. Finds vendors with unsettled pay-as-you-go overage charges
 * that have reached or exceeded their personal auto-deduction threshold.
 *
 * Threshold escalation ladder:
 *   - The platform-wide escalation ladder is admin-configurable via the
 *     `billing.deductionLadder` site-content block (default [10, 50, 100, 200] USD).
 *   - Each vendor starts at ladder[0]. After each successful charge, their
 *     personal threshold advances to the next rung (stored in vendors.currentDeductionThreshold).
 *   - Once at the top rung, subsequent charges fire at that level indefinitely.
 *   - If a charge fails, the threshold is NOT advanced; the vendor is billing-blocked.
 *   - Admins can reset a vendor's threshold to null (= ladder[0]) from the admin panel.
 *
 * For Stripe vendors an invoice is finalized and charged immediately.
 * For non-Stripe vendors an in-app notification is sent and the admin is alerted.
 */
import { db, vendorsTable, vendorOverageChargesTable, vendorNotificationsTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { callWithPlatformStripe } from "./platform-gateways";
import { recordJobRun } from "./job-run-status";
import { sendSlackAlert } from "./slack";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { getSiteContentBlock } from "./site-content";
import { logger } from "./logger";

const JOB_NAME = "billing-threshold-check";
const DEFAULT_LADDER = [10, 50, 100, 200]; // USD — fallback when site-content not yet set
const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** Returns the admin-configured escalation ladder, falling back to DEFAULT_LADDER. */
async function getDeductionLadder(): Promise<number[]> {
  try {
    const raw = await getSiteContentBlock("billing.deductionLadder");
    if (Array.isArray(raw) && raw.length > 0) {
      const nums = (raw as unknown[]).filter((v): v is number => typeof v === "number" && v > 0);
      if (nums.length > 0) return nums;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_LADDER;
}

/** Returns the charge threshold this vendor must cross before an automatic charge fires. */
function vendorThreshold(currentDeductionThreshold: string | null, ladder: number[]): number {
  if (currentDeductionThreshold !== null) {
    const v = parseFloat(currentDeductionThreshold);
    if (!isNaN(v) && v > 0) return v;
  }
  return ladder[0] ?? DEFAULT_LADDER[0];
}

/** Returns the next threshold rung after a successful charge. */
function nextRung(currentDeductionThreshold: string | null, ladder: number[]): number {
  const current = vendorThreshold(currentDeductionThreshold, ladder);
  const idx = ladder.findIndex((v) => Math.abs(v - current) < 0.001);
  if (idx === -1 || idx >= ladder.length - 1) {
    // Already at top rung (or unrecognised value) — stay there
    return ladder[ladder.length - 1] ?? current;
  }
  return ladder[idx + 1];
}

async function tick(): Promise<{ checked: number; charged: number }> {
  const ladder = await getDeductionLadder();

  // Pull all vendors with any unsettled overage plus their personal threshold.
  const rows = await db
    .select({
      vendorId:                  vendorOverageChargesTable.vendorId,
      totalUnsettled:            sql<number>`sum(${vendorOverageChargesTable.totalUsd})::float`,
      currentDeductionThreshold: vendorsTable.currentDeductionThreshold,
    })
    .from(vendorOverageChargesTable)
    .innerJoin(vendorsTable, eq(vendorOverageChargesTable.vendorId, vendorsTable.id))
    .where(isNull(vendorOverageChargesTable.settledAt))
    .groupBy(vendorOverageChargesTable.vendorId, vendorsTable.currentDeductionThreshold)
    .having(sql`sum(${vendorOverageChargesTable.totalUsd}) > 0`);

  // Filter to vendors who have crossed their personal threshold.
  const eligible = rows.filter(
    (r) => r.totalUnsettled >= vendorThreshold(r.currentDeductionThreshold, ladder),
  );

  if (eligible.length === 0) return { checked: rows.length, charged: 0 };

  logger.info({ count: eligible.length, ladder }, "[billing-threshold] Vendors crossing their charge threshold");

  let charged = 0;
  for (const row of eligible) {
    try {
      await chargeVendor(row.vendorId, row.totalUnsettled, row.currentDeductionThreshold, ladder);
      charged++;
    } catch (err) {
      logger.error({ err, vendorId: row.vendorId }, "[billing-threshold] Failed to process charge for vendor");
    }
  }
  return { checked: rows.length, charged };
}

async function chargeVendor(
  vendorId: number,
  totalUsd: number,
  currentDeductionThreshold: string | null,
  ladder: number[],
): Promise<void> {
  const threshold = vendorThreshold(currentDeductionThreshold, ladder);
  const next      = nextRung(currentDeductionThreshold, ladder);

  const [vendor] = await db
    .select({
      id:                   vendorsTable.id,
      name:                 vendorsTable.name,
      email:                vendorsTable.email,
      stripeCustomerId:     vendorsTable.stripeCustomerId,
      stripeSubscriptionId: vendorsTable.stripeSubscriptionId,
      subscriptionProvider: vendorsTable.subscriptionProvider,
    })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId));

  if (!vendor) return;

  const amountStr        = `$${totalUsd.toFixed(2)}`;
  const nextThresholdStr = `$${next.toFixed(2)}`;

  // ── Stripe vendors — create and immediately collect an off-cycle invoice ──
  if (vendor.stripeCustomerId && vendor.stripeSubscriptionId) {
    try {
      await callWithPlatformStripe(async (stripe) => {
        const invoice = await stripe.invoices.create({
          customer:     vendor.stripeCustomerId as string,
          description:  `Platform resource overage — threshold collection (${amountStr})`,
          auto_advance: true,
          metadata: {
            vendorId:  String(vendorId),
            trigger:   "threshold",
            threshold: String(threshold),
          },
        });

        await stripe.invoices.finalizeInvoice(invoice.id);
        await stripe.invoices.pay(invoice.id, { expand: ["payment_intent"] });

        // Mark the overage rows settled
        await db
          .update(vendorOverageChargesTable)
          .set({ settledAt: new Date() })
          .where(and(
            eq(vendorOverageChargesTable.vendorId, vendorId),
            isNull(vendorOverageChargesTable.settledAt),
          ));

        // Advance the vendor's personal threshold to the next rung
        await db
          .update(vendorsTable)
          .set({ currentDeductionThreshold: next.toString(), updatedAt: new Date() })
          .where(eq(vendorsTable.id, vendorId));

        logger.info(
          { vendorId, invoiceId: invoice.id, amountStr, nextThreshold: next },
          "[billing-threshold] Stripe invoice collected — threshold advanced",
        );
      });

      // Notify vendor
      await db.insert(vendorNotificationsTable).values({
        vendorId,
        type: "subscription",
        message: `Your resource usage has reached ${amountStr}. An invoice has been automatically charged to your card on file. Your next auto-charge threshold is ${nextThresholdStr}.`,
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
          </p>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            Your next automatic charge will fire when your unsettled usage reaches
            <strong>${escapeHtml(nextThresholdStr)}</strong>.
          </p>`;
        await sendEmail({
          to: vendor.email,
          subject: `Resource usage charge of ${amountStr} processed — next threshold: ${nextThresholdStr}`,
          html: wrapVendorEmail({ bodyHtml }),
        });
      }

    } catch (err) {
      logger.error({ err, vendorId }, "[billing-threshold] Stripe invoice collection failed — billing blocked");

      // Payment failed: block the vendor; do NOT advance their threshold
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

  // ── Non-Stripe vendors — notify and alert admin (no threshold advancement) ──
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
  getDeductionLadder()
    .then((ladder) => logger.info({ ladder, intervalMinutes: INTERVAL_MS / 60_000 }, "[billing-threshold] Scheduler started — checks every hour"))
    .catch(() => logger.info({ ladder: DEFAULT_LADDER, intervalMinutes: INTERVAL_MS / 60_000 }, "[billing-threshold] Scheduler started — checks every hour"));

  setInterval(async () => {
    try {
      const counts = await tick();
      await recordJobRun(JOB_NAME, { success: true, checkedCount: counts.checked, affectedCount: counts.charged });
    } catch (err) {
      logger.error({ err }, "[billing-threshold] Tick failed");
      await recordJobRun(JOB_NAME, { success: false, error: String(err) }).catch(() => {});
    }
  }, INTERVAL_MS);
}
