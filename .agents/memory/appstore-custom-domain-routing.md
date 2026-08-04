---
name: App Store custom-domain routing
description: SPA built with non-root base path breaks when served at custom domain root — router base and API origin both need runtime hostname detection.
---

# App Store custom-domain routing

## The rule
When a Vite SPA is built with `base="/app-store/"` but served at a custom domain root (`awajimaaappstore.com/`), two things must detect the hostname at runtime:

1. **Router base** (`App.tsx`) — Wouter's `<Router base={basePath}>` must use `""` not `"/app-store"` on the custom domain, or every route matches nothing and the 404 component always renders.
2. **API origin** (`lib/api.ts`) — relative `/api/store/…` calls land on the static-only custom-domain host, which serves `index.html` back. Must use the absolute origin `https://account.awajimaaai.com` on the custom domain.

## Why
The Replit monorepo deployment routes `awajimaaappstore.com/*` to the app-store static artifact. That artifact has no `/api/` handler — all unmatched paths fall through to the SPA rewrite and return `index.html`. The primary domain `awajimaaai.com` routes normally to the API server.

## How to apply
Pattern used in `artifacts/app-store/src/App.tsx` and `artifacts/app-store/src/lib/api.ts`:
```ts
const _onCustomDomain =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'awajimaaappstore.com' ||
    window.location.hostname === 'www.awajimaaappstore.com');
```
- In `App.tsx`: `const basePath = _onCustomDomain ? "" : _builtBase;`
- In `api.ts`: use `https://account.awajimaaai.com` as origin when `_onCustomDomain` is true.
