---
name: Production schema drift — deploy blockers
description: Specific schema mismatches that blocked Replit publish (provision stage) and how they were resolved. Reference before the next publish attempt.
---

## What the Replit provision step does

Replit's publish flow runs `drizzle-kit push` against the **production** database during the "Provision" stage — before any build starts and before the api-server boots. If it detects drift it either:
- Prompts ("Add the constraint as-is") for constraint name changes
- Shows a WARNING for destructive changes (column drops, data conflicts)
- Hard-fails with "conflict with existing production data" for SET NOT NULL failures or duplicate constraint names

## Constraint name drift (root cause, Aug 2026)

Production has auto-named `_key` constraints (Postgres default for inline UNIQUE). Drizzle schema generates `_unique` names for unnamed `.unique()` calls. Every column with `.unique()` generated a prompt on every publish.

**Fix applied:** All single-column `.unique()` calls in the schema were changed to explicit `.unique("_key_name")` matching what already exists in production (e.g., `unique("job_run_status_job_name_key")`). Multi-column genhal constraints (previously custom-named) were also updated to use the auto-generated `_key` names.

**Startup migration:** `artifacts/api-server/src/lib/startup-constraint-migration.ts` — idempotently adds `_unique` alias constraints + missing columns on every api-server boot. Safe to leave in place permanently.

## Rule: Never add a table-level unique constraint to the schema for a constraint that already exists in production

Adding a named unique constraint (e.g., `unique("blog_commenter_bans_vendor_id_commenter_email_key").on(...)`) to a table where production already has that constraint causes drizzle-kit to attempt a DROP + re-CREATE, which fails. Leave such constraints out of the schema entirely (they exist in the DB and enforce uniqueness regardless).

Affected tables where this was an issue: `blog_post_likes`, `blog_commenter_bans`, `store_app_download_subscribers`, `orders.receipt_token`.

## Missing columns (production had them, schema didn't — would be DROPped)

Production columns not defined in the Drizzle schema before Aug 2026 fixes:
- `social_accounts.refresh_token_expires_at` (TIMESTAMPTZ, nullable)
- `leads.linkedin_url` (TEXT, nullable)
- `leads.website_url` (TEXT, nullable)
- `leads.product_id` (INTEGER, nullable)

All four added to their schema files. Also applied DDL to dev DB via `executeSql` since they were missing there too.

## NOT NULL conflict (schema said NOT NULL, production column was nullable with null data)

`posts.social_account_ids` was `.array().notNull().default([])` in schema but the column was added to production as nullable (no NOT NULL) and all 7 existing rows had NULL. The provision step tried `ALTER TABLE posts ALTER COLUMN social_account_ids SET NOT NULL` and failed.

**Fix:** Removed `.notNull()` — schema now has `integer("social_account_ids").array().default([])`.

**Why:** This happens when a migration adds a column as nullable (no NOT NULL in the SQL) even though the Drizzle schema says notNull. Always verify new NOT NULL columns in schema match the actual SQL in the migration file.

## How to diagnose before publishing

Run against production:
```sql
-- Find nullable columns in production that schema might say NOT NULL
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name = 'your_table' ORDER BY ordinal_position;
```

Use `executeSql` (environment: "production") — it's read-only so safe. Check for:
1. Column in production as nullable + schema says notNull → SET NOT NULL conflict
2. Column in schema but not in production + notNull + no default → ADD COLUMN conflict
3. Constraint in schema not in production → prompt (usually safe to accept)
4. Column in production but not in schema → DROP warning (add to schema immediately)

## New tables (safe)

Tables in schema but not in production are safe CREATE TABLE operations. As of Aug 2026: `messages`, `conversations`, `genhal_town_rulers`, `genhal_town_records`.
