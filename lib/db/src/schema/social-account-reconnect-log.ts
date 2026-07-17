import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { socialAccountsTable } from "./social-accounts";

/**
 * One row per active → needs_reconnect transition, written by the social
 * account health checker (social-account-health.ts). Lets admins tell apart
 * a first-time failure from an account that keeps flapping.
 */
export const socialAccountReconnectLogTable = pgTable("social_account_reconnect_log", {
  id: serial("id").primaryKey(),
  socialAccountId: integer("social_account_id")
    .notNull()
    .references(() => socialAccountsTable.id, { onDelete: "cascade" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
