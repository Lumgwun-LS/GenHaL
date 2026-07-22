/**
 * Music prompt derivation for AI-generated post videos.
 *
 * Extracted from routes/ai.ts so it can be unit-tested independently of the
 * HTTP layer. `buildMusicPrompt` is the single place where a video's content
 * (prompt + caption) is translated into an ElevenLabs sound-generation prompt,
 * either via a short LLM call (content-aware path) or a fixed descriptor when
 * the vendor picks an explicit mood (explicit-mood path).
 */
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export const MUSIC_MOOD_DESCRIPTORS: Record<string, string> = {
  upbeat:    "Upbeat, energetic, modern instrumental. Fast tempo, bright synths, punchy beat, no vocals.",
  calm:      "Calm, soothing, laid-back instrumental. Gentle piano or acoustic guitar, soft pads, slow tempo, no vocals.",
  corporate: "Clean, professional corporate instrumental. Light piano, subtle strings, steady mid-tempo beat, no vocals.",
  festive:   "Festive, celebratory instrumental. Bright brass, hand percussion, joyful and lively, no vocals.",
  dramatic:  "Cinematic and dramatic instrumental. Building tension, orchestral swells, powerful dynamics, no vocals.",
  romantic:  "Warm, romantic instrumental. Smooth acoustic guitar or piano, gentle melody, no vocals.",
};

/** The generic fallback returned when the LLM call fails or yields an unusable result. */
export const MUSIC_PROMPT_FALLBACK =
  "Upbeat, modern instrumental background music bed for a short small business social media product video. Soft synths and a subtle beat, no vocals, no lyrics.";

/**
 * Derives a music-mood description from the video's content (prompt + caption)
 * by asking the LLM to suggest the best-fitting musical mood and expand it into
 * an ElevenLabs sound-generation prompt. Falls back to a safe generic prompt
 * so music generation is never blocked by this step.
 *
 * When `musicMood` matches a known key in MUSIC_MOOD_DESCRIPTORS, the LLM call
 * is skipped entirely and the pre-written descriptor is returned immediately.
 */
export async function buildMusicPrompt(
  videoPrompt: string,
  captionText?: string,
  musicMood?: string,
): Promise<string> {
  // Vendor picked an explicit mood — no LLM call needed
  if (musicMood && MUSIC_MOOD_DESCRIPTORS[musicMood]) {
    return `${MUSIC_MOOD_DESCRIPTORS[musicMood]} Short social media background music bed, ~15 seconds.`;
  }

  // Derive the mood from video content via a short LLM call
  try {
    const contentSummary = [videoPrompt, captionText].filter(Boolean).join(" | ").slice(0, 600);
    const response = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      max_completion_tokens: 120,
      messages: [
        {
          role: "system",
          content: `You write brief ElevenLabs sound-generation prompts for short social-media video background music. Given a video's content description, produce a single music-prompt sentence (20-40 words) that captures the right mood, tempo, and instrumentation for the video. The prompt must end with ", no vocals, no lyrics." Return ONLY the prompt sentence.`,
        },
        { role: "user", content: `Video content: ${contentSummary}` },
      ],
    });
    const raw = (response.choices[0]?.message?.content ?? "").trim();
    if (raw && raw.length > 10) return raw;
    throw new Error("empty or too-short music prompt from model");
  } catch (err) {
    logger.warn({ err }, "AI music prompt derivation failed; using generic fallback");
    return MUSIC_PROMPT_FALLBACK;
  }
}
