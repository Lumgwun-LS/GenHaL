import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const genhalCommunitiesTable = pgTable("genhal_communities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  ethnicGroup: text("ethnic_group").notNull(),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  clerkUserId: text("clerk_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
