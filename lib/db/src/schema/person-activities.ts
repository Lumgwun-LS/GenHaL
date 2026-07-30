import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";
import { leadsTable } from "./leads";

export type PersonActivityType =
  | "page_view"
  | "form_submit"
  | "social_click"
  | "utm_click"
  | "order_placed"
  | "manual_note"
  | "ad_click"
  | "status_change"
  | "blog_comment";

export const personActivitiesTable = pgTable("person_activities", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  personId: integer("person_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // PersonActivityType
  data: jsonb("data").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PersonActivity = typeof personActivitiesTable.$inferSelect;
