import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { storeAppsTable } from "./store-apps";
import { storeDeveloperAccountsTable } from "./store-developer-accounts";

/**
 * Offline payment requests for the app store publishing fee.
 * Flow: developer uploads proof → admin first-level approval → super admin final approval.
 */
export const storeOfflinePaymentsTable = pgTable("store_offline_payments", {
  id: serial("id").primaryKey(),
  appId: integer("app_id").notNull().references(() => storeAppsTable.id, { onDelete: "cascade" }),
  developerId: integer("developer_id").notNull().references(() => storeDeveloperAccountsTable.id, { onDelete: "cascade" }),

  // Proof of payment details
  proofUrl: text("proof_url").notNull(),         // uploaded screenshot / PDF URL
  proofNote: text("proof_note"),                 // developer's note (bank name, reference, etc.)
  amountPaid: text("amount_paid"),               // e.g. "25000 NGN"
  bankReference: text("bank_reference"),         // teller / transaction ref

  // Status: submitted | admin_approved | super_approved | rejected
  status: text("status").notNull().default("submitted"),

  // Admin first-level review
  adminApprovedByClerkId: text("admin_approved_by_clerk_id"),
  adminApprovedAt: timestamp("admin_approved_at"),
  adminNote: text("admin_note"),

  // Super admin final approval
  superApprovedByClerkId: text("super_approved_by_clerk_id"),
  superApprovedAt: timestamp("super_approved_at"),
  superNote: text("super_note"),

  // Rejection
  rejectedByClerkId: text("rejected_by_clerk_id"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
