---
name: GenHaL Towns & Civic Governance
description: 5-table civic layer — towns, ruler succession, compounds, chief succession, heritage records. Migration 0124.
---

## Data model
- `genhal_towns` — root entity; configurable `rulerTitle` (King/Emir/Oba) and `chiefTitle` (Chief/Elder) per town
- `genhal_town_rulers` — king/ruler succession timeline; `isCurrent` flag; auto-clears prior current when new one set; links to tree/member
- `genhal_compounds` — family quarters within a town; optional override `chiefTitle`; `linkedTreeIds` jsonb for multiple family trees
- `genhal_compound_chiefs` — chief succession per compound; same pattern as rulers
- `genhal_town_records` — polymorphic record: type ∈ {history|tradition|festival|ceremony|natural_resource|economic_activity}

**Why:** Communities are organised around town → compound → family hierarchy; rulers and chiefs have succession (not just one entry); heritage is multi-typed so one table with a `type` column beats six thin tables.

## Routes (genhal-towns.ts, mounted in index.ts)
- GET/POST /genhal/towns — list + create
- GET/PATCH/DELETE /genhal/towns/:id — detail (includes rulers, compounds+chiefs, records)
- GET/POST /genhal/towns/:id/rulers, PATCH/DELETE /:id/rulers/:rid
- GET/POST /genhal/towns/:id/compounds, PATCH/DELETE /:id/compounds/:cid
- POST /genhal/towns/:townId/compounds/:cid/chiefs, PATCH/DELETE /:townId/compounds/:cid/chiefs/:id
- GET/POST /genhal/towns/:id/records, PATCH/DELETE /:townId/records/:rid

## Frontend
- `/towns` → `pages/towns/index.tsx` — amber hero banner, card grid, create dialog
- `/towns/:id` → `pages/towns/detail.tsx` — hero with cover image + emblem, stat ribbon, 5 tabs:
  - Overview (description, current ruler, quick-add buttons)
  - Rulers (vertical timeline with succession notes)
  - Compounds (cards with chief lineage expand/collapse, Add Chief inline)
  - Heritage (grouped by type: history/tradition/festival/ceremony)
  - Resources (natural_resource + economic_activity two-column)
- Nav: "Towns" with Building2 icon in layout.tsx (between Collect and Corpus & AI)
