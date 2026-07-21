import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { socialAccountsTable } from "./social-accounts";

/**
 * One row per active → needs_reconnect transition, written by the social
 * account health checker (social-account-health.ts). Lets admins tell apart
 * a first-time failure from an account that keeps flapping.
 *
 * ## History preservation across reconnects
 *
 * The OAuth reconnect flow (social-oauth.ts) intentionally reuses an existing
 * social_accounts row when the same vendor reconnects the same platform account
 * (matched by vendor_id + platform + account_id). Because the row's primary key
 * is unchanged, these log entries are preserved — the "N× in 30d" repeat-offender
 * badge in the admin Social Health tab correctly accumulates across multiple
 * token expiry/revocation cycles for the same account.
 *
 * ## Accepted trade-off on explicit deletion
 *
 * The ON DELETE CASCADE here is intentional: if a vendor explicitly removes a
 * social account via DELETE /api/social-accounts/:id (a deliberate disconnect,
 * not a forced reconnect), both the social_accounts row and all its reconnect
 * log entries are deleted. If the vendor later re-adds the same account via
 * OAuth, a brand-new social_accounts row is inserted and the break history
 * resets to zero.
 *
 * This is an accepted trade-off:
 *   - An explicit delete signals the vendor intends to sever the connection
 *     entirely, so silently carrying forward hidden failure history on the
 *     new row would be surprising and potentially misleading.
 *   - The admin Slack alert fired at each active → needs_reconnect transition
 *     provides a durable audit trail outside the database, independent of
 *     whether the vendor later deletes and re-adds the account.
 *   - If cross-reconnect history ever becomes important (e.g. billing or abuse
 *     detection), the log can be decoupled from the social_accounts FK by
 *     adding a (vendor_id, platform, account_id) composite key and matching
 *     on those columns instead of the FK on insert.
 */
export const socialAccountReconnectLogTable = pgTable("social_account_reconnect_log", {
  id: serial("id").primaryKey(),
  socialAccountId: integer("social_account_id")
    .notNull()
    .references(() => socialAccountsTable.id, { onDelete: "cascade" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
