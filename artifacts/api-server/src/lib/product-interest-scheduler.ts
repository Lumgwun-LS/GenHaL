/**
 * Product Interest Reminder Scheduler
 *
 * Every 2 hours, finds CRM leads who:
 *   - Have an email address (identified)
 *   - Have at least one product they viewed or added to cart (interestedProductIds not null)
 *   - Have NOT received a product reminder yet (productReminderSentAt is null)
 *   - Are NOT already a converted customer (no completed/paid order with this email for this vendor)
 *
 * Sends a "you were looking at this" email with product thumbnails and a direct
 * shop link so they can pick up where they left off.
 */
import { db, leadsTable, productsTable, vendorsTable, ordersTable } from "@workspace/db";
import { eq, and, isNotNull, isNull, sql } from "drizzle-orm";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { recordJobRun } from "./job-run-status";
import { logger } from "./logger";

const JOB_NAME = "product-interest-reminder";
const INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

function getAppBaseUrl(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  return domain ? `https://${domain}` : "https://app.awabiz.com";
}

function buildShopUrl(shopSlug: string | null | undefined, productId?: number): string {
  const base = getAppBaseUrl();
  const slug = shopSlug ?? "";
  const path = slug ? `/vendor-hub/site/${encodeURIComponent(slug)}` : "/vendor-hub";
  return productId ? `${base}${path}?product=${productId}` : `${base}${path}`;
}

async function sendProductInterestReminders(): Promise<{ checked: number; sent: number }> {
  // Find leads that are ready for a reminder
  const candidates = await db
    .select({
      id: leadsTable.id,
      vendorId: leadsTable.vendorId,
      name: leadsTable.name,
      email: leadsTable.email,
      interestedProductIds: leadsTable.interestedProductIds,
      shopSlug: leadsTable.shopSlug,
    })
    .from(leadsTable)
    .where(
      and(
        isNotNull(leadsTable.email),
        isNotNull(leadsTable.interestedProductIds),
        isNull(leadsTable.productReminderSentAt),
      ),
    );

  if (candidates.length === 0) return { checked: 0, sent: 0 };

  let sent = 0;

  for (const lead of candidates) {
    try {
      if (!lead.email) continue;

      // Parse interested product IDs
      let productIds: number[] = [];
      try {
        const parsed = JSON.parse(lead.interestedProductIds ?? "[]");
        productIds = Array.isArray(parsed) ? parsed.map(Number).filter(Boolean).slice(0, 4) : [];
      } catch { continue; }
      if (productIds.length === 0) continue;

      // Check: skip if they already have a completed/paid order (they converted)
      const [converted] = await db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.vendorId, lead.vendorId),
            eq(ordersTable.customerEmail, lead.email),
            eq(ordersTable.paymentStatus, "paid"),
          ),
        );
      if (converted) {
        // Mark as reminded so we don't keep checking — they're already a customer
        await db.update(leadsTable).set({ productReminderSentAt: new Date() }).where(eq(leadsTable.id, lead.id));
        continue;
      }

      // Fetch product details (up to 4)
      const products = await db
        .select({
          id: productsTable.id,
          name: productsTable.name,
          price: productsTable.price,
          imageUrl: productsTable.imageUrl,
          category: productsTable.category,
        })
        .from(productsTable)
        .where(
          and(
            eq(productsTable.vendorId, lead.vendorId),
            sql`${productsTable.id} = ANY(ARRAY[${sql.join(productIds.map(id => sql`${id}`), sql`, `)}]::int[])`,
          ),
        );

      if (products.length === 0) continue;

      // Fetch vendor name
      const [vendor] = await db
        .select({ name: vendorsTable.name })
        .from(vendorsTable)
        .where(eq(vendorsTable.id, lead.vendorId));
      if (!vendor) continue;

      // Atomically claim the send slot
      const [claimed] = await db
        .update(leadsTable)
        .set({ productReminderSentAt: new Date() })
        .where(and(eq(leadsTable.id, lead.id), isNull(leadsTable.productReminderSentAt)))
        .returning({ id: leadsTable.id });
      if (!claimed) continue;

      const firstName = lead.name?.split(" ")[0] ?? "there";
      const shopUrl = buildShopUrl(lead.shopSlug);

      // Build product cards HTML
      const productCardsHtml = products.map(p => {
        const productUrl = buildShopUrl(lead.shopSlug, p.id);
        const priceStr = `${Number(p.price).toFixed(2)}`;
        const imgHtml = p.imageUrl
          ? `<img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)}" style="width:100%;height:140px;object-fit:cover;border-radius:8px 8px 0 0;display:block;" />`
          : `<div style="width:100%;height:140px;background:#f3f4f6;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:center;font-size:36px;">🛍️</div>`;
        return `
          <td style="width:48%;vertical-align:top;padding:4px;">
            <a href="${escapeHtml(productUrl)}" style="display:block;text-decoration:none;color:inherit;border:1px solid #f0f0f0;border-radius:10px;overflow:hidden;">
              ${imgHtml}
              <div style="padding:10px 12px;">
                <p style="font-size:13px;font-weight:700;margin:0 0 4px;color:#111827;">${escapeHtml(p.name)}</p>
                <p style="font-size:15px;font-weight:900;margin:0;color:#7c3aed;">${escapeHtml(priceStr)}</p>
              </div>
            </a>
          </td>`;
      }).join("");

      // Wrap in rows of 2
      const rows: string[] = [];
      for (let i = 0; i < products.length; i += 2) {
        const cells = productCardsHtml.split("</td>").filter(Boolean).map(s => s + "</td>");
        rows.push(`<tr>${cells.slice(i, i + 2).join("")}</tr>`);
      }

      const bodyHtml = `
        <h2 style="font-size:20px;font-weight:700;margin:0 0 8px;">
          Hey ${escapeHtml(firstName)}, you left something behind 👀
        </h2>
        <p style="color:#555;margin:0 0 20px;">
          You were browsing <strong>${escapeHtml(vendor.name)}</strong> and showed interest in
          ${products.length === 1 ? "this item" : "these items"}. They're still available — don't miss out!
        </p>
        <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:20px;">
          ${rows.join("")}
        </table>
        <p style="color:#888;font-size:13px;margin:0 0 20px;">
          Click any product above to go straight to it, or browse the full shop below.
        </p>`;

      const html = wrapVendorEmail({
        bodyHtml,
        action: { label: "Continue Shopping →", url: shopUrl },
      });

      const result = await sendEmail({
        to: lead.email,
        subject: `You left something in ${vendor.name}'s shop`,
        html,
      });

      if (result.status !== "failed") {
        sent++;
        logger.info({ leadId: lead.id, to: lead.email, products: products.length }, "[product-interest-reminder] Reminder sent");
      } else {
        logger.warn({ leadId: lead.id, error: result.error }, "[product-interest-reminder] Email failed");
      }
    } catch (err) {
      logger.error({ err, leadId: lead.id }, "[product-interest-reminder] Error");
    }
  }

  return { checked: candidates.length, sent };
}

export function startProductInterestScheduler(): void {
  const tick = async () => {
    try {
      const result = await sendProductInterestReminders();
      await recordJobRun(JOB_NAME, { success: true, checkedCount: result.checked, affectedCount: result.sent });
      logger.info(result, "[product-interest-reminder] Tick complete");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await recordJobRun(JOB_NAME, { success: false, error: msg }).catch(() => {});
      logger.error({ err }, "[product-interest-reminder] Tick failed");
    }
  };

  void tick();
  setInterval(tick, INTERVAL_MS);
  logger.info({ intervalHours: 2 }, "[product-interest-reminder] Scheduler started");
}
