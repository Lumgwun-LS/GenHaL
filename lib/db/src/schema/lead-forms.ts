import { pgTable, text, serial, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

export type LeadFormField = {
  name: string;
  label: string;
  type: "text" | "email" | "phone" | "textarea" | "select";
  required: boolean;
  options?: string[]; // for select fields
  placeholder?: string;
};

export const leadFormsTable = pgTable("lead_forms", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  fields: jsonb("fields").notNull().$type<LeadFormField[]>().default([]),
  redirectUrl: text("redirect_url"),
  buttonText: text("button_text").notNull().default("Submit"),
  thankYouMessage: text("thank_you_message"),
  status: text("status").notNull().default("active"), // active | paused
  submissionsCount: integer("submissions_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LeadForm = typeof leadFormsTable.$inferSelect;
