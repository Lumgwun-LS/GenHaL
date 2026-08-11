/**
 * Platform-wide contact registry — cross-vendor, email-keyed.
 *
 * Every person who interacts with any vendor's storefront (support form,
 * order, CRM lead capture, newsletter sign-up) gets one row here keyed by
 * email address. This lets the platform send newsletters to the full
 * audience and track opens across all email types without requiring a
 * Clerk account.
 *
 * When a registered customer (`customers` table) is later matched by email,
 * `customerId` is linked so their Clerk identity ties in.
 */
import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";

export const platformContactsTable = pgTable("platform_contacts", {
  id: serial("id").primaryKey(),
  /** Normalised (lowercase, trimmed) email — globally unique across the platform */
  email: text("email").notNull().unique("platform_contacts_email_key"),
  name: text("name"),
  phone: text("phone"),
  /** Linked once the person creates a full Clerk customer account */
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  /** Opt-out of platform-level newsletters (default opted in) */
  newsletterOptIn: boolean("newsletter_opt_in").notNull().default(true),
  /** Rolling platform newsletter metrics — updated by email-tracking pixel handler */
  platformEmailSentCount: integer("platform_email_sent_count").notNull().default(0),
  platformEmailOpenCount: integer("platform_email_open_count").notNull().default(0),
  platformEmailLastSentAt: timestamp("platform_email_last_sent_at", { withTimezone: true }),
  platformEmailLastOpenedAt: timestamp("platform_email_last_opened_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformContact = typeof platformContactsTable.$inferSelect;
