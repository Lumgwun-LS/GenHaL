---
name: VendorHub voice calls use ElevenLabs TTS
description: Outbound Twilio voice calls play ElevenLabs-synthesized audio instead of Twilio's built-in <Say> voice; covers the synthesis-timing and token-replay decisions.
---

`artifacts/api-server/src/lib/voice-caller.ts`'s `buildTwiml()` synthesizes the call script via the ElevenLabs connector (`lib/elevenlabs-voice.ts`) **before** placing the Twilio call, then points TwiML at a `<Play>` of our own `GET /api/voice/tts-audio/:token` route which just serves the pre-made MP3 bytes from an in-memory, token-keyed cache.

**Why:** an earlier version synthesized on-demand when Twilio fetched the audio URL. Code review flagged that as introducing call-time latency risk, having no real fallback path if synthesis failed, and letting a leaked token trigger repeat (costly) synthesis on every replay. Synthesizing up front fixes all three: failure before the call is placed falls back to Twilio's built-in `<Say>` voice, and the fetch route never calls ElevenLabs.

**How to apply:** the token cache is in-memory/process-local (fine for this single-instance deployment, matches other schedulers/buffers in this codebase) with a 5-minute TTL, and each token is invalidated ~30s after its first successful fetch (`firstServedAt` + `CONSUME_GRACE_MS`) to bound replay exposure while still tolerating Twilio's own retry attempts. If this service ever moves to multi-instance, this cache must move to a shared store (Redis/DB) or Twilio's fetch can land on an instance that never registered the token.
