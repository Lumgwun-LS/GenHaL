import { pgTable, serial, text, integer, boolean, timestamp, bigint, jsonb } from "drizzle-orm/pg-core";
import { genhalKingdomsTable } from "./genhal-kingdoms";

// ── Vault Documents ───────────────────────────────────────────────────────────
// One table covers both kingdom-level and family-level vaults
// unitType: "kingdom" | "family"
export const genhalVaultDocumentsTable = pgTable("genhal_vault_documents", {
  id: serial("id").primaryKey(),
  unitType: text("unit_type").notNull(),        // "kingdom" | "family"
  unitId: integer("unit_id").notNull(),          // kingdomId or familyId
  kingdomId: integer("kingdom_id").references(() => genhalKingdomsTable.id, { onDelete: "cascade" }),

  title: text("title").notNull(),
  description: text("description"),
  accessInstructions: text("access_instructions"),  // e.g. "Request from the family head"

  // Storage
  r2Key: text("r2_key"),                        // R2 object key (may be null before upload)
  fileUrl: text("file_url"),                    // public or signed CDN URL
  fileName: text("file_name"),
  fileType: text("file_type").notNull().default("document"), // document|image|video|audio|other
  mimeType: text("mime_type"),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),

  // Classification
  category: text("category"),                   // e.g. "will", "land_title", "birth_record"
  isWill: boolean("is_will").notNull().default(false),
  tags: text("tags").array().notNull().default([]),
  attributes: jsonb("attributes"),              // free-form key-value pairs

  // Access control
  accessLevel: text("access_level").notNull().default("members"),
  // public | members | elders_and_above | admins | specific_roles
  allowedRoles: text("allowed_roles").array().notNull().default([]),
  isPasswordProtected: boolean("is_password_protected").notNull().default(false),
  passwordHash: text("password_hash"),          // bcrypt for extra protection

  // Status
  uploadStatus: text("upload_status").notNull().default("pending"), // pending|complete|failed
  isArchived: boolean("is_archived").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  viewCount: integer("view_count").notNull().default(0),
  downloadCount: integer("download_count").notNull().default(0),

  uploadedByClerkUserId: text("uploaded_by_clerk_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Individual access grants (beyond role-level) ──────────────────────────────
export const genhalVaultAccessGrantsTable = pgTable("genhal_vault_access_grants", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => genhalVaultDocumentsTable.id, { onDelete: "cascade" }),
  granteeClerkUserId: text("grantee_clerk_user_id").notNull(),
  grantedByClerkUserId: text("granted_by_clerk_user_id").notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
