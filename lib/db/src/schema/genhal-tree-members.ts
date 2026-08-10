import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { genhalTreesTable } from "./genhal-trees";

export const genhalTreeMembersTable = pgTable("genhal_tree_members", {
  id: serial("id").primaryKey(),
  treeId: integer("tree_id")
    .notNull()
    .references(() => genhalTreesTable.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  gender: text("gender").notNull().default("unknown"),
  birthDate: text("birth_date"),
  deathDate: text("death_date"),
  birthPlace: text("birth_place"),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  parentId: integer("parent_id"),
  spouseId: integer("spouse_id"),
  relationship: text("relationship"),
  isLiving: boolean("is_living").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
