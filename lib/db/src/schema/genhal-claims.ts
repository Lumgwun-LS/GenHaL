import { pgTable, serial, text, integer, timestamp, bigint } from "drizzle-orm/pg-core";

/**
 * Ownership dispute / transfer claims for kingdoms, families, and compounds.
 * A verified user files a claim to be recognised as the rightful holder of a
 * leadership position, supporting it with legal documents, images, and videos.
 */
export const genhalOwnershipClaimsTable = pgTable("genhal_ownership_claims", {
  id:                       serial("id").primaryKey(),
  unitType:                 text("unit_type").notNull(),           // 'kingdom' | 'family' | 'compound'
  unitId:                   integer("unit_id").notNull(),
  position:                 text("position").notNull(),            // e.g. 'king' | 'chief' | 'head'
  claimantClerkUserId:      text("claimant_clerk_user_id").notNull(),
  claimantName:             text("claimant_name").notNull(),
  claimantEmail:            text("claimant_email").notNull(),
  claimantPhone:            text("claimant_phone"),
  claimReason:              text("claim_reason").notNull(),        // detailed written justification
  status:                   text("status").notNull().default("pending"),
  // pending | under_review | approved | rejected
  adminNotes:               text("admin_notes"),
  reviewedByClerkUserId:    text("reviewed_by_clerk_user_id"),
  reviewedAt:               timestamp("reviewed_at"),
  createdAt:                timestamp("created_at").notNull().defaultNow(),
  updatedAt:                timestamp("updated_at").notNull().defaultNow(),
});

/** Evidence files (documents, images, videos) attached to a claim. */
export const genhalClaimEvidenceTable = pgTable("genhal_claim_evidence", {
  id:             serial("id").primaryKey(),
  claimId:        integer("claim_id").notNull().references(() => genhalOwnershipClaimsTable.id, { onDelete: "cascade" }),
  evidenceType:   text("evidence_type").notNull().default("document"),  // document | image | video
  r2Key:          text("r2_key"),
  fileName:       text("file_name").notNull(),
  mimeType:       text("mime_type"),
  fileSizeBytes:  bigint("file_size_bytes", { mode: "number" }),
  uploadStatus:   text("upload_status").notNull().default("pending"),   // pending | complete | failed
  description:    text("description"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});
