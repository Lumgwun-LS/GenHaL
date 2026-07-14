import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, aiGenerationsTable, vendorsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";
import { ai as gemini } from "@workspace/integrations-gemini-ai";
import { generateVideoBuffer, type MotionTemplate, type VideoScene } from "../lib/video-generation";
import { extractVideoFrames } from "../lib/video-frames";
import { generateMusicBuffer } from "../lib/ai-music";
import { storeGeneratedMedia } from "../lib/generated-media-storage";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import {
  GenerateAiImageBody,
  GenerateAiVideoBody,
  GenerateAiCaptionBody,
  GetAiVideoUploadUrlBody,
  AnalyzeVideoCaptionBody,
  ListAiGenerationsQueryParams,
  GenerateAiImageResponse,
  GenerateAiVideoResponse,
  GenerateAiCaptionResponse,
  GetAiVideoUploadUrlResponse,
  AnalyzeVideoCaptionResponse,
  ListAiGenerationsResponse,
} from "@workspace/api-zod";

const objectStorageService = new ObjectStorageService();

/** Drizzle returns `createdAt` as a Date object, but the generated response schemas
 *  (from openapi.yaml's `createdAt: {type: string, format: date-time}`) expect a
 *  plain string — .parse(generation) throws a ZodError without this conversion. */
function serializeGeneration<T extends { createdAt: Date | string }>(generation: T): Omit<T, "createdAt"> & { createdAt: string } {
  return { ...generation, createdAt: generation.createdAt instanceof Date ? generation.createdAt.toISOString() : generation.createdAt };
}

/** Gemini's inline (non-Files-API) request payload is capped at 8MB — see the
 *  ai-integrations-gemini skill. Videos under this are sent whole; larger
 *  ones fall back to a handful of extracted still frames instead. */
const GEMINI_INLINE_MAX_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;

const router: IRouter = Router();

const MAX_PROMPT_LEN = 500;
const MAX_CAPTION_OVERLAY_LEN = 500;

/** Shared with /ai/generate-video so the still frame it's built from matches the image endpoint's style. */
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
 * Generates a short video for a post: one or more AI product images, each
 * brought to life with a motion template (zoom/pan), stitched together with
 * crossfade transitions when there's more than one scene, the post's caption
 * burned in on the opening scene, and an optional short instrumental
 * background track. There's no supported text-to-video model available
 * server-side (see media-generation skill — OpenAI/Gemini AI Integrations
 * don't support video output), so this builds a real, relevant mp4 from
 * AI-generated image(s) rather than mocking a placeholder clip.
 */
router.post("/ai/generate-video", async (req, res): Promise<void> => {
  const parsed = GenerateAiVideoBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId, prompt, style, industry, captionText, sceneCount, motionTemplate, includeMusic } = parsed.data;

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== vendorId) { res.status(403).json({ error: "You can only generate content for your own vendor account." }); return; }
  if (prompt.length > MAX_PROMPT_LEN) { res.status(400).json({ error: `Prompt must be ${MAX_PROMPT_LEN} characters or fewer.` }); return; }
  if (captionText && captionText.length > MAX_CAPTION_OVERLAY_LEN) { res.status(400).json({ error: `Caption must be ${MAX_CAPTION_OVERLAY_LEN} characters or fewer.` }); return; }

  const fullPrompt = buildImagePrompt(prompt, style, industry);
  const resolvedSceneCount = Math.min(Math.max(sceneCount ?? 1, 1), 3);
  const resolvedMotionTemplate: MotionTemplate | "auto" = motionTemplate ?? "auto";

  let result: string;
  let status: "completed" | "failed" = "completed";
  try {
    const scenePrompts = await buildScenePrompts(fullPrompt, resolvedSceneCount);
    const imageBuffers = await Promise.all(scenePrompts.map((p) => generateImageBuffer(p, "1536x1024", "high")));
    const scenes: VideoScene[] = imageBuffers.map((imageBuffer, i) => ({
      imageBuffer,
      // Only burn the caption in on the opening scene so multi-scene videos
      // don't repeat the same overlay text across every cut.
      overlayText: i === 0 ? (captionText ?? prompt) : undefined,
    }));

    let musicBuffer: Buffer | undefined;
    if (includeMusic) {
      try {
        const approxDurationSeconds = resolvedSceneCount === 1 ? 6 : resolvedSceneCount * 5 - (resolvedSceneCount - 1) * 0.6;
        musicBuffer = await generateMusicBuffer(
          `Upbeat, modern instrumental background music bed for a short ${industry ?? "small business"} social media product video. Soft synths and a subtle beat, no vocals, no lyrics.`,
          approxDurationSeconds,
        );
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

  const [generation] = await db.insert(aiGenerationsTable).values({
    vendorId,
    type: "video",
    prompt: fullPrompt,
    result,
    status,
  }).returning();

  const serialized = serializeGeneration(generation);
  if (status === "failed") { res.status(502).json(GenerateAiVideoResponse.parse(serialized)); return; }
  res.json(GenerateAiVideoResponse.parse(serialized));
});

router.post("/ai/generate-caption", async (req, res): Promise<void> => {
  const parsed = GenerateAiCaptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId, topic, platform, tone, includeHashtags, includeEmoji } = parsed.data;

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== vendorId) { res.status(403).json({ error: "You can only generate content for your own vendor account." }); return; }
  if (topic.length > MAX_PROMPT_LEN) { res.status(400).json({ error: `Topic must be ${MAX_PROMPT_LEN} characters or fewer.` }); return; }

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

  let result: string;
  let status: "completed" | "failed" = "completed";
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      max_completion_tokens: 500,
      messages: [
        {
          role: "system",
          content: `You write short, high-converting social media captions for small business vendors. Tone: ${toneDesc}. Target platform: ${platform ?? "general"}. Hard limit: ${limit} characters. Never use placeholder brackets. Return only the caption text, no quotes or preamble.${includeHashtags ? " End with 3-5 relevant hashtags." : " Do not include hashtags."}${includeEmoji ? " Use 1-3 tasteful emoji." : " Do not use emoji."}`,
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

  res.json(GetAiVideoUploadUrlResponse.parse({ uploadUrl, videoUrl }));
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

  const instruction = `Watch this video and write ONE short, high-converting social media caption that accurately reflects what actually happens/is shown in it — do not invent details it doesn't contain. Tone: ${toneDesc}. Target platform: ${platform ?? "general"}. Hard limit: ${limit} characters. Never use placeholder brackets. Return only the caption text, no quotes, no preamble, no description of the video itself.${includeHashtags ? " End with 3-5 relevant hashtags." : " Do not include hashtags."}${includeEmoji ? " Use 1-3 tasteful emoji." : " Do not use emoji."}`;

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

export default router;
