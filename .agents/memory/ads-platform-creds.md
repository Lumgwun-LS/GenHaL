---
name: Ads Suite platform credentials
description: How Meta and X Ads credentials are resolved at publish time; which platforms are stubs
---

## Meta (Facebook + Instagram)

- Uses the vendor's `social_accounts.refreshTokenEncrypted` (long-lived user token) — NOT the page token in `accessTokenEncrypted`. The user token carries `ads_management` scope.
- Falls back to `accessTokenEncrypted` if `refreshTokenEncrypted` is null.
- Ad Account ID comes from `vendor_ad_accounts.external_account_id` for `platform = "meta"`.
- Must be prefixed with `act_` in API calls (code handles this automatically).
- API: `https://graph.facebook.com/v19.0/` — creates Campaign → Ad Set → optionally Ad Creative + Ad.
- Creative creation is best-effort (page_id in object_story_spec is tricky); Campaign+AdSet always persist even if creative fails.

## X / Twitter Ads

- Uses OAuth 1.0a — NOT the user's OAuth 2.0 social token.
- Platform-level env vars: `X_ADS_CONSUMER_KEY`, `X_ADS_CONSUMER_SECRET`, `X_ADS_ACCESS_TOKEN`, `X_ADS_ACCESS_TOKEN_SECRET`.
- Per-vendor: `vendor_ad_accounts.external_account_id` for `platform = "twitter"` = numeric Twitter Ads account ID (from ads.twitter.com/accounts URL).
- API: `https://ads-api.x.com/12/` — creates Campaign → Line Item (ad set equivalent).
- Returns `connected: false` with setup instructions if platform env vars are missing.

## Platform normalization

`toAdPlatform(campaignPlatform)` maps display names to canonical keys:
- "Facebook" | "Instagram" → "meta"
- "X (Twitter)" | "X" → "twitter"
- "Google Ads" | "YouTube" → "google"
- "tiktok" | "linkedin" → pass-through

`toSocialPlatform(campaignPlatform)` maps display name to `social_accounts.platform` value (exact-case match used by social OAuth).

## Pending stubs

- `linkedin` — pending Marketing Developer Platform approval
- `google` — needs Developer Token + OAuth setup
- `tiktok` — needs TikTok for Business app approval

## DB

`vendor_ad_accounts` table (migration 0055) — one row per vendor per platform. Upsert on (vendorId, platform).

**Why:** Ads API credentials are separate from social posting OAuth — Ads APIs often need different scopes, different token types, or platform-level app credentials. Keeping them in their own table avoids polluting `social_accounts` with ads-specific fields.
