---
name: VendorHub AI video-to-caption feature
description: How vendor-uploaded videos get analyzed by Gemini into a caption, and two gotchas hit while building it.
---

## Feature
Vendors can upload their own video in the post composer; Gemini (`gemini-2.5-flash`) watches it (inline video bytes if ≤8MB, else sampled JPEG frames via ffmpeg) and writes a grounded caption. This is distinct from `/ai/generate-video` (which generates a new video from an AI image) and `/ai/generate-caption` (which writes from a topic string with no real media). Upload flow reuses the presigned-URL object storage pattern, now exposed client-side via `/ai/upload-video-url`.

## Gotcha 1: esbuild's default `external: ["@google/*"]` breaks any real `@google/` SDK
`artifacts/api-server/build.mjs`'s external list had a blanket `"@google/*"` (meant for hypothetical future Google packages), which silently externalizes anything under that scope — including the real `@google/genai` Gemini SDK — causing `ERR_MODULE_NOT_FOUND` at runtime since it's not hoisted into api-server's own node_modules. Removed the wildcard (kept `@google-cloud/*` for actual GCP client libs, which do need externalizing for their dynamic proto loading). If a new `@google/`-scoped package is added and needs externalizing for a real reason, add it by exact name, not by wildcard.

## Gotcha 2: AI-generation response routes never serialize `createdAt`
All `/ai/*` routes that `.insert(aiGenerationsTable).returning()` then `SomeResponse.parse(generation)` were silently broken end-to-end (500 ZodError) — Drizzle returns `createdAt` as a `Date` object, but the orval-generated response schema expects `zod.string()` per the OpenAPI `format: date-time` string type. This affected `/ai/generate-caption`, `/ai/generate-image`, `/ai/generate-video`, and `/ai/generations` too, not just the new route — it had never been exercised with a real HTTP call end-to-end before. Fixed with a shared `serializeGeneration()` helper that calls `.toISOString()` before `.parse()`. Any new route following this insert→parse pattern needs the same treatment.
