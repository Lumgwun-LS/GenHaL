import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { genhalCommunitiesTable } from "./genhal-communities";

export const genhalHeritagePostsTable = pgTable("genhal_heritage_posts", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id")
    .notNull()
    .references(() => genhalCommunitiesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body"),
  // story | photo | video | audio | tradition | oral_history
  type: text("type").notNull().default("story"),
  mediaUrl: text("media_url"),
  audioUrl: text("audio_url"),
  tags: text("tags").array(),
  clerkUserId: text("clerk_user_id").notNull(),
  authorName: text("author_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
