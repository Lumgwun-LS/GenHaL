---
name: App Store admin features audit and fixes
description: Comprehensive audit of app store admin capabilities — what works, what was added, and what remains pending.
---

# App Store Admin Features — Audit & Fixes

## Admin Login via Gmail / Google
- `isAdmin()` is sync and only checks `ADMIN_USER_IDS` (Clerk userId, any login method).
- `checkIsAdmin()` (async, new) combines both: userId match OR primary email match in `SUPER_ADMIN_EMAILS`.
- All 22 admin route guards now use `await checkIsAdmin(req)` instead of `isAdmin(req)`.
- **To grant Google/Gmail admin access:** add the Gmail address to `SUPER_ADMIN_EMAILS` env var (comma-separated). The Clerk userId is not needed — just the email.

## Fee Bypass / Direct Launch
- `feeExempt` boolean on `storeDeveloperAccountsTable` pre-existed; app submission respects it.
- New: `POST /admin/developers/:id/toggle-fee-exempt` — toggles feeExempt, shows ✅ in dev table.
- New: `POST /admin/apps/:id/direct-approve` — admin bypasses fee for any app (sets `publishingFeePaid: true, publishingFeeGateway: "admin_waived", status: "approved"`), emails developer.
- UI: "⚡ Direct Launch" button in pending apps panel and "⚡ Launch" button in all-apps table (for `pending_payment`/`draft` status apps).
- UI: "Waive Fee / ⚡ Exempt" button in developers table + checkmark column.

## Download URL After Upload
- Admin "Our Apps" tab: after APK upload, a green banner appears with the file URL and a "Copy Download Link" button.
- State: `uploadedApkUrl`, `copiedApkUrl` — cleared on form open/close.
- The public app page URL (awajimaaappstore.com/app/:publicId) also shows in the app card with its own "Copy Link" button.

## Suspend / Block
- `POST /admin/developers/:id/suspend` toggles `status` between `active` and `suspended`.
- Suspended developers cannot use any authenticated developer endpoint.
- UI: "Suspend / Unsuspend" button in developers table (already existed, confirmed working).

## Analytics
### Downloads / Installs / Uninstalls
- All tracked per-event in `store_app_events`, aggregated in `/admin/event-analytics`.
- Admin analytics tab shows: total views, installs, uninstalls, new users, conversion rate.
- Per-app engagement stats available in developer portal.

### Geo — Country
- Events table has `country` (CF-IPCountry header or `x-country-code`).
- Admin analytics shows: installs by country, uninstalls by country, views by country, new users by country (4 panels).

### Geo — State / Region / City (new)
- Migration `0073_store_event_geo.sql` added `region` and `city` columns to `store_app_events`.
- `extractRegion()` reads `cf-ipregion` or `x-region` header; `extractCity()` reads `cf-ipcity` or `x-city`.
- These are set by Cloudflare Workers (not basic Cloudflare proxy) — data appears as users come through CF.
- Admin analytics shows: installs by region, views by region + city pill cloud (appears only when data exists).
- A tip message shows when no region data is available yet.

### Review Analytics (new)
- Admin analytics shows: rating distribution bar chart (1-5 stars) + average rating + total reviews.
- "Most Reviewed Apps" table: top 10 by review count with avg rating.
- Pulls from `storeAppReviewsTable` for the same time period as other analytics.

## What's NOT tracked
- App un-installs are tracked when the app explicitly calls `POST /apps/:slug/event` with `eventType: "uninstall"` — requires client-side SDK integration.
