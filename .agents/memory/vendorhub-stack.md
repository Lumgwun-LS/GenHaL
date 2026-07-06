---
name: VendorHub Stack Decisions
description: Architecture decisions and key patterns for the VendorHub multivendor platform build.
---

## Stack
- Frontend: React + Vite (`artifacts/vendor-hub`), Clerk auth, `@workspace/api-client-react` Orval hooks
- API: Express 5 (`artifacts/api-server`), Clerk middleware, requireAuth guard on all business routes
- DB: Drizzle ORM + PostgreSQL, schema in `lib/db/src/schema/`
- Modules: vendors, social-accounts, posts, ai-generations, products, inventory-transactions, orders, order-items, leads, email-campaigns, sms-campaigns

## Auth
- Clerk (Replit-managed). `requireAuth` middleware in `artifacts/api-server/src/middlewares/requireAuth.ts` gates all `/api` routes except `/api/health`.
- Clerk proxy middleware mounted before `express.json()` at `/api/__clerk`.

## CORS
- Development: all origins allowed. Production: requires `ALLOWED_ORIGINS` env var (comma-separated).

## Email/SMS
- Currently stubbed (simulated send). TODO: wire Resend for email, Twilio for SMS.

## Lead Scraping
- AI-assisted generation, not a real web scraper. See `artifacts/api-server/src/routes/leads.ts` `generateSampleLeads()`.

**Why:** Real scrapers require external API credentials not yet provisioned.
**How to apply:** When user wants real scraping, add LinkedIn/Google Maps API integration via Replit integrations skill.
