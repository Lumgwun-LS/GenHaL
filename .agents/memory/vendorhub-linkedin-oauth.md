---
name: VendorHub LinkedIn OAuth
description: LinkedIn added as a second real per-vendor social OAuth provider alongside Meta; scope and gotchas.
---

VendorHub's social OAuth (per-vendor, real Facebook/Instagram linking via Meta) was generalized to also support
LinkedIn, following the same pattern: signed short-lived JWT state → provider code exchange → encrypted token
stored on `social_accounts` (`connectedVia: "oauth_linkedin"`).

Scope decisions:
- LinkedIn support is the **member's own personal profile** only (LinkedIn Company Page posting needs the
  separate, partner-gated Marketing API — explicitly out of scope).
- LinkedIn video publishing is NOT implemented — `lib/linkedin.ts` only has text + image publish helpers.
  `publishToPlatform` in `posts.ts` throws a clear "not wired up yet" error if a vendor tries to attach video.
- TikTok and X/Twitter remain manual-only (no real OAuth) — narrowing "any other one possible" to
  Facebook/Instagram/LinkedIn for now.
- Like Meta, LinkedIn needs real developer-app credentials (`LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET`) that
  only the user can provide by creating a LinkedIn developer app with "Sign In with LinkedIn using OpenID
  Connect" + "Share on LinkedIn" products, and registering the `/api/social/oauth/linkedin/callback` redirect URL.

**Why:** keeps the multi-provider OAuth surface consistent and auditable — one state-signing/token-encryption
pattern, not a bespoke one per platform.

**How to apply:** if adding another real OAuth platform (e.g. TikTok), copy the Meta/LinkedIn route pair in
`social-oauth.ts` (`/start` + `/callback`), add a `lib/<platform>.ts` with `isXConfigured`/`buildXAuthUrl`/
`exchangeCode...`/`publishX...`, and add a branch in `publishToPlatform()` in `posts.ts`.

Also added `artifacts/api-server/src/lib/platform-constraints.ts` (backend) and a mirrored frontend
`PLATFORM_SPECS` const in `create.tsx` — purely informational per-platform caption/aspect-ratio/duration
guidance shown in the compose UI. Actual validation still relies on each platform's own API; if constraints
drift out of sync between the two copies, it's cosmetic only, not a functional bug.
