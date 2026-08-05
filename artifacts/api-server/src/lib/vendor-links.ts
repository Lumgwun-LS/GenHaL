/**
 * Vendor link resolver — builds the set of public URLs for a vendor
 * (website, shop, mobile app, support page) and formats them for injection
 * into AI prompts so generated captions, articles, and posts always drive
 * traffic back to the right destinations.
 *
 * Callers should fetch this once per generation request and pass the result
 * through rather than re-querying on every sub-call.
 */
import { db, vendorsTable, vendorWebsitesTable, vendorMobileAppsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface VendorLinks {
  vendorName: string;
  /** Always present — every vendor has a support page */
  supportUrl: string;
  /** Present when the vendor has built a website (has a site slug) */
  websiteUrl: string | null;
  /** Present when the vendor's site has a shop section */
  shopUrl: string | null;
  /** Present only when the vendor has a published App Store listing */
  mobileAppUrl: string | null;
}

export async function getVendorLinks(vendorId: number): Promise<VendorLinks> {
  const base = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || "";
  const origin = base ? `https://${base}` : "";

  const [vendor, website, mobileApp] = await Promise.all([
    db
      .select({ name: vendorsTable.name })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, vendorId))
      .limit(1),
    db
      .select({ slug: vendorWebsitesTable.slug })
      .from(vendorWebsitesTable)
      .where(eq(vendorWebsitesTable.vendorId, vendorId))
      .limit(1),
    db
      .select({ appSlug: vendorMobileAppsTable.appSlug, status: vendorMobileAppsTable.status })
      .from(vendorMobileAppsTable)
      .where(eq(vendorMobileAppsTable.vendorId, vendorId))
      .limit(1),
  ]);

  const vendorName = vendor[0]?.name ?? "This Business";
  const supportUrl = `${origin}/help/${vendorId}`;
  const websiteUrl = website[0]?.slug ? `${origin}/site/${website[0].slug}` : null;
  const shopUrl = websiteUrl ? `${websiteUrl}/shop` : null;
  const mobileAppUrl =
    mobileApp[0]?.status === "published"
      ? `https://awajimaaappstore.com/app/${mobileApp[0].appSlug}`
      : null;

  return { vendorName, supportUrl, websiteUrl, shopUrl, mobileAppUrl };
}

/**
 * Returns a compact context block to append to an AI system prompt.
 *
 * The instruction is deliberate: weave in only 1–2 of the most relevant links
 * for the content being generated — not all of them every time — so captions
 * read naturally rather than like a link dump.
 *
 * Returns an empty string when vendorLinks is null (graceful degradation if
 * the DB call fails or is skipped).
 */
export function linksSystemContext(links: VendorLinks | null): string {
  if (!links) return "";

  const entries: string[] = [];
  if (links.websiteUrl) entries.push(`Website: ${links.websiteUrl}`);
  if (links.shopUrl) entries.push(`Shop/Products: ${links.shopUrl}`);
  if (links.mobileAppUrl) entries.push(`Mobile App: ${links.mobileAppUrl}`);
  entries.push(`Customer Support / Contact: ${links.supportUrl}`);

  return (
    `\n\n${links.vendorName}'s links — include the 1–2 most relevant ones naturally in the content. ` +
    `Never dump all links at once. Never use placeholder brackets:\n` +
    entries.map((e) => `• ${e}`).join("\n")
  );
}

/**
 * Returns a short links footer suitable for appending to long-form content
 * (articles, academic papers). Adds a "—" separator so it reads as a proper
 * author's note rather than mid-body clutter.
 */
export function linksFooter(links: VendorLinks | null): string {
  if (!links) return "";

  const entries: string[] = [];
  if (links.websiteUrl) entries.push(`🌐 Website: ${links.websiteUrl}`);
  if (links.shopUrl) entries.push(`🛍️ Shop: ${links.shopUrl}`);
  if (links.mobileAppUrl) entries.push(`📱 Mobile App: ${links.mobileAppUrl}`);
  entries.push(`🎧 Support: ${links.supportUrl}`);

  return `\n\n---\n**${links.vendorName}** — ${entries.join("  |  ")}`;
}
