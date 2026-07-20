/**
 * Integration smoke-test: drift guard against the real dev database.
 *
 * The unit tests in schema-guard.test.ts mock the database entirely — they
 * cannot catch a typo in a real column name or a misconfigured
 * information_schema query. This script runs checkSchemaDrift() against the
 * ACTUAL dev database and asserts zero missing tables or columns.
 *
 * Run this after every migration is applied to confirm the guard is clean:
 *
 *   pnpm --filter @workspace/api-server exec \
 *     npx tsx src/lib/__tests__/schema-drift-guard.integration.ts
 *
 * Or from the repo root:
 *
 *   cd artifacts/api-server && npx tsx src/lib/__tests__/schema-drift-guard.integration.ts
 *
 * What it checks (end-to-end, no mocks):
 *   1. Calls checkSchemaDrift() which queries information_schema.columns on
 *      the real dev DB and compares against every PgTable exported from
 *      @workspace/db/schema.
 *   2. Asserts missingTables is empty — every Drizzle table exists in the DB.
 *   3. Asserts missingColumns is empty — every Drizzle column exists in its
 *      table in the DB.
 *   4. Exits 0 on pass, exits 1 with a detailed report on failure.
 *
 * When (and only when) this script exits 0 you can be confident:
 *   - All migrations in lib/db/migrations have been applied to this database.
 *   - The guard's information_schema query is correctly wired.
 *   - Background jobs won't fail on the first tick due to missing columns.
 *
 * If it exits 1:
 *   - Apply the missing migration(s):
 *       pnpm --filter @workspace/db run db:push   (dev)
 *       Re-publish the deployment                  (production)
 *   - Re-run this script to confirm clean.
 */
import { checkSchemaDrift } from "../schema-guard";

async function main() {
  console.log("[schema-drift-guard smoke-test] Connecting to dev database …");

  let result: Awaited<ReturnType<typeof checkSchemaDrift>>;
  try {
    result = await checkSchemaDrift();
  } catch (err) {
    console.error(
      "[schema-drift-guard smoke-test] FAILED — checkSchemaDrift() threw an error.\n" +
        "This usually means the database is unreachable or DATABASE_URL is not set.\n",
      err,
    );
    process.exit(1);
  }

  const { missingTables, missingColumns } = result;

  if (missingTables.length === 0 && missingColumns.length === 0) {
    console.log(
      "[schema-drift-guard smoke-test] PASSED — database matches Drizzle schema.\n" +
        "All migrations have been applied; no drift detected.",
    );
    process.exit(0);
  }

  // ── drift found — print a human-readable report and exit 1 ──────────────────
  const lines: string[] = [];

  lines.push(
    `[schema-drift-guard smoke-test] FAILED — ${missingTables.length} missing table(s) and ${missingColumns.length} missing column(s).`,
  );
  lines.push("");
  lines.push(
    "The Drizzle schema defines the following that are ABSENT from the database.",
    "Apply the corresponding migration(s) in lib/db/migrations to fix this.",
    "",
  );

  if (missingTables.length > 0) {
    lines.push("Missing tables:");
    for (const { table } of missingTables) {
      lines.push(`  - ${table}`);
    }
    lines.push("");
  }

  if (missingColumns.length > 0) {
    lines.push("Missing columns (table is present but column is absent):");
    for (const { table, column } of missingColumns) {
      lines.push(`  - ${table}.${column}`);
    }
    lines.push("");
  }

  lines.push(
    "To fix (dev database):",
    "  pnpm --filter @workspace/db run db:push",
    "",
    "Then re-run this smoke-test to confirm the drift is resolved.",
  );

  console.error(lines.join("\n"));
  process.exit(1);
}

main();
