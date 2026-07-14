---
name: Social account (Meta) token health check
description: How proactive Facebook/Instagram OAuth token expiry/revocation detection works, for extending to other providers or building admin visibility.
---

Facebook/Instagram OAuth tokens (connectedVia = "oauth_meta") are validated hourly by `social-account-health.ts` + `social-account-health-scheduler.ts`, using a cheap `GET /{accountId}?fields=id` Graph call (`validateMetaAccessToken` in `meta.ts`).

Only acts on the transition (active -> needs_reconnect or needs_reconnect -> active), never every tick — same shape as `platform-gateways.ts` recheck. On becoming invalid: `social_accounts.status` flips to `"needs_reconnect"` (so `posts.ts`'s `status = "active"` publish filter naturally excludes it), a `vendor_notifications` row with `type: "social_reconnect"` is inserted, a reconnect email is sent, and an admin Slack alert fires.

**Why:** matches the existing project convention (payment gateway health, Twilio token rotation) of "periodic re-test + alert only on transition" rather than only failing at use-time.

**How to apply:** LinkedIn/X OAuth tokens have the same expiry/revocation risk but aren't covered yet (only Meta) — see the "Extend account-health checks to LinkedIn and X" follow-up task. If adding another provider, add its own cheap validation call and reuse the transition-detection + notify pattern here rather than duplicating status/notification logic per provider.
