import { pgTable, serial, text, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { genhalCommunitiesTable } from "./genhal-communities";

export const genhalKingdomsTable = pgTable("genhal_kingdoms", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").references(() => genhalCommunitiesTable.id, { onDelete: "set null" }),
  clerkUserId: text("clerk_user_id").notNull(),
  name: text("name").notNull(),
  localName: text("local_name"),
  unitType: text("unit_type").notNull().default("kingdom"), // kingdom|emirate|sultanate|chiefdom|clan|custom
  unitTypeLabel: text("unit_type_label"),
  languageCode: text("language_code"),
  country: text("country"),
  region: text("region"),
  district: text("district"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  foundedYear: integer("founded_year"),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  emblemImageUrl: text("emblem_image_url"),
  rulerTitle: text("ruler_title").notNull().default("King"),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const genhalKingdomRulersTable = pgTable("genhal_kingdom_rulers", {
  id: serial("id").primaryKey(),
  kingdomId: integer("kingdom_id").notNull().references(() => genhalKingdomsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  localName: text("local_name"),
  title: text("title").notNull(),
  reignStart: integer("reign_start"),
  reignEnd: integer("reign_end"),
  isCurrent: boolean("is_current").notNull().default(false),
  bio: text("bio"),
  achievements: text("achievements"),
  imageUrl: text("image_url"),
  treeId: integer("tree_id"),
  memberId: integer("member_id"),
  successionNotes: text("succession_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
