import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { genhalKingdomsTable } from "./genhal-kingdoms";

export const genhalTownsTable = pgTable("genhal_towns", {
  id: serial("id").primaryKey(),
  kingdomId: integer("kingdom_id").notNull().references(() => genhalKingdomsTable.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id").notNull(),
  name: text("name").notNull(),
  localName: text("local_name"),
  description: text("description"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const genhalVillagesTable = pgTable("genhal_villages", {
  id: serial("id").primaryKey(),
  kingdomId: integer("kingdom_id").notNull().references(() => genhalKingdomsTable.id, { onDelete: "cascade" }),
  townId: integer("town_id").references(() => genhalTownsTable.id, { onDelete: "set null" }),
  clerkUserId: text("clerk_user_id").notNull(),
  name: text("name").notNull(),
  localName: text("local_name"),
  description: text("description"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
