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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAiGenerationSchema = createInsertSchema(aiGenerationsTable).omit({ id: true, createdAt: true });
export type InsertAiGeneration = z.infer<typeof insertAiGenerationSchema>;
export type AiGeneration = typeof aiGenerationsTable.$inferSelect;
