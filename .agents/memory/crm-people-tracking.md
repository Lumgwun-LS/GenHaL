---
name: CRM People Tracking
description: New inbound CRM system replacing the outbound scraping leads model — tracking visitors from website, ads, forms, social, and orders.
---

# CRM People Tracking System

## What changed
- `leads` table = "People" in UI. Old columns kept for compat. New columns: `channel`, `utmSource/Medium/Campaign/Content`, `referrerUrl`, `landingPage`, `visitorToken`, `pageViews`, `firstSeenAt`, `lastSeenAt`.
- New tables: `person_activities` (timeline), `lead_forms` (embeddable forms), `utm_links` (trackable short links).
- Migrations 0093–0096 applied to dev DB.

## Public tracking endpoints (no auth, mounted before requireAuth)
- `POST /api/public/crm/visit` — website pixel, upserts person by email→visitorToken
- `POST /api/public/crm/forms/:formId/submit` — form submission
- `GET /api/public/r/:shortCode` — UTM short-link redirect + click tracking

## Upsert logic
Match by email first, then visitorToken. On match: bump pageViews + update lastSeenAt. On miss: create with channel and UTM attribution. Order placement auto-creates person as `status: "converted"` via `syncOrderToCrm()` in orders.ts.

## Frontend: pages/leads/
- `index.tsx` — tabs: People | Pipeline | Lead Forms | UTM Links | Setup
- `person-drawer.tsx` — side sheet with contact info, stats, attribution, pipeline stage, activity timeline
- `pipeline-view.tsx` — kanban board with quick-move buttons
- `forms-tab.tsx` — create/manage embeddable forms + copy embed HTML
- `utm-tab.tsx` — UTM link builder with presets + copy short/full URL
- `setup-tab.tsx` — tracking script embed snippet (uses vendorId numeric)

## Key design decisions
- `channel` mirrors `source` for new records (both set, source kept for backwards compat)
- Tracking script stores `awa_vid` in localStorage as anonymous visitor token
- `public-post-links.ts` lead insert: removed `productId` (column gone), uses `channel: "form"`
- `@workspace/api-zod` added as vendor-hub dependency + tsconfig reference
- `lib/api-zod/tsconfig.json` needed `"lib": ["dom", "es2022"]` for Blob/File types in generated Zod

**Why:** `upload/binary` Orval generates `Blob` type refs that need DOM lib. Without it, typecheck:libs fails.

## Social click-through tracking (not yet implemented)
User requested auto-capture from connected social accounts (Facebook/Instagram/LinkedIn/X posts). This would require adding a redirect proxy to post links. Deferred.
