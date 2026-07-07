import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

/**
 * A vendor-owned outbound call campaign.
 * Status flow: draft → scheduled → running → completed | paused
 */
export const voiceCampaignsTable = pgTable("voice_campaigns", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Script template — supports {{name}} placeholder for lead personalisation
  script: text("script").notNull(),
  status: text("status").notNull().default("draft"), // draft|scheduled|running|completed|paused
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type VoiceCampaign = typeof voiceCampaignsTable.$inferSelect;
