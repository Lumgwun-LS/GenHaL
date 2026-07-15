---
name: VendorHub social token silent renewal
description: How X/LinkedIn/Meta OAuth token renewal is unified so vendors don't have to reconnect on expiry.
---

`social_accounts.refresh_token_encrypted` is one generic column whose meaning
depends on `connectedVia`:
- `oauth_twitter`: the X OAuth `refresh_token` (X **rotates** it on every use —
  always persist the new one returned from the refresh call, not just the
  access token).
- `oauth_linkedin`: LinkedIn's `refresh_token`, but only apps with the
  "Programmatic refresh tokens" product get one back — it's routinely `null`,
  and that's expected, not a bug. Those accounts can't be silently renewed and
  need a reconnect once the ~60-day token expires.
- `oauth_meta`: Meta has no refresh grant at all. Instead this column holds
  the long-lived **user** token (distinct from the Page/IG access token used
  for publishing); renewal re-exchanges that user token via the same
  `fb_exchange_token` flow used at connect time, then re-derives a fresh
  Page/IG token via `listManagedPages` (Instagram accounts are matched by
  `page.instagramBusinessAccountId`, not the page id).

All renewal logic lives in one place — `lib/token-refresh.ts`'s
`ensureFreshAccessToken(account, { force? })` — used two ways:
1. Proactively, via `lib/token-refresh-scheduler.ts` (10-min tick), for idle
   accounts that never publish and would otherwise silently expire.
2. Reactively, wrapping every `publishToPlatform` call in `routes/posts.ts`:
   get a token, attempt the publish, and if it fails with an auth-shaped error
   (`isMetaAuthError`/`isLinkedInAuthError`/`isTwitterAuthError`), force one
   refresh and retry exactly once before giving up.

On any renewal failure (no stored refresh credential, or the refresh call
itself fails), the account flips to `status: "needs_reconnect"` and the
vendor gets the existing reconnect in-app notification + email (reused from
`social-account-health.ts`'s pattern) — never a silent/opaque publish failure.

**Why:** X's ~2h expiry means "reconnect after it breaks" is a bad vendor
experience; a shared helper avoids three near-duplicate refresh
implementations and keeps the failure-reporting story consistent across all
three OAuth providers.
