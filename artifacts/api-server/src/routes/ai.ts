import { Router, type IRouter } from "express";
import { z } from "zod";

/** Inline schema — matches GenerateAiContentInput in openapi.yaml.
 *  Defined here because api-zod codegen has not yet been run for this schema. */
const GenerateAiContentBody = z.object({
  vendorId: z.number().int(),
  topic: z.string().max(1000),
  outputTypes: z.array(z.enum(["social_post", "article", "academic", "image", "video"])).min(1),
  tone: z.enum(["professional", "casual", "educational", "promotional"]).optional(),
  language: z.enum(["english", "hausa", "yoruba", "igbo"]).optional(),
  /** Target platform for social posts — affects character limits and link strategy */
  platform: z.enum(["instagram", "facebook", "linkedin", "twitter", "x"]).optional(),
  /** Include product/shop link in the post */
  includeProductLink: z.boolean().optional(),
  /** Include vendor website link */
  includeWebsiteLink: z.boolean().optional(),
  /** Include mobile app link */
  includeAppLink: z.boolean().optional(),
});
import { getAuth } from "@clerk/express";
import { db, aiGenerationsTable, vendorUploadsTable, vendorsTable, draftVideoScenesTable, vendorContentLibraryTable } from "@workspace/db";
import { getVendorLinks, linksSystemContext, linksFooter, type VendorLinks } from "../lib/vendor-links";
import { eq, and, desc, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";
import { ai as gemini } from "@workspace/integrations-gemini-ai";
import { generateVideoBuffer, type MotionTemplate, type VideoScene } from "../lib/video-generation";
import { extractVideoFrames } from "../lib/video-frames";
import { generateMusicBuffer } from "../lib/ai-music";
import { buildMusicPrompt } from "../lib/ai-music-prompt";
import { storeGeneratedMedia, extractMediaObjectId } from "../lib/generated-media-storage";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import { consumeQuota, releaseQuota, getVendorForUsage, quotaExceededMessage } from "../lib/usage";
import {
  GenerateAiImageBody,
  GenerateAiVideoScenesBody,
  RegenerateAiVideoSceneBody,
  RenderAiVideoBody,
  GenerateAiCaptionBody,
  GetAiVideoUploadUrlBody,
  GetAiImageUploadUrlBody,
  AnalyzeVideoCaptionBody,
  ListAiGenerationsQueryParams,
  GenerateAiImageResponse,
  GenerateAiVideoScenesResponse,
  RegenerateAiVideoSceneResponse,
  RenderAiVideoResponse,
  GenerateAiCaptionResponse,
  GetAiVideoUploadUrlResponse,
  GetAiImageUploadUrlResponse,
  AnalyzeVideoCaptionResponse,
  ListAiGenerationsResponse,
  GetDraftVideoScenesQueryParams,
  GetDraftVideoScenesResponse,
  SaveDraftVideoScenesBody,
  SaveDraftVideoScenesResponse,
  ClearDraftVideoScenesBody,
  ClearDraftVideoScenesResponse,
} from "@workspace/api-zod";

const objectStorageService = new ObjectStorageService();

/** Drizzle returns timestamp columns as Date objects, but the generated response
 *  schemas expect plain strings (or null). Converts all known timestamp fields. */
function serializeGeneration<T extends {
  createdAt: Date | string;
  mediaWarningSentAt?: Date | string | null;
  mediaDeletedAt?: Date | string | null;
}>(generation: T): Omit<T, "createdAt" | "mediaWarningSentAt" | "mediaDeletedAt"> & {
  createdAt: string;
  mediaWarningSentAt?: string | null;
  mediaDeletedAt?: string | null;
} {
  return {
    ...generation,
    createdAt: generation.createdAt instanceof Date ? generation.createdAt.toISOString() : generation.createdAt,
    mediaWarningSentAt: generation.mediaWarningSentAt instanceof Date
      ? generation.mediaWarningSentAt.toISOString()
      : (generation.mediaWarningSentAt ?? null),
    mediaDeletedAt: generation.mediaDeletedAt instanceof Date
      ? generation.mediaDeletedAt.toISOString()
      : (generation.mediaDeletedAt ?? null),
  };
}

/** Gemini's inline (non-Files-API) request payload is capped at 8MB — see the
 *  ai-integrations-gemini skill. Videos under this are sent whole; larger
 *  ones fall back to a handful of extracted still frames instead. */
const GEMINI_INLINE_MAX_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;

const router: IRouter = Router();

const MAX_PROMPT_LEN = 500;
const MAX_CAPTION_OVERLAY_LEN = 500;

/** Shared with /ai/generate-video-scenes so the still frames it's built from match the image endpoint's style. */
function buildImagePrompt(prompt: string, style?: string, industry?: string): string {
  return [
    prompt,
    style ? `Style: ${style}` : "",
    industry ? `Industry: ${industry}` : "",
    "Wide 16:9 social media post image, professional marketing quality.",
  ].filter(Boolean).join(". ");
}

/**
 * Resolves the calling Clerk user to their own vendor row (or confirms admin status).
 * Mirrors the ownership pattern used in vendors.ts/posts.ts — identity/ownership is
 * always derived server-side from the verified session, never trusted from the body.
 */
async function resolveAuthedVendor(req: import("express").Request): Promise<{ vendorId: number | null; isAdmin: boolean }> {
  const { userId } = getAuth(req);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

router.post("/ai/generate-image", async (req, res): Promise<void> => {
  const parsed = GenerateAiImageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId, prompt, style, industry } = parsed.data;

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== vendorId) { res.status(403).json({ error: "You can only generate content for your own vendor account." }); return; }
  if (prompt.length > MAX_PROMPT_LEN) { res.status(400).json({ error: `Prompt must be ${MAX_PROMPT_LEN} characters or fewer.` }); return; }

  const usageVendor = await getVendorForUsage(vendorId);
  if (!usageVendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  // Reserve quota atomically BEFORE generating (so concurrent requests can
  // never both pass a stale read and jointly overshoot the limit). Refund
  // below if generation ends up failing.
  const quotaCheck = await consumeQuota(usageVendor, "aiImages", 1);
  if (!quotaCheck.allowed) { res.status(402).json({ error: quotaExceededMessage(usageVendor, quotaCheck), usage: quotaCheck }); return; }

  const fullPrompt = buildImagePrompt(prompt, style, industry);

  let result: string;
  let status: "completed" | "failed" = "completed";
  try {
    // 1536x1024 landscape at "high" quality matches the wide 16:9 social post
    // framing requested in buildImagePrompt and is gpt-image-1's sharpest tier
    // (vs. the previous unset-quality/square default, which rendered soft and
    // cropped the composition to a square).
    const buffer = await generateImageBuffer(fullPrompt, "1536x1024", "high");
    // Stored in object storage (not a base64 data: URI) so the resulting URL is
    // publicly fetchable — Instagram's Content Publishing API requires that for
    // the post's image, and a data: URI could never satisfy it.
    const { publicUrl } = await storeGeneratedMedia(buffer, "image/png");
    result = publicUrl;
  } catch (err) {
    status = "failed";
    result = `Image generation failed: ${err instanceof Error ? err.message : "unknown error"}`;
  }

  if (status === "failed") await releaseQuota(vendorId, "aiImages", 1, quotaCheck.periodStart, quotaCheck.addonAllocations);

  const [generation] = await db.insert(aiGenerationsTable).values({
    vendorId,
    type: "image",
    prompt: fullPrompt,
    result,
    status,
  }).returning();

  const serialized = serializeGeneration(generation);
  if (status === "failed") { res.status(502).json(GenerateAiImageResponse.parse(serialized)); return; }
  res.json(GenerateAiImageResponse.parse(serialized));
});

/**
 * Splits a base image prompt into N distinct-but-consistent scene prompts for
 * a multi-scene video (e.g. wide shot, close-up, in-use shot). Falls back to
 * reusing the base prompt for every scene if the model call fails or returns
 * something unusable — multi-scene still works, the scenes are just less varied.
 */
async function buildScenePrompts(basePrompt: string, sceneCount: number): Promise<string[]> {
  if (sceneCount <= 1) return [basePrompt];
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      max_completion_tokens: 400,
      messages: [
        {
          role: "system",
          content: `You write short image-generation prompts for a multi-scene product video. Given a base product/marketing image prompt, produce exactly ${sceneCount} distinct scene prompts that show the same product/subject from different angles, framings, or moments (e.g. wide establishing shot, close-up detail, in-use/lifestyle shot). Each must stay consistent with the base prompt's subject, style, and industry. Return ONLY a JSON array of ${sceneCount} strings, no other text.`,
        },
        { role: "user", content: basePrompt },
      ],
    });
    const raw = (response.choices[0]?.message?.content ?? "").trim().replace(/^```json\s*|```$/g, "");
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === sceneCount && parsed.every((p) => typeof p === "string" && p.trim())) {
      return (parsed as string[]).map((p) => `${p.trim()}. Wide 16:9 social media post image, professional marketing quality.`);
    }
    throw new Error("unexpected scene prompt format");
  } catch (err) {
    logger.warn({ err }, "AI video scene prompt generation failed; reusing the base prompt for every scene");
    return Array.from({ length: sceneCount }, () => basePrompt);
  }
}

/**
 * Generates the per-scene preview images for a multi-scene video (1-3
 * scenes) WITHOUT rendering anything — this is the step that lets a vendor
 * see what each scene looks like before spending any AI video quota. Each
 * scene image is billed against `aiImages` quota (same cost as calling
 * /ai/generate-image once per scene) and persisted as its own `type: "image"`
 * AiGeneration row, so an unconfirmed/abandoned preview is picked up by the
 * same orphaned-media cleanup job as any other unused AI image — no separate
 * cleanup path needed.
 */
router.post("/ai/generate-video-scenes", async (req, res): Promise<void> => {
  const parsed = GenerateAiVideoScenesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId, prompt, style, industry, sceneCount } = parsed.data;

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== vendorId) { res.status(403).json({ error: "You can only generate content for your own vendor account." }); return; }
  if (prompt.length > MAX_PROMPT_LEN) { res.status(400).json({ error: `Prompt must be ${MAX_PROMPT_LEN} characters or fewer.` }); return; }

  const usageVendor = await getVendorForUsage(vendorId);
  if (!usageVendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  const resolvedSceneCount = Math.min(Math.max(sceneCount ?? 1, 1), 3);
  const quotaCheck = await consumeQuota(usageVendor, "aiImages", resolvedSceneCount);
  if (!quotaCheck.allowed) { res.status(402).json({ error: quotaExceededMessage(usageVendor, quotaCheck), usage: quotaCheck }); return; }

  const fullPrompt = buildImagePrompt(prompt, style, industry);

  try {
    const scenePrompts = await buildScenePrompts(fullPrompt, resolvedSceneCount);
    const imageBuffers = await Promise.all(scenePrompts.map((p) => generateImageBuffer(p, "1536x1024", "high")));
    const imageUrls = await Promise.all(imageBuffers.map(async (buffer) => (await storeGeneratedMedia(buffer, "image/png")).publicUrl));

    const generations = await db.insert(aiGenerationsTable).values(
      scenePrompts.map((scenePrompt, i) => ({
        vendorId,
        type: "image" as const,
        prompt: scenePrompt,
        result: imageUrls[i],
        status: "completed" as const,
      })),
    ).returning();

    res.json(GenerateAiVideoScenesResponse.parse({ scenes: generations.map(serializeGeneration) }));
  } catch (err) {
    await releaseQuota(vendorId, "aiImages", resolvedSceneCount, quotaCheck.periodStart, quotaCheck.addonAllocations);
    res.status(502).json({ error: `Scene generation failed: ${err instanceof Error ? err.message : "unknown error"}` });
  }
});

/**
 * Regenerates a single scene's preview image (e.g. the vendor didn't like
 * it) without touching any other scene. `prompt` is the scene-specific
 * prompt from the /ai/generate-video-scenes result, optionally edited by the
 * vendor. Billed as one more `aiImages` unit, same as any other single image
 * generation, and recorded as its own AiGeneration row for the same
 * cleanup-job coverage as generate-video-scenes.
 */
router.post("/ai/regenerate-video-scene", async (req, res): Promise<void> => {
  const parsed = RegenerateAiVideoSceneBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId, prompt } = parsed.data;

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== vendorId) { res.status(403).json({ error: "You can only generate content for your own vendor account." }); return; }
  if (prompt.length > MAX_PROMPT_LEN) { res.status(400).json({ error: `Prompt must be ${MAX_PROMPT_LEN} characters or fewer.` }); return; }

  const usageVendor = await getVendorForUsage(vendorId);
  if (!usageVendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  const quotaCheck = await consumeQuota(usageVendor, "aiImages", 1);
  if (!quotaCheck.allowed) { res.status(402).json({ error: quotaExceededMessage(usageVendor, quotaCheck), usage: quotaCheck }); return; }

  let result: string;
  let status: "completed" | "failed" = "completed";
  try {
    const buffer = await generateImageBuffer(prompt, "1536x1024", "high");
    const { publicUrl } = await storeGeneratedMedia(buffer, "image/png");
    result = publicUrl;
  } catch (err) {
    status = "failed";
    result = `Scene regeneration failed: ${err instanceof Error ? err.message : "unknown error"}`;
  }

  if (status === "failed") await releaseQuota(vendorId, "aiImages", 1, quotaCheck.periodStart, quotaCheck.addonAllocations);

  const [generation] = await db.insert(aiGenerationsTable).values({
    vendorId,
    type: "image",
    prompt,
    result,
    status,
  }).returning();

  const serialized = serializeGeneration(generation);
  if (status === "failed") { res.status(502).json(RegenerateAiVideoSceneResponse.parse(serialized)); return; }
  res.json(RegenerateAiVideoSceneResponse.parse(serialized));
});

/** Fetches a scene image's bytes from its own public /api/media/:objectId URL
 *  (generated by storeGeneratedMedia, already ACL'd public — unlike vendor
 *  uploads, no ACL fix-up is needed before fetching it back). */
async function fetchGeneratedMediaBuffer(mediaUrl: string): Promise<Buffer> {
  const response = await fetch(mediaUrl);
  if (!response.ok) throw new Error(`Could not fetch scene image (status ${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Resolves each client-supplied scene URL to the canonical URL WE stored for
 * one of this vendor's own completed image generations, and rejects
 * anything else. This is a security boundary, not just data plumbing:
 * without it, /ai/render-video would let an authenticated vendor point the
 * server's fetch() at an arbitrary URL (SSRF — internal services, cloud
 * metadata endpoints, another vendor's private media, etc). By requiring
 * every URL to match an `aiGenerationsTable` row this vendor owns, and by
 * fetching the row's own stored `result` value rather than the
 * client-supplied string, the server never fetches a URL it didn't
 * originally mint and store itself.
 */
async function resolveOwnedSceneImageUrls(vendorId: number, urls: string[]): Promise<string[]> {
  const objectIds = urls.map((url) => extractMediaObjectId(url));
  const unrecognized = objectIds.some((id) => !id);
  if (unrecognized) {
    throw new Error("One or more scene image URLs are not recognized generated-media URLs.");
  }

  const ownedImages = await db
    .select({ result: aiGenerationsTable.result })
    .from(aiGenerationsTable)
    .where(and(eq(aiGenerationsTable.vendorId, vendorId), eq(aiGenerationsTable.type, "image")));

  const ownedByObjectId = new Map<string, string>();
  for (const row of ownedImages) {
    if (!row.result) continue;
    const id = extractMediaObjectId(row.result);
    if (id) ownedByObjectId.set(id, row.result);
  }

  return objectIds.map((objectId) => {
    const ownedUrl = ownedByObjectId.get(objectId as string);
    if (!ownedUrl) {
      throw new Error("One or more scene images were not found among this vendor's own generated images.");
    }
    return ownedUrl;
  });
}

/**
 * Renders the final video from scene images the vendor has already
 * previewed/confirmed (from /ai/generate-video-scenes and/or
 * /ai/regenerate-video-scene) — applying motion templates, crossfade
 * transitions between scenes, the caption overlay on the opening scene, and
 * an optional short instrumental background track. This is the only step
 * that spends `aiVideos` quota; no new scene images are generated here.
 * There's no supported text-to-video model available server-side (see
 * media-generation skill — OpenAI/Gemini AI Integrations don't support video
 * output), so this builds a real, relevant mp4 from the confirmed image(s)
 * rather than mocking a placeholder clip.
 */
router.post("/ai/render-video", async (req, res): Promise<void> => {
  const parsed = RenderAiVideoBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId, prompt, sceneImageUrls, captionText, motionTemplate, includeMusic, musicMood } = parsed.data;

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== vendorId) { res.status(403).json({ error: "You can only generate content for your own vendor account." }); return; }
  if (prompt.length > MAX_PROMPT_LEN) { res.status(400).json({ error: `Prompt must be ${MAX_PROMPT_LEN} characters or fewer.` }); return; }
  if (captionText && captionText.length > MAX_CAPTION_OVERLAY_LEN) { res.status(400).json({ error: `Caption must be ${MAX_CAPTION_OVERLAY_LEN} characters or fewer.` }); return; }

  // Resolve every scene URL to this vendor's own stored generation BEFORE
  // spending any quota or fetching anything — see resolveOwnedSceneImageUrls
  // for why this can't just trust the client-supplied URLs (SSRF).
  let ownedSceneImageUrls: string[];
  try {
    ownedSceneImageUrls = await resolveOwnedSceneImageUrls(vendorId, sceneImageUrls);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid scene image URLs" });
    return;
  }

  const usageVendor = await getVendorForUsage(vendorId);
  if (!usageVendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  const quotaCheck = await consumeQuota(usageVendor, "aiVideos", 1);
  if (!quotaCheck.allowed) { res.status(402).json({ error: quotaExceededMessage(usageVendor, quotaCheck), usage: quotaCheck }); return; }

  const resolvedMotionTemplate: MotionTemplate | "auto" = motionTemplate ?? "auto";

  let result: string;
  let status: "completed" | "failed" = "completed";
  try {
    const imageBuffers = await Promise.all(ownedSceneImageUrls.map(fetchGeneratedMediaBuffer));
    const scenes: VideoScene[] = imageBuffers.map((imageBuffer, i) => ({
      imageBuffer,
      // Only burn the caption in on the opening scene so multi-scene videos
      // don't repeat the same overlay text across every cut.
      overlayText: i === 0 ? (captionText ?? prompt) : undefined,
    }));

    let musicBuffer: Buffer | undefined;
    if (includeMusic) {
      try {
        const approxDurationSeconds = scenes.length === 1 ? 6 : scenes.length * 5 - (scenes.length - 1) * 0.6;
        // Derive a content-aware music prompt from the video's own prompt and
        // caption (and optional vendor mood pick) instead of a fixed string.
        const musicPrompt = await buildMusicPrompt(prompt, captionText, musicMood);
        logger.info({ musicPrompt }, "AI video: using derived music prompt");
        musicBuffer = await generateMusicBuffer(musicPrompt, approxDurationSeconds);
      } catch (err) {
        // Background music is a nice-to-have; failing to generate it should
        // never block the video itself.
        logger.warn({ err }, "AI video music generation failed; continuing without music");
      }
    }

    const videoBuffer = await generateVideoBuffer(scenes, { motionTemplate: resolvedMotionTemplate, musicBuffer });
    // Stored in object storage (not a base64 data: URI) for the same reason as
    // generate-image — a publicly fetchable URL is what platform publish APIs need.
    const { publicUrl } = await storeGeneratedMedia(videoBuffer, "video/mp4");
    result = publicUrl;
  } catch (err) {
    status = "failed";
    result = `Video generation failed: ${err instanceof Error ? err.message : "unknown error"}`;
  }

  if (status === "failed") await releaseQuota(vendorId, "aiVideos", 1, quotaCheck.periodStart, quotaCheck.addonAllocations);

  const [generation] = await db.insert(aiGenerationsTable).values({
    vendorId,
    type: "video",
    prompt,
    result,
    status,
  }).returning();

  const serialized = serializeGeneration(generation);
  if (status === "failed") { res.status(502).json(RenderAiVideoResponse.parse(serialized)); return; }
  res.json(RenderAiVideoResponse.parse(serialized));
});

router.post("/ai/generate-caption", async (req, res): Promise<void> => {
  const parsed = GenerateAiCaptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId, topic, platform, tone, includeHashtags, includeEmoji } = parsed.data;

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== vendorId) { res.status(403).json({ error: "You can only generate content for your own vendor account." }); return; }
  if (topic.length > MAX_PROMPT_LEN) { res.status(400).json({ error: `Topic must be ${MAX_PROMPT_LEN} characters or fewer.` }); return; }

  const usageVendor = await getVendorForUsage(vendorId);
  if (!usageVendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  const quotaCheck = await consumeQuota(usageVendor, "aiCaptions", 1);
  if (!quotaCheck.allowed) { res.status(402).json({ error: quotaExceededMessage(usageVendor, quotaCheck), usage: quotaCheck }); return; }

  const toneMap: Record<string, string> = {
    professional: "professional and authoritative",
    casual: "friendly and conversational",
    urgent: "urgent and action-oriented",
    inspirational: "motivating and inspiring",
  };
  const toneDesc = toneMap[tone ?? "professional"] ?? "professional and authoritative";
  const platformLimits: Record<string, number> = {
    twitter: 280,
    instagram: 2200,
    facebook: 63206,
    linkedin: 3000,
  };
  const limit = platformLimits[platform?.toLowerCase() ?? ""] ?? 500;

  // Fetch vendor's public links to weave into the caption
  const vendorLinks = await getVendorLinks(vendorId).catch(() => null);

  let result: string;
  let status: "completed" | "failed" = "completed";
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      max_completion_tokens: 500,
      messages: [
        {
          role: "system",
          content: `You write short, high-converting social media captions for small business vendors. Tone: ${toneDesc}. Target platform: ${platform ?? "general"}. Hard limit: ${limit} characters. Never use placeholder brackets. Return only the caption text, no quotes or preamble.${includeHashtags ? " End with 3-5 relevant hashtags." : " Do not include hashtags."}${includeEmoji ? " Use 1-3 tasteful emoji." : " Do not use emoji."}${linksSystemContext(vendorLinks)}`,
        },
        { role: "user", content: `Write a caption about: ${topic}` },
      ],
    });
    result = (response.choices[0]?.message?.content ?? "").trim().slice(0, limit);
    if (!result) throw new Error("empty response from model");
  } catch (err) {
    status = "failed";
    result = `Caption generation failed: ${err instanceof Error ? err.message : "unknown error"}`;
  }

  if (status === "failed") await releaseQuota(vendorId, "aiCaptions", 1, quotaCheck.periodStart, quotaCheck.addonAllocations);

  const [generation] = await db.insert(aiGenerationsTable).values({
    vendorId,
    type: "caption",
    prompt: `${topic} | ${platform} | ${toneDesc}`,
    result,
    status,
  }).returning();

  const serialized = serializeGeneration(generation);
  if (status === "failed") { res.status(502).json(GenerateAiCaptionResponse.parse(serialized)); return; }
  res.json(GenerateAiCaptionResponse.parse(serialized));
});

/**
 * Returns a presigned PUT URL for a vendor to upload a video's raw bytes
 * directly to object storage, plus the public URL it'll be reachable at
 * once uploaded (served by routes/media.ts). Mirrors the presigned-upload
 * mechanism generated-media-storage.ts uses server-side, but exposes it to
 * the client so vendors can upload their OWN video (not an AI-generated one).
 */
router.post("/ai/upload-video-url", async (req, res): Promise<void> => {
  const parsed = GetAiVideoUploadUrlBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId } = parsed.data;

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== vendorId) { res.status(403).json({ error: "You can only upload video for your own vendor account." }); return; }

  const base = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
  if (!base) { res.status(500).json({ error: "No public domain configured for media uploads." }); return; }

  const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
  const objectPath = objectStorageService.normalizeObjectEntityPath(uploadUrl);
  const objectId = objectPath.replace(/^\/objects\/uploads\//, "");
  const videoUrl = `https://${base}/api/media/${objectId}`;

  // Record the upload so the media-cleanup job can sweep it if the vendor
  // never attaches it to a saved post (or if a post that used it is deleted).
  await db.insert(vendorUploadsTable).values({ vendorId, mediaUrl: videoUrl, mediaType: "video" });

  res.json(GetAiVideoUploadUrlResponse.parse({ uploadUrl, videoUrl }));
});

/**
 * Returns a presigned PUT URL for a vendor to upload their own photo's raw
 * bytes directly to object storage, plus the public URL it'll be reachable
 * at once uploaded (served by routes/media.ts). Mirrors /ai/upload-video-url,
 * but the resulting imageUrl is used directly as post media — no AI analysis
 * step, since a photo needs no captioning of its own content to be usable.
 */
router.post("/ai/upload-image-url", async (req, res): Promise<void> => {
  const parsed = GetAiImageUploadUrlBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId } = parsed.data;

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== vendorId) { res.status(403).json({ error: "You can only upload media for your own vendor account." }); return; }

  const base = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
  if (!base) { res.status(500).json({ error: "No public domain configured for media uploads." }); return; }

  const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
  const objectPath = objectStorageService.normalizeObjectEntityPath(uploadUrl);
  const objectId = objectPath.replace(/^\/objects\/uploads\//, "");
  const imageUrl = `https://${base}/api/media/${objectId}`;

  // Record the upload so the media-cleanup job can sweep it if the vendor
  // never attaches it to a saved post (or if a post that used it is deleted).
  await db.insert(vendorUploadsTable).values({ vendorId, mediaUrl: imageUrl, mediaType: "image" });

  res.json(GetAiImageUploadUrlResponse.parse({ uploadUrl, imageUrl }));
});

/** Downloads the vendor's uploaded video and, once it's public, marks its ACL so the
 *  same public /api/media/:objectId route the caption endpoint reads from can serve it. */
async function fetchUploadedVideo(videoUrl: string): Promise<Buffer> {
  const objectIdMatch = videoUrl.match(/\/api\/media\/([^/?]+)/);
  if (objectIdMatch) {
    const objectPath = `/objects/uploads/${objectIdMatch[1]}`;
    await objectStorageService.trySetObjectEntityAclPolicy(objectPath, { owner: "system:vendor-upload", visibility: "public" });
  }
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Could not fetch uploaded video (status ${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Analyzes the actual visual/audio content of a vendor-uploaded video and
 * writes a catchy, platform-appropriate caption for it — distinct from
 * /ai/generate-caption, which writes copy from a topic string with no
 * knowledge of any real media. Uses Gemini (the only AI Integrations
 * provider that accepts video input; OpenAI's proxy explicitly does not).
 * Videos small enough to fit Gemini's 8MB inline request limit are sent
 * whole (so narration/audio is considered too); larger videos fall back to
 * a handful of extracted still frames, since true chunked video splitting
 * is out of scope here.
 */
router.post("/ai/analyze-video-caption", async (req, res): Promise<void> => {
  const parsed = AnalyzeVideoCaptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId, videoUrl, platform, tone, includeHashtags, includeEmoji } = parsed.data;

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== vendorId) { res.status(403).json({ error: "You can only generate content for your own vendor account." }); return; }

  const usageVendor = await getVendorForUsage(vendorId);
  if (!usageVendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  const quotaCheck = await consumeQuota(usageVendor, "aiCaptions", 1);
  if (!quotaCheck.allowed) { res.status(402).json({ error: quotaExceededMessage(usageVendor, quotaCheck), usage: quotaCheck }); return; }

  const toneMap: Record<string, string> = {
    professional: "professional and authoritative",
    casual: "friendly and conversational",
    urgent: "urgent and action-oriented",
    inspirational: "motivating and inspiring",
  };
  const toneDesc = toneMap[tone ?? "professional"] ?? "professional and authoritative";
  const platformLimits: Record<string, number> = {
    twitter: 280,
    instagram: 2200,
    facebook: 63206,
    linkedin: 3000,
  };
  const limit = platformLimits[platform?.toLowerCase() ?? ""] ?? 500;

  // Fetch vendor's public links to weave into the caption
  const vendorLinks = await getVendorLinks(vendorId).catch(() => null);

  const instruction = `Watch this video and write ONE short, high-converting social media caption that accurately reflects what actually happens/is shown in it — do not invent details it doesn't contain. Tone: ${toneDesc}. Target platform: ${platform ?? "general"}. Hard limit: ${limit} characters. Never use placeholder brackets. Return only the caption text, no quotes, no preamble, no description of the video itself.${includeHashtags ? " End with 3-5 relevant hashtags." : " Do not include hashtags."}${includeEmoji ? " Use 1-3 tasteful emoji." : " Do not use emoji."}${linksSystemContext(vendorLinks)}`;

  let result: string;
  let status: "completed" | "failed" = "completed";
  try {
    const videoBuffer = await fetchUploadedVideo(videoUrl);
    if (videoBuffer.length > MAX_VIDEO_UPLOAD_BYTES) {
      throw new Error(`Video is too large (max ${MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)}MB)`);
    }

    let parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
    if (videoBuffer.length <= GEMINI_INLINE_MAX_BYTES) {
      parts = [
        { inlineData: { mimeType: "video/mp4", data: videoBuffer.toString("base64") } },
        { text: instruction },
      ];
    } else {
      // Too large to inline as video — fall back to sampled still frames so
      // the caption is still grounded in the video's real visual content.
      const frames = await extractVideoFrames(videoBuffer, 6);
      parts = [
        ...frames.map((frame) => ({ inlineData: { mimeType: "image/jpeg", data: frame.toString("base64") } })),
        { text: `These are ${frames.length} still frames sampled evenly across a longer video. ${instruction}` },
      ];
    }

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      config: { maxOutputTokens: 8192 },
    });
    result = (response.text ?? "").trim().slice(0, limit);
    if (!result) throw new Error("empty response from model");
  } catch (err) {
    status = "failed";
    result = `Video caption generation failed: ${err instanceof Error ? err.message : "unknown error"}`;
  }

  if (status === "failed") await releaseQuota(vendorId, "aiCaptions", 1, quotaCheck.periodStart, quotaCheck.addonAllocations);

  const [generation] = await db.insert(aiGenerationsTable).values({
    vendorId,
    type: "video-caption",
    prompt: `video:${videoUrl} | ${platform ?? ""} | ${toneDesc}`,
    result,
    status,
  }).returning();

  const serialized = serializeGeneration(generation);
  if (status === "failed") { res.status(502).json(AnalyzeVideoCaptionResponse.parse(serialized)); return; }
  res.json(AnalyzeVideoCaptionResponse.parse(serialized));
});

/**
 * GET /ai/draft-video-scenes — returns the stored scene draft for a vendor, or
 * null if no draft exists. Called on Create Post mount to restore any scenes
 * the vendor had open when they previously left the page.
 */
router.get("/ai/draft-video-scenes", async (req, res): Promise<void> => {
  const params = GetDraftVideoScenesQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const { vendorId } = params.data;

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== vendorId) { res.status(403).json({ error: "You can only access your own draft." }); return; }

  const [row] = await db.select().from(draftVideoScenesTable).where(eq(draftVideoScenesTable.vendorId, vendorId));
  res.json(GetDraftVideoScenesResponse.parse({ scenes: row?.scenes ?? null }));
});

/**
 * PUT /ai/draft-video-scenes — upsert the in-progress scene draft for a vendor.
 * Called after scene generation, after per-scene prompt edits (debounced on the
 * frontend), and after per-scene image regeneration, so a server-side copy is
 * always up to date.
 */
router.put("/ai/draft-video-scenes", async (req, res): Promise<void> => {
  const parsed = SaveDraftVideoScenesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId, scenes } = parsed.data;

  // Server-side prompt length guard — mirrors the MAX_PROMPT_LEN check on all
  // generation endpoints so a direct API call can't bypass the client guard.
  for (const scene of scenes) {
    if (typeof scene.prompt === "string" && scene.prompt.length > MAX_PROMPT_LEN) {
      res.status(400).json({ error: `Scene prompt must be ${MAX_PROMPT_LEN} characters or fewer.` });
      return;
    }
  }

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== vendorId) { res.status(403).json({ error: "You can only save your own draft." }); return; }

  await db.insert(draftVideoScenesTable)
    .values({ vendorId, scenes, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: draftVideoScenesTable.vendorId,
      set: { scenes, updatedAt: new Date() },
    });

  res.json(SaveDraftVideoScenesResponse.parse({ ok: true }));
});

/**
 * DELETE /ai/draft-video-scenes — clear the stored draft after the vendor
 * renders or discards their scenes, so stale data never restores on the next
 * visit to Create Post.
 */
router.delete("/ai/draft-video-scenes", async (req, res): Promise<void> => {
  const parsed = ClearDraftVideoScenesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId } = parsed.data;

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== vendorId) { res.status(403).json({ error: "You can only clear your own draft." }); return; }

  await db.delete(draftVideoScenesTable).where(eq(draftVideoScenesTable.vendorId, vendorId));
  res.json(ClearDraftVideoScenesResponse.parse({ ok: true }));
});

router.get("/ai/generations", async (req, res): Promise<void> => {
  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = ListAiGenerationsQueryParams.safeParse(req.query);
  if (!isAdmin && params.success && params.data.vendorId && params.data.vendorId !== authedVendorId) {
    res.status(403).json({ error: "You can only view your own vendor's AI generations." });
    return;
  }

  let generations = await db.select().from(aiGenerationsTable).orderBy(desc(aiGenerationsTable.createdAt));
  if (!isAdmin) generations = generations.filter((g) => g.vendorId === authedVendorId);
  if (params.success) {
    if (params.data.vendorId) generations = generations.filter((g) => g.vendorId === params.data.vendorId);
    if (params.data.type) generations = generations.filter((g) => g.type === params.data.type);
  }
  res.json(ListAiGenerationsResponse.parse(generations.map(serializeGeneration)));
});

// ─── AI CONTENT STUDIO ────────────────────────────────────────────────────────

/**
 * Generates long-form text content (article or academic paper) for the
 * Content Studio using OpenAI. Language-aware: adds a language instruction
 * when a non-English language is selected.
 */
async function generateLongForm(
  topic: string,
  tone: string,
  language: string,
  style: "article" | "academic",
  links?: VendorLinks | null,
): Promise<string> {
  const toneMap: Record<string, string> = {
    professional: "professional and authoritative",
    casual: "friendly and conversational",
    educational: "clear, educational and informative",
    promotional: "persuasive and promotional",
  };
  const toneDesc = toneMap[tone] ?? "professional and authoritative";
  const langLabel =
    language === "hausa" ? "Hausa (Harshen Hausa)" :
    language === "yoruba" ? "Yoruba" :
    language === "igbo" ? "Igbo" : "";
  const langInstruction = langLabel
    ? `\n\nIMPORTANT: Write the entire response in ${langLabel} language.`
    : "";

  if (style === "article") {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      max_completion_tokens: 1500,
      messages: [
        {
          role: "system",
          content:
            `You are an expert content writer for small and medium businesses in Nigeria and West Africa. Write a structured article with a ${toneDesc} tone. Structure: compelling headline (H1), engaging 2-3 sentence introduction, 3-4 body sections each with an H2 subheading and substantive paragraphs, clear conclusion with a call-to-action. Target length: 600-900 words. Do not use placeholder brackets.${langInstruction}`,
        },
        { role: "user", content: `Write an article about: ${topic}` },
      ],
    });
    return (response.choices[0]?.message?.content ?? "").trim() + linksFooter(links ?? null);
  } else {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      max_completion_tokens: 2000,
      messages: [
        {
          role: "system",
          content:
            `You are an academic writer with expertise in business and economics. Write a formal academic-style paper with a ${toneDesc} tone. Structure: Title, Abstract (150-200 words), 1. Introduction, 2. Background and Literature Context, 3. Analysis and Discussion (2-3 subsections), 4. Conclusion, References (3-5 illustrative citations in APA style — label them as illustrative). Target length: 900-1200 words. Use formal academic language. Do not use placeholder brackets.${langInstruction}`,
        },
        { role: "user", content: `Write an academic paper about: ${topic}` },
      ],
    });
    return (response.choices[0]?.message?.content ?? "").trim() + linksFooter(links ?? null);
  }
}

/**
 * Builds a link-injection hint for social post generation.
 * X/Twitter gets at most ONE link (it eats 23 chars from a 280-char budget).
 * Other platforms get up to 2 most-relevant links.
 */
function buildSocialLinkHint(
  links: VendorLinks | null,
  opts: { platform: string | null; includeProductLink?: boolean; includeWebsiteLink?: boolean; includeAppLink?: boolean },
): string {
  if (!links) return "";

  const isTwitter = opts.platform === "twitter";

  // Collect candidate links in priority order
  const candidates: string[] = [];
  if (opts.includeProductLink !== false && links.shopUrl) candidates.push(`Shop/Products: ${links.shopUrl}`);
  if (opts.includeWebsiteLink !== false && links.websiteUrl) candidates.push(`Website: ${links.websiteUrl}`);
  if (opts.includeAppLink !== false && links.mobileAppUrl) candidates.push(`Mobile App: ${links.mobileAppUrl}`);

  if (candidates.length === 0) return linksSystemContext(links);

  const selected = isTwitter ? candidates.slice(0, 1) : candidates.slice(0, 2);

  const forX = isTwitter
    ? `\n\nX/Twitter note: a URL counts as 23 characters toward your 280-char limit. Include EXACTLY ONE of these links and nothing else:\n${selected.map(l => `• ${l}`).join("\n")}`
    : `\n\n${links.vendorName}'s links — weave 1-2 of these naturally into the post:\n${selected.map(l => `• ${l}`).join("\n")}`;

  return forX;
}

/** Number of scene-preview images generated for the "video" output type. */
const STUDIO_VIDEO_SCENE_COUNT = 2;

/**
 * Generates multiple content types from a single topic in parallel.
 * All generators run concurrently via Promise.allSettled; any individual
 * failures are returned as { status: "failed", error: "…" } instead of
 * failing the whole request. Quota is consumed upfront and refunded for
 * any type that fails.
 */
router.post("/ai/generate-content", async (req, res): Promise<void> => {
  const parsed = GenerateAiContentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId, topic, tone, language, includeProductLink, includeWebsiteLink, includeAppLink } = parsed.data;
  // Normalise "x" → "twitter"
  const platform = parsed.data.platform === "x" ? "twitter" : (parsed.data.platform ?? null);
  // Deduplicate output types so a crafted request with repeated entries
  // can't run the same generator multiple times while paying quota only once.
  const outputTypes = [...new Set(parsed.data.outputTypes)];

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== vendorId) { res.status(403).json({ error: "You can only generate content for your own vendor account." }); return; }

  const usageVendor = await getVendorForUsage(vendorId);
  if (!usageVendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  // Fetch vendor's public links once — injected into every generator below
  const vendorLinks = await getVendorLinks(vendorId).catch(() => null);

  // Count quota upfront so concurrent requests can't jointly overshoot limits.
  const textTypes = outputTypes.filter((t: string) => ["social_post", "article", "academic"].includes(t));
  const needsImage = outputTypes.includes("image");
  const needsVideo = outputTypes.includes("video");
  const imageQuotaCount = (needsImage ? 1 : 0) + (needsVideo ? STUDIO_VIDEO_SCENE_COUNT : 0);

  let textQuota: Awaited<ReturnType<typeof consumeQuota>> | null = null;
  let imageQuota: Awaited<ReturnType<typeof consumeQuota>> | null = null;

  if (textTypes.length > 0) {
    textQuota = await consumeQuota(usageVendor, "aiCaptions", textTypes.length);
    if (!textQuota.allowed) { res.status(402).json({ error: quotaExceededMessage(usageVendor, textQuota) }); return; }
  }
  if (imageQuotaCount > 0) {
    imageQuota = await consumeQuota(usageVendor, "aiImages", imageQuotaCount);
    if (!imageQuota.allowed) {
      if (textQuota) await releaseQuota(vendorId, "aiCaptions", textTypes.length, textQuota.periodStart, textQuota.addonAllocations);
      res.status(402).json({ error: quotaExceededMessage(usageVendor, imageQuota) }); return;
    }
  }

  const toneStr = tone ?? "professional";
  const langStr = language ?? "english";
  const toneMap: Record<string, string> = {
    professional: "professional and authoritative",
    casual: "friendly and conversational",
    educational: "clear, educational and informative",
    promotional: "persuasive and promotional",
  };
  const toneDesc = toneMap[toneStr] ?? "professional and authoritative";
  const langLabel =
    langStr === "hausa" ? "Hausa (Harshen Hausa)" :
    langStr === "yoruba" ? "Yoruba" :
    langStr === "igbo" ? "Igbo" : "";
  const captionLangInstruction = langLabel ? ` Write in ${langLabel}.` : "";

  type ContentResultType = {
    status: "completed" | "failed";
    content?: string | null;
    imageUrl?: string | null;
    videoScenes?: { id: number; prompt: string; imageUrl: string }[] | null;
    wordCount?: number | null;
    error?: string | null;
    libraryId?: number | null;
  };

  const generators = outputTypes.map(async (type: string): Promise<{ type: string; result: ContentResultType }> => {
    try {
      if (type === "social_post") {
        // Platform-specific character limits
        const platformLimits: Record<string, number> = {
          twitter: 280,
          instagram: 2200,
          facebook: 63206,
          linkedin: 3000,
        };
        const charLimit = platform ? (platformLimits[platform] ?? 500) : 500;

        // Platform-specific guidance
        const platformGuidance: Record<string, string> = {
          twitter: `CRITICAL: X (Twitter) has a HARD 280-character limit (URLs count as 23 chars each). Write the caption first, then if space allows add ONE link, then 1-2 hashtags. Never exceed 280 characters total. No emoji that wastes characters.`,
          instagram: `Instagram allows 2,200 characters. Write engaging copy, use 1-3 emoji, end with a line break then 5-10 relevant hashtags (hashtags go last). You may include your shop or website link in the caption text since Instagram links aren't clickable but the bio link is.`,
          facebook: `Facebook allows long posts. Write naturally, include 1-2 links inline, use 1-3 emoji. Hashtags are optional (max 2-3).`,
          linkedin: `LinkedIn is a professional network. Write a thoughtful 2-4 paragraph post, include your website or product link, use professional language. End with 3-5 relevant hashtags. Limit emoji to 1-2 tasteful ones.`,
        };
        const platformHint = platform ? (platformGuidance[platform] ?? "") : "";

        // Build link selection hint based on vendor's links and request flags
        const linkHint = buildSocialLinkHint(vendorLinks, { platform, includeProductLink, includeWebsiteLink, includeAppLink });

        const response = await openai.chat.completions.create({
          model: "gpt-5.4-mini",
          max_completion_tokens: 600,
          messages: [
            {
              role: "system",
              content: [
                `You write high-converting social media captions for small business vendors.`,
                `Tone: ${toneDesc}.`,
                platform ? `Target platform: ${platform === "twitter" ? "X (Twitter)" : platform}.` : "",
                platformHint,
                `Hard character limit: ${charLimit} characters — count carefully and never exceed it.`,
                `Return ONLY the caption text, no preamble, no quotes.`,
                captionLangInstruction,
                linkHint,
              ].filter(Boolean).join(" "),
            },
            { role: "user", content: `Topic: ${topic}` },
          ],
        });
        const content = (response.choices[0]?.message?.content ?? "").trim().slice(0, charLimit);
        return { type, result: { status: "completed", content, wordCount: content.split(/\s+/).filter(Boolean).length } };
      }

      if (type === "article" || type === "academic") {
        const content = await generateLongForm(topic, toneStr, langStr, type as "article" | "academic", vendorLinks);
        const [saved] = await db.insert(vendorContentLibraryTable).values({ vendorId, type, topic, content }).returning();
        return { type, result: { status: "completed", content, wordCount: content.split(/\s+/).filter(Boolean).length, libraryId: saved.id } };
      }

      if (type === "image") {
        const fullPrompt = buildImagePrompt(topic);
        const buffer = await generateImageBuffer(fullPrompt, "1536x1024", "high");
        const { publicUrl } = await storeGeneratedMedia(buffer, "image/png");
        await db.insert(aiGenerationsTable).values({ vendorId, type: "image", prompt: fullPrompt, result: publicUrl, status: "completed" });
        const [saved] = await db.insert(vendorContentLibraryTable).values({ vendorId, type: "image", topic, content: publicUrl, imageUrl: publicUrl }).returning();
        return { type, result: { status: "completed", imageUrl: publicUrl, libraryId: saved.id } };
      }

      if (type === "video") {
        const fullPrompt = buildImagePrompt(topic);
        const scenePrompts = await buildScenePrompts(fullPrompt, STUDIO_VIDEO_SCENE_COUNT);
        const imageBuffers = await Promise.all(scenePrompts.map((p) => generateImageBuffer(p, "1536x1024", "high")));
        const imageUrls = await Promise.all(imageBuffers.map(async (buf) => (await storeGeneratedMedia(buf, "image/png")).publicUrl));
        const generations = await db.insert(aiGenerationsTable).values(
          scenePrompts.map((sp, i) => ({ vendorId, type: "image" as const, prompt: sp, result: imageUrls[i], status: "completed" as const })),
        ).returning();
        const videoScenes = generations.map((g, i) => ({ id: g.id, prompt: scenePrompts[i], imageUrl: imageUrls[i] }));
        return { type, result: { status: "completed", videoScenes } };
      }

      return { type, result: { status: "failed", error: "Unknown output type" } };
    } catch (err) {
      logger.warn({ err, type }, "AI Content Studio: generator failed for type");
      return { type, result: { status: "failed", error: err instanceof Error ? err.message : "Generation failed" } };
    }
  });

  const outcomes = await Promise.allSettled(generators);
  const result: Record<string, ContentResultType> = {};
  for (const outcome of outcomes) {
    if (outcome.status === "fulfilled") result[outcome.value.type] = outcome.value.result;
  }

  // Refund quota for any generator that failed
  const failedText = textTypes.filter((t: string) => result[t]?.status === "failed").length;
  const failedImages =
    (result["image"]?.status === "failed" ? 1 : 0) +
    (result["video"]?.status === "failed" ? STUDIO_VIDEO_SCENE_COUNT : 0);
  if (failedText > 0 && textQuota) await releaseQuota(vendorId, "aiCaptions", failedText, textQuota.periodStart, textQuota.addonAllocations);
  if (failedImages > 0 && imageQuota) await releaseQuota(vendorId, "aiImages", failedImages, imageQuota.periodStart, imageQuota.addonAllocations);

  res.json(result);
});

router.get("/ai/content-library", async (req, res): Promise<void> => {
  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const qVendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : NaN;
  if (!isAdmin && qVendorId !== authedVendorId) { res.status(403).json({ error: "You can only view your own vendor's content library." }); return; }

  const resolvedVendorId = isAdmin && !isNaN(qVendorId) ? qVendorId : (authedVendorId as number);
  const items = await db
    .select()
    .from(vendorContentLibraryTable)
    .where(eq(vendorContentLibraryTable.vendorId, resolvedVendorId))
    .orderBy(desc(vendorContentLibraryTable.createdAt));

  res.json(items.map((item) => ({
    ...item,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
  })));
});

router.post("/ai/content-library", async (req, res): Promise<void> => {
  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { vendorId, type, topic, content, imageUrl } = req.body as {
    vendorId: number; type: string; topic: string; content: string; imageUrl?: string | null;
  };
  if (!vendorId || !type || !topic || !content) { res.status(400).json({ error: "vendorId, type, topic, content are required" }); return; }
  if (!isAdmin && vendorId !== authedVendorId) { res.status(403).json({ error: "You can only save content for your own vendor account." }); return; }

  const [saved] = await db.insert(vendorContentLibraryTable).values({ vendorId, type, topic, content, imageUrl: imageUrl ?? null }).returning();
  res.json({ ...saved, createdAt: saved.createdAt instanceof Date ? saved.createdAt.toISOString() : saved.createdAt });
});

export default router;
