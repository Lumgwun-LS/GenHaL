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

  // ── Recovery / executor system ────────────────────────────────────────────
  /** 'passphrase' (legacy) | 'split-key' (new — has executor recovery codes) */
  contentKeyScheme:    text("content_key_scheme").notNull().default("passphrase"),
  /** JSON: [{name, email}] — named executors, each emailed a recovery code */
  executors:           text("executors").notNull().default("[]"),
  /**
   * Owner key envelope (JSON: {encrypted, iv, salt, authTag}).
   * The random 32-byte content key, wrapped with the owner's passphrase via PBKDF2.
   * Only present when contentKeyScheme === 'split-key'.
   */
  ownerKeyEnvelope:    text("owner_key_envelope"),
  /**
   * Recovery key envelope (JSON: {encrypted, iv, salt, authTag}).
   * The content key wrapped with the one-time recovery code via PBKDF2.
   * Allows named executors to decrypt the will without the owner's passphrase.
   */
  recoveryKeyEnvelope: text("recovery_key_envelope"),
  /**
   * Platform escrow key envelope (JSON: {encrypted, iv, authTag}).
   * The content key wrapped with WILL_PLATFORM_MASTER_KEY (env var, never in DB).
   * Admin-only last resort — requires death cert verification before unlocking.
   */
  platformKeyEnvelope: text("platform_key_envelope"),

  // Admin escrow unlock workflow
  deathCertUrl:           text("death_cert_url"),
  deathCertSubmittedAt:   timestamp("death_cert_submitted_at"),
  deathCertSubmittedBy:   text("death_cert_submitted_by"),   // clerk user id
  adminEscrowGrantedAt:   timestamp("admin_escrow_granted_at"),
  adminEscrowGrantedBy:   text("admin_escrow_granted_by"),   // admin clerk user id
  adminEscrowForClerk:    text("admin_escrow_for_clerk"),    // who may use the escrow path
});
