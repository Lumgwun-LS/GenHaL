---
name: GenHaL Kingdom Civic Layer
description: 5 kingdom-scoped civic tables added in migration 0126; full CRUD routes; returned in GET /genhal/kingdoms/:id
---

## Tables added (migration 0126)
- `genhal_kingdom_languages` — language_code, is_official bool, speaker_count
- `genhal_kingdom_geopoints` — type (landmark/river/sacred/…), lat/lng real, image_url
- `genhal_kingdom_economic_activities` — category, scale, is_main bool, seasonality
- `genhal_kingdom_schools` — level, type, founded, address, website, notes
- `genhal_kingdom_churches` — type (church/mosque/shrine/…), denomination, founded

**Why:** each kingdom needed structured civic data beyond the generic CivicRecord text blob — searchable/filterable, not just prose.

## API pattern
- `GET /genhal/kingdoms/:id` fetches all 5 collections via `Promise.all([ ..., languages, geopoints, economicActivities, schools, churches ])` and merges into the response.
- CRUD routes: `GET/POST /genhal/kingdoms/:id/<resource>` + `DELETE /genhal/kingdoms/:kingdomId/<resource>/:id` pattern (no PUT/PATCH — delete + re-add).

## Frontend pattern (detail.tsx)
- 5 new TabsTrigger values: `languages`, `geopoints`, `economy`, `schools`, `religion`
- Each TabsContent + EmptyState + Card grid + delete buttons follow the existing RecordCard/CdcCard pattern.
- 5 new Dialog components: LanguageDialog, GeopointDialog, EconomyDialog, SchoolDialog, ChurchDialog — all follow `useFormDialog` + `fetch POST + toast` pattern.
- EconomyCard is a standalone sub-component (not a dialog-style card) to enable primary/secondary grouping.
- Overview tab has shortcut buttons for all 5 new tabs (alongside existing Heritage Record button).
- Stat ribbon counts Languages, Schools, Economy, Churches.

## Pre-existing TS fixes applied at same time
- `order-fulfillment.ts` — removed `vendorName` from `wrapVendorEmail()` call (not in its type signature)
- `product-media.ts` — removed non-existent `businessType` column from vendor select + response; replaced non-existent `getPublicObjectURL` with direct `${R2_PUBLIC_URL}/${objectPath}`
- `sso.ts` — `displayName`→`name`, `lastLoginAt`→`lastSeenAt` on platformUsersTable; typed `verifyResp.json()` result
- `support-public.ts` — removed non-existent `category` column from vendorsTable select + response mapping
- `vendor-customers.ts` — removed non-existent `invoiceNumber` from invoicesTable + `ticketRef` from supportTicketsTable selects
