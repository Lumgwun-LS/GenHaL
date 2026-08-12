# Awa Biz Suite — Platform Documentation

A multi-vendor SaaS platform built on a pnpm monorepo. Vendors sign up, complete onboarding, and get a full business cockpit: social media management, CRM, inventory, sales, voice & SMS campaigns, finance, and a public storefront. Admins manage the whole platform from a separate Admin Panel tab.

---

## Run & Operate

```bash
pnpm --filter @workspace/api-server run dev          # API server (port via $PORT)
pnpm --filter @workspace/vendor-hub run dev          # Vendor dashboard (React/Vite)
pnpm --filter @workspace/app-store run dev           # Awajimaa App Store (React/Vite)
pnpm --filter @workspace/vendorhub-mobile run dev    # Mobile app (Expo)
pnpm run typecheck                                    # Full typecheck across all packages
pnpm run build                                        # Typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen        # Regenerate API hooks + Zod schemas from OpenAPI spec
pnpm --filter @workspace/db run push                 # Push DB schema changes (dev only — use push-force to bypass TTY prompt)
```

### ⚠️ Before publishing: rebuild genhal-web

`genhal-web` is a **static artifact** — Replit serves its pre-built `dist/public` directly without re-running Vite. Any source changes to `artifacts/genhal-web/src/**` are invisible in production until you rebuild:

```bash
pnpm build:genhal   # rebuilds artifacts/genhal-web/dist/public (BASE_PATH=/ for genhal.awajimaa.com)
# IMPORTANT: Always run pnpm build:genhal before publishing genhal-web changes.
# The artifact uses serve="static" (no Replit-triggered build), so the workspace
# dist/public/ at publish time IS what gets served on genhal.awajimaa.com.
```

Run this once, then publish. The `PORT` and `BASE_PATH` env vars are baked into the build script — no flags needed.

Required secrets: `DATABASE_URL`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`.  
Payment secrets: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`.  
Voice/SMS: `TWILIO_AUTH_TOKEN` (separate from the Twilio connector — needed for webhook signature validation).  
Social OAuth: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET`.  
Object storage: `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`.

---

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces, Node.js 24, TypeScript 5.9 |
| API | Express 5, esbuild (CJS bundle) |
| DB | PostgreSQL + Drizzle ORM + drizzle-zod |
| Validation | Zod (v4) |
| API codegen | Orval (from OpenAPI spec in `lib/api-spec/`) |
| Auth | Clerk (web + mobile), custom vendor JWT for mobile/external |
| Frontend | React 18 + Vite, Tailwind CSS, shadcn/ui, Wouter routing |
| Mobile | Expo (SDK 53), React Native, EAS Build |
| Payments | Stripe, Paystack, PayPal, Nomba, Remita, Flutterwave |
| Voice | Twilio (calls) + ElevenLabs (TTS / music) |
| AI | OpenAI (images, captions) + Gemini (video analysis) |
| Storage | Replit Object Storage |
| Email | SMTP via Nodemailer (`lib/mailer.ts`) |
| Push | Expo Push Notification Service (`lib/push.ts`) |

---

## Where things live

```
lib/
  db/               Drizzle schema (src/schema/), migrations/, dist/ (must rebuild after schema changes)
  api-spec/         OpenAPI YAML — source of truth for all API contracts
  api-zod/          Generated Zod schemas (from Orval)
  api-client-react/ Generated React Query hooks (from Orval)

artifacts/
  api-server/       Express API — all backend logic
    src/
      routes/       One file per domain (products.ts, leads.ts, social/posts.ts, …)
      routes/external/  External / partner API (/api/external/features/*)
      routes/admin* Admin-only routes (analytics, billing, gateways, …)
      lib/          Shared helpers: usage.ts, mailer.ts, push.ts, scheduler.ts, …
      app.ts        Route mounting (all at /api prefix — do NOT repeat /api in route files)

  vendor-hub/       React/Vite vendor dashboard + public landing page
    src/
      pages/        One folder per feature (products/, leads/, social/, finance/, …)
      components/   Shared components — layout.tsx is the authenticated shell
      hooks/        useCurrentVendor.ts, useIsAdmin.ts, use-date-range-filter.ts, …
      contexts/     voice-context.tsx, QueryClientProvider, …

  app-store/        Awajimaa App Store (separate React/Vite app)
  vendorhub-mobile/ Expo mobile app for vendors

lib/db/src/schema/  Source of truth for the database schema
lib/api-spec/       Source of truth for the HTTP API contract
```

---

## Architecture decisions

- **Clerk for auth, vendor JWT for external/mobile.** Web sessions use Clerk tokens. The mobile app and external partners use a two-token pattern: Clerk token for the handshake only, then an app-issued JWT for all `/api/external/*` calls. The handshake endpoint must derive identity from the verified Clerk token server-side — never from self-asserted request fields.

- **Single `applyPaymentStatusTransition()` for all payment status writes.** All gateways (Stripe, Paystack, PayPal, Nomba, Remita, Flutterwave) funnel through one function in `lib/payment-transition.ts`. This prevents late webhooks from overwriting a vendor-cancelled payment and keeps sales auto-sync idempotent.

- **`useCurrentVendor()` is the canonical way to get the logged-in vendor's data on the frontend.** It calls `GET /api/vendors/me` and works for any authenticated user. **Never use `useListVendors()` + `.find(v => v.clerkUserId === user.id)` in page components** — `useListVendors()` is admin-only and returns an empty array for regular vendors, leaving every button permanently disabled.

- **Background jobs use `setInterval` + `recordJobRun()`.** The scheduler (`lib/scheduler.ts`) runs jobs on 5-minute ticks with atomic conditional UPDATEs for idempotency. Every job calls `recordJobRun()` so the Admin → Background Jobs panel shows last-run time and failure banners without per-job wiring.

- **Schema-drift guard runs on startup.** `lib/schema-drift-guard.ts` checks a curated list of tables/columns at boot. A missing column crashes the process immediately instead of silently failing on the first scheduler tick.

- **Orval requestBody schemas must use `Input`/`Update` suffixes.** Never use `*Body` suffix or inline schemas in the OpenAPI spec — Orval's auto-generated Zod exports cause `TS2308` collisions.

- **Subscription tier reconciliation goes both directions.** `subscription-sync.ts` is called by both the manual `/sync` route and the periodic scheduler. It upgrades on active subscriptions and downgrades to free when none is found.

---

## Product

**Awa Biz Suite** — authenticated vendor dashboard at `/dashboard` and sub-routes.

| Module | What it does |
|---|---|
| Dashboard | KPI overview, recent activity, quick actions |
| Social Media Manager | Multi-platform post scheduling (Facebook, Instagram, LinkedIn, X, TikTok), AI caption generation, media library, post analytics |
| AI Design Studio | Architecture/building design, interior design, fashion & tailoring AI image generation |
| CRM / Leads | Lead pipeline with status tracking, CSV import/export, analytics |
| Products | Product catalogue, stock tracking, CSV import/export |
| Inventory | Stock-in / stock-out / adjustment transactions |
| Orders | Customer order management, multi-gateway checkout |
| Public Storefront | `GET /site/:slug` — per-vendor storefront for customers |
| SMS Campaigns | Mass SMS with scheduling |
| Voice Campaigns | Twilio-powered outbound voice calls with ElevenLabs TTS scripts |
| Email Campaigns | HTML email campaigns |
| Finance Suite | Sales, Expenses (incl. recurring), Investments — with date/branch/worker filters |
| Finance Analytics | Revenue charts, expense breakdowns, investment ROI |
| Branches & Workers | Multi-location and staff management |
| Ads Suite | Meta, X/Twitter ad campaigns |
| Data Analytics | AI-driven business data insights |
| Real Estate | Property listings management |
| Billing / Subscriptions | Stripe (USD) + Paystack (NGN), free trial, plan upgrades/downgrades, add-on credits, Stripe Customer Portal |
| Account & Developer | Profile, notification preferences, API key management, OAuth app registration |
| **Admin Panel** | Vendor management, platform analytics, visitor intelligence, platform financials, billing enforcement, background jobs, payment gateways, site editor, social account health, announcement broadcasts |

**Awajimaa App Store** — separate artifact at `/app-store`. Developers submit apps; vendors browse and install. $15 listing fee via Stripe or Paystack.

**Awa Biz Suite Mobile** — Expo app mirroring core dashboard features on iOS/Android.

---

## User preferences

_Populate as the user gives explicit preferences._

---

## Gotchas

- **`useCurrentVendor()` — not `useListVendors()`** in page components. `useListVendors()` is admin-only; regular vendors get an empty array back, so `myVendor` is always `undefined` and every action button stays `disabled`. Import `useCurrentVendor` from `@/hooks/useCurrentVendor` and use `const { vendor } = useCurrentVendor()`.

- **`lib/db` must be rebuilt after schema changes.** Run `tsc -b` inside `lib/db/` after any schema edit, or `dist/schema/index.d.ts` stays stale and API-server typecheck breaks with phantom errors.

- **Schema-drift guard**: After adding a migration file in `lib/db/migrations/`, apply it to the dev database:
  ```bash
  pnpm --filter @workspace/db run push-force
  ```
  Then verify no drift:
  ```bash
  pnpm --filter @workspace/api-server exec npx tsx src/lib/__tests__/schema-drift-guard.integration.ts
  ```
  The post-merge script (`scripts/post-merge.sh`) runs both steps automatically after every task merge. Background jobs silently fail on every scheduler tick when a migration is written but not applied.

- **`drizzle-kit push` can hang waiting for a TTY prompt** for pre-existing unrelated drift. Use `push-force` or apply new table DDL directly via `executeSql` to unblock.

- **Twilio Auth Token rotation**: `TWILIO_AUTH_TOKEN` (Replit Secret) must match the active Auth Token in the Twilio console. Rotating the token in Twilio without updating the secret causes all voice status-callback requests to fail signature validation silently (call statuses stop updating). The API server detects a burst of rejected callbacks and fires a Slack alert + admin banner.

- **App.ts mounts all routes under `/api`.** Route files must NOT include `/api` in their own paths or requests 404.

- **Orval codegen after OpenAPI changes.** After editing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` AND `tsc -b` in `lib/db` and `lib/api-zod` before trusting typecheck errors — stale generated files cause false TS errors.

- **Numeric DB columns return strings from Postgres; timestamps return Date objects.** Coerce numbers with `String(val)` before Drizzle insert/update. Pass `new Date(isoString)` for timestamp columns.

- **Sidebar layout fix (dashboard shell):** `layout.tsx` uses `md:sticky md:top-0 md:h-screen` on the `<aside>` so the nav column is always exactly viewport-tall and `overflow-y-auto` on the inner `<nav>` actually scrolls. Do not revert to `md:relative` — that removes the bounded height and clips menu items silently.

- **`POST /vendors/onboarding` is the correct vendor signup route.** `POST /vendors` is admin-only. The Clerk `<SignUp />` component alone does NOT create a vendors row; the onboarding step does, with server-verified Clerk identity and a DB-unique constraint on `clerkUserId` to survive double-submits.

- **Public storefront and App Store routes must mount BEFORE `requireAuth`.** These routes serve unauthenticated customers — mounting them after the auth middleware 401s every public visitor.

---

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
- Developer-facing API reference lives at `/developers` (the `DevelopersPage` component) — covers the external `/api/external/features/*` REST API, OAuth 2.0, webhooks, rate limits.
- Payment webhook pipeline is centralised in `routes/payments/webhooks.ts` (public, pre-auth). Per-file webhook routes elsewhere are unreachable dead code.
