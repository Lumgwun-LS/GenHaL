/**
 * ElevenLabs text-to-speech for outbound voice calls.
 *
 * Twilio can't call ElevenLabs directly, so the flow is:
 *   1. voice-caller.ts synthesizes the call script's audio UP FRONT, before
 *      placing the Twilio call, and registers the resulting MP3 bytes under
 *      a short-lived token (see registerAudio / peekAudio below).
 *   2. The TwiML we hand to Twilio points at our own
 *      GET /api/voice/tts-audio/:token endpoint instead of using <Say>.
 *   3. When Twilio fetches that URL, we just stream back the already-
 *      synthesized bytes — no ElevenLabs call happens mid-call, so there's
 *      no call-time synthesis latency and no repeat-synthesis cost if
 *      Twilio retries the fetch.
 *
 * Synthesizing up front also means a real fallback is possible: if
 * ElevenLabs fails before the call is placed, voice-caller.ts falls back to
 * Twilio's built-in <Say> voice for that call instead of leaving Twilio
 * to fetch a URL that would 502.
 *
 * The token store is in-memory and process-local, matching this app's
 * existing single-process patterns (webhook buffer, schedulers). If this
 * service is ever run as multiple instances behind a load balancer, this
 * needs to move to a shared store (e.g. Redis or a DB table) so Twilio's
 * fetch can land on any instance.
 */
import { randomUUID } from "node:crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";

let _connectors: ReplitConnectors | null = null;
function connectors(): ReplitConnectors {
  if (!_connectors) _connectors = new ReplitConnectors();
  return _connectors;
}

// "Rachel" — one of ElevenLabs' default premade voices, available on every
// account. Override with ELEVENLABS_VOICE_ID if a different voice is preferred.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
function getVoiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
}

type PendingAudio = { audio: Buffer; expiresAt: number; firstServedAt?: number };
const pendingAudio = new Map<string, PendingAudio>();
// Short TTL: audio is pre-synthesized right before the call is placed, so
// Twilio fetches it within seconds. Keeping this short limits how long a
// leaked token could be replayed to re-download (not re-synthesize) audio.
const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes
// After the first successful fetch, keep serving briefly so Twilio's own
// retry logic still succeeds, then treat the token as consumed — this
// bounds how long a leaked token stays replayable to a few seconds instead
// of the full TTL.
const CONSUME_GRACE_MS = 30 * 1000; // 30 seconds

function sweepExpired(): void {
  const now = Date.now();
  for (const [token, entry] of pendingAudio) {
    const consumed = entry.firstServedAt !== undefined && now - entry.firstServedAt > CONSUME_GRACE_MS;
    if (entry.expiresAt < now || consumed) pendingAudio.delete(token);
  }
}

/** Registers already-synthesized audio and returns a token for the audio URL. */
export function registerAudio(audio: Buffer): string {
  sweepExpired();
  const token = randomUUID();
  pendingAudio.set(token, { audio, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

/**
 * Returns the audio for a token and marks it as served. Non-destructive on
 * the first few calls (Twilio may retry the fetch within CONSUME_GRACE_MS),
 * but the entry is dropped shortly after its first successful fetch rather
 * than staying replayable for the full TTL.
 */
export function peekAudio(token: string): Buffer | undefined {
  sweepExpired();
  const entry = pendingAudio.get(token);
  if (!entry) return undefined;
  if (entry.firstServedAt === undefined) entry.firstServedAt = Date.now();
  return entry.audio;
}

export function isElevenLabsConfigured(): boolean {
  // The connector handles auth; presence of the integration is enough to try.
  // synthesizeSpeech() will surface any real failure (missing/invalid key) at call time.
  return true;
}

/** Synthesizes speech for the given text and returns raw MP3 bytes. */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const voiceId = getVoiceId();
  const res = await connectors().proxy(
    "elevenlabs",
    `/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(`ElevenLabs TTS returned ${res.status}: ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
