/**
 * AI Gateway — routing layer between Spring Boot (and any other backend) and
 * the AI service backends: LLM, ASR (speech-to-text), TTS, Embeddings, Image.
 *
 * Auth: callers must supply the gateway API key via
 *   X-Gateway-Key: <GATEWAY_API_KEY env var>
 * This lets backend services (Spring Boot, Python workers) call the gateway
 * without Clerk session tokens.
 *
 * Mount: /api/gateway  (no requireAuth — key-based)
 */

import { Router, Request, Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router = Router();

// ── Key auth middleware ───────────────────────────────────────────────────────

function requireGatewayKey(req: Request, res: Response, next: () => void) {
  const key = req.headers["x-gateway-key"];
  const expected = process.env.GATEWAY_API_KEY;
  if (!expected) {
    // No key configured → accept any authenticated caller (dev/open mode)
    return next();
  }
  if (key !== expected) {
    return void res.status(401).json({ error: "Invalid gateway key" });
  }
  next();
}

router.use("/gateway", requireGatewayKey);

// ── Health ───────────────────────────────────────────────────────────────────

router.get("/gateway/health", (_req, res) => {
  res.json({
    status: "ok",
    capabilities: ["llm", "asr", "tts", "embed", "image"],
    timestamp: new Date().toISOString(),
  });
});

// ── LLM — chat completion ─────────────────────────────────────────────────────

router.post("/gateway/llm", async (req, res): Promise<void> => {
  try {
    const {
      messages,
      model = "gpt-4o-mini",
      temperature = 0.7,
      max_tokens,
      system,
      stream = false,
    } = req.body as {
      messages?: Array<{ role: string; content: string }>;
      model?: string;
      temperature?: number;
      max_tokens?: number;
      system?: string;
      stream?: boolean;
    };

    if (!messages && !system) {
      return void res.status(400).json({ error: "messages or system is required" });
    }

    const fullMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
    if (system) fullMessages.push({ role: "system", content: system });
    if (messages) fullMessages.push(...(messages as typeof fullMessages));

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const completion = await openai.chat.completions.create({
        model,
        messages: fullMessages,
        temperature,
        max_tokens,
        stream: true,
      });

      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      return void res.end();
    }

    const completion = await openai.chat.completions.create({
      model,
      messages: fullMessages,
      temperature,
      max_tokens,
    });

    res.json({
      text: completion.choices[0]?.message?.content ?? "",
      usage: completion.usage,
      model: completion.model,
    });
  } catch (err) {
    logger.error(err, "gateway/llm error");
    res.status(500).json({ error: "LLM request failed" });
  }
});

// ── ASR — speech-to-text (Whisper) ───────────────────────────────────────────

router.post("/gateway/asr", async (req, res): Promise<void> => {
  try {
    const {
      audioBase64,
      language,
      model = "whisper-1",
      prompt,
    } = req.body as {
      audioBase64?: string;
      language?: string;
      model?: string;
      prompt?: string;
    };

    if (!audioBase64) {
      return void res.status(400).json({ error: "audioBase64 is required" });
    }

    const audioBuffer = Buffer.from(audioBase64, "base64");
    const audioFile = new File([audioBuffer], "recording.webm", { type: "audio/webm" });

    const transcription = await openai.audio.transcriptions.create({
      model,
      file: audioFile,
      language,
      prompt,
    });

    res.json({
      transcript: transcription.text,
      language: language ?? "auto",
    });
  } catch (err) {
    logger.error(err, "gateway/asr error");
    res.status(500).json({ error: "ASR transcription failed" });
  }
});

// ── TTS — text-to-speech (OpenAI TTS) ────────────────────────────────────────

router.post("/gateway/tts", async (req, res): Promise<void> => {
  try {
    const {
      text,
      voice = "alloy",
      model = "tts-1",
      speed = 1.0,
      format = "mp3",
    } = req.body as {
      text?: string;
      voice?: string;
      model?: string;
      speed?: number;
      format?: string;
    };

    if (!text) {
      return void res.status(400).json({ error: "text is required" });
    }

    const response = await openai.audio.speech.create({
      model,
      voice: voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
      input: text,
      speed,
      response_format: format as "mp3" | "opus" | "aac" | "flac",
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", `audio/${format}`);
    res.setHeader("Content-Length", audioBuffer.length);
    res.send(audioBuffer);
  } catch (err) {
    logger.error(err, "gateway/tts error");
    res.status(500).json({ error: "TTS synthesis failed" });
  }
});

// ── Embeddings ────────────────────────────────────────────────────────────────

router.post("/gateway/embed", async (req, res): Promise<void> => {
  try {
    const {
      input,
      model = "text-embedding-3-small",
      dimensions,
    } = req.body as {
      input?: string | string[];
      model?: string;
      dimensions?: number;
    };

    if (!input) {
      return void res.status(400).json({ error: "input is required" });
    }

    const response = await openai.embeddings.create({
      model,
      input,
      dimensions,
    });

    res.json({
      embeddings: response.data.map(d => d.embedding),
      model: response.model,
      usage: response.usage,
    });
  } catch (err) {
    logger.error(err, "gateway/embed error");
    res.status(500).json({ error: "Embedding request failed" });
  }
});

// ── Image generation ──────────────────────────────────────────────────────────

router.post("/gateway/image", async (req, res): Promise<void> => {
  try {
    const {
      prompt,
      model = "dall-e-3",
      size = "1024x1024",
      quality = "standard",
      n = 1,
      style = "vivid",
    } = req.body as {
      prompt?: string;
      model?: string;
      size?: string;
      quality?: string;
      n?: number;
      style?: string;
    };

    if (!prompt) {
      return void res.status(400).json({ error: "prompt is required" });
    }

    const response = await openai.images.generate({
      model,
      prompt,
      size: size as "256x256" | "512x512" | "1024x1024" | "1792x1024" | "1024x1792",
      quality: quality as "standard" | "hd",
      n,
      style: style as "vivid" | "natural",
    });

    res.json({
      images: (response.data ?? []).map(img => ({
        url: img.url,
        revisedPrompt: img.revised_prompt,
      })),
    });
  } catch (err) {
    logger.error(err, "gateway/image error");
    res.status(500).json({ error: "Image generation failed" });
  }
});

// ── Language-specific ASR (heritage audio transcription) ─────────────────────
// Transcribes a language recording and returns transcript + detected words.

router.post("/gateway/heritage-asr", async (req, res): Promise<void> => {
  try {
    const {
      audioBase64,
      languageCode,
      textContent,
    } = req.body as {
      audioBase64?: string;
      languageCode?: string;
      textContent?: string;
    };

    if (!audioBase64) {
      return void res.status(400).json({ error: "audioBase64 is required" });
    }

    const audioBuffer = Buffer.from(audioBase64, "base64");
    const audioFile = new File([audioBuffer], "heritage.webm", { type: "audio/webm" });

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
      prompt: textContent
        ? `The speaker is reading or saying: "${textContent}" in ${languageCode ?? "an indigenous African language"}.`
        : `Indigenous African language recording${languageCode ? ` in ${languageCode}` : ""}.`,
    });

    // Ask LLM to extract key words from the transcript for the dataset
    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a linguist specializing in African languages. Extract key linguistic data from transcripts.",
        },
        {
          role: "user",
          content: `Transcript: "${transcription.text}"\nOriginal text: "${textContent ?? "unknown"}"\nLanguage: ${languageCode ?? "unknown"}\n\nReturn JSON: { "detectedLanguage": string, "quality": number (1-5), "notes": string }`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const analysis_data = JSON.parse(analysis.choices[0]?.message?.content ?? "{}");

    res.json({
      transcript: transcription.text,
      ...analysis_data,
    });
  } catch (err) {
    logger.error(err, "gateway/heritage-asr error");
    res.status(500).json({ error: "Heritage ASR failed" });
  }
});

export default router;
