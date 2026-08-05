/**
 * Shared HTML wrapper for every vendor-facing email.
 *
 * Every email sent to a vendor should go through `wrapVendorEmail` so that
 * social links and cross-promoted service links are always present, instead
 * of every call site re-implementing its own footer (which is how earlier
 * emails — birthday, account deletion — drifted out of sync).
 */

const SOCIAL_LINKS: { label: string; url: string }[] = [
  { label: "Instagram", url: "https://www.instagram.com/lumgwunsolutionsgroup" },
  { label: "TikTok", url: "https://tiktok.com/@lumgwun.solutions" },
  { label: "Telegram", url: "https://t.me/AwaApp" },
  { label: "F6S", url: "https://www.f6s.com/lumgwun-solutions-group" },
  { label: "LinkedIn", url: "https://www.linkedin.com/company/lumgwun-solutions-group/" },
  { label: "Facebook", url: "https://web.facebook.com/LUMGWUNSOLUTIONS/" },
  { label: "X", url: "https://x.com/awajimaaApp" },
];

const SERVICE_LINKS: { label: string; url: string }[] = [
  { label: "Awajimaa Schools & Education Mgt. Platform", url: "https://www.awajimaaschools.com" },
  { label: "Awajimaa Hosting", url: "https://www.awajimaahosting.com" },
];

const BRAND_NAME = "Awa Biz Suite";

export type EmailAction = {
  label: string;
  url: string;
};

/**
 * Wraps a piece of body HTML with a consistent header, an optional call-to-action
 * button, and a footer with social + cross-service links. `bodyHtml` should be the
 * content-specific part only (heading, message, etc.) — no outer <div>/wrapper.
 *
 * Pass `trackingPixelUrl` (from `buildPixelUrl(token)`) to inject a 1×1 open-tracking
 * pixel at the bottom of the email. Omit for emails that don't need tracking.
 */
export function wrapVendorEmail(opts: { bodyHtml: string; action?: EmailAction; trackingPixelUrl?: string }): string {
  const { bodyHtml, action, trackingPixelUrl } = opts;

  const actionHtml = action
    ? `
      <div style="text-align: center; margin: 28px 0;">
        <a href="${escapeAttr(action.url)}"
           style="display: inline-block; background: #7F50FF; color: #ffffff; text-decoration: none;
                  font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px;">
          ${escapeHtml(action.label)}
        </a>
      </div>`
    : "";

  const socialLinksHtml = SOCIAL_LINKS
    .map((s) => `<a href="${escapeAttr(s.url)}" style="color: #7F50FF; text-decoration: none; margin: 0 8px; font-size: 12px;">${escapeHtml(s.label)}</a>`)
    .join("");

  const serviceLinksHtml = SERVICE_LINKS
    .map((s) => `<a href="${escapeAttr(s.url)}" style="color: #999; text-decoration: none; margin: 0 8px; font-size: 11px;">${escapeHtml(s.label)}</a>`)
    .join(" &middot; ");

  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff;">
      ${bodyHtml}
      ${actionHtml}
      <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0 16px;" />
      <p style="text-align: center; font-size: 12px; color: #999; margin: 0 0 12px;">${escapeHtml(BRAND_NAME)}</p>
      <p style="text-align: center; margin: 0 0 10px;">${socialLinksHtml}</p>
      <p style="text-align: center; margin: 0;">${serviceLinksHtml}</p>
      ${trackingPixelUrl ? `<img src="${escapeAttr(trackingPixelUrl)}" width="1" height="1" style="display:block;width:1px;height:1px;overflow:hidden;opacity:0;border:0" alt="">` : ""}
    </div>`;
}

/** Exported so callers can safely interpolate vendor-controlled values (name, caption, etc.) into bodyHtml before passing it in — wrapVendorEmail itself renders bodyHtml raw. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
