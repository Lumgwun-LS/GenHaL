---
name: drizzle-kit push interactive prompt blocks non-interactive shells
description: What to do when `pnpm run push` (drizzle-kit push) hangs/fails asking to confirm a destructive change unrelated to your current schema addition.
---

`drizzle-kit push` diffs the *entire* schema against the DB, not just your new table. If there is pre-existing drift elsewhere (e.g. a unique constraint that would require confirming a truncate), it prompts interactively and fails with "Interactive prompts require a TTY" in this environment.

**Why:** the agent shell is non-interactive, so any accumulated drift blocks pushing schema for a totally unrelated new feature.

**How to apply:** when you only need to add a new table/column and push is blocked by unrelated drift, skip `pnpm run push` and apply your specific DDL directly via the database tool's `executeSql` (`CREATE TABLE IF NOT EXISTS ...` etc.), matching the Drizzle schema exactly. Don't try to resolve the unrelated drift unless that's the actual task.
