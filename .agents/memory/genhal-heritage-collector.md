---
name: GenHaL Heritage Collector & AI Gateway
description: Language data collection system (Heritage Collector) + AI routing gateway added to GenHaL
---

## Heritage Collector (Language Data Collection)

New table: `genhal_language_recordings` — six recording types: word | sentence | story | interview | artifact | place.

Key fields: clerk_user_id, language_code (FK genhal_languages.code), community_id (FK, nullable), type, text_content, audio_url, video_url, photo_url, transcript, location_lat/lng, speaker_name, speaker_age_group, consent_given, quality_score, status (pending/approved/rejected), metadata jsonb.

**API routes** (all `requireAuth()`, added to `genhal.ts`):
- POST /genhal/collect/upload-url — presigned PUT URL using ObjectStorageService (same pattern as /media/upload-url)
- GET /genhal/collect — list user's recordings (filter by type/languageCode)
- GET /genhal/collect/dataset — aggregate stats (total, approved, byType, byLanguage) for ML dashboard
- POST /genhal/collect — submit recording (text or with pre-uploaded media URLs)
- PATCH /genhal/collect/:id — update quality_score/transcript/status
- DELETE /genhal/collect/:id

**UI**: `artifacts/genhal-web/src/pages/collect/index.tsx` — 6-type selector panel + recording panel (browser MediaRecorder for audio/video, file input for photos, Geolocation API for places), speaker info, consent checkbox, presigned upload flow.

**Nav**: "Collect" added to sidebar (Mic icon), route `/collect` added to App.tsx.

**API base URL helper**: `artifacts/genhal-web/src/lib/api.ts` → `getApiBaseUrl()` returns `${origin}/api` for direct fetch calls outside the generated hooks.

## AI Gateway

New route file: `artifacts/api-server/src/routes/ai-gateway.ts`

**Mount**: Added to `routes/index.ts` AFTER requireAuth — the gateway's own key-based middleware (`X-Gateway-Key` header) gates all /gateway/* routes. Spring Boot and Python workers supply this key.

**Routes** (key-based auth, not Clerk):
- GET /gateway/health — capability list
- POST /gateway/llm — OpenAI chat completion, supports streaming (text/event-stream) and JSON mode
- POST /gateway/asr — Whisper transcription via openai.audio.transcriptions.create, accepts audioBase64
- POST /gateway/tts — OpenAI TTS, returns audio binary (mp3/opus/aac/flac)
- POST /gateway/embed — text-embedding-3-small, returns embedding arrays
- POST /gateway/image — DALL-E 3 image generation
- POST /gateway/heritage-asr — language-specific ASR with LLM quality analysis for dataset pipeline

**Auth pattern**: `GATEWAY_API_KEY` env var; if not set, gateway is open (dev mode). Spring Boot should send `X-Gateway-Key: <value>`.

**Why**: Spring Boot sits in front of the gateway; Python ML workers call it directly. All AI credentials stay in the Node server (AI Integrations) — Spring Boot/Python never need their own OpenAI keys.
