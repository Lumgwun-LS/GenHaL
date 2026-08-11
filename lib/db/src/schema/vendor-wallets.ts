import { pgTable, text, serial, timestamp, integer, numeric, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";
import { ordersTable } from "./orders";
import { paymentsTable } from "./payments";

// ── Vendor wallet (one row per vendor) ───────────────────────────────────────

export const vendorWalletsTable = pgTable("vendor_wallets", {
  id:               serial("id").primaryKey(),
  vendorId:         integer("vendor_id").notNull().unique("vendor_wallets_vendor_id_key").references(() => vendorsTable.id, { onDelete: "cascade" }),
  ngnBalance:       numeric("ngn_balance", { precision: 14, scale: 2 }).notNull().default("0"),
  usdBalance:       numeric("usd_balance", { precision: 14, scale: 2 }).notNull().default("0"),
  pendingNgnPayout: numeric("pending_ngn_payout", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type VendorWallet = typeof vendorWalletsTable.$inferSelect;

// ── Wallet transactions ledger ────────────────────────────────────────────────

export const walletTransactionsTable = pgTable("wallet_transactions", {
  id:          serial("id").primaryKey(),
  vendorId:    integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  type:        text("type").notNull(), // credit | debit | payout
  amount:      numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency:    text("currency").notNull().default("NGN"), // NGN | USD
  orderId:     integer("order_id").references(() => ordersTable.id, { onDelete: "set null" }),
  payoutId:    integer("payout_id"),  // FK to vendor_payouts — added after that table is created
  // Unique per payment so duplicate webhook deliveries can't double-credit the wallet
  paymentId:   integer("payment_id").references(() => paymentsTable.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("wallet_transactions_payment_id_unique").on(t.paymentId),
]);

export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;

// ── Vendor payouts ────────────────────────────────────────────────────────────

export const vendorPayoutsTable = pgTable("vendor_payouts", {
  id:                serial("id").primaryKey(),
  vendorId:          integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  amountNgn:         numeric("amount_ngn", { precision: 14, scale: 2 }).notNull(),
  status:            text("status").notNull().default("pending"), // pending|processing|completed|failed
  provider:          text("provider").notNull(), // paystack|interswitch|squad
  providerReference: text("provider_reference"),
  bankAccountId:     integer("bank_account_id"), // FK to vendor_bank_accounts
  notes:             text("notes"),
  failureReason:     text("failure_reason"),
  // USD→NGN rate locked at payout-request time so settlement is deterministic
  // even if the admin changes the rate between request and approval.
  lockedUsdToNgnRate: numeric("locked_usd_to_ngn_rate", { precision: 12, scale: 4 }),
  requestedAt:       timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt:       timestamp("processed_at", { withTimezone: true }),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type VendorPayout = typeof vendorPayoutsTable.$inferSelect;

// ── Vendor bank accounts ──────────────────────────────────────────────────────

export const vendorBankAccountsTable = pgTable("vendor_bank_accounts", {
  id:            serial("id").primaryKey(),
  vendorId:      integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  provider:      text("provider").notNull(), // paystack|interswitch|squad
  bankCode:      text("bank_code").notNull(),
  bankName:      text("bank_name").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName:   text("account_name").notNull(),
  // Paystack transfer recipient code (reused across transfers to same account)
  paystackRecipientCode: text("paystack_recipient_code"),
  isDefault:     boolean("is_default").notNull().default(false),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendorBankAccount = typeof vendorBankAccountsTable.$inferSelect;
