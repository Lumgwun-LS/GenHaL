import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

export const utmLinksTable = pgTable("utm_links", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  destinationUrl: text("destination_url").notNull(),
  utmSource: text("utm_source").notNull(),
  utmMedium: text("utm_medium").notNull(),
  utmCampaign: text("utm_campaign").notNull(),
  utmContent: text("utm_content"),
  utmTerm: text("utm_term"),
  shortCode: text("short_code").notNull(),
  clicks: integer("clicks").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  shortCodeUnique: unique("utm_links_short_code_unique").on(t.shortCode),
}));

export type UtmLink = typeof utmLinksTable.$inferSelect;
