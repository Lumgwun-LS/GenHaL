import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * Stores platform-level (admin-managed) gateway credentials, encrypted at
 * rest with AES-256-GCM. One row per provider. Unlike
 * `vendorPaymentCredentialsTable` (per-vendor, tier-gated keys), these are
 * the platform's own keys that admins configure from the dashboard instead
 * of environment secrets — used as the fallback for every vendor unless a
 * vendor has their own tier-eligible key on file.
 *
 * `credentialsEncrypted` holds a JSON object of provider-specific fields
 * (e.g. { secretKey, webhookSecret } for Stripe, { clientId, clientSecret,
 * accountId } for Nomba) as a single encrypted blob — providers vary in
 * what credentials they need, so a fixed column-per-field layout doesn't fit.
 */
export const platformPaymentCredentialsTable = pgTable("platform_payment_credentials", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().unique(), // "stripe" | "paystack" | "remita" | "flutterwave" | "nomba"
  credentialsEncrypted: text("credentials_encrypted").notNull(), // iv:authTag:ciphertext hex of a JSON blob
  testPassed: boolean("test_passed").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type PlatformPaymentCredentials = typeof platformPaymentCredentialsTable.$inferSelect;
