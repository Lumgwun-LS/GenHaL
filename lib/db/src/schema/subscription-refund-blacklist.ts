import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Tracks vendors who received a subscription refund within the 10-day window.
 * Once blacklisted, the vendor may only subscribe to a tier strictly above
 * `min_allowed_tier_rank` — they cannot re-subscribe to the refunded tier or lower.
 */
export const subscriptionRefundBlacklistTable = pgTable("subscription_refund_blacklist", {
  id: serial("id").primaryKey(),
  /** FK to vendors.id — row is removed if the vendor is deleted. */
  vendorId: integer("vendor_id").notNull(),
  /** The tier that was refunded (e.g. "starter"). */
  refundedTier: text("refunded_tier").notNull(),
  /** The lowest tier the vendor is now allowed to subscribe to (e.g. "pro"). */
  minAllowedTier: text("min_allowed_tier").notNull(),
  /**
   * Numeric rank of minAllowedTier (free=0, starter=1, pro=2, enterprise=3).
   * Checkout routes compare targetRank >= minAllowedTierRank.
   */
  minAllowedTierRank: integer("min_allowed_tier_rank").notNull(),
  /** Gateway that processed the refund (stripe | paystack | paypal). */
  gateway: text("gateway").notNull(),
  /** Refund ID returned by the gateway (optional — not all providers expose it). */
  refundReference: text("refund_reference"),
  refundedAt: timestamp("refunded_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
