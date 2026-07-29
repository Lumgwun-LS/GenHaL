import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { storeDeveloperAccountsTable } from "./store-developer-accounts";

/**
 * Admin-granted upload trial: lets an admin give a specific developer a window
 * to submit apps without paying the publishing fee upfront. The developer must
 * complete payment before the trial expires or their apps are suspended.
 */
export const storeUploadTrialsTable = pgTable("store_upload_trials", {
  id:               serial("id").primaryKey(),
  developerId:      integer("developer_id").notNull()
                      .references(() => storeDeveloperAccountsTable.id, { onDelete: "cascade" }),
  expiresAt:        timestamp("expires_at", { withTimezone: true }).notNull(),
  grantedByAdminId: text("granted_by_admin_id"),   // Clerk userId of the granting admin
  revokedAt:        timestamp("revoked_at", { withTimezone: true }),
  note:             text("note"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
});
