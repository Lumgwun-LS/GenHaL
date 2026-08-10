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

// ─── Kingdom civic expansion tables ─────────────────────────────────────────

export const genhalKingdomLanguagesTable = pgTable("genhal_kingdom_languages", {
  id: serial("id").primaryKey(),
  kingdomId: integer("kingdom_id").notNull().references(() => genhalKingdomsTable.id, { onDelete: "cascade" }),
  languageCode: text("language_code"),
  name: text("name").notNull(),
  localName: text("local_name"),
  isOfficial: boolean("is_official").notNull().default(false),
  speakerCount: integer("speaker_count"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const genhalKingdomGeopointsTable = pgTable("genhal_kingdom_geopoints", {
  id: serial("id").primaryKey(),
  kingdomId: integer("kingdom_id").notNull().references(() => genhalKingdomsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("landmark"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  description: text("description"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const genhalKingdomEconomicActivitiesTable = pgTable("genhal_kingdom_economic_activities", {
  id: serial("id").primaryKey(),
  kingdomId: integer("kingdom_id").notNull().references(() => genhalKingdomsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull().default("agriculture"),
  description: text("description"),
  scale: text("scale"),
  isMain: boolean("is_main").notNull().default(false),
  seasonality: text("seasonality"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const genhalKingdomSchoolsTable = pgTable("genhal_kingdom_schools", {
  id: serial("id").primaryKey(),
  kingdomId: integer("kingdom_id").notNull().references(() => genhalKingdomsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  localName: text("local_name"),
  level: text("level").notNull().default("primary"),
  type: text("type").notNull().default("public"),
  founded: integer("founded"),
  address: text("address"),
  imageUrl: text("image_url"),
  website: text("website"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const genhalKingdomChurchesTable = pgTable("genhal_kingdom_churches", {
  id: serial("id").primaryKey(),
  kingdomId: integer("kingdom_id").notNull().references(() => genhalKingdomsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  localName: text("local_name"),
  type: text("type").notNull().default("church"),
  denomination: text("denomination"),
  founded: integer("founded"),
  address: text("address"),
  imageUrl: text("image_url"),
  website: text("website"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
