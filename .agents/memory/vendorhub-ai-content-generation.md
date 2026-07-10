---
name: VendorHub AI content generation
description: Real image/caption generation backend for the Social Media Manager feature, and route auth pattern for AI endpoints.
---

`/ai/generate-image` and `/ai/generate-caption` use the Replit-managed OpenAI AI
Integration (`@workspace/integrations-openai-ai-server`) — `generateImageBuffer`
(gpt-image-1) for images, `openai.chat.completions.create` (gpt-5.4-mini) for
captions. No user-supplied API key. Images are returned/stored as base64 data URIs
in `ai_generations.result` (text column) — acceptable for now but will need to move
to object storage if history volume grows.

**Why:** these routes previously returned hardcoded placeholder text ("requires
OpenAI integration, connect via Settings") — no real generation existed.

**How to apply:** any new AI generation route in this app should follow the same
`resolveAuthedVendor` ownership check used in `posts.ts`/`vendors.ts` — vendorId in
the body must be verified against the caller's own vendor row (or admin allowlist)
before invoking the model or writing to `ai_generations`. Also cap prompt/topic
length before sending to the model.

No video generation exists yet for this feature — OpenAI's integration does not
support video output; would need the Gemini AI integration or a different approach.
Real publishing to Instagram/Facebook/TikTok/X/LinkedIn also does not exist —
`social_accounts` table and its CRUD routes are unused placeholder scaffolding with
no OAuth behind them, and `POST /posts/:id/publish` just flips a DB status flag with
no external API calls.
