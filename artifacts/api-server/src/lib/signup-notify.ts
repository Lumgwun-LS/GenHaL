/**
 * Sends a signup-alert email to ALL super admin addresses whenever a new
 * user registers on any platform (vendor-hub, mobile app, app store).
 *
 * Recipients are read from the SUPER_ADMIN_EMAILS environment variable
 * (comma-separated list of addresses). Falls back to the hard-coded address
 * when the variable is empty so local dev still receives alerts.
 *
 * Fire-and-forget: never blocks or fails the caller.
 */
import { sendEmail } from "./mailer";
import { logger } from "./logger";

/** Fallback used only when SUPER_ADMIN_EMAILS is not set. */
const FALLBACK_ADMIN_EMAIL = "Lumgwunsolutions@gmail.com";

function getSuperAdminEmails(): string[] {
  const raw = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return raw.length > 0 ? raw : [FALLBACK_ADMIN_EMAIL];
}

export type SignupPlatform = "vendor-hub" | "mobile-app" | "app-store" | "app-store-user";

interface SignupInfo {
  platform: SignupPlatform;
  name: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  userType?: string | null;
}

export function notifyAdminSignup(info: SignupInfo): void {
  void (async () => {
    try {
      const platformLabel: Record<SignupPlatform, string> = {
        "vendor-hub":     "Awa Biz Suite (Web)",
        "mobile-app":     "Awa Biz Suite (Mobile)",
        "app-store":      "Awajimaa App Store (Developer)",
        "app-store-user": "Awajimaa App Store (User)",
      };

      const label = platformLabel[info.platform];
      const now = new Date().toLocaleString("en-NG", {
        timeZone: "Africa/Lagos",
        dateStyle: "full",
        timeStyle: "short",
      });

      const rows = [
        ["Platform", label],
        ["Name", info.name],
        ["Email", info.email],
        ...(info.phone ? [["Phone", info.phone]] : []),
        ...(info.country ? [["Country", info.country]] : []),
        ...(info.userType ? [["User type", info.userType]] : []),
        ["Signed up", now],
      ] as [string, string][];

      const tableRows = rows
        .map(
          ([k, v]) => `
          <tr>
            <td style="padding:8px 12px;font-weight:600;color:#555;white-space:nowrap;border-bottom:1px solid #f0f0f0;">${k}</td>
            <td style="padding:8px 12px;color:#111;border-bottom:1px solid #f0f0f0;">${v}</td>
          </tr>`,
        )
        .join("");

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#d32f2f 0%,#f9a825 100%);padding:28px 32px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px;">🎉 New Sign-up on Awajimaa</p>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.85);">${label}</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px 12px;">
            <p style="margin:0 0 16px;font-size:14px;color:#444;">A new user just joined <strong>Awajimaa</strong>. Here are their details:</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden;">
              ${tableRows}
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px 28px;">
            <p style="margin:0;font-size:12px;color:#999;">This is an automated notification from the Awajimaa platform. Do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const recipients = getSuperAdminEmails();
      await sendEmail({
        to: recipients.join(", "),
        subject: `New sign-up: ${info.name} — ${label}`,
        html,
        text: `New sign-up on ${label}\n\nName: ${info.name}\nEmail: ${info.email}${info.phone ? `\nPhone: ${info.phone}` : ""}${info.country ? `\nCountry: ${info.country}` : ""}${info.userType ? `\nUser type: ${info.userType}` : ""}\nSigned up: ${now}`,
      });
      logger.info({ recipients, platform: info.platform }, "[signup-notify] Admin signup alert sent");
    } catch (err) {
      logger.warn({ err }, "[signup-notify] Failed to send admin signup alert — continuing normally");
    }
  })();
}
