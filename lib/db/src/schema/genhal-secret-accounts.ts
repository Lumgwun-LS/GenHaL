import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Dedicated secret bank accounts for GenHaL kingdoms and family accounts.
 * NGN accounts are provisioned via Paystack dedicated virtual accounts.
 * USD accounts are provisioned via Squad USD virtual accounts.
 */
export const genhalSecretAccountsTable = pgTable("genhal_secret_accounts", {
  id:                    serial("id").primaryKey(),
  unitType:              text("unit_type").notNull(),            // 'kingdom' | 'family'
  unitId:                integer("unit_id").notNull(),
  currency:              text("currency").notNull(),             // 'NGN' | 'USD'
  provider:              text("provider").notNull(),             // 'paystack' | 'squad'
  accountNumber:         text("account_number").notNull(),
  accountName:           text("account_name").notNull(),
  bankName:              text("bank_name"),
  bankCode:              text("bank_code"),
  routingNumber:         text("routing_number"),                 // USD ABA routing number
  customerIdentifier:    text("customer_identifier"),            // Squad customer_identifier or Paystack customer_code
  isActive:              boolean("is_active").notNull().default(true),
  rawResponse:           jsonb("raw_response"),
  createdByClerkUserId:  text("created_by_clerk_user_id").notNull(),
  createdAt:             timestamp("created_at").notNull().defaultNow(),
  updatedAt:             timestamp("updated_at").notNull().defaultNow(),
});
