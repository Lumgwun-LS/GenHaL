/**
 * GenHaL Proof-of-Life Scheduler
 *
 * Runs once per day.  For every family account it determines whether a new
 * 90-day check token needs to be sent, and whether the Next of Kin should be
 * alerted after 4 consecutive missed checks (≈ 1 year of silence).
 *
 * State machine per family:
 *   ┌─ No checks yet                   → send check #1
 *   ├─ Active pending check             → wait (nothing to do)
 *   ├─ Last check responded             → next send = respondedAt + 90 days
 *   ├─ Last check expired, sequence < 4 → send next check (sequence++)
 *   └─ Last check expired, sequence = 4 → email NOK (once), then pause
 */
import { randomBytes } from "crypto";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db, genhalLifeChecksTable, genhalFamilyAccountsTable } from "@workspace/db";
import { logger } from "./logger";
import {
  sendLifeCheckReminderEmail,
  sendNextOfKinAlertEmail,
} from "./genhal-emails";

const WINDOW_DAYS = 90;
const MAX_SEQUENCE = 4;
const INTERVAL_MS = 24 * 60 * 60 * 1000; // run daily

function generateToken(): string {
  // 8 uppercase alphanumeric characters — easy to type, URL-safe
  return randomBytes(6)
    .toString("base64url")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8)
    .padEnd(8, "A");
}

async function tick() {
  const now = new Date();

  // ── 1. Load all families with their most recent life check ──────────────────
  const families = await db
    .select({
      familyId:        genhalFamilyAccountsTable.id,
      clerkUserId:     genhalFamilyAccountsTable.clerkUserId,
      familyName:      genhalFamilyAccountsTable.name,
      nokName:         genhalFamilyAccountsTable.nextOfKinName,
      nokEmail:        genhalFamilyAccountsTable.nextOfKinEmail,
      // Latest check columns (null if no checks exist)
      lastToken:       sql<string | null>`lc.token`,
      lastSentAt:      sql<Date | null>`lc.sent_at`,
      lastRespondedAt: sql<Date | null>`lc.responded_at`,
      lastExpiresAt:   sql<Date | null>`lc.expires_at`,
      lastSequence:    sql<number | null>`lc.sequence`,
      lastNokNotified: sql<Date | null>`lc.nok_notified_at`,
    })
    .from(genhalFamilyAccountsTable)
    .leftJoin(
      sql`(
        SELECT DISTINCT ON (family_id)
          family_id, token, sent_at, responded_at, expires_at, sequence, nok_notified_at
        FROM genhal_life_checks
        ORDER BY family_id, sent_at DESC
      ) lc`,
      sql`lc.family_id = ${genhalFamilyAccountsTable.id}`,
    );

  let sent = 0;
  let nokAlerted = 0;

  for (const family of families) {
    try {
      await processFamily(family, now);
      if (family.lastNokNotified) nokAlerted++;
    } catch (err) {
      logger.warn({ err, familyId: family.familyId }, "[genhal-life-check] error processing family");
    }
  }

  logger.info({ checked: families.length, sent, nokAlerted }, "[genhal-life-check] tick complete");

  async function processFamily(
    f: typeof families[number],
    now: Date,
  ) {
    const { familyId, clerkUserId, familyName, nokName, nokEmail } = f;

    // ── Case A: No checks ever sent → send first check ──────────────────────
    if (!f.lastSentAt) {
      await sendCheck(familyId, clerkUserId, familyName, 1);
      sent++;
      return;
    }

    // ── Case B: Active pending check → nothing to do ────────────────────────
    const isPending = !f.lastRespondedAt && f.lastExpiresAt! > now;
    if (isPending) return;

    // ── Case C: Last check was responded → next window = response + 90d ─────
    if (f.lastRespondedAt) {
      const nextSend = new Date(f.lastRespondedAt);
      nextSend.setDate(nextSend.getDate() + WINDOW_DAYS);
      if (now >= nextSend) {
        await sendCheck(familyId, clerkUserId, familyName, 1); // reset sequence after response
        sent++;
      }
      return;
    }

    // ── Case D: Last check expired without response ──────────────────────────
    const missedSequence = f.lastSequence ?? 1;

    if (missedSequence >= MAX_SEQUENCE) {
      // Already hit the limit — notify NOK once if not done already
      if (!f.lastNokNotified && nokEmail) {
        await notifyNok(familyId, f.lastToken!, familyName, nokName, nokEmail);
        nokAlerted++;
      }
      return; // pause further reminders until the NOK/admin intervenes
    }

    // Send the next sequential check
    await sendCheck(familyId, clerkUserId, familyName, missedSequence + 1);
    sent++;
  }
}

async function sendCheck(
  familyId: number,
  clerkUserId: string,
  familyName: string,
  sequence: number,
) {
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + WINDOW_DAYS);

  await db.insert(genhalLifeChecksTable).values({
    familyId,
    token,
    sentAt: now,
    expiresAt,
    sequence,
  });

  await sendLifeCheckReminderEmail({ familyId, familyName, clerkUserId, token, sequence });
}

async function notifyNok(
  familyId: number,
  lastToken: string,
  familyName: string,
  nokName: string | null,
  nokEmail: string,
) {
  await db
    .update(genhalLifeChecksTable)
    .set({ nokNotifiedAt: new Date() })
    .where(eq(genhalLifeChecksTable.token, lastToken));

  await sendNextOfKinAlertEmail({ familyId, familyName, nokName, nokEmail });
}

export function startGenhalLifeCheckScheduler() {
  logger.info("[genhal-life-check] Scheduler started — checks daily, 90-day windows");

  // Run once at startup (non-blocking)
  tick().catch((err) => logger.warn({ err }, "[genhal-life-check] initial tick failed"));

  setInterval(() => {
    tick().catch((err) => logger.warn({ err }, "[genhal-life-check] tick failed"));
  }, INTERVAL_MS);
}
