import {
  pgTable, serial, integer, text, boolean, timestamp, unique,
} from "drizzle-orm/pg-core";

/**
 * Language Organisations — professional bodies or community groups that are
 * the custodians of one or more local languages.  They register on GenHaL,
 * get approved by the platform admin, then manage submitted corpus data for
 * their language(s) before it enters the ML training pipeline.
 */

// ── Organisation record ──────────────────────────────────────────────────────
export const genhalLanguageOrgsTable = pgTable("genhal_language_orgs", {
  id:                     serial("id").primaryKey(),
  name:                   text("name").notNull(),
  slug:                   text("slug").notNull().unique("genhal_language_orgs_slug_key"),   // URL-safe identifier
  description:            text("description"),
  logoUrl:                text("logo_url"),
  website:                text("website"),
  contactEmail:           text("contact_email"),
  country:                text("country"),
  foundedYear:            integer("founded_year"),
  /** Clerk user ID of the person who submitted the registration */
  clerkUserId:            text("clerk_user_id").notNull(),
  /** pending | approved | rejected | suspended */
  status:                 text("status").notNull().default("pending"),
  adminNotes:             text("admin_notes"),
  reviewedByClerkUserId:  text("reviewed_by_clerk_user_id"),
  reviewedAt:             timestamp("reviewed_at"),
  createdAt:              timestamp("created_at").notNull().defaultNow(),
  updatedAt:              timestamp("updated_at").notNull().defaultNow(),
});

// ── Organisation membership ───────────────────────────────────────────────────
export const genhalLanguageOrgMembersTable = pgTable(
  "genhal_language_org_members",
  {
    id:                     serial("id").primaryKey(),
    orgId:                  integer("org_id").notNull()
                              .references(() => genhalLanguageOrgsTable.id, { onDelete: "cascade" }),
    clerkUserId:            text("clerk_user_id").notNull(),
    /**
     * owner     — founder; full control, cannot be removed
     * admin     — manage members, languages, org settings
     * reviewer  — review and approve/reject dataset submissions
     * contributor — submit data on behalf of the org
     * viewer    — read-only access to org dashboard
     */
    role:                   text("role").notNull().default("contributor"),
    /** active | pending | removed */
    status:                 text("status").notNull().default("active"),
    invitedByClerkUserId:   text("invited_by_clerk_user_id"),
    joinedAt:               timestamp("joined_at").defaultNow(),
    createdAt:              timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("genhal_language_org_members_org_id_clerk_user_id_key").on(t.orgId, t.clerkUserId)],
);

// ── Languages managed by an organisation ─────────────────────────────────────
export const genhalLanguageOrgLanguagesTable = pgTable(
  "genhal_language_org_languages",
  {
    id:               serial("id").primaryKey(),
    orgId:            integer("org_id").notNull()
                        .references(() => genhalLanguageOrgsTable.id, { onDelete: "cascade" }),
    languageCode:     text("language_code").notNull(),
    // FK to genhal_languages(code) enforced in migration SQL
    /**
     * When true, any dataset or recording submitted for this language
     * must be reviewed and approved by an org reviewer before it is
     * eligible for AI training (approved_for_training remains false).
     */
    requiresApproval: boolean("requires_approval").notNull().default(false),
    /**
     * Marks this org as the primary/authoritative custodian for the language.
     * A language can have only one primary org.
     */
    isPrimaryOrg:     boolean("is_primary_org").notNull().default(false),
    createdAt:        timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("genhal_language_org_languages_org_id_language_code_key").on(t.orgId, t.languageCode)],
);
