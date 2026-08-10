import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { genhalFamilyAccountsTable } from "./genhal-members";

/**
 * Family Last Will & Testament records.
 *
 * Content is encrypted server-side with AES-256-GCM.
 * The passphrase is never stored — only a scrypt verifier.
 * Decryption requires knowing the passphrase.
 */
export const genhalFamilyWillsTable = pgTable("genhal_family_wills", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => genhalFamilyAccountsTable.id, { onDelete: "cascade" }),

  // Author (Clerk user who wrote this will)
  authorClerkId: text("author_clerk_id").notNull(),
  authorName:    text("author_name").notNull(),

  // Will metadata (stored in plaintext — not sensitive)
  title:           text("title").notNull().default("My Last Will & Testament"),
  summary:         text("summary"),            // optional non-sensitive summary
  accessCondition: text("access_condition"),   // e.g. "Upon my death, verified by family head"
  authorizedPersons: text("authorized_persons").notNull().default("[]"), // JSON [{name,email,relationship}]

  // Encrypted will content (AES-256-GCM)
  encryptedContent: text("encrypted_content"),
  encryptionIv:     text("encryption_iv"),
  encryptionSalt:   text("encryption_salt"),
  encryptionAuthTag: text("encryption_auth_tag"),

  // Passphrase verifier (scrypt hash for quick verification before decryption attempt)
  passphraseVerifier: text("passphrase_verifier"),
  passphraseSalt:     text("passphrase_salt"),

  // Secret account references (IDs only — account details fetched at decrypt time)
  linkedAccountIds: text("linked_account_ids").notNull().default("[]"), // JSON number[]

  // Status
  status:    text("status").notNull().default("active"), // draft | active | revoked
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
});
