import { pgTable, text, serial, timestamp, boolean, jsonb, integer } from "drizzle-orm/pg-core";

export const storeDeveloperAccountsTable = pgTable("store_developer_accounts", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique("store_developer_accounts_clerk_user_id_key"),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  bio: text("bio"),
  website: text("website"),
  company: text("company"),
  country: text("country").notNull().default("Nigeria"),
  avatarUrl: text("avatar_url"),
  // Status lifecycle: active | suspended
  status: text("status").notNull().default("active"),
  // When true: publishing fee is waived (e.g. super admin test accounts)
  feeExempt: boolean("fee_exempt").notNull().default(false),
  // Paystack integration for dedicated virtual accounts
  paystackCustomerCode: text("paystack_customer_code"),
  // Dedicated bank accounts (JSON: { accountNumber, bankName, bankSlug })
  dedicatedNgnAccount: jsonb("dedicated_ngn_account").$type<{
    accountNumber: string;
    bankName: string;
    bankSlug: string;
  } | null>(),
  dedicatedUsdAccount: jsonb("dedicated_usd_account").$type<{
    accountNumber: string;
    bankName: string;
    routingNumber?: string;
  } | null>(),
  suspensionReason: text("suspension_reason"),
  // ── Account-level fee (one-time, not per-app) ────────────────────────────────
  // New accounts start unpaid (false). Existing rows keep their prior value.
  registrationFeePaid: boolean("registration_fee_paid").notNull().default(false),
  registrationFeeAmountKobo: integer("registration_fee_amount_kobo"),
  paymentGateway: text("payment_gateway"),
  paymentRef: text("payment_ref"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paystackReference: text("paystack_reference"),
  paypalOrderId: text("paypal_order_id"),
  // ── Two-seat member support ───────────────────────────────────────────────────
  // Owner = clerkUserId (seat 1). Member = memberClerkUserId (seat 2, optional).
  // Both can access all developer routes for this account.
  memberClerkUserId: text("member_clerk_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
