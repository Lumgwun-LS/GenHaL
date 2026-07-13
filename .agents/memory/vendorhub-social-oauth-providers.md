---
name: VendorHub social OAuth publish providers
description: How each social platform's live-publish connection is added and wired into the publish pipeline.
---

VendorHub now has real OAuth-connected publishing for Facebook/Instagram (Meta), LinkedIn, and X/Twitter. TikTok remains manual-only (no OAuth flow exists for it).

Pattern for adding a new provider (used for X/Twitter):
- `lib/<provider>.ts`: `is<Provider>Configured()`, `build<Provider>AuthUrl`, code-exchange, profile fetch, and publish function(s). Env vars are never platform-supplied — each deployment needs its own developer app, so these fail closed with a clear message until an admin sets the keys.
- `routes/social-oauth.ts`: `/social/oauth/<provider>/start` and `/callback`, using a signed short-lived JWT `state` (bound to vendorId) so the callback never trusts client-supplied identity. X's PKCE `code_verifier` is embedded in that same signed state JWT (no server-side session needed) since the callback is a separate redirect request.
- `routes/posts.ts`: `publishToPlatform` gets a new branch keyed by `normalizePlatformKey`; `socialAccountsTable.connectedVia` gets a new value (`oauth_<provider>`); `resolveTargetAccount`/`normalizePlatformKey` already generalize across platforms without changes.
- Frontend `pages/social/index.tsx`: add a "Connect X" button calling `/api/social/oauth/<provider>/start`, remove the platform from `MANUAL_ONLY_PLATFORMS`, and make sure the "Live" badge condition includes the new `connectedVia` value (this was previously scoped to `oauth_meta` only and needed updating for oauth_linkedin/oauth_twitter too — check it whenever adding a provider).

None of the three providers refresh their access token before/at expiry yet (Meta's is long-lived ~60d, LinkedIn/X shorter) — publishing will start failing with an opaque auth error until the vendor manually reconnects. Tracked as a follow-up, not yet fixed.
