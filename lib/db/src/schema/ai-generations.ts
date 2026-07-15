import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

export const aiGenerationsTable = pgTable("ai_generations", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  prompt: text("prompt").notNull(),
  result: text("result"),
  status: text("status").notNull().default("completed"),
  // Set once the media-cleanup job has deleted this generation's result from
  // object storage (image/video generations only) because it aged out
  // unattached to any post. `result` is left in place as an audit trail —
  // only the underlying object is removed. Null means "not swept yet" (either
  // still within the retention window, still referenced by a post, or not a
  // media generation to begin with).
  mediaDeletedAt: timestamp("media_deleted_at", { withTimezone: true }),
  // Bumped every time the media-cleanup job examines this row, whether or not
  // it deletes it. Sweep order is by this column (oldest/never-checked
  // first), so a large, permanently-in-use backlog can't starve the batch
  // limit forever and prevent truly orphaned rows elsewhere in the table
  // from ever being reached — every row gets a turn in round-robin fashion.
  mediaLastCheckedAt: timestamp("media_last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAiGenerationSchema = createInsertSchema(aiGenerationsTable).omit({ id: true, createdAt: true });
export type InsertAiGeneration = z.infer<typeof insertAiGenerationSchema>;
export type AiGeneration = typeof aiGenerationsTable.$inferSelect;
