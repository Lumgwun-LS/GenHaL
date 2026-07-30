/**
 * Vendor Blog routes
 *
 * GET    /blog/posts              — list vendor's own posts (auth)
 * POST   /blog/posts              — create post (auth)
 * GET    /blog/posts/:id          — get single post (auth)
 * PATCH  /blog/posts/:id          — update post (auth)
 * DELETE /blog/posts/:id          — delete post (auth)
 * POST   /blog/posts/:id/publish  — publish (auth)
 * POST   /blog/posts/:id/unpublish — back to draft (auth)
 */

import { Router } from "express";
import { eq, and, desc, count, isNotNull, ne } from "drizzle-orm";
import { db, vendorsTable, blogPostsTable, blogCommentsTable, blogCommenterBansTable, leadsTable, emailCampaignsTable, vendorWebsitesTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { logger } from "../lib/logger";
import { randomBytes } from "node:crypto";
import { sendEmail } from "../lib/mailer";

function getAppBaseUrl(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  return domain ? `https://${domain}` : "https://app.awabiz.com";
}

const router = Router();

function nanoid(): string {
  return randomBytes(5).toString("hex"); // 10 hex chars
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function resolveVendor(req: any) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id, name: vendorsTable.name })
    .from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return vendor ? { ...vendor, isAdmin } : isAdmin ? { id: 0, name: "Admin", isAdmin } : null;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/^-|-$/g, "");
}

function generateExcerpt(html: string, maxLen = 200): string {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length <= maxLen ? text : text.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

function serializePost(p: typeof blogPostsTable.$inferSelect) {
  return {
    ...p,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    createdAt:   p.createdAt.toISOString(),
    updatedAt:   p.updatedAt.toISOString(),
  };
}

// ── GET /blog/posts ───────────────────────────────────────────────────────────
router.get("/blog/posts", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor) return void res.status(401).json({ error: "Unauthorized" });

    const { status } = req.query as { status?: string };

    let posts = await db.select().from(blogPostsTable)
      .where(vendor.isAdmin && vendor.id === 0
        ? undefined
        : eq(blogPostsTable.vendorId, vendor.id))
      .orderBy(desc(blogPostsTable.updatedAt));

    if (status && (status === "draft" || status === "published")) {
      posts = posts.filter((p) => p.status === status);
    }

    res.json({ posts: posts.map(serializePost) });
  } catch (err) {
    logger.error({ err }, "GET /blog/posts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /blog/posts ──────────────────────────────────────────────────────────
router.post("/blog/posts", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor || vendor.id === 0) return void res.status(401).json({ error: "Unauthorized" });

    const { title, bodyHtml = "", coverImageUrl, keywords = [], status = "draft" } = req.body as {
      title?: string; bodyHtml?: string; coverImageUrl?: string;
      keywords?: string[]; status?: string;
    };

    if (!title?.trim()) return void res.status(400).json({ error: "title is required" });

    const base = slugify(title);
    const slug = base ? `${base}-${nanoid()}` : nanoid();
    const excerpt = generateExcerpt(bodyHtml);

    const [post] = await db.insert(blogPostsTable).values({
      vendorId: vendor.id,
      title:    title.trim(),
      slug,
      bodyHtml,
      excerpt,
      coverImageUrl: coverImageUrl ?? null,
      keywords:      Array.isArray(keywords) ? keywords.filter(Boolean) : [],
      status:        status === "published" ? "published" : "draft",
      publishedAt:   status === "published" ? new Date() : null,
      updatedAt:     new Date(),
    }).returning();

    res.status(201).json({ post: serializePost(post) });
  } catch (err) {
    logger.error({ err }, "POST /blog/posts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /blog/posts/:id ───────────────────────────────────────────────────────
router.get("/blog/posts/:id", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor) return void res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });
    const [post] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, id));
    if (!post) return void res.status(404).json({ error: "Post not found" });
    if (!vendor.isAdmin && post.vendorId !== vendor.id)
      return void res.status(403).json({ error: "Forbidden" });
    res.json({ post: serializePost(post) });
  } catch (err) {
    logger.error({ err }, "GET /blog/posts/:id error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /blog/posts/:id ─────────────────────────────────────────────────────
router.patch("/blog/posts/:id", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor || vendor.id === 0) return void res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });

    const [existing] = await db.select({ id: blogPostsTable.id, vendorId: blogPostsTable.vendorId })
      .from(blogPostsTable).where(eq(blogPostsTable.id, id));
    if (!existing) return void res.status(404).json({ error: "Post not found" });
    if (!vendor.isAdmin && existing.vendorId !== vendor.id)
      return void res.status(403).json({ error: "Forbidden" });

    const { title, bodyHtml, coverImageUrl, keywords } = req.body as {
      title?: string; bodyHtml?: string; coverImageUrl?: string; keywords?: string[];
    };

    const updates: Partial<typeof blogPostsTable.$inferInsert> = { updatedAt: new Date() };
    if (title !== undefined)        updates.title        = title.trim();
    if (bodyHtml !== undefined)     { updates.bodyHtml = bodyHtml; updates.excerpt = generateExcerpt(bodyHtml); }
    if (coverImageUrl !== undefined) updates.coverImageUrl = coverImageUrl || null;
    if (keywords !== undefined)     updates.keywords     = keywords.filter(Boolean);

    const [post] = await db.update(blogPostsTable).set(updates)
      .where(eq(blogPostsTable.id, id)).returning();
    res.json({ post: serializePost(post) });
  } catch (err) {
    logger.error({ err }, "PATCH /blog/posts/:id error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /blog/posts/:id ────────────────────────────────────────────────────
router.delete("/blog/posts/:id", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor || vendor.id === 0) return void res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });
    const [existing] = await db.select({ vendorId: blogPostsTable.vendorId })
      .from(blogPostsTable).where(eq(blogPostsTable.id, id));
    if (!existing) return void res.status(404).json({ error: "Post not found" });
    if (!vendor.isAdmin && existing.vendorId !== vendor.id)
      return void res.status(403).json({ error: "Forbidden" });
    await db.delete(blogPostsTable).where(eq(blogPostsTable.id, id));
    res.sendStatus(204);
  } catch (err) {
    logger.error({ err }, "DELETE /blog/posts/:id error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /blog/posts/:id/publish ──────────────────────────────────────────────
router.post("/blog/posts/:id/publish", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor || vendor.id === 0) return void res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });
    const [existing] = await db.select({ vendorId: blogPostsTable.vendorId })
      .from(blogPostsTable).where(eq(blogPostsTable.id, id));
    if (!existing) return void res.status(404).json({ error: "Post not found" });
    if (!vendor.isAdmin && existing.vendorId !== vendor.id)
      return void res.status(403).json({ error: "Forbidden" });
    const [post] = await db.update(blogPostsTable)
      .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(blogPostsTable.id, id), eq(blogPostsTable.status, "draft")))
      .returning();
    if (!post) return void res.status(409).json({ error: "Post is already published" });
    res.json({ post: serializePost(post) });
  } catch (err) {
    logger.error({ err }, "POST /blog/posts/:id/publish error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /blog/posts/:id/unpublish ────────────────────────────────────────────
router.post("/blog/posts/:id/unpublish", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor || vendor.id === 0) return void res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });
    const [existing] = await db.select({ vendorId: blogPostsTable.vendorId })
      .from(blogPostsTable).where(eq(blogPostsTable.id, id));
    if (!existing) return void res.status(404).json({ error: "Post not found" });
    if (!vendor.isAdmin && existing.vendorId !== vendor.id)
      return void res.status(403).json({ error: "Forbidden" });
    const [post] = await db.update(blogPostsTable)
      .set({ status: "draft", updatedAt: new Date() })
      .where(and(eq(blogPostsTable.id, id), eq(blogPostsTable.status, "published")))
      .returning();
    if (!post) return void res.status(409).json({ error: "Post is already a draft" });
    res.json({ post: serializePost(post) });
  } catch (err) {
    logger.error({ err }, "POST /blog/posts/:id/unpublish error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /blog/commenter-bans — list banned commenters for this vendor ─────────
router.get("/blog/commenter-bans", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor) return void res.status(401).json({ error: "Unauthorized" });
    const bans = await db.select()
      .from(blogCommenterBansTable)
      .where(eq(blogCommenterBansTable.vendorId, vendor.id === 0 ? -1 : vendor.id))
      .orderBy(desc(blogCommenterBansTable.bannedAt));
    res.json(bans.map((b) => ({ ...b, bannedAt: b.bannedAt.toISOString() })));
  } catch (err) {
    logger.error({ err }, "GET /blog/commenter-bans error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /blog/commenter-bans — ban a commenter from this vendor's blog ───────
router.post("/blog/commenter-bans", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor || vendor.id === 0) return void res.status(401).json({ error: "Unauthorized" });
    const { email, reason } = req.body as { email?: string; reason?: string };
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return void res.status(400).json({ error: "Valid email is required" });
    }
    const normalizedEmail = email.trim().toLowerCase();
    await db.insert(blogCommenterBansTable)
      .values({ vendorId: vendor.id, commenterEmail: normalizedEmail, reason: reason?.trim() || null })
      .onConflictDoUpdate({
        target: [blogCommenterBansTable.vendorId, blogCommenterBansTable.commenterEmail],
        set: { reason: reason?.trim() || null, bannedAt: new Date() },
      });
    res.status(201).json({ banned: true, email: normalizedEmail });
  } catch (err) {
    logger.error({ err }, "POST /blog/commenter-bans error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /blog/commenter-bans/:email — unban a commenter ───────────────────
router.delete("/blog/commenter-bans/:email", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor || vendor.id === 0) return void res.status(401).json({ error: "Unauthorized" });
    const email = decodeURIComponent(req.params.email).toLowerCase();
    await db.delete(blogCommenterBansTable)
      .where(and(eq(blogCommenterBansTable.vendorId, vendor.id), eq(blogCommenterBansTable.commenterEmail, email)));
    res.sendStatus(204);
  } catch (err) {
    logger.error({ err }, "DELETE /blog/commenter-bans/:email error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /blog/posts/:id/toggle-global-suspension — admin only ────────────────
router.post("/blog/posts/:id/toggle-global-suspension", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor?.isAdmin) return void res.status(403).json({ error: "Admin only" });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });
    const [existing] = await db.select({ suspendedFromGlobal: blogPostsTable.suspendedFromGlobal })
      .from(blogPostsTable).where(eq(blogPostsTable.id, id));
    if (!existing) return void res.status(404).json({ error: "Post not found" });
    const [post] = await db.update(blogPostsTable)
      .set({ suspendedFromGlobal: !existing.suspendedFromGlobal, updatedAt: new Date() })
      .where(eq(blogPostsTable.id, id))
      .returning({ id: blogPostsTable.id, suspendedFromGlobal: blogPostsTable.suspendedFromGlobal });
    res.json(post);
  } catch (err) {
    logger.error({ err }, "POST /blog/posts/:id/toggle-global-suspension error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /blog/vendors/:id/toggle-blog-suspension — admin only ───────────────
router.post("/blog/vendors/:id/toggle-blog-suspension", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor?.isAdmin) return void res.status(403).json({ error: "Admin only" });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid vendor id" });
    const [existing] = await db.select({ blogSuspended: vendorsTable.blogSuspended })
      .from(vendorsTable).where(eq(vendorsTable.id, id));
    if (!existing) return void res.status(404).json({ error: "Vendor not found" });
    const [updated] = await db.update(vendorsTable)
      .set({ blogSuspended: !existing.blogSuspended, updatedAt: new Date() })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, blogSuspended: vendorsTable.blogSuspended });
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "POST /blog/vendors/:id/toggle-blog-suspension error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /blog/admin/posts — admin view of all posts with suspension state ─────
router.get("/blog/admin/posts", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor?.isAdmin) return void res.status(403).json({ error: "Admin only" });
    const posts = await db.select({
      id: blogPostsTable.id,
      vendorId: blogPostsTable.vendorId,
      title: blogPostsTable.title,
      slug: blogPostsTable.slug,
      status: blogPostsTable.status,
      suspendedFromGlobal: blogPostsTable.suspendedFromGlobal,
      viewCount: blogPostsTable.viewCount,
      commentCount: blogPostsTable.commentCount,
      publishedAt: blogPostsTable.publishedAt,
      vendorName: vendorsTable.name,
      vendorBlogSuspended: vendorsTable.blogSuspended,
    })
      .from(blogPostsTable)
      .innerJoin(vendorsTable, eq(vendorsTable.id, blogPostsTable.vendorId))
      .where(eq(blogPostsTable.status, "published"))
      .orderBy(desc(blogPostsTable.publishedAt))
      .limit(200);
    res.json(posts.map((p) => ({ ...p, publishedAt: p.publishedAt?.toISOString() ?? null })));
  } catch (err) {
    logger.error({ err }, "GET /blog/admin/posts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /blog/admin/vendors — admin list vendors with blog suspension state ───
router.get("/blog/admin/vendors", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor?.isAdmin) return void res.status(403).json({ error: "Admin only" });
    const vendors = await db.select({
      id: vendorsTable.id,
      name: vendorsTable.name,
      email: vendorsTable.email,
      blogSuspended: vendorsTable.blogSuspended,
      status: vendorsTable.status,
    })
      .from(vendorsTable)
      .orderBy(vendorsTable.name);
    res.json(vendors);
  } catch (err) {
    logger.error({ err }, "GET /blog/admin/vendors error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /blog/posts/:id/newsletter-stats ─────────────────────────────────────
// Returns the count of opted-in leads that would receive a newsletter for this post.
router.get("/blog/posts/:id/newsletter-stats", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor || vendor.id === 0) return void res.status(401).json({ error: "Unauthorized" });

    const postId = Number(req.params.id);
    if (!postId) return void res.status(400).json({ error: "Invalid post id" });

    const [post] = await db.select({ id: blogPostsTable.id, vendorId: blogPostsTable.vendorId, status: blogPostsTable.status })
      .from(blogPostsTable)
      .where(eq(blogPostsTable.id, postId));
    if (!post) return void res.status(404).json({ error: "Post not found" });
    if (!vendor.isAdmin && post.vendorId !== vendor.id) return void res.status(403).json({ error: "Forbidden" });
    if (post.status !== "published") return void res.status(400).json({ error: "Post is not published" });

    const [{ value }] = await db
      .select({ value: count() })
      .from(leadsTable)
      .where(and(
        eq(leadsTable.vendorId, post.vendorId),
        isNotNull(leadsTable.email),
        ne(leadsTable.email, ""),
        eq(leadsTable.newsLetterOptIn, true),
      ));

    res.json({ recipientCount: value });
  } catch (err) {
    logger.error({ err }, "GET /blog/posts/:id/newsletter-stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /blog/posts/:id/send-newsletter ─────────────────────────────────────
// Creates an email campaign from a blog post and dispatches it via SMTP
// to all opted-in leads for that vendor.
//
// Idempotency: a per-post `targetAudience = "newsletter:<postId>"` guard
// prevents sending the same post twice. Returns 409 if already sent.
router.post("/blog/posts/:id/send-newsletter", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor || vendor.id === 0) return void res.status(401).json({ error: "Unauthorized" });

    const postId = Number(req.params.id);
    if (!postId) return void res.status(400).json({ error: "Invalid post id" });

    const [post] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, postId));
    if (!post) return void res.status(404).json({ error: "Post not found" });
    if (!vendor.isAdmin && post.vendorId !== vendor.id) return void res.status(403).json({ error: "Forbidden" });
    if (post.status !== "published") return void res.status(400).json({ error: "Post is not published" });

    // Idempotency guard: one newsletter per post
    const newsletterAudience = `newsletter:${postId}`;
    const [existing] = await db
      .select({ id: emailCampaignsTable.id, sentCount: emailCampaignsTable.sentCount })
      .from(emailCampaignsTable)
      .where(and(
        eq(emailCampaignsTable.vendorId, post.vendorId),
        eq(emailCampaignsTable.targetAudience, newsletterAudience),
      ));
    if (existing) {
      return void res.status(409).json({
        error: "A newsletter has already been sent for this post",
        campaignId: existing.id,
        sentCount: existing.sentCount,
      });
    }

    // Fetch opted-in leads with valid emails
    const recipients = await db
      .select({ id: leadsTable.id, email: leadsTable.email, name: leadsTable.name })
      .from(leadsTable)
      .where(and(
        eq(leadsTable.vendorId, post.vendorId),
        isNotNull(leadsTable.email),
        ne(leadsTable.email, ""),
        eq(leadsTable.newsLetterOptIn, true),
      ));

    if (recipients.length === 0) {
      return void res.status(400).json({ error: "No opted-in subscribers to send to" });
    }

    // Build public post URL using the same pattern as customer-emails.ts
    const [website] = await db
      .select({ slug: vendorWebsitesTable.slug })
      .from(vendorWebsitesTable)
      .where(eq(vendorWebsitesTable.vendorId, post.vendorId));
    const siteSlug = website?.slug ?? String(post.vendorId);
    const postUrl = `${getAppBaseUrl()}/vendor-hub/public-blog/${encodeURIComponent(siteSlug)}/${encodeURIComponent(post.slug)}`;

    // Build email HTML
    const safeTitle   = post.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeExcerpt = (post.excerpt ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const emailHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
  <h1 style="font-size:24px;font-weight:700;margin-bottom:8px;">${safeTitle}</h1>
  ${post.coverImageUrl ? `<img src="${post.coverImageUrl}" alt="" style="width:100%;max-height:320px;object-fit:cover;border-radius:8px;margin-bottom:16px;" />` : ""}
  <p style="font-size:16px;line-height:1.6;color:#444;">${safeExcerpt}</p>
  <a href="${postUrl}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:#7C3AED;color:#fff;font-weight:700;border-radius:8px;text-decoration:none;">Read Full Post →</a>
  <hr style="margin-top:32px;border:none;border-top:1px solid #eee;" />
  <p style="font-size:12px;color:#999;margin-top:12px;">
    You are receiving this because you opted in to newsletters from this business.
  </p>
</div>`.trim();

    // Atomically create campaign in "sending" state to claim the send slot
    const [campaign] = await db.insert(emailCampaignsTable).values({
      vendorId:       post.vendorId,
      name:           `Newsletter: ${post.title}`,
      subject:        post.title,
      body:           emailHtml,
      status:         "sending",
      recipientCount: recipients.length,
      targetAudience: newsletterAudience,
    }).returning();

    // Dispatch emails and track real sent/failed counts
    let sentCount = 0;
    let failedCount = 0;
    for (const lead of recipients) {
      if (!lead.email) continue;
      const result = await sendEmail({ to: lead.email, subject: post.title, html: emailHtml });
      if (result.status === "sent" || result.status === "skipped") {
        sentCount++;
      } else {
        failedCount++;
      }
    }

    // Finalise campaign with accurate counts
    await db.update(emailCampaignsTable).set({
      status:    "sent",
      sentCount,
      sentAt:    new Date(),
    }).where(eq(emailCampaignsTable.id, campaign.id));

    logger.info({ campaignId: campaign.id, postId, sentCount, failedCount }, "[newsletter] Campaign dispatched");
    res.json({
      campaignId:    campaign.id,
      sentCount,
      failedCount,
      recipientCount: recipients.length,
      message: `Newsletter sent to ${sentCount} of ${recipients.length} subscriber${recipients.length !== 1 ? "s" : ""}`,
    });
  } catch (err) {
    logger.error({ err }, "POST /blog/posts/:id/send-newsletter error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /blog/settings — vendor blog opt-out flag ───────────────────────────
router.patch("/blog/settings", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor || vendor.id === 0) return void res.status(401).json({ error: "Unauthorized" });

    const { blogFeaturedOnPlatform } = req.body as { blogFeaturedOnPlatform?: boolean };
    if (typeof blogFeaturedOnPlatform !== "boolean") {
      return void res.status(400).json({ error: "blogFeaturedOnPlatform must be boolean" });
    }

    await db.update(vendorsTable)
      .set({ blogFeaturedOnPlatform })
      .where(eq(vendorsTable.id, vendor.id));

    res.json({ blogFeaturedOnPlatform });
  } catch (err) {
    logger.error({ err }, "PATCH /blog/settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /blog/settings — fetch vendor's blog settings ────────────────────────
router.get("/blog/settings", async (req: any, res: any) => {
  try {
    const vendor = await resolveVendor(req);
    if (!vendor || vendor.id === 0) return void res.status(401).json({ error: "Unauthorized" });

    const [row] = await db.select({ blogFeaturedOnPlatform: vendorsTable.blogFeaturedOnPlatform })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, vendor.id));

    res.json({ blogFeaturedOnPlatform: row?.blogFeaturedOnPlatform ?? true });
  } catch (err) {
    logger.error({ err }, "GET /blog/settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
