---
name: VendorHub AI content generation
description: Real image/caption generation backend for the Social Media Manager feature, vendor links injection into AI prompts, and route auth pattern for AI endpoints.
---

## Vendor links auto-injected into all AI-generated content
`lib/vendor-links.ts` — `getVendorLinks(vendorId)` queries website slug + published mobile app slug + builds support URL; `linksSystemContext()` formats for system-prompt injection; `linksFooter()` formats for long-form content footer.

Injected in every AI generation entry point (graceful degradation: `.catch(() => null)` so a DB failure never blocks generation):
- `/ai/generate-caption` — appended to system prompt
- `/ai/analyze-video-caption` (Gemini, video captions) — appended to instruction string
- `/ai/generate-content` Content Studio `social_post` type — appended to system prompt
- `/ai/generate-content` Content Studio `article`/`academic` — `linksFooter()` appended to the returned content string via `generateLongForm(..., links)` param
- `task-scheduler.ts` `post_social_media` — dynamic import + inject into system prompt

Links included per vendor (only those that exist): website, shop, published mobile app, support ticket page (always).
AI is instructed: weave in only 1–2 most relevant links naturally — never dump all at once.

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
