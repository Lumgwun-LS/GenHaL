---
name: Dev DB drift can span many already-committed migrations
description: Full-row select/insert against posts/social_accounts/vendor_notifications/job_run_status/vendors can throw "column does not exist" even though the Drizzle schema and migration files are correct.
---

Several tables' dev-DB columns lag behind their Drizzle schema even though the corresponding migration file already exists in `lib/db/migrations/` — the migration was simply never applied to this dev database. Symptom: any full-row `db.select().from(table)` or `db.insert(table).values(...)` throws `column "..." does not exist`, even for columns you never touch, because Drizzle lists every declared column in the query.

**Why:** `drizzle-kit push` against dev can hang on an unrelated interactive prompt (see `drizzle-push-interactive-prompt.md`), so drift accumulates silently across sessions instead of surfacing at push time.

**How to apply:** Before treating a "column/relation does not exist" error as a new bug in your feature, check `lib/db/migrations/` for a file that already defines it, and apply just that file's DDL via `executeSql` (dev-only) to unblock your path. Don't attempt a full remediation of every table in one sitting — that's its own task (see project task "Catch schema drift before it silently breaks background jobs"); just patch enough to verify what you're working on.
