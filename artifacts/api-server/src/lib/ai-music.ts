/**
 * Short instrumental background track generation for AI-generated post videos.
 *
 * There's no dedicated music-generation model available through this app's
 * integrations, but the ElevenLabs integration already used for voice-call
 * TTS (see elevenlabs-voice.ts) also exposes a sound-generation endpoint that
 * reliably produces usable ambient/instrumental beds from a text prompt —
 * good enough for a short (~10-20s) social video's background music, without
 * needing a separate provider or API key.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";

let _connectors: ReplitConnectors | null = null;
function connectors(): ReplitConnectors {
  if (!_connectors) _connectors = new ReplitConnectors();
  return _connectors;
}

// ElevenLabs sound-generation caps requested duration; keep a safety margin
// under the documented ceiling rather than relying on the API to clamp it.
const MAX_DURATION_SECONDS = 22;
const MIN_DURATION_SECONDS = 0.5;

/** Generates a short instrumental track and returns raw MP3 bytes. */
export async function generateMusicBuffer(prompt: string, durationSeconds: number): Promise<Buffer> {
  const clampedDuration = Math.min(Math.max(durationSeconds, MIN_DURATION_SECONDS), MAX_DURATION_SECONDS);

  const res = await connectors().proxy(
    "elevenlabs",
    "/v1/sound-generation",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: clampedDuration,
        prompt_influence: 0.35,
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(`ElevenLabs sound-generation returned ${res.status}: ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
