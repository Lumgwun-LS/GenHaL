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

    const missing = EXPECTED_COLUMNS.filter((c) => !present.has(`${c.table}.${c.column}`));
    if (missing.length === 0) {
      logger.info("[schema-guard] No known schema drift detected");
      return;
    }

    const lines = missing.map((c) => `- ${c.table}.${c.column} (breaks: ${c.usedBy})`);
    const message = `[schema-guard] Missing ${missing.length} expected column(s) — a migration was written but never applied to this database. Affected background jobs will fail on every tick until this is fixed:\n${lines.join("\n")}`;

    logger.error({ missing }, message);
    await sendSlackAlert(
      `:rotating_light: Schema drift detected on startup — ${missing.length} expected column(s) missing:\n${lines.join("\n")}\n\nApply the corresponding migration(s) in lib/db/migrations to the dev DB (or re-publish for production).`,
    );
  } catch (err) {
    // Never let the guard itself take down startup.
    logger.error({ err }, "[schema-guard] Failed to run schema drift check");
  }
}
