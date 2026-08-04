---
name: R2 Storage Migration
description: Cloudflare R2 replaces GCS for app media; vendor system migration pending. Credentials, URL pattern, and migration script documented here.
---

## What moved to R2
- App Store icons, APKs, screenshots — fully migrated (gcs.ts replaced by r2.ts)
- One-time migration script: `artifacts/api-server/scripts/migrate-gcs-to-r2.mjs`

## What is still on Replit object storage
- All vendor system media (product photos, AI images, voice audio, website builder assets)
- Uses `objectStorage.ts` + Replit sidecar — not plain GCS credentials
- Task #742 queued to migrate this too

## R2 credentials (secret names)
- `R2_ACCOUNT_ID` — Cloudflare account ID
- `R2_BUCKET_NAME` — bucket name
- `S3_ACCESS_KEY_ID` — R2 API token Access Key ID (token needs Object Read & Write permission)
- `S3_ACCESS_KEY_SECRET` — R2 API token Secret Access Key
- `R2_PUBLIC_URL` — r2.dev public base URL (e.g. https://pub-xxx.r2.dev)

## Public URL pattern
`${R2_PUBLIC_URL}/${prefix}/${timestamp}-${hex}${ext}`
- app-store/media — icons
- app-store/downloads — APKs
- app-store/screenshots — screenshots

## Customer-facing download URLs
`POST /apps/:slug/download` returns `canonicalDownloadUrl` (awajimaaappstore.com/dl/:packageName), NOT the raw R2 URL.
`/dl/:identifier` route does a 302 redirect to the real R2 file URL — R2 URL never shown to customers.

**Why:** openai package was also missing from api-server node_modules (installed separately) and from build.mjs externals list — both fixed during this migration.
