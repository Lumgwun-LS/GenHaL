/**
 * Customer-facing transactional emails.
 *
 * sendCustomerOrderConfirmationEmail — sent immediately after a customer
 *   places an order (before payment completes) so they have a receipt and
 *   a link to complete their Awa Biz Suite profile.
 *
 * sendCustomerProfileCompletionEmail — sent when a new customer account is
 *   created with profileCompleted=false (e.g. Google/Gmail signup, which only
 *   provides name + email but no address/phone).
 */

import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";

function getAppBaseUrl(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  return domain ? `https://${domain}` : "https://app.awabiz.com";
}

const PROFILE_URL = `${getAppBaseUrl()}/vendor-hub/customer/profile`;

// ── Order confirmation ────────────────────────────────────────────────────────

export interface OrderConfirmationOpts {
  customerEmail: string;
  customerName: string;
  orderId: number;
  vendorName: string;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
  totalAmount: number;
  currency: string;
  shippingAddress: string;
}

export async function sendCustomerOrderConfirmationEmail(
  opts: OrderConfirmationOpts,
): Promise<void> {
  const { customerEmail, customerName, orderId, vendorName, items, totalAmount, currency, shippingAddress } = opts;

  const itemsHtml = items
    .map(
      (i) =>
        `<tr>
          <td style="padding:6px 0;font-size:13px;color:#333;">${escapeHtml(i.name)}</td>
          <td style="padding:6px 0;font-size:13px;color:#666;text-align:center;">${i.quantity}</td>
          <td style="padding:6px 0;font-size:13px;color:#333;text-align:right;">${currency} ${(i.unitPrice * i.quantity).toFixed(2)}</td>
        </tr>`,
    )
    .join("");

  const bodyHtml = `
    <h2 style="margin:0 0 6px;font-size:20px;color:#1a1a1a;">Your order is confirmed 🎉</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#555;">
      Hi ${escapeHtml(customerName)}, <strong>${escapeHtml(vendorName)}</strong> has received your order.
      Complete your payment to get it shipped to you.
    </p>

    <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#999;">Order #${orderId}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <thead>
          <tr>
            <th style="text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#999;padding-bottom:6px;">Item</th>
            <th style="text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#999;padding-bottom:6px;">Qty</th>
            <th style="text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#999;padding-bottom:6px;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding-top:10px;font-size:14px;font-weight:700;color:#1a1a1a;border-top:1px solid #eee;">Total</td>
            <td style="padding-top:10px;font-size:14px;font-weight:700;color:#7F50FF;text-align:right;border-top:1px solid #eee;">${currency} ${totalAmount.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <p style="margin:0 0 20px;font-size:13px;color:#555;">
      <strong>Delivery to:</strong><br/>${escapeHtml(shippingAddress)}
    </p>

    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;"/>
    <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1a1a1a;">Save your profile for faster future purchases</p>
    <p style="margin:0;font-size:13px;color:#555;">
      Create a free Awa Biz Suite account with your email to track orders, access your purchase history, and check out in seconds next time.
    </p>`;

  const html = wrapVendorEmail({
    bodyHtml,
    action: { label: "Complete your profile →", url: PROFILE_URL },
  });

  await sendEmail({
    to: customerEmail,
    subject: `Order #${orderId} confirmed — ${vendorName}`,
    html,
  }).catch(() => {}); // best-effort — never block the checkout
}

// ── Profile completion ────────────────────────────────────────────────────────

export interface ProfileCompletionOpts {
  customerEmail: string;
  customerName: string;
}

export async function sendCustomerProfileCompletionEmail(
  opts: ProfileCompletionOpts,
): Promise<void> {
  const { customerEmail, customerName } = opts;

  const bodyHtml = `
    <h2 style="margin:0 0 6px;font-size:20px;color:#1a1a1a;">Welcome, ${escapeHtml(customerName)}! 👋</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#555;">
      Your Awa Biz Suite account was created using your Google account. To make sure vendors
      can reach you and deliver your orders, please complete your profile by adding your:
    </p>
    <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;color:#555;line-height:1.8;">
      <li>Delivery address</li>
      <li>Phone number</li>
      <li>City &amp; country</li>
    </ul>
    <p style="margin:0;font-size:13px;color:#555;">
      It only takes 30 seconds and ensures vendors can always reach you with order updates.
    </p>`;

  const html = wrapVendorEmail({
    bodyHtml,
    action: { label: "Complete your profile →", url: PROFILE_URL },
  });

  await sendEmail({
    to: customerEmail,
    subject: "Complete your Awa Biz Suite profile",
    html,
  }).catch(() => {}); // best-effort
}
