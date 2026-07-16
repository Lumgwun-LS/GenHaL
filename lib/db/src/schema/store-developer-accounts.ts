import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const storeDeveloperAccountsTable = pgTable("store_developer_accounts", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  website: text("website"),
  company: text("company"),
  avatarUrl: text("avatar_url"),
  // Status lifecycle: pending_payment → active → suspended
  status: text("status").notNull().default("pending_payment"),
  registrationFeePaid: boolean("registration_fee_paid").notNull().default(false),
  // Payment tracking for the $15 signup fee
  paymentGateway: text("payment_gateway"),   // stripe | paystack | paypal
  paymentRef: text("payment_ref"),            // gateway-specific reference
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paystackReference: text("paystack_reference"),
  paypalOrderId: text("paypal_order_id"),
  suspensionReason: text("suspension_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
