/**
 * Serves ElevenLabs-generated speech audio for outbound voice calls.
 * Public, no auth (Twilio fetches this directly to play it during a call) —
 * mounted BEFORE requireAuth in routes/index.ts, same as the status callback.
 *
 * The token references pre-synthesized audio registered by voice-caller.ts
 * when it builds the call's TwiML. It is not a guessable ID, is consumed
 * after Twilio's first successful fetch (with a short grace window to
 * tolerate Twilio's own retries), and expires after 5 minutes regardless —
 * so a leaked token can only replay one call's audio, briefly.
 */
import { Router } from "express";
import { peekAudio } from "../lib/elevenlabs-voice";
import { logger } from "../lib/logger";

const router = Router();

router.get("/voice/tts-audio/:token", (req, res) => {
  const { token } = req.params;
  const audio = peekAudio(token);

  if (!audio) {
    logger.warn({ token }, "[voice] tts-audio requested with unknown/expired token");
    res.status(404).end();
    return;
  }

  res.set({
    "Content-Type": "audio/mpeg",
    "Content-Length": String(audio.length),
    "Cache-Control": "no-store",
  });
  res.send(audio);
});

export default router;
