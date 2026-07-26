import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

/** Persists AI-generated long-form text and images from the Content Studio so
 *  vendors can reuse them later without spending additional AI quota. */
export const vendorContentLibraryTable = pgTable("vendor_content_library", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendorsTable.id, { onDelete: "cascade" }),
  /** 'article' | 'academic' | 'social_post' | 'image' */
  type: text("type").notNull(),
  topic: text("topic").notNull(),
  /** For text types: the generated text. For image: the public object storage URL. */
  content: text("content").notNull(),
  /** Populated for image-type rows so the UI can render a thumbnail. */
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVendorContentLibrarySchema = createInsertSchema(
  vendorContentLibraryTable,
).omit({ id: true, createdAt: true });

export type InsertVendorContentLibrary = z.infer<
  typeof insertVendorContentLibrarySchema
>;
export type VendorContentLibrary =
  typeof vendorContentLibraryTable.$inferSelect;
