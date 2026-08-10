import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const genhalTreesTable = pgTable("genhal_trees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  originCountry: text("origin_country"),
  originEthnicGroup: text("origin_ethnic_group"),
  coverImageUrl: text("cover_image_url"),
  clerkUserId: text("clerk_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
