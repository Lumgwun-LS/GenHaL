import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { randomBytes } from "node:crypto";
import { eq, and, gt, desc, inArray } from "drizzle-orm";
import { db, postsTable, productsTable, vendorsTable, socialAccountsTable, postPublicationsTable } from "@workspace/db";
import { publishFacebookFeedPost, publishFacebookPhotoPost, publishFacebookVideoPost, publishInstagramPhotoPost, isMetaAuthError } from "../lib/meta";
import { publishLinkedInTextPost, publishLinkedInImagePost, publishLinkedInVideoPost, isLinkedInAuthError } from "../lib/linkedin";
import { publishTweet, publishTweetWithImage, publishTweetWithVideo, isTwitterAuthError } from "../lib/twitter";
import { ensureFreshAccessToken } from "../lib/token-refresh";
import { notifyScheduledPostFailed } from "../lib/post-notifications";
import { releaseOrphanedPostMedia } from "../lib/media-cleanup";
import { logger } from "../lib/logger";
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
  SchedulePostParams,
  SchedulePostBody,
  CancelPostScheduleParams,
  GetPostConnectionWarningsResponse,
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

router.get("/posts/scheduled", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  const now = new Date();
  let posts = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.status, "scheduled"), gt(postsTable.scheduledAt, now)))
    .orderBy(postsTable.scheduledAt);
  if (!authed.isAdmin) posts = posts.filter((p) => p.vendorId === authed.vendorId);
  res.json(ListScheduledPostsResponse.parse(posts.map(serializePost)));
});

router.get("/posts", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = ListPostsQueryParams.safeParse(req.query);
  if (!authed.isAdmin && params.success && params.data.vendorId && params.data.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You can only view your own vendor's posts." });
    return;
  }

  let posts = await db.select().from(postsTable).orderBy(desc(postsTable.createdAt));
  if (!authed.isAdmin) posts = posts.filter((p) => p.vendorId === authed.vendorId);
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
  const authed = await resolveAuthedVendor(req);
  if (!authed.isAdmin && authed.vendorId !== post.vendorId) { res.status(403).json({ error: "You do not have permission to view this post." }); return; }
  res.json(GetPostResponse.parse(serializePost(post)));
});

router.patch("/posts/:id", async (req, res): Promise<void> => {
  const params = UpdatePostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePostBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { scheduledAt: saU, status: statusU, force: forceReschedule, ...restUpdate } = parsed.data as typeof parsed.data & { status?: string; force?: boolean };
  if (statusU !== undefined) {
    // Status only ever moves through the dedicated /submit-for-review, /approve,
    // /request-changes, and /publish endpoints, which enforce the state machine and
    // ownership atomically. Allowing it here would let a generic edit skip review.
    res.status(400).json({ error: "Use /submit-for-review, /approve, /request-changes, or /publish to change post status." });
    return;
  }
  const updateData: typeof restUpdate & { scheduledAt?: Date | null; shareToken?: string | null; reminderSentAt?: Date | null } = {
    ...restUpdate,
    // Changing scheduledAt (e.g. a still-scheduled post being re-timed some
    // other way than the dedicated /schedule route) must clear any reminder
    // already sent for the old time, or the vendor never gets reminded ahead
    // of the new one — see post-reminders.ts.
    ...(saU !== undefined ? { scheduledAt: saU ? new Date(saU) : null, reminderSentAt: null } : {}),
  };

  // Every PATCH must be scoped to the post's own vendor (or an admin) — this was
  // previously only checked for shop-link fields, leaving caption/platform/media
  // edits open to any authenticated caller regardless of ownership.
  {
    const [existing] = await db
      .select({ vendorId: postsTable.vendorId, productIds: postsTable.productIds, linkMode: postsTable.linkMode, shareToken: postsTable.shareToken, status: postsTable.status, platforms: postsTable.platforms, socialAccountIds: postsTable.socialAccountIds })
      .from(postsTable)
      .where(eq(postsTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Post not found" }); return; }

    const authed = await resolveAuthedVendor(req);
    if (!authed.isAdmin && authed.vendorId !== existing.vendorId) {
      res.status(403).json({ error: "You do not have permission to update this post." });
      return;
    }

    // When rescheduling an already-scheduled post (PATCH with a new scheduledAt
    // on a post in "scheduled" status), apply the same connection check that the
    // dedicated /schedule route enforces for the initial schedule transition.
    // This prevents a vendor from silently confirming a reschedule into the same
    // failure they'd hit at auto-publish time. `force: true` skips the block
    // after the vendor has acknowledged the warning (matching /schedule behavior).
    if (saU !== undefined && existing.status === "scheduled") {
      const effectivePlatforms = restUpdate.platforms ?? existing.platforms ?? [];
      const effectiveSocialAccountIds = restUpdate.socialAccountIds ?? existing.socialAccountIds ?? [];
      const rescheduleWarnings = await getConnectionWarnings(existing.vendorId, effectivePlatforms, effectiveSocialAccountIds);
      if (rescheduleWarnings.length > 0 && !forceReschedule) {
        res.status(409).json({
          error: "One or more selected platforms has no usable connected account. Reconnect it, or confirm to reschedule anyway.",
          warnings: rescheduleWarnings,
        });
        return;
      }
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
  const [existing] = await db.select({ vendorId: postsTable.vendorId, mediaUrls: postsTable.mediaUrls }).from(postsTable).where(eq(postsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }
  const authed = await resolveAuthedVendor(req);
  if (!authed.isAdmin && authed.vendorId !== existing.vendorId) { res.status(403).json({ error: "You do not have permission to delete this post." }); return; }
  await db.delete(postsTable).where(eq(postsTable.id, params.data.id));
  res.sendStatus(204);
  // After the response is sent, reset mediaLastCheckedAt for any media URLs
  // that are no longer referenced by any remaining post — this brings them to
  // the front of the next cleanup tick so the orphaned objects are swept
  // promptly rather than waiting up to RETENTION_HOURS (48h) for their turn.
  // Errors are swallowed inside releaseOrphanedPostMedia so this fire-and-forget
  // call can never bubble up and corrupt the already-sent 204.
  releaseOrphanedPostMedia(existing.mediaUrls ?? []).catch(() => {});
});

/**
 * AI-drafted posts must go through a human approval step before publishing —
 * draft -> pending_review -> approved -> published. Only the post's own vendor
 * (or an admin) may submit/approve/publish it. This is enforced here rather than
 * left to the frontend, since the frontend is untrusted input.
 */
router.post("/posts/:id/submit-for-review", async (req, res): Promise<void> => {
  const params = PublishPostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [existing] = await db.select({ vendorId: postsTable.vendorId, status: postsTable.status }).from(postsTable).where(eq(postsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }
  const authed = await resolveAuthedVendor(req);
  if (!authed.isAdmin && authed.vendorId !== existing.vendorId) { res.status(403).json({ error: "You do not have permission to update this post." }); return; }
  // Guard the transition on the current status in the WHERE clause (not just a
  // preceding read) so two concurrent requests can't both pass the precheck and
  // race each other into an invalid state.
  const [post] = await db.update(postsTable).set({ status: "pending_review" }).where(and(eq(postsTable.id, params.data.id), eq(postsTable.status, "draft"))).returning();
  if (!post) { res.status(409).json({ error: `Cannot submit a post with status "${existing.status}" for review.` }); return; }
  res.json(GetPostResponse.parse(serializePost(post)));
});

router.post("/posts/:id/approve", async (req, res): Promise<void> => {
  const params = PublishPostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [existing] = await db.select({ vendorId: postsTable.vendorId, status: postsTable.status }).from(postsTable).where(eq(postsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }
  const authed = await resolveAuthedVendor(req);
  if (!authed.isAdmin && authed.vendorId !== existing.vendorId) { res.status(403).json({ error: "You do not have permission to update this post." }); return; }
  const [post] = await db.update(postsTable).set({ status: "approved" }).where(and(eq(postsTable.id, params.data.id), eq(postsTable.status, "pending_review"))).returning();
  if (!post) { res.status(409).json({ error: `Cannot approve a post with status "${existing.status}".` }); return; }
  res.json(GetPostResponse.parse(serializePost(post)));
});

router.post("/posts/:id/request-changes", async (req, res): Promise<void> => {
  const params = PublishPostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [existing] = await db.select({ vendorId: postsTable.vendorId, status: postsTable.status }).from(postsTable).where(eq(postsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }
  const authed = await resolveAuthedVendor(req);
  if (!authed.isAdmin && authed.vendorId !== existing.vendorId) { res.status(403).json({ error: "You do not have permission to update this post." }); return; }
  const [post] = await db.update(postsTable).set({ status: "draft" }).where(and(eq(postsTable.id, params.data.id), eq(postsTable.status, "pending_review"))).returning();
  if (!post) { res.status(409).json({ error: `Cannot request changes on a post with status "${existing.status}".` }); return; }
  res.json(GetPostResponse.parse(serializePost(post)));
});

/** Collapses platform spellings used across the UI ("X (Twitter)", "twitter", "x") to one key. */
function normalizePlatformKey(platform: string): string {
  const p = platform.trim().toLowerCase();
  if (p === "x" || p === "twitter" || p.startsWith("x (")) return "twitter";
  return p;
}

function bufferFromDataUri(dataUri: string): { buffer: Buffer; kind: "image" | "video" } | null {
  const match = /^data:(image|video)\/[a-zA-Z0-9+.-]+;base64,(.+)$/.exec(dataUri);
  if (!match) return null;
  return { buffer: Buffer.from(match[2], "base64"), kind: match[1] as "image" | "video" };
}

/**
 * Resolves a post's media entry (a `data:` URI, or a publicly hosted URL —
 * AI-generated images/videos are now stored in object storage and referenced
 * by URL, not embedded as base64) into raw bytes for platforms that need a
 * direct byte upload (Facebook, LinkedIn, X/Twitter). Instagram is the one
 * platform that wants the URL itself, not bytes, and is handled separately.
 */
async function resolveMediaBuffer(media: string): Promise<{ buffer: Buffer; kind: "image" | "video" } | null> {
  if (media.startsWith("data:")) return bufferFromDataUri(media);
  if (!/^https?:\/\//.test(media)) return null;
  const res = await fetch(media);
  if (!res.ok) throw new Error(`Failed to fetch post media (status ${res.status})`);
  const contentType = res.headers.get("content-type") ?? "";
  const kind: "image" | "video" | null = contentType.startsWith("video/") ? "video" : contentType.startsWith("image/") ? "image" : null;
  if (!kind) throw new Error(`Could not determine media type for the post's hosted media (content-type: "${contentType}")`);
  return { buffer: Buffer.from(await res.arrayBuffer()), kind };
}

/**
 * Cheaply determines whether a hosted media URL is an image or a video via
 * its Content-Type, without downloading the body. Used before choosing which
 * Facebook Graph API endpoint to post to — posting a video to the photos
 * endpoint (or vice versa) fails, so this must be checked first rather than
 * assumed from the fact that it's a URL.
 */
async function probeHostedMediaKind(url: string): Promise<"image" | "video" | null> {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("image/")) return "image";
  return null;
}

interface PublishOutcome {
  platform: string;
  socialAccountId: number | null;
  // "processing" means Facebook accepted the video upload but hasn't finished
  // async processing yet — the video-publish-finalizer background job (not
  // this request) resolves it to "success" or "failed" once Facebook reports
  // the outcome. See publishFacebookVideoPost in lib/meta.ts.
  status: "success" | "failed" | "processing";
  externalPostId: string | null;
  externalUrl: string | null;
  errorMessage: string | null;
}

/**
 * Resolves exactly which connected account a platform entry should publish to.
 * `socialAccountIds` is aligned by index with `platforms` — when a post was
 * created/edited after this feature shipped, that explicit id is authoritative.
 * Older posts (or entries left unset) fall back to "the vendor's one active
 * account for this platform", but only when that's unambiguous; if the vendor
 * has multiple connected accounts for the same platform, publishing must fail
 * rather than guess which one to post to.
 */
function resolveTargetAccount(
  platformLabel: string,
  explicitAccountId: number | null | undefined,
  vendorAccounts: (typeof socialAccountsTable.$inferSelect)[],
): { account: typeof socialAccountsTable.$inferSelect | undefined; error: string | null } {
  // 0 (or unset) means "not explicitly chosen" — real social_accounts ids start at 1.
  if (explicitAccountId != null && explicitAccountId !== 0) {
    const account = vendorAccounts.find((a) => a.id === explicitAccountId);
    if (!account) return { account: undefined, error: `The account connected to this post for ${platformLabel} is no longer connected. Reconnect it and edit the post.` };
    return { account, error: null };
  }
  const key = normalizePlatformKey(platformLabel);
  const matches = vendorAccounts.filter((a) => normalizePlatformKey(a.platform) === key);
  if (matches.length > 1) {
    return { account: undefined, error: `Multiple ${platformLabel} accounts are connected. Edit this post and choose which one to publish to.` };
  }
  return { account: matches[0], error: null };
}

/**
 * Checks each selected platform entry against the vendor's currently active
 * `social_accounts` — the same resolution `resolveTargetAccount` performs at
 * actual publish time — so a vendor can be warned about a missing/ambiguous
 * connection at schedule time instead of finding out hours later when the
 * scheduled auto-publisher fails. Returns one entry per platform that has no
 * usable connection right now; an empty array means every platform is fine
 * (accounts could still be disconnected later, so this is a point-in-time check).
 */
async function getConnectionWarnings(
  vendorId: number,
  platforms: string[],
  socialAccountIds: number[],
): Promise<{ platform: string; message: string }[]> {
  const vendorAccounts = await db
    .select()
    .from(socialAccountsTable)
    .where(and(eq(socialAccountsTable.vendorId, vendorId), eq(socialAccountsTable.status, "active")));

  const warnings: { platform: string; message: string }[] = [];
  for (let i = 0; i < platforms.length; i++) {
    const platformLabel = platforms[i];
    const explicitAccountId = socialAccountIds[i] ?? null;
    const { account, error } = resolveTargetAccount(platformLabel, explicitAccountId, vendorAccounts);
    if (error) {
      warnings.push({ platform: platformLabel, message: error });
    } else if (!account) {
      warnings.push({ platform: platformLabel, message: `No connected ${platformLabel} account. Connect it from the Social Hub before this post can publish.` });
    } else if (!account.accessTokenEncrypted) {
      warnings.push({ platform: platformLabel, message: `The connected ${platformLabel} account has no live connection. Reconnect it from the Social Hub.` });
    }
  }
  return warnings;
}

/**
 * Publishes a single platform's leg of a post. Facebook/Instagram (Meta Graph
 * API), LinkedIn, and X/Twitter have real OAuth-connected publish paths today;
 * every other platform fails clearly instead of silently pretending to succeed.
 */
async function publishToPlatform(
  platformKey: string,
  rawPlatformLabel: string,
  account: typeof socialAccountsTable.$inferSelect | undefined,
  caption: string,
  mediaUrls: string[],
): Promise<PublishOutcome> {
  const base = { platform: rawPlatformLabel, socialAccountId: account?.id ?? null };
  if (!account || !account.accessTokenEncrypted) {
    return {
      ...base,
      status: "failed",
      externalPostId: null,
      externalUrl: null,
      errorMessage: `No connected ${rawPlatformLabel} account with a live connection. Connect it via OAuth from the Social Hub first.`,
    };
  }

  if (platformKey !== "facebook" && platformKey !== "instagram" && platformKey !== "linkedin" && platformKey !== "twitter") {
    return {
      ...base,
      status: "failed",
      externalPostId: null,
      externalUrl: null,
      errorMessage: `Live publishing isn't available yet for ${rawPlatformLabel}.`,
    };
  }

  const isAuthError = (message: string): boolean =>
    platformKey === "facebook" || platformKey === "instagram"
      ? isMetaAuthError(message)
      : platformKey === "linkedin"
        ? isLinkedInAuthError(message)
        : isTwitterAuthError(message);

  try {
    const accessToken = await ensureFreshAccessToken(account);

    try {
      return await attemptPublish(platformKey, account, accessToken, caption, mediaUrls, base);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // The proactive expiry check can still miss a token the platform just
      // invalidated (early revocation, clock skew, etc.) — on an auth-looking
      // failure, force one renewal and retry exactly once before giving up.
      if (!isAuthError(message)) throw err;
      const refreshedToken = await ensureFreshAccessToken(account, { force: true });
      return await attemptPublish(platformKey, account, refreshedToken, caption, mediaUrls, base);
    }
  } catch (err) {
    return {
      ...base,
      status: "failed",
      externalPostId: null,
      externalUrl: null,
      errorMessage: err instanceof Error ? err.message : "Publish failed",
    };
  }
}

/** Performs the actual per-platform publish call using an already-resolved-fresh access token. */
async function attemptPublish(
  platformKey: string,
  account: typeof socialAccountsTable.$inferSelect,
  accessToken: string,
  caption: string,
  mediaUrls: string[],
  base: { platform: string; socialAccountId: number | null },
): Promise<PublishOutcome> {
  {
    const media = mediaUrls[0] ?? null;

    if (platformKey === "facebook") {
      if (media) {
        if (/^https?:\/\//.test(media)) {
          // AI-generated images AND videos are both hosted URLs now — probe
          // which one this is before picking an endpoint. Videos must go
          // through publishFacebookVideoPost (which needs the raw bytes);
          // only images can use the cheap URL-passthrough /photos call.
          const kind = await probeHostedMediaKind(media);
          if (kind === "video") {
            const decoded = await resolveMediaBuffer(media);
            if (!decoded) throw new Error("Failed to download the post's hosted video for Facebook publishing");
            // Upload-only — does not wait for Facebook's async video processing.
            // See publishFacebookVideoPost's doc comment; the background
            // video-publish-finalizer job resolves this to success/failed.
            const result = await publishFacebookVideoPost(account.accountId!, accessToken, decoded.buffer, caption);
            return { ...base, status: "processing", externalPostId: result.externalPostId, externalUrl: result.externalUrl, errorMessage: null };
          }
          // Facebook's photo endpoint accepts a hosted URL directly — no need
          // to download and re-upload the bytes ourselves.
          const res = await fetch(`https://graph.facebook.com/v21.0/${account.accountId}/photos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: media, caption, access_token: accessToken }),
          });
          const json: any = await res.json().catch(() => ({}));
          if (!res.ok || !json.post_id) throw new Error(json?.error?.message || "Facebook rejected the photo post");
          return { ...base, status: "success", externalPostId: json.post_id, externalUrl: `https://www.facebook.com/${json.post_id}`, errorMessage: null };
        }
        const decoded = bufferFromDataUri(media);
        if (decoded) {
          if (decoded.kind === "video") {
            const result = await publishFacebookVideoPost(account.accountId!, accessToken, decoded.buffer, caption);
            return { ...base, status: "processing", externalPostId: result.externalPostId, externalUrl: result.externalUrl, errorMessage: null };
          }
          const result = await publishFacebookPhotoPost(account.accountId!, accessToken, decoded.buffer, caption);
          return { ...base, status: "success", externalPostId: result.externalPostId, externalUrl: result.externalUrl, errorMessage: null };
        }
      }
      const result = await publishFacebookFeedPost(account.accountId!, accessToken, caption);
      return { ...base, status: "success", externalPostId: result.externalPostId, externalUrl: result.externalUrl, errorMessage: null };
    }

    if (platformKey === "linkedin") {
      if (media) {
        // Resolves either a data: URI or a hosted URL (AI-generated images are
        // now stored in object storage and referenced by URL) to bytes — the
        // Posts API's image upload step needs the bytes either way.
        const decoded = await resolveMediaBuffer(media);
        if (decoded?.kind === "image") {
          const result = await publishLinkedInImagePost(account.accountId!, accessToken, decoded.buffer, caption);
          return { ...base, status: "success", externalPostId: result.externalPostId, externalUrl: result.externalUrl, errorMessage: null };
        }
        if (decoded?.kind === "video") {
          const result = await publishLinkedInVideoPost(account.accountId!, accessToken, decoded.buffer, caption);
          return { ...base, status: "success", externalPostId: result.externalPostId, externalUrl: result.externalUrl, errorMessage: null };
        }
        throw new Error("Couldn't read this post's image/video to publish it to LinkedIn.");
      }
      const result = await publishLinkedInTextPost(account.accountId!, accessToken, caption);
      return { ...base, status: "success", externalPostId: result.externalPostId, externalUrl: result.externalUrl, errorMessage: null };
    }

    if (platformKey === "twitter") {
      // accountName is stored as "@username" (see social-oauth.ts) — strip the
      // leading "@" to build the tweet permalink.
      const username = (account.accountName ?? "").replace(/^@/, "");
      if (media) {
        const decoded = await resolveMediaBuffer(media);
        if (decoded?.kind === "image") {
          const result = await publishTweetWithImage(username, accessToken, decoded.buffer, caption);
          return { ...base, status: "success", externalPostId: result.externalPostId, externalUrl: result.externalUrl, errorMessage: null };
        }
        if (decoded?.kind === "video") {
          const result = await publishTweetWithVideo(username, accessToken, decoded.buffer, caption);
          return { ...base, status: "success", externalPostId: result.externalPostId, externalUrl: result.externalUrl, errorMessage: null };
        }
        throw new Error("Couldn't read this post's image/video to publish it to X/Twitter.");
      }
      const result = await publishTweet(username, accessToken, caption);
      return { ...base, status: "success", externalPostId: result.externalPostId, externalUrl: result.externalUrl, errorMessage: null };
    }

    // Instagram Content Publishing requires a publicly reachable image URL —
    // it has no direct byte-upload path (unlike Facebook's Page photo
    // endpoint). AI-generated images are now stored in object storage and
    // referenced by a real https:// URL, so this succeeds for them; a
    // leftover base64 data: URI (or any other non-URL value) still fails
    // clearly instead of silently dropping the media or lying about success.
    if (!media) throw new Error("Instagram posts require an image or video. Add one before publishing.");
    if (!/^https?:\/\//.test(media)) {
      throw new Error("Instagram requires a publicly hosted media URL. This post's image/video isn't hosted online — regenerate it or attach a hosted URL to publish to Instagram.");
    }
    const result = await publishInstagramPhotoPost(account.accountId!, accessToken, media, caption);
    return { ...base, status: "success", externalPostId: result.externalPostId, externalUrl: result.externalUrl, errorMessage: null };
  }
}

function serializePublication(row: typeof postPublicationsTable.$inferSelect) {
  return { ...row, publishedAt: row.publishedAt.toISOString() };
}

/**
 * Runs the actual per-platform publish attempts for a post that has already
 * been atomically claimed (moved to status "publishing"), then resolves that
 * claim to "published" or back to "approved". Shared by the manual /publish
 * route and the scheduled-post auto-publisher so both go through exactly one
 * code path — a claimed post is never left stuck in "publishing".
 */
export async function executeClaimedPublish(
  claimed: typeof postsTable.$inferSelect,
  opts: { auto?: boolean } = {},
): Promise<{
  post: typeof postsTable.$inferSelect | undefined;
  publications: ReturnType<typeof serializePublication>[];
  anySucceeded: boolean;
}> {
  const auto = opts.auto ?? false;
  const vendorAccounts = await db.select().from(socialAccountsTable).where(and(eq(socialAccountsTable.vendorId, claimed.vendorId), eq(socialAccountsTable.status, "active")));

  const outcomes: PublishOutcome[] = [];
  for (let i = 0; i < claimed.platforms.length; i++) {
    const platformLabel = claimed.platforms[i];
    const explicitAccountId = claimed.socialAccountIds[i] ?? null;
    const { account, error } = resolveTargetAccount(platformLabel, explicitAccountId, vendorAccounts);
    if (error) {
      outcomes.push({ platform: platformLabel, socialAccountId: account?.id ?? null, status: "failed", externalPostId: null, externalUrl: null, errorMessage: error });
      continue;
    }
    const key = normalizePlatformKey(platformLabel);
    outcomes.push(await publishToPlatform(key, platformLabel, account, claimed.caption, claimed.mediaUrls));
  }

  const insertedPublications = outcomes.length > 0
    ? await db.insert(postPublicationsTable).values(
        outcomes.map((o) => ({
          postId: claimed.id,
          socialAccountId: o.socialAccountId,
          platform: o.platform,
          status: o.status,
          externalPostId: o.externalPostId,
          externalUrl: o.externalUrl,
          errorMessage: o.errorMessage,
        })),
      ).returning()
    : [];

  // A Facebook video leg that's still "processing" (upload accepted, async
  // processing not finished yet — see publishFacebookVideoPost) counts as
  // succeeded for the purposes of moving the post out of "publishing": we
  // don't hold the post (or this request) hostage to Facebook's processing
  // wait. The video-publish-finalizer background job resolves that
  // publication row to "success" or "failed" once Facebook reports the
  // outcome, independent of the post's own status.
  const anySucceeded = outcomes.some((o) => o.status === "success" || o.status === "processing");
  // Resolve the "publishing" claim: back to "approved" on total failure (so the
  // vendor can fix the connection and retry — manually, or by rescheduling), or
  // "published" if at least one platform went live. Guarded on status="publishing"
  // for the same reason as the initial claim — nothing else should have moved
  // this post in between.
  const [post] = await db
    .update(postsTable)
    .set(
      anySucceeded
        ? { status: "published", publishedAt: new Date(), autoPublishFailed: false }
        : { status: "approved", autoPublishFailed: auto },
    )
    .where(and(eq(postsTable.id, claimed.id), eq(postsTable.status, "publishing")))
    .returning();

  // Only the scheduled auto-publisher's silent failures need a proactive notice —
  // a manual "Publish Now" failure is already surfaced immediately in the UI.
  if (auto && !anySucceeded && post) {
    const failures = outcomes.filter((o) => o.status === "failed").map((o) => ({ platform: o.platform, errorMessage: o.errorMessage }));
    await notifyScheduledPostFailed(claimed.vendorId, claimed.id, claimed.caption, failures).catch((err) => {
      logger.error({ err, postId: claimed.id }, "[posts] Failed to notify vendor of scheduled post auto-publish failure");
    });
  }

  return { post, publications: insertedPublications.map(serializePublication), anySucceeded };
}

router.post("/posts/:id/publish", async (req, res): Promise<void> => {
  const params = PublishPostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [existing] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }
  const authed = await resolveAuthedVendor(req);
  if (!authed.isAdmin && authed.vendorId !== existing.vendorId) { res.status(403).json({ error: "You do not have permission to update this post." }); return; }

  // Atomically claim the post for publishing: the WHERE clause guards the
  // transition on the status column itself, so two concurrent publish clicks
  // (or a double-submit) can't both pass and both post the same content twice
  // to the same live account.
  const [claimed] = await db
    .update(postsTable)
    .set({ status: "publishing" })
    .where(and(eq(postsTable.id, params.data.id), eq(postsTable.status, "approved")))
    .returning();
  if (!claimed) {
    res.status(409).json({ error: `Cannot publish a post with status "${existing.status}". It must be approved first, and can't already be publishing.` });
    return;
  }

  const { post, publications, anySucceeded } = await executeClaimedPublish(claimed);
  if (!anySucceeded) {
    res.status(502).json({ error: "Publishing failed on every selected platform.", publications });
    return;
  }
  res.json({ ...GetPostResponse.parse(serializePost(post!)), publications });
});

/**
 * Schedules an approved post to auto-publish at a future date/time. Only
 * "approved" posts may be scheduled — the same review gate that guards the
 * immediate /publish route — so a scheduled post is guaranteed to have
 * already passed review by the time the background job picks it up.
 */
router.post("/posts/:id/schedule", async (req, res): Promise<void> => {
  const params = SchedulePostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = SchedulePostBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const scheduledDate = new Date(parsed.data.scheduledAt);
  if (Number.isNaN(scheduledDate.getTime())) { res.status(400).json({ error: "scheduledAt must be a valid date/time" }); return; }
  if (scheduledDate.getTime() <= Date.now()) { res.status(400).json({ error: "scheduledAt must be in the future" }); return; }

  const [existing] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }
  const authed = await resolveAuthedVendor(req);
  if (!authed.isAdmin && authed.vendorId !== existing.vendorId) { res.status(403).json({ error: "You do not have permission to update this post." }); return; }

  // Warn (and by default, block) scheduling a post for a platform with no
  // usable connected account right now — this is exactly the situation that
  // would otherwise silently fail hours later when the auto-publisher picks
  // it up. A vendor who has seen the warning and still wants to proceed
  // (e.g. they're about to reconnect before the scheduled time) can pass
  // `force: true` to schedule anyway.
  const warnings = await getConnectionWarnings(existing.vendorId, existing.platforms, existing.socialAccountIds ?? []);
  if (warnings.length > 0 && !parsed.data.force) {
    res.status(409).json({
      error: "One or more selected platforms has no usable connected account. Reconnect it, or confirm to schedule anyway.",
      warnings,
    });
    return;
  }

  const [post] = await db
    .update(postsTable)
    .set({ status: "scheduled", scheduledAt: scheduledDate, autoPublishFailed: false, reminderSentAt: null })
    .where(and(eq(postsTable.id, params.data.id), eq(postsTable.status, "approved")))
    .returning();
  if (!post) { res.status(409).json({ error: `Cannot schedule a post with status "${existing.status}". It must be approved first.` }); return; }
  res.json(GetPostResponse.parse(serializePost(post)));
});

/**
 * Point-in-time check of whether this post's selected platforms each have a
 * usable connected account, without scheduling anything. The Social Hub's
 * schedule dialog calls this to surface a warning before the vendor confirms.
 */
router.get("/posts/:id/connection-warnings", async (req, res): Promise<void> => {
  const params = PublishPostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [existing] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }
  const authed = await resolveAuthedVendor(req);
  if (!authed.isAdmin && authed.vendorId !== existing.vendorId) { res.status(403).json({ error: "You do not have permission to view this post." }); return; }
  const warnings = await getConnectionWarnings(existing.vendorId, existing.platforms, existing.socialAccountIds ?? []);
  res.json(GetPostConnectionWarningsResponse.parse({ warnings }));
});

/** Cancels a pending schedule, clearing scheduledAt and sending the post back to draft so it can be re-reviewed before going out any other way. */
router.post("/posts/:id/cancel-schedule", async (req, res): Promise<void> => {
  const params = CancelPostScheduleParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [existing] = await db.select({ vendorId: postsTable.vendorId, status: postsTable.status }).from(postsTable).where(eq(postsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }
  const authed = await resolveAuthedVendor(req);
  if (!authed.isAdmin && authed.vendorId !== existing.vendorId) { res.status(403).json({ error: "You do not have permission to update this post." }); return; }

  const [post] = await db
    .update(postsTable)
    .set({ status: "draft", scheduledAt: null, autoPublishFailed: false })
    .where(and(eq(postsTable.id, params.data.id), eq(postsTable.status, "scheduled")))
    .returning();
  if (!post) { res.status(409).json({ error: `Cannot cancel a schedule on a post with status "${existing.status}".` }); return; }
  res.json(GetPostResponse.parse(serializePost(post)));
});

router.get("/posts/:id/publications", async (req, res): Promise<void> => {
  const params = PublishPostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [existing] = await db.select({ vendorId: postsTable.vendorId }).from(postsTable).where(eq(postsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }
  const authed = await resolveAuthedVendor(req);
  if (!authed.isAdmin && authed.vendorId !== existing.vendorId) { res.status(403).json({ error: "You do not have permission to view this post." }); return; }
  const rows = await db.select().from(postPublicationsTable).where(eq(postPublicationsTable.postId, params.data.id)).orderBy(desc(postPublicationsTable.publishedAt));
  res.json(rows.map(serializePublication));
});

function serializePost(post: typeof postsTable.$inferSelect) {
  return {
    ...post,
    scheduledAt: post.scheduledAt ? post.scheduledAt.toISOString() : null,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    createdAt: post.createdAt.toISOString(),
  };
}

export default router;
