import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, aiGenerationsTable, vendorsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";
import { generateVideoBuffer, type MotionTemplate, type VideoScene } from "../lib/video-generation";
import { generateMusicBuffer } from "../lib/ai-music";
import { storeGeneratedMedia } from "../lib/generated-media-storage";
import { logger } from "../lib/logger";
import {
  GenerateAiImageBody,
  GenerateAiVideoBody,
  GenerateAiCaptionBody,
  ListAiGenerationsQueryParams,
  GenerateAiImageResponse,
  GenerateAiVideoResponse,
  GenerateAiCaptionResponse,
  ListAiGenerationsResponse,
} from "@workspace/api-zod";

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

  if (status === "failed") { res.status(502).json(GenerateAiImageResponse.parse(generation)); return; }
  res.json(GenerateAiImageResponse.parse(generation));
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

  if (status === "failed") { res.status(502).json(GenerateAiVideoResponse.parse(generation)); return; }
  res.json(GenerateAiVideoResponse.parse(generation));
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

  if (status === "failed") { res.status(502).json(GenerateAiCaptionResponse.parse(generation)); return; }
  res.json(GenerateAiCaptionResponse.parse(generation));
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
  res.json(ListAiGenerationsResponse.parse(generations));
});

export default router;
