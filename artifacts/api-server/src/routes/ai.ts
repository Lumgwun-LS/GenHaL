import { Router, type IRouter } from "express";
import { db, aiGenerationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  GenerateAiImageBody,
  GenerateAiCaptionBody,
  ListAiGenerationsQueryParams,
  GenerateAiImageResponse,
  GenerateAiCaptionResponse,
  ListAiGenerationsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/ai/generate-image", async (req, res): Promise<void> => {
  const parsed = GenerateAiImageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId, prompt, style, industry } = parsed.data;

  // Record generation attempt
  const fullPrompt = [
    prompt,
    style ? `Style: ${style}` : "",
    industry ? `Industry: ${industry}` : "",
  ].filter(Boolean).join(". ");

  const result = `[AI Image Generation: ${fullPrompt}] - Image generation requires OpenAI DALL-E integration. Connect via Settings to enable.`;

  const [generation] = await db.insert(aiGenerationsTable).values({
    vendorId,
    type: "image",
    prompt: fullPrompt,
    result,
    status: "completed",
  }).returning();

  res.json(GenerateAiImageResponse.parse(generation));
});

router.post("/ai/generate-caption", async (req, res): Promise<void> => {
  const parsed = GenerateAiCaptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId, topic, platform, tone, includeHashtags, includeEmoji } = parsed.data;

  // Generate caption using template (real AI via OpenAI can be added)
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

  const captions = [
    `Exciting developments in ${topic}! Discover how we're transforming the industry with cutting-edge solutions designed for modern businesses.`,
    `${topic} is changing everything. Are you ready to be part of the revolution? Join thousands of businesses already making the shift.`,
    `Your business deserves the best. Explore our ${topic} solutions and see the difference premium service makes.`,
  ];
  const caption = captions[Math.floor(Math.random() * captions.length)]!;

  const hashtags = includeHashtags ? `\n\n#${topic.replace(/\s+/g, "")} #Business #Growth #Innovation` : "";
  const result = `${caption}${hashtags}`.slice(0, limit);

  const [generation] = await db.insert(aiGenerationsTable).values({
    vendorId,
    type: "caption",
    prompt: `${topic} | ${platform} | ${toneDesc}`,
    result,
    status: "completed",
  }).returning();

  res.json(GenerateAiCaptionResponse.parse(generation));
});

router.get("/ai/generations", async (req, res): Promise<void> => {
  const params = ListAiGenerationsQueryParams.safeParse(req.query);
  let generations = await db.select().from(aiGenerationsTable).orderBy(desc(aiGenerationsTable.createdAt));
  if (params.success) {
    if (params.data.vendorId) generations = generations.filter((g) => g.vendorId === params.data.vendorId);
    if (params.data.type) generations = generations.filter((g) => g.type === params.data.type);
  }
  res.json(ListAiGenerationsResponse.parse(generations));
});

export default router;
