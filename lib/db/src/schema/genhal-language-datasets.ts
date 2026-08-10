import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const genhalLanguageDatasetsTable = pgTable("genhal_language_datasets", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  languageCode: text("language_code").notNull(),
  communityId: integer("community_id"),
  type: text("type").notNull(), // 'bible' | 'audio' | 'video' | 'text' | 'image'
  title: text("title").notNull(),
  description: text("description"),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileMimeType: text("file_mime_type"),
  fileSizeBytes: integer("file_size_bytes"),
  durationSeconds: integer("duration_seconds"),   // audio / video
  pageCount: integer("page_count"),               // pdf / epub
  wordCount: integer("word_count"),               // text files
  status: text("status").notNull().default("pending"), // pending | ready | approved | rejected
  approvedForTraining: boolean("approved_for_training").notNull().default(false),
  processingNotes: text("processing_notes"),
  metadata: jsonb("metadata"),
  // Language Organisation approval workflow
  /** not_required | pending | approved | rejected */
  orgApprovalStatus:          text("org_approval_status").notNull().default("not_required"),
  orgReviewedByClerkUserId:   text("org_reviewed_by_clerk_user_id"),
  orgReviewedAt:              timestamp("org_reviewed_at"),
  orgRejectionReason:         text("org_rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
