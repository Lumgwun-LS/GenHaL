---
name: VendorHub dev DB drift runs deeper than schema.ts diffs
description: tsc/typecheck passing does not mean the dev Postgres DB actually has the columns/tables Drizzle schema.ts declares; exercise new query paths for real before trusting them.
---

A clean `tsc --noEmit` does not mean the dev database matches the Drizzle schema files — dev DB drift can hide entire missing columns or tables that only surface when a query actually runs, not at compile time.

A stale-column failure mid-way through a multi-step claim/execute background job is worse than a normal error: if the code doesn't explicitly revert the in-progress state on exception, a row can get stuck in an intermediate status forever, since the job's own query only looks for the status it expects to claim from.

**Why:** Drizzle typecheck only validates against TS schema definitions, never against what's actually applied to the connected Postgres instance.

**How to apply:** after writing any new query/job that touches a table you haven't exercised this session, actually run it against dev data before declaring the feature done. If it reveals drift, apply the missing DDL via `executeSql` (see the existing dev-db-schema-drift note) — and make sure any multi-step job reverts cleanly on unexpected exceptions, not just expected failure branches.
