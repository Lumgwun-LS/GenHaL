---
name: VendorHub AI video scene preview/render split
description: Multi-scene AI video generation is split into preview, per-scene regenerate, and render steps so vendors can review before spending video-render quota.
---

The old single-shot `/ai/generate-video` (generate all scenes + render in one call) was replaced with three endpoints in `artifacts/api-server/src/routes/ai.ts`:

- `POST /ai/generate-video-scenes` — generates 1-3 scene preview images only, no render.
- `POST /ai/regenerate-video-scene` — regenerates one scene's image without touching the others.
- `POST /ai/render-video` — fetches the vendor-confirmed scene image URLs (already public, from `storeGeneratedMedia`) and does the ffmpeg stitch (transitions, caption overlay, optional music).

**Why:** vendors previously had to regenerate the entire video (all scenes + render) to retry one disliked scene, which cost time and generation credits for scenes they were already happy with.

**Quota split (the key non-obvious decision):** scene preview/regenerate calls consume `aiImages` quota (one unit per scene image, same as a normal image generation). Only `/ai/render-video` consumes `aiVideos` quota. So no video credit is spent until the vendor explicitly confirms scenes and renders.

**Cleanup for free:** scene preview images are persisted as ordinary `aiGenerationsTable` rows with `type: "image"` (not a new type), so they're automatically picked up by the existing orphaned-media cleanup job (media-cleanup.ts, 48h retention, unattached-to-post sweep) with zero changes to that job — an unconfirmed or discarded scene preview just ages out like any other unused AI image.

**How to apply:** any future change to the video-generation flow (e.g. new scene controls, editable prompts before regenerate) should preserve this three-step shape and the quota boundary — don't let render-time-only quota spend regress back to spending on scene generation.

**SSRF/ownership trap:** a render step that accepts client-supplied media URLs and fetches them server-side is an SSRF vector unless every URL is first resolved against a record the server itself minted and stored, scoped to the calling vendor. Never fetch a client string directly — extract the object id, look it up against that vendor's own generation rows, and fetch the URL that came back from the database, not the one in the request body.
