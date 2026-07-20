/**
 * Startup schema-drift guard.
 *
 * Migrations in lib/db/migrations only take effect once actually applied to
 * a given database (dev via post-merge db:push, production via the Publish
 * diff flow). If a migration is written but never applied, every background
 * job that queries the new column fails on every tick, silently, since each
 * job's top-level try/catch just logs and keeps ticking (see
 * pending-reminders.ts, subscription-sync-scheduler.ts). Nothing surfaces
 * that to an admin.
 *
 * This runs once at boot and compares the Drizzle schema (the source of
 * truth for what *should* be in the database) against what information_schema
 * says is *actually* there. Any table or column defined in the Drizzle schema
 * but absent from the database is loudly logged and Slack-alerted.
 *
 * Newly added tables/columns are covered automatically — no hand-maintained
 * list needs updating after each migration.
 *
 * It intentionally does not crash the process: a partially-migrated dev DB
 * shouldn't take down routes that don't touch the missing column.
 */
import * as dbSchema from "@workspace/db/schema";
import { db } from "@workspace/db";
import { PgTable } from "drizzle-orm/pg-core";
import { getTableConfig } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { sendSlackAlert } from "./slack";

interface MissingColumn {
  table: string;
  column: string;
}

interface MissingTable {
  table: string;
}

/**
 * Derives all expected (table, column) pairs from the exported Drizzle schema.
 * Any export that is a PgTable instance contributes its SQL table name and
 * each of its SQL column names to the expected set. Non-table exports (Zod
 * schemas, TypeScript types, helper functions) are silently skipped.
 */
function deriveExpectedFromDrizzleSchema(): {
  expectedTables: Set<string>;
  expectedColumns: Set<string>;
} {
  const expectedTables = new Set<string>();
  const expectedColumns = new Set<string>();

  for (const value of Object.values(dbSchema)) {
    // PgTable objects (created by pgTable()) have runtime class identity.
    if (!(value instanceof PgTable)) continue;

    const config = getTableConfig(value);
    expectedTables.add(config.name);

    for (const col of config.columns) {
      expectedColumns.add(`${config.name}.${col.name}`);
    }
  }

  return { expectedTables, expectedColumns };
}

export interface SchemaDriftResult {
  missingTables: MissingTable[];
  /** Columns missing from tables that ARE present (excludes columns of wholly-absent tables). */
  missingColumns: MissingColumn[];
}

/**
 * Pure query layer: connects to the real database and compares its
 * information_schema against the Drizzle schema.  Returns the findings
 * without any side effects (no logging, no Slack alert).
 *
 * This is the function used by the integration smoke-test
 * (src/lib/__tests__/schema-drift-guard.integration.ts) so it can assert on
 * the actual findings rather than just checking for logged side-effects.
 *
 * Throws if the database is unreachable — the caller (runSchemaDriftGuard)
 * wraps it in a try/catch so the server keeps starting even on DB trouble.
 */
export async function checkSchemaDrift(): Promise<SchemaDriftResult> {
  const { expectedTables, expectedColumns } = deriveExpectedFromDrizzleSchema();

  const rows = await db.execute<{ table_name: string; column_name: string }>(
    sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`,
  );

  const presentColumns = new Set(rows.rows.map((r) => `${r.table_name}.${r.column_name}`));
  const presentTables = new Set(rows.rows.map((r) => r.table_name));

  const missingColumns: MissingColumn[] = [];
  for (const col of expectedColumns) {
    if (!presentColumns.has(col)) {
      const [table, column] = col.split(".");
      missingColumns.push({ table, column });
    }
  }

  const missingTables: MissingTable[] = [];
  for (const table of expectedTables) {
    if (!presentTables.has(table)) {
      missingTables.push({ table });
    }
  }

  // Suppress per-column entries for wholly-absent tables — the table line
  // already captures the full extent of the drift.
  const missingTableNames = new Set(missingTables.map((t) => t.table));
  const orphanColumns = missingColumns.filter((c) => !missingTableNames.has(c.table));

  return { missingTables, missingColumns: orphanColumns };
}

/**
 * Queries information_schema for all columns in the public schema, then
 * compares against the expected set derived from the Drizzle schema. Any
 * mismatch is logged at ERROR level and Slack-alerted.
 *
 * Never throws — a drift finding should be visible, not fatal, since most
 * routes are unaffected by any single missing column.
 */
export async function runSchemaDriftGuard(): Promise<void> {
  try {
    const { missingTables, missingColumns: orphanColumns } = await checkSchemaDrift();

    if (missingTables.length === 0 && orphanColumns.length === 0) {
      logger.info("[schema-guard] No schema drift detected — database matches Drizzle schema");
      return;
    }

    const tableLines = missingTables.map((t) => `- table: ${t.table}`);
    const columnLines = orphanColumns.map((c) => `- column: ${c.table}.${c.column}`);
    const allLines = [...tableLines, ...columnLines];
    const totalMissing = missingTables.length + orphanColumns.length;

    const message =
      `[schema-guard] Missing ${totalMissing} table(s)/column(s) defined in the Drizzle schema ` +
      `but absent from the database — a migration was written but never applied. ` +
      `Background jobs touching these will fail on every tick until this is fixed:\n` +
      allLines.join("\n");

    logger.error({ missingTables, missingColumns: orphanColumns }, message);

    await sendSlackAlert(
      `:rotating_light: Schema drift detected on startup — ${totalMissing} Drizzle-defined table(s)/column(s) missing from the database:\n` +
        allLines.join("\n") +
        `\n\nApply the corresponding migration(s) in lib/db/migrations to this database (dev: \`pnpm --filter @workspace/db run db:push\`, production: re-publish).`,
    );
  } catch (err) {
    // Never let the guard itself take down startup.
    logger.error({ err }, "[schema-guard] Failed to run schema drift check");
  }
}
