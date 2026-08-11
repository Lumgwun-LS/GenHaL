---
name: Production schema drift — deploy blockers
description: Specific schema mismatches that blocked Replit publish (provision stage) and how they were resolved. Reference before the next publish attempt.
---

## How Replit's provision step actually works (CRITICAL)

Replit's provision step diffs the **dev database schema** against the **production database schema** — NOT the Drizzle TypeScript schema files, NOT the compiled dist/, NOT the migration SQL files.

This means:
- Editing TypeScript schema files does NOT affect the provision step
- Editing migration SQL files does NOT affect the provision step
- The dev database IS the source of truth for what the provision step tries to apply to production

**Implication**: If you alter a column on dev (e.g., `SET NOT NULL`) but production still has it nullable, the provision step will generate `ALTER TABLE ... SET NOT NULL` against production — and fail if production rows are null.

**The fix for any provision conflict**: make the dev database match production (or vice versa), not the TypeScript files.

## How to diagnose provision conflicts

Before publishing, run both queries and compare:
```sql
SELECT column_name, is_nullable, column_default, data_type
FROM information_schema.columns
WHERE table_name = 'your_table'
ORDER BY ordinal_position;
```
- Dev: `executeSql({ sqlQuery: ... })` (no environment = dev)
- Production: `executeSql({ sqlQuery: ..., environment: "production" })`

Any diff will be applied by the provision step. Nullability, column type, defaults — all must match.

## posts.social_account_ids — full history of this conflict

The column was added to production as nullable (despite the migration saying NOT NULL DEFAULT '{}' — the IF NOT EXISTS clause skipped it). Production: nullable. Dev: was set to NOT NULL during a "backfill" attempt.

Provision step saw: dev=NOT NULL, prod=nullable → generated SET NOT NULL → failed (7 null rows in production).

**Fix applied**: `ALTER TABLE "posts" ALTER COLUMN "social_account_ids" DROP NOT NULL` on dev DB, making both dev and production nullable. TypeScript schema also updated to match (`.notNull()` removed).

Migration 0131 (`0131_backfill_post_social_account_ids.sql`) will backfill production NULLs to `'{}'` on next deploy. The startup migration also backfills on api-server boot.

## Constraint name drift (root cause, Aug 2026)

Production has auto-named `_key` constraints (Postgres default for inline UNIQUE). Drizzle schema generates `_unique` names for unnamed `.unique()` calls. Every column with `.unique()` generated a prompt on every publish.

**Fix applied**: All single-column `.unique()` calls changed to explicit `.unique("_key_name")` matching what production has (e.g., `unique("job_run_status_job_name_key")`).

Startup migration (`artifacts/api-server/src/lib/startup-constraint-migration.ts`) also adds `_unique` alias constraints + missing columns idempotently on boot.

## Rule: Never add a table-level unique constraint to the schema for a constraint that already exists in production

Adding a named unique constraint to a table where production already has it causes a DROP + re-CREATE which fails. Leave such constraints out of the schema entirely.

Affected tables: `blog_post_likes`, `blog_commenter_bans`, `store_app_download_subscribers`, `orders.receipt_token`.

## Missing columns (production had them, schema didn't — would be DROPped)

Production columns not defined in the Drizzle schema before Aug 2026 fixes:
- `social_accounts.refresh_token_expires_at` (TIMESTAMPTZ, nullable)
- `leads.linkedin_url` (TEXT, nullable)
- `leads.website_url` (TEXT, nullable)
- `leads.product_id` (INTEGER, nullable)

All four added to their schema files. Also applied DDL to dev DB via `executeSql`.

## New tables (safe)

Tables in schema but not in production are safe CREATE TABLE operations. As of Aug 2026: `messages`, `conversations`, `genhal_town_rulers`, `genhal_town_records`.

## Key rule: any dev DB DDL must be mirrored on production before next publish

If you run `ALTER TABLE ... SET NOT NULL` or `ALTER TABLE ... ADD COLUMN NOT NULL` on dev, you must either:
1. Also apply it to production (not always possible — prod is read-only via executeSql)
2. Or roll it back on dev before publishing

Never leave dev in a "more constrained" state than production unless production data supports the constraint.
