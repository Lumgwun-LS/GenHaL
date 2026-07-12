---
name: VendorHub AI video generation
description: Why post videos are built by animating the AI image instead of calling a text-to-video model, and the payload-size trap that comes with it.
---

Neither the OpenAI nor Gemini Replit AI Integrations proxy supports text-to-video generation/output, and the agent-only video-generation tool isn't callable from production request handlers — so there is no real text-to-video model available to the running server.

**Decision:** build the video by animating the already-supported AI product image (pan/zoom + caption overlay) into a real, relevant mp4 server-side, rather than mocking a placeholder clip.

**Why:** keeps the feature genuinely functional today; revisit only if AI Integrations adds text-to-video support or a vendor supplies their own third-party video-gen API key.

**Payload-size trap:** any binary media (image or video) shipped as a base64 `data:` URI inside a JSON request/response body can exceed Express's default 100kb body-size limit well before it exceeds what's "reasonable" for the media itself — a plain product photo alone can trip this. Any new base64-media feature must confirm the relevant Express body-size limit is raised to fit it, not just that the generation step itself works.
