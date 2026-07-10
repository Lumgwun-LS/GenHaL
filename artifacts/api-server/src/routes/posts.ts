import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { randomBytes } from "node:crypto";
import { eq, and, gt, desc, inArray } from "drizzle-orm";
import { db, postsTable, productsTable, vendorsTable } from "@workspace/db";
import {
  ListPostsQueryParams,
  CreatePostBody,
  GetPostParams,
  UpdatePostParams,
  UpdatePostBody,
  DeletePostParams,
  PublishPostParams,
  ListPostsResponse,
  CreatePostResponse,
  GetPostResponse,
  UpdatePostResponse,
  ListScheduledPostsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Resolves the calling Clerk user to their own vendor row (or confirms admin status).
 * Mirrors the ownership pattern used in vendors.ts — identity/ownership is always
 * derived server-side from the verified session, never trusted from the request body.
 */
async function resolveAuthedVendor(req: import("express").Request): Promise<{ vendorId: number | null; isAdmin: boolean }> {
  const { userId } = getAuth(req);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

/** Every productId attached to a post's shop link must belong to that post's own vendor. */
async function productsBelongToVendor(vendorId: number, productIds: number[]): Promise<boolean> {
  if (productIds.length === 0) return true;
  const owned = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(and(inArray(productsTable.id, productIds), eq(productsTable.vendorId, vendorId)));
  return owned.length === productIds.length;
}

router.get("/posts/scheduled", async (_req, res): Promise<void> => {
  const now = new Date();
  const posts = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.status, "scheduled"), gt(postsTable.scheduledAt, now)))
    .orderBy(postsTable.scheduledAt);
  res.json(ListScheduledPostsResponse.parse(posts.map(serializePost)));
});

router.get("/posts", async (req, res): Promise<void> => {
  const params = ListPostsQueryParams.safeParse(req.query);
  let posts = await db.select().from(postsTable).orderBy(desc(postsTable.createdAt));
  if (params.success) {
    if (params.data.vendorId) posts = posts.filter((p) => p.vendorId === params.data.vendorId);
    if (params.data.status) posts = posts.filter((p) => p.status === params.data.status);
    if (params.data.platform) posts = posts.filter((p) => p.platforms.includes(params.data.platform!));
  }
  res.json(ListPostsResponse.parse(posts.map(serializePost)));
});

router.post("/posts", async (req, res): Promise<void> => {
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { scheduledAt: sa, ...restCreate } = parsed.data;

  // A vendor may only ever create posts for themselves — the body's vendorId is
  // untrusted input and is rejected outright if it doesn't match the caller's own
  // vendor (admins are exempt, matching the ownership pattern in vendors.ts).
  const authed = await resolveAuthedVendor(req);
  if (!authed.isAdmin && authed.vendorId !== restCreate.vendorId) {
    res.status(403).json({ error: "You do not have permission to create posts for this vendor." });
    return;
  }

  const scheduledDate = sa ? new Date(sa) : null;
  const productIds = restCreate.productIds ?? [];
  if (!(await productsBelongToVendor(restCreate.vendorId, productIds))) {
    res.status(400).json({ error: "One or more products do not belong to this vendor" });
    return;
  }
  const needsLink = productIds.length > 0 && restCreate.linkMode && restCreate.linkMode !== "none";
  const [post] = await db.insert(postsTable).values({
    ...restCreate,
    ...(scheduledDate ? { scheduledAt: scheduledDate } : {}),
    ...(needsLink ? { shareToken: randomBytes(12).toString("hex") } : {}),
    status: scheduledDate ? "scheduled" : "draft",
  }).returning();
  res.status(201).json(CreatePostResponse.parse(serializePost(post)));
});

router.get("/posts/:id", async (req, res): Promise<void> => {
  const params = GetPostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.id));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.json(GetPostResponse.parse(serializePost(post)));
});

router.patch("/posts/:id", async (req, res): Promise<void> => {
  const params = UpdatePostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePostBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { scheduledAt: saU, ...restUpdate } = parsed.data;
  const updateData: typeof restUpdate & { scheduledAt?: Date | null; shareToken?: string | null } = {
    ...restUpdate,
    ...(saU !== undefined ? { scheduledAt: saU ? new Date(saU) : null } : {}),
  };

  if (restUpdate.linkMode !== undefined || restUpdate.productIds !== undefined) {
    const [existing] = await db
      .select({ vendorId: postsTable.vendorId, productIds: postsTable.productIds, linkMode: postsTable.linkMode, shareToken: postsTable.shareToken })
      .from(postsTable)
      .where(eq(postsTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Post not found" }); return; }

    // Only the post's own vendor (or an admin) may change its shop-link configuration.
    const authed = await resolveAuthedVendor(req);
    if (!authed.isAdmin && authed.vendorId !== existing.vendorId) {
      res.status(403).json({ error: "You do not have permission to update this post." });
      return;
    }

    const effectiveProductIds = restUpdate.productIds ?? existing.productIds;
    const effectiveLinkMode = restUpdate.linkMode ?? existing.linkMode;

    if (restUpdate.productIds !== undefined && !(await productsBelongToVendor(existing.vendorId, restUpdate.productIds))) {
      res.status(400).json({ error: "One or more products do not belong to this vendor" });
      return;
    }

    if (effectiveLinkMode === "none" || effectiveProductIds.length === 0) {
      // Link disabled or emptied — kill the token so a later re-enable can't
      // silently resurrect a link customers may have already seen/shared.
      updateData.shareToken = null;
    } else if (!existing.shareToken) {
      // Link is being (re)enabled from a disabled state — mint a fresh token.
      updateData.shareToken = randomBytes(12).toString("hex");
    }
    // else: link was already live — keep its existing token so shared URLs don't break.
  }

  const [post] = await db.update(postsTable).set(updateData).where(eq(postsTable.id, params.data.id)).returning();
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.json(UpdatePostResponse.parse(serializePost(post)));
});

router.delete("/posts/:id", async (req, res): Promise<void> => {
  const params = DeletePostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [post] = await db.delete(postsTable).where(eq(postsTable.id, params.data.id)).returning();
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.sendStatus(204);
});

router.post("/posts/:id/publish", async (req, res): Promise<void> => {
  const params = PublishPostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [post] = await db
    .update(postsTable)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(postsTable.id, params.data.id))
    .returning();
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.json(GetPostResponse.parse(serializePost(post)));
});

function serializePost(post: typeof postsTable.$inferSelect) {
  return {
    ...post,
    scheduledAt: post.scheduledAt ? post.scheduledAt.toISOString() : null,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
  };
}

export default router;
