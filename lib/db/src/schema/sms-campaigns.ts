import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

export const smsCampaignsTable = pgTable("sms_campaigns", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("draft"),
  recipientCount: integer("recipient_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  targetAudience: text("target_audience"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSmsCampaignSchema = createInsertSchema(smsCampaignsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSmsCampaign = z.infer<typeof insertSmsCampaignSchema>;
export type SmsCampaign = typeof smsCampaignsTable.$inferSelect;
