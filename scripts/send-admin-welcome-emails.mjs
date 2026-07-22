/**
 * One-time script: sends the branded welcome email to all 4 super-admin accounts.
 * Run: node scripts/send-admin-welcome-emails.mjs
 */
import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
  console.error("SMTP env vars not configured — emails skipped.");
  process.exit(0);
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: Number(SMTP_PORT) === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

const admins = [
  { to: "admin@lumgwunsolutions.com",    name: "Lumgwun Admin",       roles: ["SUPER_ADMIN", "ADMIN", "AWAJIMA"] },
  { to: "awajimaaapps@gmail.com",         name: "Awajimaa Apps",       roles: ["SUPER_ADMIN", "ADMIN", "AWAJIMA"] },
  { to: "lumgwuns@gmail.com",             name: "Lumgwun Solutions",   roles: ["SUPER_ADMIN", "ADMIN", "AWAJIMA"] },
  { to: "lumgwunsolutions@gmail.com",     name: "Lumgwun Solutions",   roles: ["SUPER_ADMIN", "ADMIN", "AWAJIMA"] },
];

function buildHtml(name, roles) {
  const roleChips = roles
    .map(r => `<span style="display:inline-block;background:#7F50FF;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin:2px;">${r}</span>`)
    .join(" ");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:Inter,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);max-width:600px;">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#7F50FF 0%,#FF7F50 100%);padding:36px 40px 28px;">
          <p style="margin:0 0 4px;font-size:13px;color:rgba(255,255,255,0.80);letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Lumgwun Solutions &amp; Awajimaa Group</p>
          <p style="margin:0;font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px;">Welcome, ${name}! 🎉</p>
          <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.88);">Your super-admin account is ready on <strong>Awa Biz Suite &amp; Awajimaa App Store</strong>.</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:32px 40px 20px;">
          <p style="margin:0 0 18px;font-size:15px;color:#333;line-height:1.6;">
            Hi <strong>${name}</strong>,<br><br>
            You have been granted administrator access to the Awajimaa platform ecosystem.
            Your account is set up and ready to use across all our platforms.
          </p>

          <!-- Roles -->
          <div style="background:#faf9ff;border:1px solid #ede8ff;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#7F50FF;text-transform:uppercase;letter-spacing:1px;">Your Roles</p>
            ${roleChips}
          </div>

          <p style="margin:0 0 14px;font-size:14px;color:#444;font-weight:600;">Our Platforms</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td width="48%" style="padding:0 6px 10px 0;vertical-align:top;">
                <div style="background:#f9f9fc;border-radius:10px;padding:14px 16px;border-left:4px solid #7F50FF;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#7F50FF;text-transform:uppercase;">Lumgwun Solutions</p>
                  <a href="https://lumgwunsolutions.com" style="font-size:13px;color:#333;text-decoration:none;">lumgwunsolutions.com</a>
                </div>
              </td>
              <td width="48%" style="padding:0 0 10px 6px;vertical-align:top;">
                <div style="background:#f9f9fc;border-radius:10px;padding:14px 16px;border-left:4px solid #FF7F50;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FF7F50;text-transform:uppercase;">Awajimaa Schools</p>
                  <a href="https://awajimaaschools.com" style="font-size:13px;color:#333;text-decoration:none;">awajimaaschools.com</a>
                </div>
              </td>
            </tr>
            <tr>
              <td width="48%" style="padding:0 6px 10px 0;vertical-align:top;">
                <div style="background:#f9f9fc;border-radius:10px;padding:14px 16px;border-left:4px solid #7F50FF;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#7F50FF;text-transform:uppercase;">Awajimaa Hosting</p>
                  <a href="https://awajimaahosting.com" style="font-size:13px;color:#333;text-decoration:none;">awajimaahosting.com</a>
                </div>
              </td>
              <td width="48%" style="padding:0 0 10px 6px;vertical-align:top;">
                <div style="background:#f9f9fc;border-radius:10px;padding:14px 16px;border-left:4px solid #FF7F50;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FF7F50;text-transform:uppercase;">Awajimaa AI</p>
                  <a href="https://awajimaaai.com" style="font-size:13px;color:#333;text-decoration:none;">awajimaaai.com</a>
                </div>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding:0 0 10px 0;">
                <div style="background:#f9f9fc;border-radius:10px;padding:14px 16px;border-left:4px solid #7F50FF;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#7F50FF;text-transform:uppercase;">Awajimaa App</p>
                  <span style="font-size:13px;color:#333;">Download from the Play Store or visit the </span>
                  <a href="https://awajimaaappstore.com" style="font-size:13px;color:#7F50FF;text-decoration:none;font-weight:600;">Awajimaa App Store →</a>
                </div>
              </td>
            </tr>
          </table>

          <!-- Social -->
          <p style="margin:0 0 12px;font-size:14px;color:#444;font-weight:600;">Follow Us</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td width="33%" style="padding:0 4px 8px 0;text-align:center;">
                <a href="https://www.instagram.com/lumgwunsolutionsgroup" style="display:block;background:#f9f9fc;border-radius:8px;padding:10px;text-decoration:none;">
                  <span style="font-size:20px;">📸</span><br><span style="font-size:11px;color:#555;font-weight:600;">Instagram</span>
                </a>
              </td>
              <td width="33%" style="padding:0 4px 8px;text-align:center;">
                <a href="https://tiktok.com/@lumgwun.solutions" style="display:block;background:#f9f9fc;border-radius:8px;padding:10px;text-decoration:none;">
                  <span style="font-size:20px;">🎵</span><br><span style="font-size:11px;color:#555;font-weight:600;">TikTok</span>
                </a>
              </td>
              <td width="33%" style="padding:0 0 8px 4px;text-align:center;">
                <a href="https://t.me/AwaApp" style="display:block;background:#f9f9fc;border-radius:8px;padding:10px;text-decoration:none;">
                  <span style="font-size:20px;">✈️</span><br><span style="font-size:11px;color:#555;font-weight:600;">Telegram</span>
                </a>
              </td>
            </tr>
            <tr>
              <td width="33%" style="padding:0 4px 0 0;text-align:center;">
                <a href="https://web.facebook.com/LUMGWUNSOLUTIONS/" style="display:block;background:#f9f9fc;border-radius:8px;padding:10px;text-decoration:none;">
                  <span style="font-size:20px;">👤</span><br><span style="font-size:11px;color:#555;font-weight:600;">Facebook</span>
                </a>
              </td>
              <td width="33%" style="padding:0 4px;text-align:center;">
                <a href="https://www.linkedin.com/company/lumgwun-solutions-group/" style="display:block;background:#f9f9fc;border-radius:8px;padding:10px;text-decoration:none;">
                  <span style="font-size:20px;">💼</span><br><span style="font-size:11px;color:#555;font-weight:600;">LinkedIn</span>
                </a>
              </td>
              <td width="33%" style="padding:0 0 0 4px;text-align:center;">
                <a href="https://x.com/awajimaaApp" style="display:block;background:#f9f9fc;border-radius:8px;padding:10px;text-decoration:none;">
                  <span style="font-size:20px;">𝕏</span><br><span style="font-size:11px;color:#555;font-weight:600;">X / Twitter</span>
                </a>
              </td>
            </tr>
          </table>

          <!-- Contact -->
          <div style="background:#f4f4f8;border-radius:10px;padding:18px 20px;margin-bottom:12px;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#7F50FF;text-transform:uppercase;letter-spacing:1px;">Contact Us</p>
            <p style="margin:0 0 6px;font-size:13px;color:#444;">📍 <strong>USA:</strong> 16501 Shady Grove Road, Suite 8885, Gaithersburg, MD 20898</p>
            <p style="margin:0 0 6px;font-size:13px;color:#444;">📍 <strong>Nigeria:</strong> Pyale Workhub, 21 Bekwere Wosu Street, D-Line, Diobu, Port Harcourt, Rivers State</p>
            <p style="margin:0 0 6px;font-size:13px;color:#444;">📞 +1 917 821 8640 &nbsp;|&nbsp; +234 703 884 3102</p>
            <p style="margin:0;font-size:13px;color:#444;">✉️
              <a href="mailto:admin@lumgwunsolutions.com" style="color:#7F50FF;">admin@lumgwunsolutions.com</a> &nbsp;|&nbsp;
              <a href="mailto:awajimaaapps@gmail.com" style="color:#7F50FF;">awajimaaapps@gmail.com</a>
            </p>
          </div>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#faf9ff;padding:20px 40px 28px;border-top:1px solid #ede8ff;">
          <p style="margin:0 0 8px;font-size:12px;color:#999;text-align:center;">© 2025 Lumgwun Solutions &amp; Awajimaa Group. All rights reserved.</p>
          <p style="margin:0;font-size:11px;color:#bbb;text-align:center;">
            <a href="https://docs.google.com/document/d/1GQ7NOKDXFORu1vLKtP7EMpXZlIA1NIR6/edit" style="color:#999;text-decoration:none;">Privacy Policy</a>
            &nbsp;·&nbsp;
            <a href="https://www.f6s.com/lumgwun-solutions-group" style="color:#999;text-decoration:none;">F6S Profile</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function buildText(name, roles) {
  return `Welcome to the Awajimaa Platform, ${name}!

Your super-admin account is now active.
Roles: ${roles.join(", ")}

OUR PLATFORMS
─────────────
• Lumgwun Solutions & Awajimaa Group: https://lumgwunsolutions.com
• Awajimaa Schools: https://awajimaaschools.com
• Awajimaa Hosting: https://awajimaahosting.com
• Awajimaa App Store: https://awajimaaappstore.com
• Awajimaa AI: https://awajimaaai.com

FOLLOW US
─────────
Instagram: https://www.instagram.com/lumgwunsolutionsgroup
TikTok:    https://tiktok.com/@lumgwun.solutions
Telegram:  https://t.me/AwaApp
Facebook:  https://web.facebook.com/LUMGWUNSOLUTIONS/
LinkedIn:  https://www.linkedin.com/company/lumgwun-solutions-group/
X:         https://x.com/awajimaaApp
F6S:       https://www.f6s.com/lumgwun-solutions-group

CONTACT US
──────────
USA:     16501 Shady Grove Road, Suite 8885, Gaithersburg, MD 20898
Nigeria: Pyale Workhub, 21 Bekwere Wosu Street, D-Line, Diobu, Port Harcourt, Rivers State
Phone:   +1 917 821 8640 | +234 703 884 3102
Email:   admin@lumgwunsolutions.com | awajimaaapps@gmail.com
Privacy: https://docs.google.com/document/d/1GQ7NOKDXFORu1vLKtP7EMpXZlIA1NIR6/edit
`;
}

for (const admin of admins) {
  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: admin.to,
      subject: "Welcome to Awajimaa — Your Admin Account is Ready",
      html: buildHtml(admin.name, admin.roles),
      text: buildText(admin.name, admin.roles),
    });
    console.log(`✅ Sent to ${admin.to}`);
  } catch (err) {
    console.error(`❌ Failed to send to ${admin.to}: ${err.message}`);
  }
}
