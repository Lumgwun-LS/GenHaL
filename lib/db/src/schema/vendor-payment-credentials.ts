import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

/**
 * Stores per-vendor Stripe / Paystack secret keys, encrypted at rest with
 * AES-256-GCM. One row per vendor (unique on vendorId). A row is created on
 * first PUT /vendors/:id/payment-credentials; keys are cleared (set to NULL)
 * on DELETE rather than deleting the row so test-pass state is preserved.
 */
export const vendorPaymentCredentialsTable = pgTable("vendor_payment_credentials", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id")
    .notNull()
    .unique()
    .references(() => vendorsTable.id, { onDelete: "cascade" }),
  stripeSecretEncrypted: text("stripe_secret_encrypted"),    // iv:authTag:ciphertext hex
  paystackSecretEncrypted: text("paystack_secret_encrypted"),
  stripeTestPassed: boolean("stripe_test_passed").notNull().default(false),
  paystackTestPassed: boolean("paystack_test_passed").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type VendorPaymentCredentials =
  typeof vendorPaymentCredentialsTable.$inferSelect;
