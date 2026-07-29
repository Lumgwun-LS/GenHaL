/**
 * Store Upload Trial Expiry Scheduler
 *
 * Runs daily. Finds store upload trials that have expired (expiresAt < now,
 * revokedAt IS NULL) and haven't been processed yet. For each expired trial,
 * suspends any unpaid trial-upload apps belonging to that developer, then
 * sends the developer an email listing the suspended apps and a link to pay.
 *
 * Uses recordJobRun for admin-visible job health tracking.
 */
import { db, storeUploadTrialsTable, storeAppsTable, storeDeveloperAccountsTable } from "@workspace/db";
import { eq, and, isNull, lt, isNotNull } from "drizzle-orm";
import { recordJobRun } from "./job-run-status";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { logger } from "./logger";

const JOB_NAME = "store-upload-trial-expiry";
const INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

const STORE_URL = "https://awajimaaappstore.com";

async function tick(): Promise<{ checked: number; suspended: number }> {
  const now = new Date();

  // Find expired, non-revoked trials
  const expiredTrials = await db
    .select({
      id:          storeUploadTrialsTable.id,
      developerId: storeUploadTrialsTable.developerId,
      expiresAt:   storeUploadTrialsTable.expiresAt,
    })
    .from(storeUploadTrialsTable)
    .where(and(
      isNull(storeUploadTrialsTable.revokedAt),
      lt(storeUploadTrialsTable.expiresAt, now),
    ));

  if (expiredTrials.length === 0) return { checked: 0, suspended: 0 };

  logger.info({ count: expiredTrials.length }, "[store-trial-expiry] Processing expired upload trials");

  let totalSuspended = 0;

  for (const trial of expiredTrials) {
    try {
      // Find unpaid trial apps for this developer
      const unpaidApps = await db
        .select({ id: storeAppsTable.id, name: storeAppsTable.name })
        .from(storeAppsTable)
        .where(and(
          eq(storeAppsTable.developerId, trial.developerId),
          eq(storeAppsTable.trialUpload as any, true),
          eq(storeAppsTable.publishingFeePaid, false),
          isNull((storeAppsTable as any).trialSuspendedAt),
        ));

      if (unpaidApps.length > 0) {
        // Suspend each unpaid trial app
        for (const app of unpaidApps) {
          await db.update(storeAppsTable)
            .set({ status: "suspended", trialSuspendedAt: now, updatedAt: now } as any)
            .where(eq(storeAppsTable.id, app.id));
        }
        totalSuspended += unpaidApps.length;

        // Notify the developer
        const dev = await db.query.storeDeveloperAccountsTable.findFirst({
          where: eq(storeDeveloperAccountsTable.id, trial.developerId),
        });

        if (dev?.email) {
          const appList = unpaidApps.map(a => `<li style="margin:4px 0;">${escapeHtml(a.name)}</li>`).join("");
          const html = wrapVendorEmail({
            bodyHtml: `
              <h1 style="text-align:center;font-size:20px;color:#1a1a1a;margin:0 0 16px;">
                ⚠️ Trial upload window expired
              </h1>
              <p style="font-size:14px;line-height:1.6;color:#444;">
                Hi ${escapeHtml(dev.displayName ?? "there")},
              </p>
              <p style="font-size:14px;line-height:1.6;color:#444;">
                Your trial upload window on the Awajimaa App Store expired on
                <strong>${trial.expiresAt.toLocaleDateString()}</strong>.
                The following app${unpaidApps.length > 1 ? "s have" : " has"} been suspended pending payment:
              </p>
              <ul style="font-size:14px;color:#444;padding-left:20px;margin:12px 0;">
                ${appList}
              </ul>
              <p style="font-size:14px;line-height:1.6;color:#444;">
                To restore ${unpaidApps.length > 1 ? "them" : "it"}, complete the publishing fee payment
                (₦50,000 per app) from your
                <a href="${STORE_URL}/app-store/developer" style="color:#00c853;">Developer Portal</a>.
                Once payment is confirmed, your app will be restored to the review queue automatically.
              </p>
              <p style="font-size:14px;line-height:1.6;color:#444;">
                If you believe this is an error, please contact our support team.
              </p>
            `,
          });

          await sendEmail({
            to: dev.email,
            subject: `Action required: ${unpaidApps.length > 1 ? `${unpaidApps.length} apps` : `"${unpaidApps[0]?.name}"`} suspended — publishing fee due`,
            html,
          }).catch(() => {});
        }
      }

      logger.info({ trialId: trial.id, developerId: trial.developerId, suspended: unpaidApps.length }, "[store-trial-expiry] Trial processed");
    } catch (err) {
      logger.error({ err, trialId: trial.id }, "[store-trial-expiry] Failed to process trial");
    }
  }

  return { checked: expiredTrials.length, suspended: totalSuspended };
}

export function startStoreUploadTrialScheduler(): void {
  logger.info("[store-trial-expiry] Scheduler started — runs daily");

  setInterval(async () => {
    try {
      const counts = await tick();
      await recordJobRun(JOB_NAME, { success: true, checkedCount: counts.checked, affectedCount: counts.suspended });
    } catch (err) {
      logger.error({ err }, "[store-trial-expiry] Tick failed");
      await recordJobRun(JOB_NAME, { success: false, error: String(err) }).catch(() => {});
    }
  }, INTERVAL_MS);
}
