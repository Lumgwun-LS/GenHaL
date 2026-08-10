---
name: App Store & GenHaL custom-domain routing
description: How awajimaaappstore.com and genhal.awajimaa.com are routed in the monorepo deployment — host-router.mjs, standalone builds, and Wouter base detection.
---

## Rule
In a Replit monorepo deployment, ALL custom domains map to the root `/` path. The vendor-hub's `host-router.mjs` runs at `/` and routes traffic to the correct static-file directory based on the `Host` header. GenHaL lives at `/genhal/` in dev but needs a standalone build (BASE_PATH=/) served at the domain root.

## host-router.mjs (artifacts/vendor-hub/host-router.mjs)
Three static roots:
- `awajimaaappstore.com` / `www.awajimaaappstore.com` → `artifacts/app-store/dist/standalone`
- `genhal.awajimaa.com` / `www.genhal.awajimaa.com` → `artifacts/genhal-web/dist/standalone`
- everything else → `artifacts/vendor-hub/dist/public` (Awa Biz Suite)

## Standalone builds
Each domain-served SPA must have a `build:standalone` npm script that builds with `BASE_PATH=/` (no sub-path) into `dist/standalone/`:
- App Store: `PORT=3000 BASE_PATH=/ vite build --outDir dist/standalone --emptyOutDir`
- GenHaL:    `PORT=3000 BASE_PATH=/ vite build --outDir dist/standalone --emptyOutDir`

## Production build command (vendor-hub artifact.toml)
```
build = ["sh", "-c", "pnpm --filter @workspace/vendor-hub run build && pnpm --filter @workspace/app-store run build:standalone && pnpm --filter @workspace/genhal-web run build:standalone"]
```
Any new domain-served SPA must be added to this chain.

## In-app hostname detection
Each SPA detects its custom domain at runtime and adjusts:
- Wouter `base` → `""` (not the `/app-store/` or `/genhal/` sub-path)
- API origin → same-origin `/api/...` still works because Replit's path routing intercepts `/api/*` before the host-router sees it

GenHaL pattern (App.tsx):
```ts
const _onCustomDomain = window.location.hostname === 'genhal.awajimaa.com' || ...;
const basePath = _onCustomDomain ? '' : _builtBase; // _builtBase = import.meta.env.BASE_URL
```

App Store pattern (App.tsx + lib/api.ts): same structure, plus API_ORIGIN switches to `https://api.awajimaaai.com` when on the custom domain.

**Why:** Replit's custom-domain system attaches a domain to the entire deployment, not to a specific path. The host-router is the only place path→domain mapping can be done for static SPAs. Without the standalone build (BASE_PATH=/), asset links in index.html reference /genhal/assets/... which 404 when served at the domain root.
