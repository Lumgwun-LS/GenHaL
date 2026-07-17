import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

/**
 * Tracks every vendor-uploaded photo/video so the media-cleanup job can sweep
 * objects that were never attached to a saved post (abandoned uploads) or
 * belonged to posts that were later deleted — mirroring the `mediaDeletedAt`
 * / `mediaLastCheckedAt` pattern used for AI-generated media in
 * `aiGenerationsTable`. Without this record the presigned URL is the only
 * reference to the object, so orphaned uploads can never be found.
 */
export const vendorUploadsTable = pgTable("vendor_uploads", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  /** The public `/api/media/:objectId` URL returned to the client. */
  mediaUrl: text("media_url").notNull(),
  /** "image" | "video" — mirrors the shape of aiGenerationsTable.type */
  mediaType: text("media_type").notNull(),
  // Set once the media-cleanup job has deleted this upload's object from
  // object storage because it aged out unattached to any post. `mediaUrl` is
  // left in place as an audit trail. Null means "not swept yet".
  mediaDeletedAt: timestamp("media_deleted_at", { withTimezone: true }),
  // Bumped every time the media-cleanup job examines this row, whether or not
  // it deletes it. Sweep order is by this column (oldest/never-checked first),
  // matching the round-robin behaviour of the AI-generation cleanup path.
  mediaLastCheckedAt: timestamp("media_last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVendorUploadSchema = createInsertSchema(vendorUploadsTable).omit({ id: true, createdAt: true });
export type InsertVendorUpload = z.infer<typeof insertVendorUploadSchema>;
export type VendorUpload = typeof vendorUploadsTable.$inferSelect;
