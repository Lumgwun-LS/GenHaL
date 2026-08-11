/**
 * One-time idempotent constraint migration.
 *
 * Replit's publish provision step runs drizzle-kit push against production and
 * prompts when it detects unique constraint name drift: production has auto-named
 * `_key` constraints (created by inline UNIQUE in the original migrations), while
 * the current Drizzle schema generates `_unique` names.
 *
 * This migration adds all the missing `_unique` named constraints to production so
 * that future drizzle-kit push runs see zero drift and prompt the user for nothing.
 * Each ALTER is skipped if the named constraint already exists — fully idempotent.
 */

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

interface ConstraintDef {
  constraint: string;   // new constraint name to add
  table: string;        // table name
  columns: string[];    // column(s) to cover
}

// Single-column constraints: production has `_key`, provision wants `_unique`
const SINGLE_COLUMN_CONSTRAINTS: ConstraintDef[] = [
  { constraint: "orders_receipt_token_unique",                          table: "orders",                         columns: ["receipt_token"] },
  { constraint: "vendor_payment_credentials_vendor_id_unique",          table: "vendor_payment_credentials",     columns: ["vendor_id"] },
  { constraint: "platform_payment_credentials_provider_unique",         table: "platform_payment_credentials",   columns: ["provider"] },
  { constraint: "job_run_status_job_name_unique",                       table: "job_run_status",                 columns: ["job_name"] },
  { constraint: "store_developer_accounts_clerk_user_id_unique",        table: "store_developer_accounts",       columns: ["clerk_user_id"] },
  { constraint: "store_apps_slug_unique",                               table: "store_apps",                     columns: ["slug"] },
  { constraint: "store_apps_public_id_unique",                          table: "store_apps",                     columns: ["public_id"] },
  { constraint: "store_user_signups_clerk_user_id_unique",              table: "store_user_signups",             columns: ["clerk_user_id"] },
  { constraint: "vendor_push_tokens_expo_push_token_unique",            table: "vendor_push_tokens",             columns: ["expo_push_token"] },
  { constraint: "external_api_keys_key_hash_unique",                    table: "external_api_keys",              columns: ["key_hash"] },
  { constraint: "vendor_websites_slug_unique",                          table: "vendor_websites",                columns: ["slug"] },
  { constraint: "vendor_websites_vendor_id_unique",                     table: "vendor_websites",                columns: ["vendor_id"] },
  { constraint: "vendor_stock_alert_settings_vendor_id_unique",         table: "vendor_stock_alert_settings",    columns: ["vendor_id"] },
  { constraint: "invoices_share_token_unique",                          table: "invoices",                       columns: ["share_token"] },
  { constraint: "vendor_api_keys_key_hash_unique",                      table: "vendor_api_keys",                columns: ["key_hash"] },
  { constraint: "oauth_clients_client_id_unique",                       table: "oauth_clients",                  columns: ["client_id"] },
  { constraint: "oauth_tokens_token_hash_unique",                       table: "oauth_tokens",                   columns: ["token_hash"] },
  { constraint: "vendor_wallets_vendor_id_unique",                      table: "vendor_wallets",                 columns: ["vendor_id"] },
  { constraint: "customers_clerk_user_id_unique",                       table: "customers",                      columns: ["clerk_user_id"] },
  { constraint: "platform_partners_slug_unique",                        table: "platform_partners",              columns: ["slug"] },
  { constraint: "platform_users_clerk_user_id_unique",                  table: "platform_users",                 columns: ["clerk_user_id"] },
  { constraint: "blog_posts_slug_unique",                               table: "blog_posts",                     columns: ["slug"] },
  { constraint: "support_tickets_ticket_token_unique",                  table: "support_tickets",                columns: ["ticket_token"] },
  { constraint: "email_tracking_events_token_unique",                   table: "email_tracking_events",          columns: ["token"] },
  { constraint: "platform_contacts_email_unique",                       table: "platform_contacts",              columns: ["email"] },
  { constraint: "genhal_life_checks_token_unique",                      table: "genhal_life_checks",             columns: ["token"] },
  { constraint: "genhal_language_orgs_slug_unique",                     table: "genhal_language_orgs",           columns: ["slug"] },
];

// Multi-column constraints: production has auto-named `_key`, schema had custom names
const MULTI_COLUMN_CONSTRAINTS: ConstraintDef[] = [
  { constraint: "genhal_kingdom_member_unique",  table: "genhal_kingdom_members",        columns: ["kingdom_id", "clerk_user_id"] },
  { constraint: "genhal_family_member_unique",   table: "genhal_family_members",         columns: ["family_id", "clerk_user_id"] },
  { constraint: "genhal_org_member_unique",      table: "genhal_language_org_members",   columns: ["org_id", "clerk_user_id"] },
  { constraint: "genhal_org_lang_unique",        table: "genhal_language_org_languages", columns: ["org_id", "language_code"] },
];

const ALL_CONSTRAINTS = [...SINGLE_COLUMN_CONSTRAINTS, ...MULTI_COLUMN_CONSTRAINTS];

export async function runStartupConstraintMigration(): Promise<void> {
  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const def of ALL_CONSTRAINTS) {
    try {
      // Check if the constraint already exists
      const existing = await db.execute(sql.raw(`
        SELECT 1 FROM pg_constraint
        WHERE conname = '${def.constraint}'
          AND conrelid = '${def.table}'::regclass
        LIMIT 1
      `));

      if ((existing as unknown as { rows: unknown[] }).rows?.length > 0) {
        skipped++;
        continue;
      }

      // Add the constraint
      const cols = def.columns.join(", ");
      await db.execute(sql.raw(`
        ALTER TABLE "${def.table}"
        ADD CONSTRAINT "${def.constraint}" UNIQUE (${cols})
      `));
      added++;
    } catch (err) {
      // Log but don't crash startup — constraint may conflict in edge cases
      logger.warn({ err, constraint: def.constraint }, "startup-constraint-migration: skipping constraint (non-fatal)");
      failed++;
    }
  }

  if (added > 0 || failed > 0) {
    logger.info(
      { added, skipped, failed, total: ALL_CONSTRAINTS.length },
      "startup-constraint-migration: complete",
    );
  }
}
