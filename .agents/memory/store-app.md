---
name: Awajimaa App Store
description: Architecture and key decisions for the app-store artifact at /app-store/
---

# Awajimaa App Store

## Stack
- Frontend: React + Vite at `artifacts/app-store/`, previewPath `/app-store/`
- Routes mounted in API server: `/store/*` (before the global `requireAuth` middleware)
- DB tables: `store_developer_accounts`, `store_apps`, `store_app_versions`, `store_app_reviews`
- API routes: `artifacts/api-server/src/routes/store.ts`

## Critical: Route mounting position
Store routes must be mounted BEFORE `router.use(requireAuth)` in `routes/index.ts`.
Public browse endpoints (GET /store/apps, /store/apps/featured, etc.) must not require Clerk auth.
Per-route auth is handled inside `store.ts` itself via `requireAuth()` only on protected endpoints.

## API URL pattern
The app-store frontend uses root-relative `/api/store/*` URLs (no BASE_URL prefix).
The Replit proxy routes `/api/*` to the API server regardless of which frontend is active.
`apiFetch()` in `artifacts/app-store/src/lib/api.ts` uses `const API_BASE = "/api/store"`.

## Drizzle relations
Store tables use `with: { developer: true }` relational queries.
Relations defined in `lib/db/src/schema/store-relations.ts` and exported from schema/index.ts.

## $15 developer fee
- Stripe: creates checkout.sessions, returns checkoutUrl
- Paystack: initializes transaction, returns paystackAuthorizationUrl
- PayPal: stub (not implemented, returns 501)
- After payment, call POST /store/developers/register to activate account

## AI review
POST /store/admin/apps/:id/ai-review calls GPT-4o-mini with a structured JSON prompt.
Returns: summary, category, policyFlags[], score (0-100), recommendation (approve/review/reject), malwareHints[].
Persists results to store_apps.ai_summary/ai_category/ai_policy_flags/ai_review_score.

## Pages
- `/` — Home: hero, categories, featured, trending, newest
- `/search` — Browse with filters (category, platform, sort)
- `/apps/:slug` — App detail: screenshots, reviews, versions, download
- `/developer` — Portal: dashboard, my apps, submit (requires developer account)
- `/developer/signup` — 3-step signup: payment → profile → done
- `/admin` — Admin: overview stats, pending review queue, all apps, developers

**Why:** Store routes before requireAuth = public browsing works without login. Per-route auth inside store.ts guards developer/admin actions.
