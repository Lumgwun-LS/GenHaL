---
name: Mobile App Builder
description: Website-to-App service — vendor submits a URL, an Android APK is built via GitHub Actions (Gradle + keystore) and published to the App Store automatically.
---

## Rule
`logger` in api-server is a **named export** (`import { logger } from "./logger"`), not default. `resolveAuthedVendor` is always inlined per-route file — there is no shared lib version. `@/lib/api` does NOT exist in vendor-hub; use `@/lib/authFetch` instead.

## Architecture
- `vendor_mobile_apps` table — vendorId, source, websiteUrl/repoUrl, easBuildId (stores GitHub run ID), apkUrl, storeAppId, status
- `artifacts/android-template/` — native Kotlin WebView app; `artifacts/app-generator-template/` (old Expo template) is now unused
- `lib/app-generator.ts` — triggers GitHub `workflow_dispatch` on `build-apk.yml`; returns `{ slug, packageName, runId }`; stores runId in `easBuildId` column
- `lib/mobile-app-build-scheduler.ts` — polls GitHub Actions run status every 5 min as a **failure-detection fallback only**; successful builds are handled by the callback
- `routes/mobile-apps.ts` — GET/POST/DELETE `/vendors/me/mobile-app`; passes `recordId` to `generateVendorApp`
- `routes/internal-mobile-app.ts` — `POST /internal/mobile-app/:id/apk` (binary APK → object storage → mark published) and `/fail`; mounted **before** requireAuth; protected by `X-Callback-Secret`

## Build flow
1. Vendor submits URL → API dispatches `workflow_dispatch` with `recordId`, inputs, callback URL + secret
2. GitHub Actions: setup-android, sed-replace pkg/name/url, build with Gradle, sign with keystore, `curl` binary APK to callback route
3. Callback stores APK via `storeGeneratedMedia()`, creates/updates App Store listing, marks record `published`
4. Scheduler detects stuck/failed runs (>45 min or `conclusion != success`) and marks them failed

## Required secrets (Awa Biz Suite)
`GITHUB_ACTIONS_TOKEN` (repo+workflow PAT), `GITHUB_ANDROID_REPO_OWNER`, `GITHUB_ANDROID_REPO_NAME`, `MOBILE_APP_CALLBACK_SECRET`

## Required GitHub secrets (android-template repo)
`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`

## Auto-developer-account
On `POST /vendors/onboarding`, a fire-and-forget `ON CONFLICT DO NOTHING` insert creates a `store_developer_accounts` row — no extra registration needed.

## Frontend
`artifacts/vendor-hub/src/pages/mobile-app.tsx` — auto-polls every 15s during building. Nav item in Operations group → `/mobile-app`, icon: `Smartphone`.
