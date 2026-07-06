import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * API keys issued to external systems (e.g. Awajimaa Spring Boot backend).
 * Each key identifies the calling application and grants access to
 * the /api/external/* handshake endpoint.
 */
export const externalApiKeysTable = pgTable("external_api_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),                        // e.g. "Awajimaa Android Production"
  keyHash: text("key_hash").notNull().unique(),        // SHA-256 hash of the raw key
  source: text("source").notNull().default("awajimaa"), // integration source label
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const insertExternalApiKeySchema = createInsertSchema(externalApiKeysTable).omit({
  id: true,
  createdAt: true,
});
export type InsertExternalApiKey = z.infer<typeof insertExternalApiKeySchema>;
export type ExternalApiKey = typeof externalApiKeysTable.$inferSelect;
