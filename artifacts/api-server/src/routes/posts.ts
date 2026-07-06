import { Router, type IRouter } from "express";
import { eq, and, gt, desc } from "drizzle-orm";
import { db, postsTable } from "@workspace/db";
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
  const scheduledDate = sa ? new Date(sa) : null;
  const [post] = await db.insert(postsTable).values({
    ...restCreate,
    ...(scheduledDate ? { scheduledAt: scheduledDate } : {}),
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
  const updateData = { ...restUpdate, ...(saU !== undefined ? { scheduledAt: saU ? new Date(saU) : null } : {}) };
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
