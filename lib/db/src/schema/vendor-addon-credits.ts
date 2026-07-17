import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

/**
 * Proactively-purchased resource add-on bundles — tracked separately from the
 * automatic pay-as-you-go overage in `vendor_overage_charges`. When a vendor
 * hits their base plan quota they can purchase a bundle of extra units for a
 * specific resource. Those units are consumed (units_remaining decremented)
 * before automatic per-unit overage billing kicks in, so the vendor always
 * gets predictable cost before entering open-ended overage.
 *
 * lifecycle:  pending → active (on payment success) → exhausted (units_remaining = 0)
 *             pending → cancelled (on payment failure / manual cancel)
 */
export const vendorAddonCreditsTable = pgTable("vendor_addon_credits", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendorsTable.id, { onDelete: "cascade" }),
  resource: text("resource").notNull(),
  unitsGranted: numeric("units_granted", { precision: 14, scale: 2 }).notNull(),
  unitsRemaining: numeric("units_remaining", { precision: 14, scale: 2 }).notNull().default("0"),
  unitRateUsd: numeric("unit_rate_usd", { precision: 10, scale: 4 }).notNull(),
  totalPaidUsd: numeric("total_paid_usd", { precision: 10, scale: 4 }).notNull(),
  /** 'stripe' | 'paystack' */
  gateway: text("gateway").notNull(),
  /** Stripe checkout session id / PaymentIntent id, or Paystack transaction reference */
  gatewayPaymentId: text("gateway_payment_id"),
  /** pending | active | exhausted | cancelled */
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendorAddonCredit = typeof vendorAddonCreditsTable.$inferSelect;
export type NewVendorAddonCredit = typeof vendorAddonCreditsTable.$inferInsert;
