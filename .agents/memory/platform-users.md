---
name: Platform Users Registry
description: platform_users table + admin view — captures every Clerk user who touches the platform, including pre-onboarding sign-ups.
---

## Rule
Every Clerk user who touches the platform (authenticated or not yet onboarded) gets a row in `platform_users`. The table is the source of truth for the admin "Platform Users" view.

## How it works
- **JIT upsert in two places in `vendors.ts`:**
  - `POST /vendors/login-ping` — fires on every Clerk session; upserts with whatever info is available (Clerk user or vendor row). Captures pre-onboarding users.
  - `GET /vendors/me` — fires on every dashboard load; upserts with full vendor info + `onboardingCompleted=true` + `vendorId`.
- **`onboardingCompleted`** is set to true only once a vendors row exists for that clerkUserId.
- **`vendorId`** FK links to vendors.id (SET NULL on delete). NULL for pre-onboarding users.

## Admin routes (in admin.ts)
- `GET /admin/platform-users` — paginated list; search by name/email/phone; filter by onboarding status; includes order count (by customerEmail) and page-view count (by vendorId).
- `GET /admin/platform-users/:clerkUserId` — full detail: profile + vendor row (if any) + last 30 orders + last 30 page views.

## Orders and activity linking
- Orders linked by `customerEmail` (only stable cross-table link — orders table has no clerkUserId).
- Page views linked by `vendorId` (only available for onboarded users — pageViewsTable tracks vendor dashboard views, not storefront views).
- Pre-onboarding users show 0 page views until they complete onboarding.

## Why
- `GET /vendors/me` returns 404 for pre-onboarding users, so there was no previous way to see incomplete sign-ups in the admin.
- The JIT approach (no Clerk webhook needed) is simpler and covers the common case without extra infra.

## Admin UI
- `artifacts/vendor-hub/src/pages/admin/platform-users.tsx` — PlatformUsersPanel
- Wired into admin/index.tsx as "Platform Users" tab (value="platform-users") with Users icon from lucide-react.
