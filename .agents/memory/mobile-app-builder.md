---
name: Mobile App Builder
description: Website-to-App service — vendor submits a URL, gets an Android APK published to the App Store automatically via EAS Build.
---

## Rule
When building the mobile app generator, `logger` in api-server is a **named export** (`import { logger } from "./logger"`), not default. `resolveAuthedVendor` is always inlined per-route file — there is no shared lib version.

## Architecture
- `vendor_mobile_apps` table: tracks one build per vendor (vendorId, source, websiteUrl/repoUrl, easBuildId, apkUrl, storeAppId, status)
- `artifacts/app-generator-template/` — minimal Expo WebView wrapper; reads `VENDOR_WEBSITE_URL` from `app.json extra.websiteUrl` via `expo-constants`
- `lib/app-generator.ts`: copies template to `/tmp/vendor-app-{vendorId}-{ts}/`, downloads vendor icon, writes customised `app.json`, runs `npm install`, then `eas build --platform android --profile preview --non-interactive --no-wait`
- `lib/mobile-app-build-scheduler.ts`: polls every 5 min for status=building rows, calls `eas build:view {id} --json`, on FINISHED creates/updates App Store listing + updates vendor_mobile_apps
- `routes/mobile-apps.ts`: GET/POST/DELETE `/vendors/me/mobile-app`

## Auto-developer-account
On `POST /vendors/onboarding`, a fire-and-forget `ON CONFLICT DO NOTHING` insert creates a `store_developer_accounts` row with the vendor's details — no extra registration needed.

## EAS project strategy
All generated apps use the same EAS account (`lumgwun-solutions`). Each gets a unique Android package name (`com.awajimaa.{vendor_slug}_{vendorId}`) via auto-registration when `eas build` runs for the first time with a new slug.

## Frontend
`artifacts/vendor-hub/src/pages/mobile-app.tsx` — "Mobile App Builder" page; `authFetch` + inline `apiFetch` helper (not `@/lib/api` which doesn't exist in vendor-hub); auto-polls every 15s while a build is in progress.
Nav item: Operations group in `components/layout.tsx` → `/mobile-app`, icon: `Smartphone`.

**Why:** `@/lib/api` is the app-store's helper; vendor-hub uses `@/lib/authFetch`.
