import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

/**
 * Webhook URLs registered by vendors so third-party integrations can receive
 * real-time events (order paid, lead created, post published, etc.).
 *
 * Events are HMAC-SHA256 signed with the vendor's secret for verification.
 * Use "*" in the events array to subscribe to all events.
 */
export const vendorWebhookEndpointsTable = pgTable("vendor_webhook_endpoints", {
  id:         serial("id").primaryKey(),
  vendorId:   integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  url:        text("url").notNull(),
  secretHash: text("secret_hash"),    // SHA-256 of the raw signing secret shown once at creation
  rawSecretPreview: text("raw_secret_preview"), // first 8 chars for identification only
  events:     text("events").array().notNull().default(["*"]),
  isActive:   boolean("is_active").notNull().default(true),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendorWebhookEndpoint = typeof vendorWebhookEndpointsTable.$inferSelect;
