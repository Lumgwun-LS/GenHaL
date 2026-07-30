/**
 * Public Blog routes — no Clerk auth required.
 *
 * GET  /public/blog/:siteSlug/posts              — list published posts for a vendor
 * GET  /public/blog/:siteSlug/:postSlug          — get single published post (increments viewCount)
 * POST /public/blog/:siteSlug/:postSlug/like     — toggle like (idempotent by visitorToken cookie)
 * POST /public/blog/:siteSlug/:postSlug/comments — post comment + upsert CRM lead
 *
 * Vendor is resolved by `vendor_websites.slug` (same slug used for /site/:slug pages).
 */

import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  vendorsTable,
  blogPostsTable,
  blogCommentsTable,
  blogPostLikesTable,
  blogCommenterBansTable,
  leadsTable,
  personActivitiesTable,
  vendorWebsitesTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { randomBytes } from "node:crypto";
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../lib/email-branding";

function getAppBaseUrl(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  return domain ? `https://${domain}` : "https://app.awabiz.com";
}

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

/** Resolve vendor from vendor_websites.slug.  Does NOT require published=true so
 *  vendors without a live website can still have a public blog. */
async function resolveVendorBySiteSlug(siteSlug: string) {
  const [row] = await db
    .select({ vendorId: vendorWebsitesTable.vendorId })
    .from(vendorWebsitesTable)
    .where(eq(vendorWebsitesTable.slug, siteSlug));
  if (!row) return null;
  const [vendor] = await db
    .select({ id: vendorsTable.id, name: vendorsTable.name, logoUrl: vendorsTable.logoUrl, description: vendorsTable.description })
    .from(vendorsTable)
    .where(and(eq(vendorsTable.id, row.vendorId), eq(vendorsTable.status, "active")));
  return vendor ?? null;
}

function getOrCreateVisitorToken(req: any, res: any): string {
  const existing = req.cookies?.["blog_visitor"] as string | undefined;
  if (existing && /^[a-f0-9]{20}$/.test(existing)) return existing;
  const token = randomBytes(10).toString("hex");
  res.cookie("blog_visitor", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    secure: process.env.NODE_ENV === "production",
  });
  return token;
}

function serializePost(p: typeof blogPostsTable.$inferSelect) {
  return {
    ...p,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    createdAt:   p.createdAt.toISOString(),
    updatedAt:   p.updatedAt.toISOString(),
  };
}

function serializeComment(c: typeof blogCommentsTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

// ── GET /public/blog/:siteSlug/posts ─────────────────────────────────────────
router.get("/public/blog/:siteSlug/posts", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendorBySiteSlug(req.params.siteSlug);
    if (!vendor) return void res.status(404).json({ error: "Blog not found" });

    const posts = await db
      .select({
        id: blogPostsTable.id,
        title: blogPostsTable.title,
        slug: blogPostsTable.slug,
        coverImageUrl: blogPostsTable.coverImageUrl,
        excerpt: blogPostsTable.excerpt,
        keywords: blogPostsTable.keywords,
        viewCount: blogPostsTable.viewCount,
        likeCount: blogPostsTable.likeCount,
        commentCount: blogPostsTable.commentCount,
        publishedAt: blogPostsTable.publishedAt,
        createdAt: blogPostsTable.createdAt,
        updatedAt: blogPostsTable.updatedAt,
      })
      .from(blogPostsTable)
      .where(and(
        eq(blogPostsTable.vendorId, vendor.id),
        eq(blogPostsTable.status, "published"),
        eq(blogPostsTable.suspendedFromGlobal, false),
      ))
      .orderBy(desc(blogPostsTable.publishedAt))
      .limit(20);

    res.json({
      vendor: { name: vendor.name, logoUrl: vendor.logoUrl, description: vendor.description },
      posts: posts.map((p) => ({
        ...p,
        publishedAt: p.publishedAt?.toISOString() ?? null,
        createdAt:   p.createdAt.toISOString(),
        updatedAt:   p.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /public/blog/:siteSlug/posts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /public/blog/:siteSlug/:postSlug ─────────────────────────────────────
router.get("/public/blog/:siteSlug/:postSlug", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendorBySiteSlug(req.params.siteSlug);
    if (!vendor) return void res.status(404).json({ error: "Blog not found" });

    const [post] = await db
      .select()
      .from(blogPostsTable)
      .where(
        and(
          eq(blogPostsTable.vendorId, vendor.id),
          eq(blogPostsTable.slug, req.params.postSlug),
          eq(blogPostsTable.status, "published"),
          eq(blogPostsTable.suspendedFromGlobal, false),
        )
      );
    if (!post) return void res.status(404).json({ error: "Post not found" });

    // Increment view count (fire-and-forget)
    void db
      .update(blogPostsTable)
      .set({ viewCount: sql`${blogPostsTable.viewCount} + 1` })
      .where(eq(blogPostsTable.id, post.id));

    // Load comments
    const comments = await db
      .select()
      .from(blogCommentsTable)
      .where(eq(blogCommentsTable.postId, post.id))
      .orderBy(desc(blogCommentsTable.createdAt));

    // Check if visitor already liked this post
    const visitorToken = getOrCreateVisitorToken(req, res);
    const [alreadyLiked] = await db
      .select({ id: blogPostLikesTable.id })
      .from(blogPostLikesTable)
      .where(and(eq(blogPostLikesTable.postId, post.id), eq(blogPostLikesTable.visitorToken, visitorToken)));

    res.json({
      vendor: { name: vendor.name, logoUrl: vendor.logoUrl, description: vendor.description },
      post: serializePost(post),
      comments: comments.map(serializeComment),
      hasLiked: !!alreadyLiked,
    });
  } catch (err) {
    logger.error({ err }, "GET /public/blog/:siteSlug/:postSlug error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /public/blog/:siteSlug/:postSlug/like ────────────────────────────────
router.post("/public/blog/:siteSlug/:postSlug/like", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendorBySiteSlug(req.params.siteSlug);
    if (!vendor) return void res.status(404).json({ error: "Blog not found" });

    const [post] = await db
      .select({ id: blogPostsTable.id, likeCount: blogPostsTable.likeCount })
      .from(blogPostsTable)
      .where(
        and(
          eq(blogPostsTable.vendorId, vendor.id),
          eq(blogPostsTable.slug, req.params.postSlug),
          eq(blogPostsTable.status, "published")
        )
      );
    if (!post) return void res.status(404).json({ error: "Post not found" });

    const visitorToken = getOrCreateVisitorToken(req, res);

    // Try to insert like; if already exists, remove it (toggle)
    const [existing] = await db
      .select({ id: blogPostLikesTable.id })
      .from(blogPostLikesTable)
      .where(and(eq(blogPostLikesTable.postId, post.id), eq(blogPostLikesTable.visitorToken, visitorToken)));

    let liked: boolean;
    if (existing) {
      // Unlike
      await db.delete(blogPostLikesTable).where(eq(blogPostLikesTable.id, existing.id));
      await db
        .update(blogPostsTable)
        .set({ likeCount: sql`GREATEST(0, ${blogPostsTable.likeCount} - 1)` })
        .where(eq(blogPostsTable.id, post.id));
      liked = false;
    } else {
      // Like
      await db.insert(blogPostLikesTable).values({ postId: post.id, visitorToken });
      await db
        .update(blogPostsTable)
        .set({ likeCount: sql`${blogPostsTable.likeCount} + 1` })
        .where(eq(blogPostsTable.id, post.id));
      liked = true;
    }

    const [updated] = await db
      .select({ likeCount: blogPostsTable.likeCount })
      .from(blogPostsTable)
      .where(eq(blogPostsTable.id, post.id));

    res.json({ liked, likeCount: updated?.likeCount ?? 0 });
  } catch (err) {
    logger.error({ err }, "POST /public/blog/:siteSlug/:postSlug/like error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /public/blog/:siteSlug/:postSlug/comments ───────────────────────────
router.post("/public/blog/:siteSlug/:postSlug/comments", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendorBySiteSlug(req.params.siteSlug);
    if (!vendor) return void res.status(404).json({ error: "Blog not found" });

    const [post] = await db
      .select({ id: blogPostsTable.id, title: blogPostsTable.title, slug: blogPostsTable.slug, commentCount: blogPostsTable.commentCount })
      .from(blogPostsTable)
      .where(
        and(
          eq(blogPostsTable.vendorId, vendor.id),
          eq(blogPostsTable.slug, req.params.postSlug),
          eq(blogPostsTable.status, "published")
        )
      );
    if (!post) return void res.status(404).json({ error: "Post not found" });

    const { name, email, phone, body } = req.body as {
      name?: string; email?: string; phone?: string; body?: string;
    };

    if (!name?.trim())  return void res.status(400).json({ error: "Name is required" });
    if (!email?.trim()) return void res.status(400).json({ error: "Email is required" });
    if (!body?.trim())  return void res.status(400).json({ error: "Comment body is required" });

    // Simple email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return void res.status(400).json({ error: "Please enter a valid email address" });
    }

    // Ban check: is this email banned from commenting on this vendor's blog?
    const [banRecord] = await db
      .select({ id: blogCommenterBansTable.id })
      .from(blogCommenterBansTable)
      .where(and(
        eq(blogCommenterBansTable.vendorId, vendor.id),
        eq(blogCommenterBansTable.commenterEmail, email.trim().toLowerCase())
      ));
    if (banRecord) {
      return void res.status(403).json({ error: "You are not allowed to comment on this blog" });
    }

    // Rate-limit: one comment per email per post
    const [dupCheck] = await db
      .select({ id: blogCommentsTable.id })
      .from(blogCommentsTable)
      .where(
        and(
          eq(blogCommentsTable.postId, post.id),
          eq(blogCommentsTable.commenterEmail, email.trim().toLowerCase())
        )
      );
    if (dupCheck) {
      return void res.status(429).json({ error: "You've already left a comment on this post" });
    }

    // Upsert CRM lead (channel = "blog")
    const now = new Date();
    const normalizedEmail = email.trim().toLowerCase();
    let leadId: number | undefined;

    try {
      const [existingLead] = await db
        .select({ id: leadsTable.id })
        .from(leadsTable)
        .where(and(eq(leadsTable.vendorId, vendor.id), eq(leadsTable.email, normalizedEmail)));

      const newsLetterOptIn = typeof req.body.newsLetterOptIn === "boolean" ? req.body.newsLetterOptIn : true;

      if (existingLead) {
        // Update with any new info; always respect a fresh opt-in preference
        await db
          .update(leadsTable)
          .set({
            lastSeenAt: now,
            newsLetterOptIn,
            ...(name.trim() && { name: name.trim() }),
            ...(phone?.trim() && { phone: phone.trim() }),
          })
          .where(eq(leadsTable.id, existingLead.id));
        leadId = existingLead.id;
      } else {
        const [inserted] = await db
          .insert(leadsTable)
          .values({
            vendorId:        vendor.id,
            name:            name.trim(),
            email:           normalizedEmail,
            phone:           phone?.trim() || undefined,
            channel:         "blog",
            source:          "blog",
            pageViews:       1,
            firstSeenAt:     now,
            lastSeenAt:      now,
            status:          "new",
            newsLetterOptIn,
          })
          .returning({ id: leadsTable.id });
        leadId = inserted?.id;
      }

      // Log activity
      if (leadId) {
        void db.insert(personActivitiesTable).values({
          vendorId: vendor.id,
          personId: leadId,
          type:     "blog_comment",
          data:     { postId: post.id, blogPostSlug: req.params.postSlug },
        }).catch(() => {/* best-effort */});
      }
    } catch (leadErr) {
      // Don't block comment on CRM failure
      logger.warn({ leadErr }, "CRM upsert failed for blog comment");
    }

    // Insert comment
    const [comment] = await db
      .insert(blogCommentsTable)
      .values({
        postId:         post.id,
        vendorId:       vendor.id,
        commenterName:  name.trim(),
        commenterEmail: normalizedEmail,
        commenterPhone: phone?.trim() || null,
        body:           body.trim(),
      })
      .returning();

    // Increment comment count
    void db
      .update(blogPostsTable)
      .set({ commentCount: sql`${blogPostsTable.commentCount} + 1` })
      .where(eq(blogPostsTable.id, post.id));

    // Send confirmation email to commenter — best-effort, never blocks the response
    void (async () => {
      try {
        const postUrl = `${getAppBaseUrl()}/vendor-hub/public-blog/${encodeURIComponent(req.params.siteSlug)}/${encodeURIComponent(req.params.postSlug)}`;
        const activityUrl = `${getAppBaseUrl()}/vendor-hub/my-activity?email=${encodeURIComponent(normalizedEmail)}`;
        const html = wrapVendorEmail({
          bodyHtml: `
            <h2 style="font-size:20px;font-weight:700;margin:0 0 8px;">
              Thanks for your comment, ${escapeHtml(name.trim().split(" ")[0])}!
            </h2>
            <p style="color:#555;margin:0 0 16px;">
              Your comment on <strong>${escapeHtml(post.title)}</strong> by
              <strong>${escapeHtml(vendor.name)}</strong> was received.
            </p>
            <blockquote style="border-left:3px solid #7F50FF;padding:10px 16px;margin:0 0 20px;background:#f9f6ff;border-radius:4px;color:#333;font-style:italic;">
              ${escapeHtml(body.trim().slice(0, 300))}${body.trim().length > 300 ? "…" : ""}
            </blockquote>
            <p style="color:#888;font-size:13px;margin:0 0 4px;">
              You can view your activity and pending orders anytime at the link below.
            </p>`,
          action: { label: "View the Post", url: postUrl },
        });
        await sendEmail({
          to:      normalizedEmail,
          subject: `Your comment on "${post.title}"`,
          html,
        });
      } catch (emailErr) {
        logger.warn({ emailErr }, "[blog-comment] Confirmation email failed");
      }
    })();

    res.status(201).json({ comment: serializeComment(comment) });
  } catch (err) {
    logger.error({ err }, "POST /public/blog/:siteSlug/:postSlug/comments error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /public/vendor-blog ───────────────────────────────────────────────────
// Platform-wide blog: 50 most-recent published posts from all vendors
// who have opted in (blogFeaturedOnPlatform=true) and aren't suspended.
router.get("/public/vendor-blog", async (req: any, res: any) => {
  try {
    const posts = await db
      .select({
        id:             blogPostsTable.id,
        title:          blogPostsTable.title,
        slug:           blogPostsTable.slug,
        siteSlug:       vendorWebsitesTable.slug,
        coverImageUrl:  blogPostsTable.coverImageUrl,
        excerpt:        blogPostsTable.excerpt,
        keywords:       blogPostsTable.keywords,
        viewCount:      blogPostsTable.viewCount,
        likeCount:      blogPostsTable.likeCount,
        commentCount:   blogPostsTable.commentCount,
        publishedAt:    blogPostsTable.publishedAt,
        vendorName:     vendorsTable.name,
        vendorLogoUrl:  vendorsTable.logoUrl,
      })
      .from(blogPostsTable)
      .innerJoin(vendorsTable, eq(vendorsTable.id, blogPostsTable.vendorId))
      .innerJoin(vendorWebsitesTable, eq(vendorWebsitesTable.vendorId, blogPostsTable.vendorId))
      .where(and(
        eq(blogPostsTable.status, "published"),
        eq(blogPostsTable.suspendedFromGlobal, false),
        eq(vendorsTable.blogSuspended, false),
        eq(vendorsTable.blogFeaturedOnPlatform, true),
        eq(vendorsTable.status, "active"),
      ))
      .orderBy(desc(blogPostsTable.publishedAt))
      .limit(50);

    res.json({
      posts: posts.map((p) => ({
        ...p,
        publishedAt: p.publishedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /public/vendor-blog error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
