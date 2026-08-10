import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { genhalKingdomsTable } from "./genhal-kingdoms";

export const genhalCompoundsTable = pgTable("genhal_compounds", {
  id: serial("id").primaryKey(),
  kingdomId: integer("kingdom_id").notNull().references(() => genhalKingdomsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  localName: text("local_name"),
  description: text("description"),
  imageUrl: text("image_url"),
  headFamilyTreeId: integer("head_family_tree_id"),
  chiefTitle: text("chief_title").notNull().default("Chief"),
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
  reignEnd: integer("reign_end"),
  isCurrent: boolean("is_current").notNull().default(false),
  bio: text("bio"),
  imageUrl: text("image_url"),
  treeId: integer("tree_id"),
  memberId: integer("member_id"),
  successionNotes: text("succession_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
