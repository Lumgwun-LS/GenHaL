import { pgTable, serial, text, integer, boolean, timestamp, bigint, real } from "drizzle-orm/pg-core";

// Plan definitions (static reference — kept as const, not DB table)
export const GENHAL_PLANS = {
  free: {
    id: "free",
    name: "Free",
    storageLimitBytes: 500 * 1024 * 1024,         // 500 MB
    maxMembers: 10,
    maxVaultDocuments: 20,
    priceUsd: 0,
    priceNgn: 0,
    features: ["500 MB vault storage", "Up to 10 members", "20 vault documents", "Basic profile"],
  },
  starter: {
    id: "starter",
    name: "Starter",
    storageLimitBytes: 10 * 1024 * 1024 * 1024,   // 10 GB
    maxMembers: 100,
    maxVaultDocuments: -1,                          // unlimited
    priceUsd: 9.99,
    priceNgn: 15000,
    features: ["10 GB vault storage", "Up to 100 members", "Unlimited vault documents", "Role-based access control", "Document passwords"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    storageLimitBytes: 100 * 1024 * 1024 * 1024,  // 100 GB
    maxMembers: -1,                                 // unlimited
    maxVaultDocuments: -1,
    priceUsd: 29.99,
    priceNgn: 45000,
    features: ["100 GB vault storage", "Unlimited members", "Unlimited vault documents", "Full RBAC", "Document analytics", "Priority support"],
  },
  royal: {
    id: "royal",
    name: "Royal",
    storageLimitBytes: 1024 * 1024 * 1024 * 1024, // 1 TB
    maxMembers: -1,
    maxVaultDocuments: -1,
    priceUsd: 99.99,
    priceNgn: 150000,
    features: ["1 TB vault storage", "Unlimited members & documents", "Custom emblem & branding", "API access", "Dedicated archivist support", "White-glove onboarding"],
    kingdomOnly: true,
  },
} as const;

export type GenHalPlan = keyof typeof GENHAL_PLANS;

// ── Subscriptions ─────────────────────────────────────────────────────────────
export const genhalSubscriptionsTable = pgTable("genhal_subscriptions", {
  id: serial("id").primaryKey(),
  unitType: text("unit_type").notNull(),          // "kingdom" | "family"
  unitId: integer("unit_id").notNull(),
  plan: text("plan").notNull().default("free"),   // free|starter|pro|royal
  status: text("status").notNull().default("active"), // active|cancelled|expired|past_due|trialing

  // Provider references
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCustomerId: text("stripe_customer_id"),
  paystackSubscriptionCode: text("paystack_subscription_code"),
  paystackCustomerCode: text("paystack_customer_code"),

  // Billing cycle
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  trialEndsAt: timestamp("trial_ends_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),

  // Limits (snapshotted from plan at subscription time)
  storageLimitBytes: bigint("storage_limit_bytes", { mode: "number" }).notNull().default(500 * 1024 * 1024),
  maxMembers: integer("max_members").notNull().default(10),
  maxVaultDocuments: integer("max_vault_documents").notNull().default(20),

  // Usage (updated on each upload/delete)
  storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }).notNull().default(0),
  vaultDocumentCount: integer("vault_document_count").notNull().default(0),
  memberCount: integer("member_count").notNull().default(0),

  // Pricing currency used at checkout
  currency: text("currency").notNull().default("usd"),
  priceAmount: real("price_amount"),

  createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
