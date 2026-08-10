import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { genhalFamilyAccountsTable } from "./genhal-members";

/**
 * Succession claims — filed by a named next-of-kin after the family account
 * holder's death, allowing them to take over the account with verified ID.
 */
export const genhalSuccessionClaimsTable = pgTable("genhal_succession_claims", {
  id:                       serial("id").primaryKey(),
  familyId:                 integer("family_id").notNull().references(() => genhalFamilyAccountsTable.id, { onDelete: "cascade" }),
  claimerClerkUserId:       text("claimer_clerk_user_id").notNull(),
  claimerName:              text("claimer_name").notNull(),
  claimerEmail:             text("claimer_email").notNull(),
  claimerPhone:             text("claimer_phone"),
  relationshipToOwner:      text("relationship_to_owner").notNull(),   // 'son' | 'daughter' | 'spouse' | etc.
  statement:                text("statement"),                         // written statement of circumstance
  idR2Key:                  text("id_r2_key"),                        // R2 key for uploaded government ID
  idFilename:               text("id_filename"),
  idUploadStatus:           text("id_upload_status").notNull().default("pending"),
  status:                   text("status").notNull().default("pending"),
  // pending | under_review | approved | rejected
  adminNotes:               text("admin_notes"),
  reviewedByClerkUserId:    text("reviewed_by_clerk_user_id"),
  reviewedAt:               timestamp("reviewed_at"),
  createdAt:                timestamp("created_at").notNull().defaultNow(),
  updatedAt:                timestamp("updated_at").notNull().defaultNow(),
});
