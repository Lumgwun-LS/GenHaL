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
 * This runs once at boot, checks a curated list of "known landmines" —
 * columns background jobs depend on that have bitten us before — against
 * information_schema, and loudly logs + Slack-alerts if any are missing.
 * It intentionally does not crash the process: a partially-migrated dev DB
 * shouldn't take down routes that don't touch the missing column.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { sendSlackAlert } from "./slack";

interface ExpectedColumn {
  table: string;
  column: string;
  /** Which background job(s)/features break if this is missing, for the alert message. */
  usedBy: string;
}

interface ExpectedTable {
  table: string;
  usedBy: string;
}

// Columns known to be required by scheduled background jobs. Add an entry
// here whenever a new migration introduces a column a scheduler depends on —
// it turns a silent per-tick crash into a loud, one-time startup warning.
const EXPECTED_COLUMNS: ExpectedColumn[] = [
  { table: "vendors", column: "remita_enabled", usedBy: "pending-reminders, checkout routing" },
  { table: "vendors", column: "flutterwave_enabled", usedBy: "pending-reminders, checkout routing" },
  { table: "vendors", column: "nomba_enabled", usedBy: "pending-reminders, checkout routing" },
  { table: "vendors", column: "push_payment_alerts_enabled", usedBy: "pending-reminders, push notifications" },
  { table: "vendors", column: "push_voice_campaign_alerts_enabled", usedBy: "pending-reminders, push notifications" },
  { table: "posts", column: "social_account_ids", usedBy: "pending-reminders, post scheduler, social publishing" },
  { table: "platform_payment_credentials", column: "last_checked_at", usedBy: "subscription-sync-scheduler, gateway-health-scheduler" },
  { table: "platform_payment_credentials", column: "last_failure_reason", usedBy: "subscription-sync-scheduler, gateway-health-scheduler" },
  { table: "platform_payment_credentials", column: "failing_since", usedBy: "subscription-sync-scheduler, gateway-health-scheduler" },
  { table: "social_accounts", column: "connected_via", usedBy: "social OAuth publish, social-account-health-scheduler" },
  { table: "social_accounts", column: "access_token_encrypted", usedBy: "social OAuth publish, social-account-health-scheduler" },
  { table: "social_accounts", column: "token_expires_at", usedBy: "social OAuth publish, social-account-health-scheduler" },
];

// Whole tables known to be required by scheduled background jobs, for
// migrations that introduce a new table rather than just a column.
const EXPECTED_TABLES: ExpectedTable[] = [
  { table: "job_run_status", usedBy: "subscription-sync-scheduler (recordJobRun), and any other scheduler using the shared job-run-status helper" },
  { table: "post_publications", usedBy: "social OAuth publish, post publishing pipeline" },
];

/**
 * Checks EXPECTED_COLUMNS against information_schema.columns and logs/alerts
 * on any that are missing. Never throws — a drift finding should be visible,
 * not fatal, since most routes are unaffected by any single missing column.
 */
export async function runSchemaDriftGuard(): Promise<void> {
  try {
    const rows = await db.execute<{ table_name: string; column_name: string }>(
      sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`,
    );
    const present = new Set(rows.rows.map((r) => `${r.table_name}.${r.column_name}`));
    const presentTables = new Set(rows.rows.map((r) => r.table_name));

    const missingColumns = EXPECTED_COLUMNS.filter((c) => !present.has(`${c.table}.${c.column}`));
    const missingTables = EXPECTED_TABLES.filter((t) => !presentTables.has(t.table));

    if (missingColumns.length === 0 && missingTables.length === 0) {
      logger.info("[schema-guard] No known schema drift detected");
      return;
    }

    const columnLines = missingColumns.map((c) => `- ${c.table}.${c.column} (breaks: ${c.usedBy})`);
    const tableLines = missingTables.map((t) => `- ${t.table} (breaks: ${t.usedBy})`);
    const allLines = [...columnLines, ...tableLines];
    const totalMissing = missingColumns.length + missingTables.length;
    const message = `[schema-guard] Missing ${totalMissing} expected column(s)/table(s) — a migration was written but never applied to this database. Affected background jobs will fail on every tick until this is fixed:\n${allLines.join("\n")}`;

    logger.error({ missingColumns, missingTables }, message);
    await sendSlackAlert(
      `:rotating_light: Schema drift detected on startup — ${totalMissing} expected column(s)/table(s) missing:\n${allLines.join("\n")}\n\nApply the corresponding migration(s) in lib/db/migrations to the dev DB (or re-publish for production).`,
    );
  } catch (err) {
    // Never let the guard itself take down startup.
    logger.error({ err }, "[schema-guard] Failed to run schema drift check");
  }
}
