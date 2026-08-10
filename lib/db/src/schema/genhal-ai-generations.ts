import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const genhalAiGenerationsTable = pgTable("genhal_ai_generations", {
  id: serial("id").primaryKey(),
  // story | translation | caption
  type: text("type").notNull(),
  prompt: text("prompt"),
  result: text("result").notNull(),
  metadata: jsonb("metadata"),
  clerkUserId: text("clerk_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
