import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

export const emailCampaignsTable = pgTable("email_campaigns", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("draft"),
  recipientCount: integer("recipient_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  openCount: integer("open_count").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
  targetAudience: text("target_audience"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEmailCampaignSchema = createInsertSchema(emailCampaignsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;
export type EmailCampaign = typeof emailCampaignsTable.$inferSelect;
