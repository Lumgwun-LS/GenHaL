import { pgTable, serial, text, integer, boolean, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { genhalCommunitiesTable } from "./genhal-communities";

export const genhalTownsTable = pgTable("genhal_towns", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").references(() => genhalCommunitiesTable.id, { onDelete: "set null" }),
  clerkUserId: text("clerk_user_id").notNull(),
  name: text("name").notNull(),
  localName: text("local_name"),          // name in the indigenous language
  languageCode: text("language_code"),
  country: text("country"),
  region: text("region"),                 // state / province
  district: text("district"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  foundedYear: integer("founded_year"),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  emblemImageUrl: text("emblem_image_url"), // coat of arms / town emblem
  rulerTitle: text("ruler_title").notNull().default("King"), // King | Emir | Oba | Chief | etc.
  chiefTitle: text("chief_title").notNull().default("Chief"), // compound-level title
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const genhalTownRulersTable = pgTable("genhal_town_rulers", {
  id: serial("id").primaryKey(),
  townId: integer("town_id").notNull().references(() => genhalTownsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  localName: text("local_name"),
  title: text("title").notNull(),           // King, Oba, Emir, Sultan, etc.
  reignStart: integer("reign_start"),       // year
  reignEnd: integer("reign_end"),           // null = current ruler
  isCurrent: boolean("is_current").notNull().default(false),
  bio: text("bio"),
  achievements: text("achievements"),
  imageUrl: text("image_url"),
  treeId: integer("tree_id"),               // FK to genhal_trees if in a family tree
  memberId: integer("member_id"),           // FK to genhal_tree_members
  successionNotes: text("succession_notes"), // how they came to power
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const genhalCompoundsTable = pgTable("genhal_compounds", {
  id: serial("id").primaryKey(),
  townId: integer("town_id").notNull().references(() => genhalTownsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  localName: text("local_name"),
  description: text("description"),
  imageUrl: text("image_url"),
  headFamilyTreeId: integer("head_family_tree_id"), // primary family tree linked to this compound
  linkedTreeIds: jsonb("linked_tree_ids").default("[]"), // additional family trees
  chiefTitle: text("chief_title"),          // override town default if different
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const genhalCompoundChiefsTable = pgTable("genhal_compound_chiefs", {
  id: serial("id").primaryKey(),
  compoundId: integer("compound_id").notNull().references(() => genhalCompoundsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  localName: text("local_name"),
  title: text("title").notNull(),
  reignStart: integer("reign_start"),
  reignEnd: integer("reign_end"),           // null = current chief
  isCurrent: boolean("is_current").notNull().default(false),
  bio: text("bio"),
  imageUrl: text("image_url"),
  treeId: integer("tree_id"),
  memberId: integer("member_id"),
  successionNotes: text("succession_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// history | tradition | festival | ceremony | natural_resource | economic_activity
export const genhalTownRecordsTable = pgTable("genhal_town_records", {
  id: serial("id").primaryKey(),
  townId: integer("town_id").notNull().references(() => genhalTownsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content"),                // rich description
  period: text("period"),                  // "annually in July" | "pre-colonial era" | "16th century"
  imageUrl: text("image_url"),
  mediaUrls: jsonb("media_urls").default("[]"),
  tags: jsonb("tags").default("[]"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
