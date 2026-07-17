/**
 * Vendor-facing notification for a scheduled post that failed to auto-publish
 * on every platform (see post-scheduler.ts). Follows the same in-app +
 * email pattern as other background-job terminal notices (voice campaigns,
 * subscription tier downgrades) — see project memory on the scheduled-job
 * notification pattern.
 */
import { db, vendorNotificationsTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { sendPushToVendor } from "./push";
import { logger } from "./logger";

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function getPublicDomain(): string | null {
  return process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || null;
}

function socialHubLink(postId: number): string {
  const domain = getPublicDomain();
  return domain ? `https://${domain}/social?highlight=${postId}` : "#";
}

/**
 * Reminds a vendor, shortly before it auto-publishes, that a scheduled post
 * is about to go live — push + email, so they have one last chance to catch
 * a mistake. Called once per post by post-reminders.ts, which reserves the
 * send atomically before calling this (see reminderSentAt on postsTable).
 */
export async function notifyPostReminderDue(
  vendorId: number,
  postId: number,
  caption: string,
  scheduledAt: Date,
): Promise<void> {
  const when = scheduledAt.toLocaleString();
  const message = `Your post "${truncate(caption, 80)}" is scheduled to publish at ${when}. Review it now if you want to make changes first.`;

  try {
    await db.insert(vendorNotificationsTable).values({
      vendorId,
      type: "post_reminder",
      message,
    });
  } catch (err) {
    logger.error({ err, postId, vendorId }, "[post-notifications] Failed to insert post-reminder notification");
  }

  await sendPushToVendor(
    vendorId,
    "Your post is about to publish",
    `"${truncate(caption, 60)}" goes live at ${when}.`,
    { screen: "social", postId },
    "post_reminders",
  ).catch((err) => {
    logger.error({ err, postId, vendorId }, "[post-notifications] Failed to send post-reminder push");
  });

  const [vendor] = await db
    .select({ name: vendorsTable.name, email: vendorsTable.email })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId));
  if (!vendor?.email) return;

  const html = wrapVendorEmail({
    bodyHtml: `
      <h1 style="text-align: center; font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">Your post is about to go live</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        Hi ${escapeHtml(vendor.name)}, your scheduled post "<em>${escapeHtml(truncate(caption, 80))}</em>" is set to publish at
        ${escapeHtml(when)}. If you spot something you want to change, now's the time — cancel or edit it before it goes out.
      </p>`,
    action: { label: "Review this post", url: socialHubLink(postId) },
  });

  const result = await sendEmail({ to: vendor.email, subject: "Your post is about to publish", html });
  if (result.status !== "sent") {
    logger.warn({ postId, vendorId, reason: result.error }, "[post-notifications] post-reminder email did not send");
  }
}

/**
 * Notifies a vendor that their Facebook video post finished processing and is
 * now live. Called by video-publish-finalizer.ts when a "processing" publication
 * row resolves to "success".
 */
export async function notifyFacebookVideoLive(
  vendorId: number,
  postId: number,
  caption: string,
): Promise<void> {
  const message = `Your Facebook video "${truncate(caption, 80)}" finished processing and is now live.`;

  try {
    await db.insert(vendorNotificationsTable).values({
      vendorId,
      type: "post_published",
      message,
    });
  } catch (err) {
    logger.error({ err, postId, vendorId }, "[post-notifications] Failed to insert facebook-video-live notification");
  }

  await sendPushToVendor(
    vendorId,
    "Your Facebook video is live!",
    `"${truncate(caption, 60)}" finished processing and is now live.`,
    { screen: "social", postId },
  ).catch((err) => {
    logger.error({ err, postId, vendorId }, "[post-notifications] Failed to send facebook-video-live push");
  });
}

/**
 * Notifies a vendor that their Facebook video failed to process after upload.
 * Called by video-publish-finalizer.ts when a "processing" publication row
 * resolves to "failed" — whether due to a Facebook processing error, a timeout,
 * or a disconnected account.
 */
export async function notifyFacebookVideoFailed(
  vendorId: number,
  postId: number,
  caption: string,
  reason: string,
): Promise<void> {
  const message = `Your Facebook video "${truncate(caption, 80)}" failed to process: ${reason} Go to Social Hub to retry.`;

  try {
    await db.insert(vendorNotificationsTable).values({
      vendorId,
      type: "post_auto_publish_failed",
      message,
    });
  } catch (err) {
    logger.error({ err, postId, vendorId }, "[post-notifications] Failed to insert facebook-video-failed notification");
  }

  await sendPushToVendor(
    vendorId,
    "Facebook video failed to process",
    `"${truncate(caption, 60)}" could not be published. Tap to retry.`,
    { screen: "social", postId },
  ).catch((err) => {
    logger.error({ err, postId, vendorId }, "[post-notifications] Failed to send facebook-video-failed push");
  });
}

export interface PlatformFailure {
  platform: string;
  errorMessage: string | null;
}

/** Inserts the in-app notice and sends the failure email for a scheduled post that never went out. */
export async function notifyScheduledPostFailed(
  vendorId: number,
  postId: number,
  caption: string,
  failures: PlatformFailure[],
): Promise<void> {
  const summary = failures.length > 0
    ? failures.map((f) => `${f.platform}: ${f.errorMessage ?? "unknown error"}`).join("; ")
    : "an unexpected error occurred before it could publish";

  const message = `Your scheduled post didn't go out automatically — ${summary}. It's back in "Approved" so you can fix the issue and republish.`;

  try {
    await db.insert(vendorNotificationsTable).values({
      vendorId,
      type: "post_auto_publish_failed",
      message,
    });
  } catch (err) {
    logger.error({ err, postId, vendorId }, "[post-notifications] Failed to insert auto-publish-failed notification");
  }

  const [vendor] = await db
    .select({ name: vendorsTable.name, email: vendorsTable.email })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId));
  if (!vendor?.email) return;

  const failuresHtml = failures.length > 0
    ? `<ul style="font-size: 14px; line-height: 1.8; color: #444; padding-left: 20px;">
        ${failures.map((f) => `<li><strong>${escapeHtml(f.platform)}:</strong> ${escapeHtml(f.errorMessage ?? "Unknown error")}</li>`).join("")}
      </ul>`
    : `<p style="font-size: 14px; line-height: 1.6; color: #444;">An unexpected error occurred before it could publish.</p>`;

  const html = wrapVendorEmail({
    bodyHtml: `
      <h1 style="text-align: center; font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">Your scheduled post failed to publish</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        Hi ${escapeHtml(vendor.name)}, your scheduled post "<em>${escapeHtml(truncate(caption, 80))}</em>" didn't go out automatically because it failed on every selected platform:
      </p>
      ${failuresHtml}
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        It's back in your Social Hub with "Approved" status — fix the connection issue and publish it manually, or reschedule it.
      </p>`,
  });

  const result = await sendEmail({ to: vendor.email, subject: "Your scheduled post failed to publish", html });
  if (result.status !== "sent") {
    logger.warn({ postId, vendorId, reason: result.error }, "[post-notifications] auto-publish-failed email did not send");
  }
}
