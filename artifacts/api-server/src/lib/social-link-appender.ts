/**
 * Builds the link-sharing footer appended to social post captions at publish
 * time when the vendor has enabled the relevant toggles.
 *
 * Three independent parts (website, APK download, latest blog post) are each
 * gated on their own vendor flag and only included when the corresponding data
 * actually exists — a toggle that's on but has no URL silently does nothing.
 *
 * The blog-post lookup is cached per vendor for 5 minutes so a vendor with
 * many simultaneous posts scheduled at the same second doesn't hit the DB
 * once per platform per post.
 */

import { eq, and, desc } from "drizzle-orm";
import { db, vendorsTable, vendorMobileAppsTable, blogPostsTable } from "@workspace/db";
import { logger } from "./logger";

function getAppBaseUrl(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  return domain ? `https://${domain}/vendor-hub` : "https://awajimaa.com/vendor-hub";
}

/** 5-minute per-vendor cache for the most-recently-published blog post URL. */
const blogLinkCache = new Map<number, { url: string | null; expiresAt: number }>();

async function resolveLatestBlogUrl(vendorId: number): Promise<string | null> {
  const cached = blogLinkCache.get(vendorId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  try {
    const [post] = await db
      .select({ slug: blogPostsTable.slug })
      .from(blogPostsTable)
      .where(and(eq(blogPostsTable.vendorId, vendorId), eq(blogPostsTable.status, "published")))
      .orderBy(desc(blogPostsTable.publishedAt))
      .limit(1);

    const url = post ? `${getAppBaseUrl()}/public-blog/${post.slug}` : null;
    blogLinkCache.set(vendorId, { url, expiresAt: Date.now() + 5 * 60 * 1000 });
    return url;
  } catch (err) {
    logger.warn({ err, vendorId }, "[social-link-appender] Failed to fetch latest blog post — skipping blog link");
    return null;
  }
}

/**
 * Returns a compact footer string (starting with "\n\n") to append to a
 * social post caption at publish time, based on the vendor's link-sharing
 * toggle settings. Returns an empty string when no toggles are enabled or
 * no relevant URLs exist yet.
 *
 * Examples:
 *   "\n\n🌐 mystore.com | 📱 Download app: https://... | 📝 Latest: https://..."
 *   "\n\n🌐 mystore.ng"
 *   ""  (all toggles off, or no data)
 */
export async function buildSocialLinkFooter(vendorId: number): Promise<string> {
  try {
    const [vendor] = await db
      .select({
        website: vendorsTable.website,
        socialAppendWebsite: vendorsTable.socialAppendWebsite,
        socialAppendAppLink: vendorsTable.socialAppendAppLink,
        socialAppendBlogLink: vendorsTable.socialAppendBlogLink,
      })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, vendorId));

    if (!vendor) return "";

    const anyEnabled = vendor.socialAppendWebsite || vendor.socialAppendAppLink || vendor.socialAppendBlogLink;
    if (!anyEnabled) return "";

    const parts: string[] = [];

    // ── Website ─────────────────────────────────────────────────────────────
    if (vendor.socialAppendWebsite && vendor.website) {
      const domain = vendor.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
      parts.push(`🌐 ${domain}`);
    }

    // ── APK download link ────────────────────────────────────────────────────
    if (vendor.socialAppendAppLink) {
      try {
        const [app] = await db
          .select({ apkUrl: vendorMobileAppsTable.apkUrl })
          .from(vendorMobileAppsTable)
          .where(
            and(
              eq(vendorMobileAppsTable.vendorId, vendorId),
              eq(vendorMobileAppsTable.status, "published"),
            ),
          )
          .limit(1);
        if (app?.apkUrl) parts.push(`📱 Download app: ${app.apkUrl}`);
      } catch (err) {
        logger.warn({ err, vendorId }, "[social-link-appender] Failed to fetch APK URL — skipping app link");
      }
    }

    // ── Latest blog post ─────────────────────────────────────────────────────
    if (vendor.socialAppendBlogLink) {
      const blogUrl = await resolveLatestBlogUrl(vendorId);
      if (blogUrl) parts.push(`📝 Latest: ${blogUrl}`);
    }

    return parts.length > 0 ? `\n\n${parts.join(" | ")}` : "";
  } catch (err) {
    // Never let a link-append failure block publishing.
    logger.warn({ err, vendorId }, "[social-link-appender] buildSocialLinkFooter error — continuing without footer");
    return "";
  }
}

/** Invalidates the blog-link cache for a vendor (call when a new blog post is published). */
export function invalidateBlogLinkCache(vendorId: number): void {
  blogLinkCache.delete(vendorId);
}
