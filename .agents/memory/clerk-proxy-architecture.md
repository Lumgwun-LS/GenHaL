---
name: Clerk proxy architecture
description: How Clerk auth proxying works across the CF Pages + Replit deployment — critical to get right or sign-in breaks completely.
---

## The correct Clerk proxy flow

```
Browser
  → awajimaaai.com/api/__clerk/*          (CF Pages)
  → _redirects 200-proxy
  → account.awajimaaai.com/api/__clerk/*  (Replit / API server)
  → clerkProxyMiddleware (artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts)
  → frontend-api.clerk.dev/*              (real Clerk FAPI)
```

**No DNS for `clerk.awajimaaai.com` is needed.** The API server handles everything.

## Key files

- `artifacts/vendor-hub/public/_redirects` — CF Pages edge rules:
  - `/api/__clerk/*` → `https://account.awajimaaai.com/api/__clerk/:splat  200`
  - `/api/*` → `https://account.awajimaaai.com/api/:splat  200`
  - `/*` → `/index.html  200`
- `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` — strips `/api/__clerk` prefix, adds `Clerk-Proxy-Url` + `Clerk-Secret-Key` headers, proxies to `frontend-api.clerk.dev`
- `artifacts/vendor-hub/host-router.mjs` — static-file only; does NOT proxy Clerk (Replit's path routing sends /api/* to api-server before it reaches host-router)
- `artifacts/vendor-hub/src/App.tsx`:
  - On CF Pages (`__CF_PAGES__ = true`): `clerkProxyUrl = 'https://awajimaaai.com/api/__clerk'`, `baseUrl = 'https://awajimaaai.com'`
  - On Replit: `clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL` (production env: `https://awajimaaai.com/api/__clerk`)

## The mistake that caused auth to break

A prior session added this to `artifacts/vendor-hub/public/_redirects`:
```
/*  https://account.awajimaaai.com/:splat  301
```
This 301-redirected everything on `awajimaaai.com` (the CF Pages deployment) to `account.awajimaaai.com`. OAuth redirect_uri must match exactly — the 301 chain changed the final URL so Google rejected it with `authorization_invalid`.

**Why:** The redirect was added as a temporary fix when Clerk keys were misconfigured. The comment said "Remove this once awajimaaai.com has a valid Clerk live key" but it was never removed.

## Replit-managed Clerk

- Status: `managed` (confirmed via `checkClerkManagementStatus()`)
- Dev key: `pk_test_...` → FAPI at `model-mink-61.clerk.accounts.dev`
- Prod key: `pk_live_Y2xlcmsuYXdhamltYWFhaS5jb20k` → encodes `clerk.awajimaaai.com` as custom domain
- There is NO external Clerk dashboard — configuration via Replit Auth pane only
- `clerk.awajimaaai.com` Cloudflare DNS: not pointing to Clerk servers — but irrelevant because the proxy goes through the API server, not directly to that host

## clerkProxyMiddleware behaviour

- Only active when `NODE_ENV === 'production'` AND `CLERK_SECRET_KEY` is set
- Strips the `/api/__clerk` prefix before forwarding to `frontend-api.clerk.dev`
- Must be mounted BEFORE `express.json()` in app.ts (currently correct at line 80)
