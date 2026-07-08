---
name: Dev database schema drift from Drizzle schema
description: What to do when routes fail with "column/relation does not exist" against the dev DB even though the Drizzle schema defines it, and drizzle-kit push can't run non-interactively.
---

A route can throw "column/relation does not exist" at runtime even though the Drizzle schema file clearly defines the column/table — this means the schema file was extended in an earlier session but the change was never applied to the actual dev database.

**Why:** `drizzle-kit push` prompts interactively for destructive-looking changes (e.g. adding a unique constraint), and there is no TTY in this environment, so it hangs instead of applying anything — `--force` and piped stdin don't bypass it.

**How to apply:** For dev-only drift, apply the missing DDL directly via `executeSql` (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`), matching the Drizzle schema exactly. Never do this for production — production schema changes must go through the deployment/database skill's migration flow.
