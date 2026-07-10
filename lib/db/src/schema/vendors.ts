import { pgTable, text, serial, timestamp, integer, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vendorsTable = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  status: text("status").notNull().default("active"),
  email: text("email").notNull(),
  phone: text("phone"),
  website: text("website"),
  address: text("address"),
  logoUrl: text("logo_url"),
  description: text("description"),
  // Public storefront theme — a preset id from the brand-themes template list
  brandTheme: text("brand_theme").notNull().default("violet"),
  clerkUserId: text("clerk_user_id"),
  // Awajimaa bridge fields — populated when vendor is created via external handshake
  awajimaaUserId: text("awajimaa_user_id").unique(),
  awajimaaUserType: text("awajimaa_user_type"),  // state|hospital|emergency|business|individual
  externalSource: text("external_source").notNull().default("vendorhub"),
  // Payment gateway settings — admin-configurable per vendor
  stripeEnabled: boolean("stripe_enabled").notNull().default(false),
  paystackEnabled: boolean("paystack_enabled").notNull().default(false),
  defaultCurrency: text("default_currency").notNull().default("USD"),
  // Subscription & verification — controls which premium features are unlocked
  subscriptionTier: text("subscription_tier").notNull().default("free"),    // free|starter|pro|enterprise
  verificationLevel: text("verification_level").notNull().default("unverified"), // unverified|basic|verified|premium
  // Stripe customer — created on first subscription checkout, reused for portal sessions & cancellations
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  // Birthday — used for automated birthday greetings
  dateOfBirth: date("date_of_birth"),
  // Voice — opt-out of birthday & campaign calls (default opted in)
  voiceCallOptOut: boolean("voice_call_opt_out").notNull().default(false),
  // Demographics — self-reported by the vendor, used for admin analytics
  gender: text("gender"), // male|female|other|prefer_not_to_say
  country: text("country"),
  state: text("state"),
  city: text("city"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVendorSchema = createInsertSchema(vendorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendorsTable.$inferSelect;
