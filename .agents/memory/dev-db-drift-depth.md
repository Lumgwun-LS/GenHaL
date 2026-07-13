---
name: VendorHub dev DB drift runs deeper than a single migration
description: When a background job crashes with "column does not exist", check every migration touching the tables that job's query joins, not just the one migration named in the crash report.
---

A crash naming one missing column is often just the first one a query trips over — an ORM `select()` with joins pulls every column of every joined table, so any other un-applied migration on those same tables surfaces as the next crash the moment the first is fixed.

**Why:** fixing only the named column and restarting looks successful for a moment, then the same job crashes again on the next un-applied column in the same query — wasting a full fix→restart→observe cycle per column instead of catching them together.

**How to apply:** when told "column X does not exist," read the failing query's full column list, walk forward through the migrations directory for every table involved, and check the live schema for all of them in one pass before applying anything. Apply all missing DDL for tables *used by the job in scope* together; defer columns/tables belonging to genuinely different jobs to a follow-up instead of expanding scope silently. Dev-only DDL can go straight via SQL; production schema only moves through the project's Publish/diff flow, never direct DDL. A startup guard that diffs expected columns against `information_schema` and alerts (without crashing) turns this class of silent per-tick failure into a one-time loud warning — see `artifacts/api-server/src/lib/schema-guard.ts`.
