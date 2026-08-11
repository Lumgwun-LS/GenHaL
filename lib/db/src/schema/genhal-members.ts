import { pgTable, serial, text, integer, boolean, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { genhalKingdomsTable } from "./genhal-kingdoms";

// Kingdom roles (ordered by authority — used for RBAC comparisons)
// king > queen_mother > council_chief > elder > cdc_member > family_head > member > viewer > guest
export const KINGDOM_ROLES = [
  "king", "queen_mother", "council_chief", "elder",
  "cdc_member", "family_head", "member", "viewer", "guest",
] as const;

// Family roles
export const FAMILY_ROLES = [
  "head", "co_head", "elder", "adult", "child", "viewer",
] as const;

// ── Kingdom Membership ────────────────────────────────────────────────────────
export const genhalKingdomMembersTable = pgTable("genhal_kingdom_members", {
  id: serial("id").primaryKey(),
  kingdomId: integer("kingdom_id").notNull().references(() => genhalKingdomsTable.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id").notNull(),
  role: text("role").notNull().default("member"),       // one of KINGDOM_ROLES
  customTitle: text("custom_title"),                     // e.g. "Royal Archivist"
  status: text("status").notNull().default("active"),    // active|pending|suspended|removed
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  invitedByClerkUserId: text("invited_by_clerk_user_id"),
  notes: text("notes"),
  attributes: jsonb("attributes"),                       // extra profile data for this membership
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("genhal_kingdom_members_kingdom_id_clerk_user_id_key").on(t.kingdomId, t.clerkUserId)]);

// ── Family Accounts ───────────────────────────────────────────────────────────
export const genhalFamilyAccountsTable = pgTable("genhal_family_accounts", {
  id: serial("id").primaryKey(),
  kingdomId: integer("kingdom_id").references(() => genhalKingdomsTable.id, { onDelete: "set null" }),
  compoundId: integer("compound_id"),            // soft reference to genhal_compounds
  clerkUserId: text("clerk_user_id").notNull(), // creator / head
  name: text("name").notNull(),
  localName: text("local_name"),
  description: text("description"),
  country: text("country"),
  region: text("region"),
  district: text("district"),
  coverImageUrl: text("cover_image_url"),
  emblemImageUrl: text("emblem_image_url"),
  attributes: jsonb("attributes"),
  isPublic: boolean("is_public").notNull().default(false),

  // Next of kin / succession
  nextOfKinName:         text("next_of_kin_name"),
  nextOfKinEmail:        text("next_of_kin_email"),
  nextOfKinPhone:        text("next_of_kin_phone"),
  nextOfKinRelationship: text("next_of_kin_relationship"),
  nextOfKinNotes:        text("next_of_kin_notes"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Family Membership ─────────────────────────────────────────────────────────
export const genhalFamilyMembersTable = pgTable("genhal_family_members", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => genhalFamilyAccountsTable.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id").notNull(),
  role: text("role").notNull().default("member"),        // one of FAMILY_ROLES
  relationship: text("relationship"),                    // "father", "mother", "sibling"…
  customTitle: text("custom_title"),
  status: text("status").notNull().default("active"),    // active|pending|suspended
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  invitedByClerkUserId: text("invited_by_clerk_user_id"),
  attributes: jsonb("attributes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("genhal_family_members_family_id_clerk_user_id_key").on(t.familyId, t.clerkUserId)]);
