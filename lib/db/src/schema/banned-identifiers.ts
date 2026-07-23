/**
 * Identifiers (email, phone) that may never be used to create a new account.
 * Populated automatically when a vendor permanently deletes their account so
 * the same credentials cannot be recycled to avoid outstanding balances or
 * platform bans.
 */
import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bannedIdentifiersTable = pgTable("banned_identifiers", {
  id:       serial("id").primaryKey(),
  email:    text("email"),   // normalised to lower-case at insert time
  phone:    text("phone"),   // E.164 format
  reason:   text("reason").notNull().default("account_deleted"),
  bannedAt: timestamp("banned_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBannedIdentifierSchema = createInsertSchema(bannedIdentifiersTable).omit({ id: true, bannedAt: true });
export type InsertBannedIdentifier = z.infer<typeof insertBannedIdentifierSchema>;
export type BannedIdentifier = typeof bannedIdentifiersTable.$inferSelect;
