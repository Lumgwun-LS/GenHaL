import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Tracks sessions issued to Awajimaa users via the handshake endpoint.
 * The JWT token itself is stateless; this table provides an audit trail
 * and allows server-side revocation by checking isRevoked.
 */
export const externalUserSessionsTable = pgTable("external_user_sessions", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull(),            // FK → vendors.id (auto-created on handshake)
  awajimaaUserId: text("awajimaa_user_id").notNull(),  // Firebase UID or Awajimaa internal ID
  awajimaaUserType: text("awajimaa_user_type").notNull(), // state|hospital|emergency|business|individual
  source: text("source").notNull().default("awajimaa"),
  jti: text("jti").notNull().unique(),                 // JWT ID for revocation
  isRevoked: text("is_revoked").notNull().default("false"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertExternalUserSessionSchema = createInsertSchema(externalUserSessionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertExternalUserSession = z.infer<typeof insertExternalUserSessionSchema>;
export type ExternalUserSession = typeof externalUserSessionsTable.$inferSelect;
