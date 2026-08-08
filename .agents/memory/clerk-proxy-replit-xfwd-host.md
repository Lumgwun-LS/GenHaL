---
name: Clerk proxy Replit x-forwarded-host mismatch
description: Why authorization_invalid kept recurring on Biz Suite login and how it was fixed.
---

## The rule
Set `CLERK_PROXY_URL` env var on the API server to a hardcoded value matching `VITE_CLERK_PROXY_URL`. Never rely solely on the dynamic `x-forwarded-host` computation for the `Clerk-Proxy-Url` header.

**Why:** Replit's deployment infrastructure sets `x-forwarded-host: account.awajimaaai.com` for all requests going through the combined deployment, even when the Clerk JS SDK targets a different origin (e.g. `awajimaaai.com/api/__clerk`). Clerk validates that the `proxy_url` baked into the OAuth state matches the `Clerk-Proxy-Url` header received at the callback. A domain mismatch → `authorization_invalid`. Previous "fixes" changed code in Replit but never redeployed the CF Pages / Replit production bundle, so the old `VITE_CLERK_PROXY_URL` value kept being used.

**How to apply:**
- `CLERK_PROXY_URL` (production env var, API server runtime) = `https://account.awajimaaai.com/api/__clerk`
- `VITE_CLERK_PROXY_URL` (production env var, baked into vendor-hub bundle at build time) = `https://account.awajimaaai.com/api/__clerk`
- `clerkProxyMiddleware.ts` reads `process.env.CLERK_PROXY_URL` and uses it as `proxyUrl` when set, bypassing the dynamic host computation.
- After ANY change to these values, both the API server AND vendor-hub must be published (redeployed) from Replit for changes to take effect.

## Key architecture fact
`account.awajimaaai.com` is a **Replit custom domain** for the vendor-hub deployment — NOT Cloudflare Pages. There is no GitHub remote in this repo; all remotes are Replit subrepl refs. Code changes in Replit only go live after Publish. The `_redirects` file (CF Pages format) in vendor-hub/public/ is unused in the Replit deployment.

## Related env vars (production)
- `VITE_CLERK_PROXY_URL` = `https://account.awajimaaai.com/api/__clerk`
- `VITE_API_BASE_URL` = `https://api.awajimaaai.com`
- `CLERK_PROXY_URL` = `https://account.awajimaaai.com/api/__clerk`
- `VENDOR_HUB_URL` (secret, needs updating to `https://account.awajimaaai.com` — currently `https://vendor.awajimaaai.com`)
