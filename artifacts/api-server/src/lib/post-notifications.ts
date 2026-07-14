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
import { logger } from "./logger";

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
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
