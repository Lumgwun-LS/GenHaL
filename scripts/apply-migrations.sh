#!/bin/bash
set -e

# Apply all SQL migration files in lib/db/migrations/ to the database in order.
# Uses psql directly — no drizzle-kit TTY prompts, fully non-interactive.
# Each migration uses CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS,
# so this is safe to run repeatedly.

MIGRATIONS_DIR="$(cd "$(dirname "$0")/../lib/db/migrations" && pwd)"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set — cannot apply migrations." >&2
  exit 1
fi

echo "[apply-migrations] Applying SQL migrations from $MIGRATIONS_DIR …"

count=0
for file in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$file" ] || continue
  echo "[apply-migrations] → $(basename "$file")"
  psql "$DATABASE_URL" -q -f "$file"
  count=$((count + 1))
done

echo "[apply-migrations] Done — applied $count migration file(s)."
