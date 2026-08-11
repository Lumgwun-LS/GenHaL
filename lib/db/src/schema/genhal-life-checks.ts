import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { genhalFamilyAccountsTable } from "./genhal-members";

/**
 * Proof-of-life checks for GenHaL family accounts.
 *
 * Every 90 days a unique token is emailed to the family head.
 * If they use the token (visit the verify link or POST it) we record respondedAt.
 * If 4 consecutive tokens expire without a response (≈ 1 year) we email the
 * family's Next of Kin to confirm the head can still be reached.
 *
 * One row per check cycle.  The "active" check for a family is the most recent
 * row where respondedAt IS NULL and expiresAt > NOW().
 */
export const genhalLifeChecksTable = pgTable("genhal_life_checks", {
  id:               serial("id").primaryKey(),
  familyId:         integer("family_id").notNull()
                      .references(() => genhalFamilyAccountsTable.id, { onDelete: "cascade" }),

  /** Short alphanumeric token — included in the email both as a type-in code
   *  and embedded in a click link.  Globally unique. */
  token:            text("token").notNull().unique("genhal_life_checks_token_key"),

  /** When the reminder email was dispatched. */
  sentAt:           timestamp("sent_at").notNull().defaultNow(),

  /** Set when the family head verifies via link or manual code entry. */
  respondedAt:      timestamp("responded_at"),

  /** 90 days after sentAt — after this the check is considered a miss. */
  expiresAt:        timestamp("expires_at").notNull(),

  /** Number of this check in the current consecutive-miss run (1–4).
   *  Resets to 1 after any response. */
  sequence:         integer("sequence").notNull().default(1),

  /** Set on the check that triggers the Next-of-Kin email (sequence == 4 + miss). */
  nokNotifiedAt:    timestamp("nok_notified_at"),

  createdAt:        timestamp("created_at").notNull().defaultNow(),
});
