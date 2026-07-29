/**
 * Sends a "You just logged in" email to the user who logged in.
 * Recipients: the user ONLY — never to admin addresses.
 * Fire-and-forget: never blocks or fails the caller.
 */
import { sendEmail } from "./mailer";
import { logger } from "./logger";

export type LoginPlatform = "vendor-hub" | "mobile-app" | "app-store" | "app-store-user";

interface LoginInfo {
  platform: LoginPlatform;
  name: string;
  email: string;
}

export function sendLoginNotification(info: LoginInfo): void {
  void (async () => {
    try {
      const platformLabel: Record<LoginPlatform, string> = {
        "vendor-hub":     "Awa Biz Suite",
        "mobile-app":     "Awa Biz Suite (Mobile)",
        "app-store":      "Awajimaa App Store (Developer Portal)",
        "app-store-user": "Awajimaa App Store",
      };

      const label = platformLabel[info.platform];
      const now = new Date().toLocaleString("en-NG", {
        timeZone: "Africa/Lagos",
        dateStyle: "full",
        timeStyle: "short",
      });

      const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:Inter,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 0;">
  <tr><td align="center">
    <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);max-width:540px;">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#7F50FF 0%,#FF7F50 100%);padding:28px 36px 22px;">
          <p style="margin:0 0 4px;font-size:12px;color:rgba(255,255,255,0.80);letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Awajimaa Platform</p>
          <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px;">🔐 New Log In</p>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.88);">${label}</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:28px 36px 12px;">
          <p style="margin:0 0 18px;font-size:15px;color:#333;line-height:1.6;">
            Hi <strong>${info.name}</strong>,
          </p>
          <p style="margin:0 0 18px;font-size:14px;color:#555;line-height:1.7;">
            We noticed a new sign-in to your account on <strong>${label}</strong>.
            If this was you, no action is needed.
          </p>

          <!-- Details card -->
          <div style="background:#faf9ff;border:1px solid #ede8ff;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#7F50FF;text-transform:uppercase;letter-spacing:1px;">Login Details</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;font-weight:600;color:#555;padding:4px 0;width:90px;">Platform</td>
                <td style="font-size:13px;color:#111;padding:4px 0;">${label}</td>
              </tr>
              <tr>
                <td style="font-size:13px;font-weight:600;color:#555;padding:4px 0;">Time</td>
                <td style="font-size:13px;color:#111;padding:4px 0;">${now}</td>
              </tr>
            </table>
          </div>

          <p style="margin:0 0 8px;font-size:13px;color:#666;line-height:1.6;">
            If you did <strong>not</strong> log in, please
            <a href="mailto:admin@lumgwunsolutions.com" style="color:#7F50FF;">contact us immediately</a>
            so we can secure your account.
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#faf9ff;padding:16px 36px 24px;border-top:1px solid #ede8ff;">
          <p style="margin:0;font-size:12px;color:#aaa;text-align:center;">
            © 2025 Lumgwun Solutions &amp; Awajimaa Group · This is an automated security notification.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

      const text = `Hi ${info.name},\n\nA new login was detected on your ${label} account.\nTime: ${now}\n\nIf this wasn't you, please contact admin@lumgwunsolutions.com immediately.\n\n— Awajimaa Platform Security`;

      const result = await sendEmail({
        to: info.email,
        subject: `Login to ${label} — ${now}`,
        html,
        text,
      });
      logger.info({ to: info.email, platform: info.platform, result }, "[login-notify] Login notification sent");
    } catch (err) {
      logger.warn({ err, platform: info.platform }, "[login-notify] Failed to send login notification — continuing normally");
    }
  })();
}
