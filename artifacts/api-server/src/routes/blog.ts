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
import { eq, and, desc } from "drizzle-orm";
import { db, vendorsTable, blogPostsTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { logger } from "../lib/logger";
import { randomBytes } from "node:crypto";

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

export default router;
