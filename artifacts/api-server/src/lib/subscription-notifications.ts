/**
 * Shared vendor-facing notifications for subscription tier changes back to
 * "free" (cancellation, refund, or reconciliation catching a subscription
 * that lapsed without a webhook ever arriving).
 *
 * Extracted from the Stripe webhook handler (payments/webhooks.ts) so the
 * subscription-sync reconciliation path (subscription-sync.ts) — used by
 * both the on-demand /subscription/sync route and the periodic background
 * job — can fire the exact same in-app notification + email a vendor would
 * have gotten had the webhook actually been delivered. See the
 * tier-downgrade notification pattern in project memory.
 */
import { db, vendorNotificationsTable } from "@workspace/db";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { SUBSCRIPTION_PLANS } from "../routes/subscription-upgrade";

/** Inserts the in-app "tier_change" notification vendors see for any downgrade to free. */
export async function insertTierChangeNotification(vendorId: number, message: string): Promise<void> {
  await db.insert(vendorNotificationsTable).values({
    vendorId,
    type: "tier_change",
    message,
  });
}

/** Sends the vendor a confirmation email when their subscription is cancelled/lapsed and they're downgraded to free. */
export async function sendSubscriptionCancelledEmail(
  email: string,
  vendorName: string,
  previousTier: string,
): Promise<void> {
  const plan = SUBSCRIPTION_PLANS.find((p) => p.tier === previousTier);
  const featuresHtml = plan
    ? `
      <p style="font-size: 14px; line-height: 1.6; color: #444;">You'll no longer have access to ${escapeHtml(plan.name)} features, including:</p>
      <ul style="font-size: 14px; line-height: 1.8; color: #444; padding-left: 20px;">
        ${plan.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
      </ul>`
    : "";

  const html = wrapVendorEmail({
    bodyHtml: `
      <h1 style="text-align: center; font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">Your subscription has been cancelled</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        Hi ${escapeHtml(vendorName)}, your VendorHub subscription has been cancelled and your account has been moved back to the Free tier.
      </p>
      ${featuresHtml}
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        You can resubscribe at any time from your dashboard to get these features back.
      </p>`,
  });

  const result = await sendEmail({ to: email, subject: "Your VendorHub subscription was cancelled", html });
  if (result.status !== "sent") {
    console.warn(`[subscription notifications] cancellation email did not send — reason=${result.error}`);
  }
}
