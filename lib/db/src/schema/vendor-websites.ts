import { pgTable, text, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

export type SiteSectionType =
  | "hero"
  | "about"
  | "products"
  | "gallery"
  | "testimonials"
  | "contact"
  | "social"
  | "whatsapp_cta"
  | "shop"; // Live shop — pulls products from catalog, full cart+checkout

export type SiteSection = {
  id: string;
  type: SiteSectionType;
  enabled: boolean;
  content: Record<string, unknown>;
};

export const vendorWebsitesTable = pgTable("vendor_websites", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().unique("vendor_websites_vendor_id_key").references(() => vendorsTable.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique("vendor_websites_slug_key"),
  templateId: text("template_id").notNull().default("modern-shop"),
  themeColor: text("theme_color").notNull().default("#7F50FF"),
  published: boolean("published").notNull().default(false),
  sectionsJson: jsonb("sections_json").$type<SiteSection[]>().notNull().default([]),
  pageTitle: text("page_title"),
  metaDescription: text("meta_description"),
  logoUrl: text("logo_url"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
