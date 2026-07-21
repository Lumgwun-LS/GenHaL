#!/bin/bash
set -e

# Post-merge setup: install dependencies, rebuild shared packages, apply
# DB migrations, and verify schema is clean.
# Runs automatically after every task merge. Must be idempotent and non-interactive.

pnpm install

# Rebuild the DB package so api-server typecheck picks up schema changes.
# Not all environments have a build script; suppress the "no build script" warning.
pnpm --filter @workspace/db run build 2>/dev/null || true

# Apply all SQL migration files in lib/db/migrations/ to the dev database via
# psql — direct SQL, no drizzle-kit TTY prompts, fully non-interactive.
# Each migration uses CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
bash scripts/apply-migrations.sh

# Smoke-test the schema-drift guard against the real dev database.
# Exits 1 (failing the merge) if any Drizzle-defined table or column is still
# absent after the migrations above.  That means either:
#   - a migration file is missing from lib/db/migrations/ (add one + re-merge), or
#   - the migration SQL itself is wrong.
pnpm --filter @workspace/api-server exec \
  npx tsx src/lib/__tests__/schema-drift-guard.integration.ts
