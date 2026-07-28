import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

/** Channels a person can enter the CRM through */
export const PERSON_CHANNELS = [
  "website",
  "instagram",
  "facebook",
  "google_ads",
  "tiktok",
  "twitter",
  "whatsapp",
  "utm_link",
  "form",
  "order",
  "manual",
  "other",
] as const;

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),

  // Core contact info
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  industry: text("industry"),
  location: text("location"),
  notes: text("notes"),

  // CRM pipeline
  status: text("status").notNull().default("new"), // new | contacted | qualified | converted | lost
  score: integer("score"),

  // Channel / attribution
  channel: text("channel"), // from PERSON_CHANNELS
  source: text("source"),   // kept for backwards compat (same as channel for new records)

  // UTM attribution
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),

  // Visit context
  referrerUrl: text("referrer_url"),
  landingPage: text("landing_page"),
  visitorToken: text("visitor_token"), // anonymous token from tracking script

  // Engagement counters
  pageViews: integer("page_views").notNull().default(0),

  // Timing
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
