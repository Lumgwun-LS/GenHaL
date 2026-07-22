/**
 * Smoke tests for buildMusicPrompt (lib/ai-music-prompt.ts).
 *
 * Covers two paths:
 *  1. Explicit-mood path: vendor passes a known musicMood enum value →
 *     the LLM is never called, each enum key maps to a distinct descriptor.
 *  2. Content-aware (LLM) path: no musicMood supplied → the OpenAI call is
 *     made with the video content and a content-specific prompt is returned.
 *     Also verifies that clearly different video prompts produce different
 *     output strings, and that a model failure falls back gracefully.
 *
 * Results are logged so future runs can be compared.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── hoisted mock state ────────────────────────────────────────────────────────
// vi.mock factories are hoisted before imports; shared mutable state goes here.
const mockCreate = vi.hoisted(() => vi.fn());

// ── mocks ─────────────────────────────────────────────────────────────────────
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: {
      completions: {
        create: (...args: unknown[]) => mockCreate(...args),
      },
    },
  },
}));

const loggerWarnMock = vi.fn();
vi.mock("../logger", () => ({
  logger: {
    warn: (...args: unknown[]) => loggerWarnMock(...args),
    info: vi.fn(),
  },
}));

// Import AFTER mocks are registered (vitest hoists vi.mock, but dynamic import
// ensures we get the already-mocked module).
const { buildMusicPrompt, MUSIC_MOOD_DESCRIPTORS, MUSIC_PROMPT_FALLBACK } =
  await import("../ai-music-prompt");

// ── helpers ───────────────────────────────────────────────────────────────────
/** Make the OpenAI mock return a specific music prompt string. */
function mockLlmResponse(promptText: string) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: promptText } }],
  });
}

beforeEach(() => {
  mockCreate.mockReset();
  loggerWarnMock.mockClear();
});

// ── explicit-mood path ────────────────────────────────────────────────────────
describe("buildMusicPrompt — explicit musicMood path", () => {
  it("never calls the LLM when a known musicMood is supplied", async () => {
    await buildMusicPrompt("some video prompt", undefined, "upbeat");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("each mood key maps to a distinct output string", async () => {
    const moodKeys = Object.keys(MUSIC_MOOD_DESCRIPTORS);
    expect(moodKeys.length).toBeGreaterThanOrEqual(4); // sanity: at least 4 moods defined

    const results = await Promise.all(
      moodKeys.map((mood) => buildMusicPrompt("a product video", undefined, mood)),
    );

    // Log for future comparison
    console.log("\n── Explicit mood → prompt mappings ──");
    moodKeys.forEach((mood, i) => console.log(`  ${mood}: ${results[i]}`));

    // All returned strings must be unique
    const unique = new Set(results);
    expect(unique.size).toBe(moodKeys.length);
  });

  it("each mood result contains the corresponding descriptor text", async () => {
    for (const [mood, descriptor] of Object.entries(MUSIC_MOOD_DESCRIPTORS)) {
      const result = await buildMusicPrompt("a video", undefined, mood);
      expect(result).toContain(descriptor);
    }
  });

  it("falls through to the LLM path for an unrecognised mood value", async () => {
    mockLlmResponse("Quirky lo-fi beats with marimba, no vocals, no lyrics.");
    const result = await buildMusicPrompt("a video", undefined, "unknown_mood_xyz");
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result).toContain("no vocals");
  });
});

// ── content-aware (LLM) path ─────────────────────────────────────────────────
describe("buildMusicPrompt — content-aware LLM path", () => {
  it("returns the LLM's prompt when the model responds", async () => {
    const expected = "Gentle acoustic guitar with soft percussion, warm and relaxed, no vocals, no lyrics.";
    mockLlmResponse(expected);

    const result = await buildMusicPrompt("Fresh-baked sourdough bread at a cosy artisan bakery");
    expect(result).toBe(expected);
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("different video prompts produce different music prompts", async () => {
    const bakeryPrompt =
      "Warm, gentle acoustic guitar with light ambient sounds, slow tempo, no vocals, no lyrics.";
    const salePrompt =
      "High-energy pop beat with bright synths and punchy bass, fast tempo, no vocals, no lyrics.";
    const techPrompt =
      "Clean modern corporate instrumental, light piano and subtle electronics, steady tempo, no vocals, no lyrics.";

    mockLlmResponse(bakeryPrompt);
    const bakeryResult = await buildMusicPrompt(
      "Fresh-baked artisan sourdough bread at a cosy neighbourhood bakery",
    );

    mockLlmResponse(salePrompt);
    const saleResult = await buildMusicPrompt(
      "Flash sale — 50% off everything this weekend only, buy now!",
    );

    mockLlmResponse(techPrompt);
    const techResult = await buildMusicPrompt(
      "Enterprise SaaS platform helping Fortune 500 teams automate workflows",
    );

    console.log("\n── Content-aware LLM → prompt mappings ──");
    console.log(`  Bakery/calm : ${bakeryResult}`);
    console.log(`  Sale/upbeat : ${saleResult}`);
    console.log(`  Tech/corp   : ${techResult}`);

    // Each call was given (and returned) a distinct simulated LLM response
    const results = [bakeryResult, saleResult, techResult];
    const unique = new Set(results);
    expect(unique.size).toBe(3);
  });

  it("passes the full video content (prompt + caption) to the model", async () => {
    mockLlmResponse("Upbeat tropical house, bright and fun, no vocals, no lyrics.");
    await buildMusicPrompt("Summer clothing collection", "Shop the new arrivals now!");

    const callArgs = mockCreate.mock.calls[0][0];
    const userMessage: string = callArgs.messages.find((m: { role: string }) => m.role === "user").content;
    expect(userMessage).toContain("Summer clothing collection");
    expect(userMessage).toContain("Shop the new arrivals now!");
  });

  it("falls back to the generic prompt when the model returns an empty string", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: "" } }] });

    const result = await buildMusicPrompt("some video");
    expect(result).toBe(MUSIC_PROMPT_FALLBACK);
    expect(loggerWarnMock).toHaveBeenCalledOnce();
  });

  it("falls back to the generic prompt when the model returns a very short string", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: "ok" } }] });

    const result = await buildMusicPrompt("some video");
    expect(result).toBe(MUSIC_PROMPT_FALLBACK);
    expect(loggerWarnMock).toHaveBeenCalledOnce();
  });

  it("falls back gracefully when the LLM call rejects (e.g. timeout)", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Request timed out"));

    const result = await buildMusicPrompt("some video");
    expect(result).toBe(MUSIC_PROMPT_FALLBACK);
    expect(loggerWarnMock).toHaveBeenCalledOnce();
    expect(loggerWarnMock.mock.calls[0][1]).toMatch(/failed/i);
  });

  it("works when no caption is provided", async () => {
    const expected = "Soft piano melody with gentle strings, reflective and elegant, no vocals, no lyrics.";
    mockLlmResponse(expected);

    const result = await buildMusicPrompt("Luxury jewellery showcase");
    expect(result).toBe(expected);
  });
});
