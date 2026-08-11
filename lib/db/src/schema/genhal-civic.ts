import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { genhalKingdomsTable } from "./genhal-kingdoms";
import { genhalCompoundsTable } from "./genhal-compounds";
import { genhalCompoundChiefsTable } from "./genhal-compounds";

// Council of Chiefs — formal kingdom body; members are compound/family chiefs
export const genhalCouncilMembersTable = pgTable("genhal_council_members", {
  id: serial("id").primaryKey(),
  kingdomId: integer("kingdom_id").notNull().references(() => genhalKingdomsTable.id, { onDelete: "cascade" }),
  chiefId: integer("chief_id").references(() => genhalCompoundChiefsTable.id, { onDelete: "set null" }),
  compoundId: integer("compound_id").references(() => genhalCompoundsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  title: text("title").notNull(),
  role: text("role").notNull().default("Member"), // Chairman | Secretary | Member | custom
  joinedYear: integer("joined_year"),
  leftYear: integer("left_year"),
  isCurrent: boolean("is_current").notNull().default(false),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// CDC Committees — elected, tenure-based, at kingdom/town/village level
export const genhalCdcCommitteesTable = pgTable("genhal_cdc_committees", {
  id: serial("id").primaryKey(),
  kingdomId: integer("kingdom_id").notNull().references(() => genhalKingdomsTable.id, { onDelete: "cascade" }),
  unitType: text("unit_type").notNull(), // 'kingdom' | 'town' | 'village'
  unitId: integer("unit_id").notNull(),
  name: text("name").notNull().default("Community Development Committee"),
  termStart: integer("term_start"),
  termEnd: integer("term_end"),
  isCurrent: boolean("is_current").notNull().default(false),
  mandate: text("mandate"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// CDC Members
export const genhalCdcMembersTable = pgTable("genhal_cdc_members", {
  id: serial("id").primaryKey(),
  committeeId: integer("committee_id").notNull().references(() => genhalCdcCommitteesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  localName: text("local_name"),
  role: text("role").notNull().default("Member"),
  electedYear: integer("elected_year"),
  bio: text("bio"),
  imageUrl: text("image_url"),
  treeId: integer("tree_id"),
  memberId: integer("member_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Civic Records — heritage/culture/resources at any governance level
export const genhalCivicRecordsTable = pgTable("genhal_civic_records", {
  id: serial("id").primaryKey(),
  kingdomId: integer("kingdom_id").notNull().references(() => genhalKingdomsTable.id, { onDelete: "cascade" }),
  unitType: text("unit_type").notNull().default("kingdom"), // 'kingdom' | 'town' | 'village'
  unitId: integer("unit_id"),
  type: text("type").notNull(), // history|tradition|festival|ceremony|natural_resource|economic_activity
  title: text("title").notNull(),
  content: text("content"),
  period: text("period"),
  imageUrl: text("image_url"),
  mediaUrls: jsonb("media_urls").default("[]"),
  tags: jsonb("tags").default("[]"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
