import { pgTable, text } from "drizzle-orm/pg-core";

export const genhalLanguagesTable = pgTable("genhal_languages", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  nativeName: text("native_name").notNull(),
  country: text("country").notNull(),
  region: text("region"),
  speakerCount: text("speaker_count"),
  flagEmoji: text("flag_emoji"),
});
