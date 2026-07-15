import { pgTable, text, serial, timestamp, integer, numeric, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

/**
 * Metered usage ledger. One row per (vendor, resource, billing period) — see
 * lib/usage.ts for how the period boundary is derived and how quota checks /
 * increments work. `used` is numeric (not integer) because voice-minute usage
 * is a fractional value (durationSeconds / 60), while every other resource
 * (aiImages, aiVideos, aiCaptions, sms, email) happens to increment in whole
 * units.
 */
export const resourceUsageTable = pgTable("resource_usage", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  resource: text("resource").notNull(), // aiImages|aiVideos|aiCaptions|voiceMinutes|sms|email
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  used: numeric("used", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ([
  unique("resource_usage_vendor_resource_period_unique").on(table.vendorId, table.resource, table.periodStart),
]));

export const insertResourceUsageSchema = createInsertSchema(resourceUsageTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertResourceUsage = z.infer<typeof insertResourceUsageSchema>;
export type ResourceUsage = typeof resourceUsageTable.$inferSelect;
