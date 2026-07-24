/**
 * Trial Reminder Scheduler
 *
 * Runs every hour. For each vendor with an active free trial it sends upgrade
 * reminder emails at key milestones:
 *   • Day 3  — "You're 3 days in — time to upgrade"
 *   • 2 days remaining — "Only 2 days left on your trial"
 *   • 1 day remaining  — "Your trial expires tomorrow"
 *   • Expiry day       — "Your trial expires today"
 *
 * Deduplication: we check the vendor_notifications table for a prior
 * trial_reminder_* row within the last 48 h so re-runs never double-send.
 */
import { db } from "@workspace/db";
import { vendorsTable, vendorNotificationsTable } from "@workspace/db/schema";
import { and, eq, isNotNull, gt, lt, gte, sql } from "drizzle-orm";
import { logger } from "./logger";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { recordJobRun } from "./job-run-status";
import { getSiteContentBlock } from "./site-content";

const JOB_NAME = "trial-reminders";

/** Read trial settings — handles both old {durationDays} and new {defaultDurationDays} shapes. */
async function getDefaultTrialDays(): Promise<number> {
  const block = (await getSiteContentBlock("billing.trialSettings")) as Record<string, unknown> | null;
  return (
    (typeof block?.defaultDurationDays === "number" ? block.defaultDurationDays : null) ??
    (typeof block?.durationDays === "number" ? block.durationDays : null) ??
    7
  );
}

async function alreadySentToday(vendorId: number, type: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: vendorNotificationsTable.id })
    .from(vendorNotificationsTable)
    .where(
      and(
        eq(vendorNotificationsTable.vendorId, vendorId),
        eq(vendorNotificationsTable.type, type),
        gte(vendorNotificationsTable.createdAt, cutoff),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function sendReminderEmail(vendor: { email: string; name: string }, subject: string, bodyHtml: string, actionUrl: string, actionLabel: string): Promise<void> {
  const html = wrapVendorEmail({
    bodyHtml,
    action: { label: actionLabel, url: actionUrl },
  });
  await sendEmail({ to: vendor.email, subject, html });
}

async function tickTrialReminders(): Promise<void> {
  const now = new Date();

  // Vendors with an active future trial
  const vendors = await db
    .select()
    .from(vendorsTable)
    .where(
      and(
        isNotNull(vendorsTable.trialEndsAt),
        gt(vendorsTable.trialEndsAt, now),
        eq(vendorsTable.subscriptionTier, "free"),
      ),
    );

  let reminded = 0;
  const baseUrl = process.env.VITE_APP_URL ?? "https://awajimaaai.com";
  const upgradeUrl = `${baseUrl}/vendor-hub/account`;

  for (const vendor of vendors) {
    if (!vendor.trialEndsAt) continue;

    const msRemaining = vendor.trialEndsAt.getTime() - now.getTime();
    const daysRemaining = msRemaining / (1000 * 60 * 60 * 24);

    const trialStart = vendor.trialStartedAt ?? vendor.createdAt;
    const msElapsed = now.getTime() - trialStart.getTime();
    const daysElapsed = msElapsed / (1000 * 60 * 60 * 24);

    const expiryStr = vendor.trialEndsAt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const vendorName = escapeHtml(vendor.name);

    let notifType: string | null = null;
    let subject = "";
    let bodyHtml = "";
    let actionLabel = "Upgrade Now";

    if (daysElapsed >= 3 && daysElapsed < 4) {
      // Day 3 prompt
      notifType = "trial_reminder_day3";
      subject = `You're 3 days into your free trial — time to upgrade 🚀`;
      bodyHtml = `
        <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#fff">
          3 days down, trial still going strong 💪
        </h2>
        <p style="margin:0 0 10px;color:#ccc;font-size:15px">
          Hi ${vendorName}, you're 3 days into your free trial of <strong>Awa Biz Suite</strong>.
          We hope you're loving the tools!
        </p>
        <p style="margin:0 0 10px;color:#ccc;font-size:15px">
          Your trial ends on <strong>${expiryStr}</strong>. To keep access to all features —
          AI Studio, Social Hub, Voice Campaigns, and more — upgrade to a paid plan now.
        </p>
        <p style="margin:0 0 10px;color:#ccc;font-size:15px">
          <strong>No charge until your trial ends.</strong> Add your card now and we'll only bill
          you once the trial expires.
        </p>`;
    } else if (daysRemaining >= 2 && daysRemaining < 3) {
      notifType = "trial_reminder_2days";
      subject = `Only 2 days left on your Awa Biz Suite trial ⏳`;
      bodyHtml = `
        <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#fff">
          2 days left on your free trial
        </h2>
        <p style="margin:0 0 10px;color:#ccc;font-size:15px">
          Hi ${vendorName}, your free trial expires on <strong>${expiryStr}</strong> — that's
          just 2 days away.
        </p>
        <p style="margin:0 0 10px;color:#ccc;font-size:15px">
          Upgrade now to keep all your data, automations, and campaigns running without interruption.
        </p>`;
    } else if (daysRemaining >= 1 && daysRemaining < 2) {
      notifType = "trial_reminder_1day";
      subject = `Your trial expires TOMORROW — don't lose access 🔔`;
      bodyHtml = `
        <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#fff">
          Your trial expires tomorrow
        </h2>
        <p style="margin:0 0 10px;color:#ccc;font-size:15px">
          Hi ${vendorName}, this is your last reminder — your Awa Biz Suite trial ends
          <strong>tomorrow (${expiryStr})</strong>.
        </p>
        <p style="margin:0 0 10px;color:#ccc;font-size:15px">
          After expiry you'll be moved to the free tier and lose access to premium features.
          Upgrade now to avoid any disruption.
        </p>`;
    } else if (daysRemaining >= 0 && daysRemaining < 1) {
      notifType = "trial_reminder_today";
      subject = `Your Awa Biz Suite trial expires TODAY`;
      bodyHtml = `
        <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#fff">
          Today is your last day
        </h2>
        <p style="margin:0 0 10px;color:#ccc;font-size:15px">
          Hi ${vendorName}, your free trial ends <strong>today</strong>. After midnight your
          account will revert to the free tier.
        </p>
        <p style="margin:0 0 10px;color:#ccc;font-size:15px">
          Tap the button below to upgrade and keep everything running seamlessly.
        </p>`;
      actionLabel = "Upgrade Before It Expires";
    }

    if (!notifType) continue;

    // Deduplicate — skip if we already sent this milestone notification within 48 h
    if (await alreadySentToday(vendor.id, notifType)) continue;

    try {
      // In-app notification
      await db.insert(vendorNotificationsTable).values({
        vendorId: vendor.id,
        type: notifType,
        message: `${subject} — Your trial ends on ${expiryStr}. Upgrade to keep full access.`,
      });

      // Email
      await sendReminderEmail(
        { email: vendor.email, name: vendor.name },
        subject,
        bodyHtml,
        upgradeUrl,
        actionLabel,
      );

      reminded++;
      logger.info({ vendorId: vendor.id, notifType }, `[trial-reminders] Sent ${notifType}`);
    } catch (err) {
      logger.error({ err, vendorId: vendor.id }, "[trial-reminders] Failed to send reminder");
    }
  }

  logger.info({ vendorsChecked: vendors.length, reminded }, "[trial-reminders] Tick complete");
}

export function startTrialReminderScheduler(): void {
  const INTERVAL_MS = 60 * 60 * 1000; // every hour

  const run = async () => {
    try {
      await tickTrialReminders();
      await recordJobRun(JOB_NAME, { success: true });
    } catch (err) {
      logger.error({ err }, "[trial-reminders] Scheduler error");
      await recordJobRun(JOB_NAME, { success: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  logger.info("[trial-reminders] Trial reminder scheduler started — checks every hour");
  void run();
  setInterval(() => void run(), INTERVAL_MS);
}
