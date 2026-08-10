import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const genhalLanguageEntriesTable = pgTable("genhal_language_entries", {
  id: serial("id").primaryKey(),
  languageCode: text("language_code").notNull(),
  word: text("word").notNull(),
  translation: text("translation").notNull(),
  pronunciation: text("pronunciation"),
  partOfSpeech: text("part_of_speech"),
  example: text("example"),
  exampleTranslation: text("example_translation"),
  audioUrl: text("audio_url"),
  dialect: text("dialect"),
  clerkUserId: text("clerk_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
