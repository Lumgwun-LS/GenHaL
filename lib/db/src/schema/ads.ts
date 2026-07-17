import { pgTable, text, serial, timestamp, integer, numeric, jsonb, date, index } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

// ── Ad Contacts ───────────────────────────────────────────────────────────────

export const adContactsTable = pgTable("ad_contacts", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  /** Free-form tags e.g. ["vip","lagos","q4-promo"] */
  tags: text("tags").array().notNull().default([]),
  /** "csv" | "form" | "manual" */
  source: text("source").notNull().default("manual"),
  /** Optional: which platform this contact came from */
  platform: text("platform"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("idx_ad_contacts_vendor").on(t.vendorId)]);

export type AdContact = typeof adContactsTable.$inferSelect;

// ── Ad Campaigns ──────────────────────────────────────────────────────────────

export const adCampaignsTable = pgTable("ad_campaigns", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** "facebook" | "instagram" | "tiktok" | "linkedin" */
  platform: text("platform").notNull(),
  /** "awareness" | "traffic" | "engagement" | "leads" | "conversions" | "sales" */
  objective: text("objective").notNull().default("awareness"),
  /** "draft" | "scheduled" | "active" | "paused" | "ended" | "error" */
  status: text("status").notNull().default("draft"),
  budgetAmount: numeric("budget_amount", { precision: 14, scale: 2 }),
  budgetCurrency: text("budget_currency").notNull().default("USD"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  /** JSON audience targeting object (age range, gender, interests, locations) */
  audienceJson: jsonb("audience_json"),
  /** Platform-assigned IDs once published */
  platformCampaignId: text("platform_campaign_id"),
  platformAdsetId: text("platform_adset_id"),
  platformAdId: text("platform_ad_id"),
  /** Human-readable error from the last publish attempt */
  lastPublishError: text("last_publish_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_ad_campaigns_vendor").on(t.vendorId),
  index("idx_ad_campaigns_status").on(t.vendorId, t.status),
]);

export type AdCampaign = typeof adCampaignsTable.$inferSelect;

// ── Ad Creatives ──────────────────────────────────────────────────────────────

export const adCreativesTable = pgTable("ad_creatives", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => adCampaignsTable.id, { onDelete: "cascade" }),
  headline: text("headline"),
  body: text("body"),
  cta: text("cta"),
  /** URL to the ad image (object-storage or external) */
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("idx_ad_creatives_campaign").on(t.campaignId)]);

export type AdCreative = typeof adCreativesTable.$inferSelect;

// ── Ad Campaign Analytics ─────────────────────────────────────────────────────

export const adCampaignAnalyticsTable = pgTable("ad_campaign_analytics", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => adCampaignsTable.id, { onDelete: "cascade" }),
  /** ISO date string e.g. "2026-07-17" — one row per day */
  date: date("date").notNull(),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  spend: numeric("spend", { precision: 14, scale: 4 }).notNull().default("0"),
  reach: integer("reach").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_ad_analytics_campaign_date").on(t.campaignId, t.date),
]);

export type AdCampaignAnalytics = typeof adCampaignAnalyticsTable.$inferSelect;

// ── Ad Email Campaigns ────────────────────────────────────────────────────────

export const adEmailCampaignsTable = pgTable("ad_email_campaigns", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  fromName: text("from_name").notNull(),
  /** "draft" | "sending" | "sent" | "failed" */
  status: text("status").notNull().default("draft"),
  /** JSON filter: { tags?: string[]; platform?: string } — null means all contacts */
  contactFilterJson: jsonb("contact_filter_json"),
  sentCount: integer("sent_count").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("idx_ad_email_campaigns_vendor").on(t.vendorId)]);

export type AdEmailCampaign = typeof adEmailCampaignsTable.$inferSelect;
