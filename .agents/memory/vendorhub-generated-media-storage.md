---
name: VendorHub generated media storage
description: AI-generated post images/videos are stored in Replit object storage with a public URL, not base64 — required for Instagram publishing.
---

`POST /ai/generate-image` and `/ai/generate-video` (`artifacts/api-server/src/routes/ai.ts`) no longer return a base64 `data:` URI as `result`. They upload the buffer via `storeGeneratedMedia()` (`artifacts/api-server/src/lib/generated-media-storage.ts`) to object storage and return a public `https://<domain>/api/media/<id>` URL instead, served unconditionally (no auth) by `artifacts/api-server/src/routes/media.ts` (mounted before `requireAuth`, same pattern as `voice-tts-audio.ts`).

**Why:** Instagram's Content Publishing API (`publishInstagramPhotoPost` in `lib/meta.ts`) only accepts a publicly reachable image URL for its media-container step — it has no direct byte-upload path like Facebook's Page photo endpoint does. A base64 data URI can never satisfy that; publishing to Instagram failed every time before this.

**How to apply:** Any future AI/generated media (not just images) that might be published to Instagram (or any platform requiring a URL) must go through `storeGeneratedMedia`, not return raw base64. Downstream publish code (Facebook/LinkedIn/X in `posts.ts`) resolves a post's media entry via `resolveMediaBuffer()`, which transparently handles either a legacy `data:` URI or a hosted URL by fetching it — so platforms needing raw bytes still work regardless of which form the media is stored in. Manual/uploaded (non-AI) post images don't exist yet as a feature; if added, route them through the same object-storage + public-URL pattern.
