/**
 * Feature Trial Expiry Scheduler
 *
 * Runs every hour. Finds vendors whose admin-granted feature trial has
 * expired (featureTrialExpiresAt < now), clears the trial fields, then
 * sends each affected vendor an in-app notification, push notification,
 * and email so they know they need to upgrade to keep access.
 *
 * Uses recordJobRun so the Background Jobs admin panel shows last-run
 * status and any errors without needing bespoke monitoring.
 */
import { db, vendorsTable, vendorNotificationsTable } from "@workspace/db";
import { eq, and, isNotNull, lt } from "drizzle-orm";
import { recordJobRun } from "./job-run-status";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { logger } from "./logger";
import { sendPushToVendor } from "./push";

const JOB_NAME = "feature-trial-expiry";
const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function tick(): Promise<{ expired: number }> {
  const now = new Date();

  // Find vendors whose trial has lapsed but fields haven't been cleared yet.
  const lapsed = await db
    .select({
      id:                  vendorsTable.id,
      name:                vendorsTable.name,
      email:               vendorsTable.email,
      featureTrialTier:    vendorsTable.featureTrialTier,
      featureTrialExpiresAt: vendorsTable.featureTrialExpiresAt,
    })
    .from(vendorsTable)
    .where(and(
      isNotNull(vendorsTable.featureTrialTier),
      lt(vendorsTable.featureTrialExpiresAt, now),
    ));

  if (lapsed.length === 0) return { expired: 0 };

  logger.info({ count: lapsed.length }, "[feature-trial-expiry] Expiring lapsed feature trials");

  let expired = 0;
  for (const vendor of lapsed) {
    try {
      const tierLabel = (vendor.featureTrialTier ?? "").charAt(0).toUpperCase()
        + (vendor.featureTrialTier ?? "").slice(1);

      // Clear the trial fields atomically.
      await db
        .update(vendorsTable)
        .set({
          featureTrialTier:      null,
          featureTrialExpiresAt: null,
          featureTrialGrantedBy: null,
          featureTrialGrantedAt: null,
          featureTrialNote:      null,
          updatedAt:             now,
        })
        .where(eq(vendorsTable.id, vendor.id));

      // In-app notification
      await db
        .insert(vendorNotificationsTable)
        .values({
          vendorId: vendor.id,
          type: "feature_trial_expired",
          message: `Your free ${tierLabel} plan feature trial has ended. Upgrade your plan to keep access to AI Content Studio, Website Builder, and other premium features.`,
        })
        .catch(() => {});

      // Push notification (uncategorised — account-level event)
      await sendPushToVendor(
        vendor.id,
        "Feature trial ended",
        `Your ${tierLabel} plan trial has expired. Upgrade to keep access.`,
        { screen: "pricing" },
      ).catch(() => {});

      // Email
      if (vendor.email) {
        const bodyHtml = `
          <h2 style="margin:0 0 12px;font-size:18px;color:#1a1a1a;">Your feature trial has ended</h2>
          <p style="margin:0 0 12px;color:#444;line-height:1.6;">Hi ${escapeHtml(vendor.name)},</p>
          <p style="margin:0 0 12px;color:#444;line-height:1.6;">
            Your free trial of the <strong>${escapeHtml(tierLabel)} plan</strong> features on
            Awa Biz Suite has ended.
          </p>
          <p style="margin:0 0 12px;color:#444;line-height:1.6;">
            To continue using AI Content Studio, Website Builder, Media Editor, and other
            premium features, upgrade your plan from your dashboard.
          </p>
          <p style="margin:0;color:#888;font-size:13px;">
            Questions? Reply to this email and our support team will be happy to help.
          </p>`;

        await sendEmail({
          to: vendor.email,
          subject: `Your ${tierLabel} plan feature trial has ended`,
          html: wrapVendorEmail({ bodyHtml }),
        }).catch(() => {});
      }

      expired++;
      logger.info({ vendorId: vendor.id, tier: vendor.featureTrialTier }, "[feature-trial-expiry] Trial cleared");
    } catch (err) {
      logger.error({ err, vendorId: vendor.id }, "[feature-trial-expiry] Failed to expire trial for vendor");
    }
  }

  return { expired };
}

export function startFeatureTrialExpiryScheduler(): void {
  logger.info("[feature-trial-expiry] Scheduler started — checks every hour");

  setInterval(async () => {
    try {
      const counts = await tick();
      await recordJobRun(JOB_NAME, { success: true, affectedCount: counts.expired });
    } catch (err) {
      logger.error({ err }, "[feature-trial-expiry] Tick failed");
      await recordJobRun(JOB_NAME, { success: false, error: String(err) }).catch(() => {});
    }
  }, INTERVAL_MS);
}
