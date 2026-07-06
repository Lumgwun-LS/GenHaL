/**
 * Birthday message scheduler.
 *
 * Fires once per day at 08:00 UTC. Idempotency is enforced at two layers:
 *
 *  1. Pre-insert existence check (application layer) — the primary guard,
 *     avoids unnecessary write attempts.
 *
 *  2. DB-level unique expression indexes (migration 0001_birthday_messages.sql):
 *       • vendor_notifications:   UNIQUE (vendor_id, DATE(created_at UTC))
 *                                 WHERE type = 'birthday'
 *       • birthday_message_logs:  UNIQUE (vendor_id, channel, DATE(sent_at UTC))
 *     These are the authoritative concurrent-safe barrier; duplicate inserts
 *     from races or concurrent instances silently no-op via onConflictDoNothing.
 *
 * Together, the two layers ensure a vendor receives exactly one birthday
 * notification per calendar day — year after year — even across restarts.
 *
 * Email dispatch is stubbed until Task #25 / Task #6 lands a real email sender.
 */
import { db } from "@workspace/db";
import {
  vendorsTable,
  vendorNotificationsTable,
  birthdayMessageLogsTable,
} from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

/** True if a birthday notification was already created for this vendor today (UTC). */
async function alreadyNotifiedToday(vendorId: number, utcDateStr: string): Promise<boolean> {
  const rows = await db
    .select({ id: vendorNotificationsTable.id })
    .from(vendorNotificationsTable)
    .where(
      and(
        eq(vendorNotificationsTable.vendorId, vendorId),
        eq(vendorNotificationsTable.type, "birthday"),
        sql`DATE(${vendorNotificationsTable.createdAt} AT TIME ZONE 'UTC') = ${utcDateStr}::date`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** True if a log row already exists for this vendor+channel today (UTC). */
async function alreadyLoggedToday(vendorId: number, channel: string, utcDateStr: string): Promise<boolean> {
  const rows = await db
    .select({ id: birthdayMessageLogsTable.id })
    .from(birthdayMessageLogsTable)
    .where(
      and(
        eq(birthdayMessageLogsTable.vendorId, vendorId),
        eq(birthdayMessageLogsTable.channel, channel),
        sql`DATE(${birthdayMessageLogsTable.sentAt} AT TIME ZONE 'UTC') = ${utcDateStr}::date`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function runBirthdayJob(utcDateStr: string): Promise<void> {
  const [, monthStr, dayStr] = utcDateStr.split("-");
  const month = Number(monthStr);
  const day   = Number(dayStr);

  logger.info({ utcDateStr, month, day }, "[birthday] Running birthday job");

  const todaysBirthdays = await db
    .select()
    .from(vendorsTable)
    .where(
      sql`${vendorsTable.dateOfBirth} IS NOT NULL
        AND EXTRACT(MONTH FROM ${vendorsTable.dateOfBirth}) = ${month}
        AND EXTRACT(DAY   FROM ${vendorsTable.dateOfBirth}) = ${day}`,
    );

  if (todaysBirthdays.length === 0) {
    logger.info("[birthday] No birthdays today.");
    return;
  }

  logger.info({ count: todaysBirthdays.length }, "[birthday] Processing birthday vendors");

  for (const vendor of todaysBirthdays) {
    try {
      // ── Pre-check (application layer) ───────────────────────────────────
      if (await alreadyNotifiedToday(vendor.id, utcDateStr)) {
        logger.info({ vendorId: vendor.id }, "[birthday] Already notified today — skipping");
        continue;
      }

      const message =
        `🎂 Happy Birthday, ${vendor.name}! ` +
        `Wishing you a wonderful day from the entire Awajimaa Connect Suite team. ` +
        `We're so grateful to have you with us. 🎉`;

      // ── In-app notification (DB index is concurrent-safe fallback) ───────
      await db
        .insert(vendorNotificationsTable)
        .values({ vendorId: vendor.id, type: "birthday", message })
        .onConflictDoNothing();

      if (!(await alreadyLoggedToday(vendor.id, "in-app", utcDateStr))) {
        await db
          .insert(birthdayMessageLogsTable)
          .values({
            vendorId: vendor.id,
            vendorName: vendor.name,
            vendorEmail: vendor.email ?? null,
            channel: "in-app",
          })
          .onConflictDoNothing();
      }

      // ── Email stub (Task #25 / Task #6 will replace this) ────────────────
      if (vendor.email && !(await alreadyLoggedToday(vendor.id, "email-queued", utcDateStr))) {
        logger.info(
          { vendorId: vendor.id, email: vendor.email },
          "[birthday] Email dispatch queued (email infrastructure pending — Task #25)",
        );
        await db
          .insert(birthdayMessageLogsTable)
          .values({
            vendorId: vendor.id,
            vendorName: vendor.name,
            vendorEmail: vendor.email,
            channel: "email-queued",
          })
          .onConflictDoNothing();
      }

      logger.info({ vendorId: vendor.id, name: vendor.name }, "[birthday] Messages dispatched");
    } catch (err) {
      logger.error({ err, vendorId: vendor.id }, "[birthday] Failed to send birthday message");
    }
  }
}

/**
 * Starts the daily birthday scheduler.
 * - Checks every 5 minutes; fires when UTC hour is 08.
 * - `lastRanDate` advances only AFTER a successful run so a DB error at 08:00
 *   UTC doesn't permanently skip that day — the next 5-min tick will retry.
 */
export function startBirthdayScheduler(): void {
  let lastRanDate = "";

  async function tick() {
    const now        = new Date();
    const utcHour    = now.getUTCHours();
    const utcDateStr = now.toISOString().split("T")[0]!;

    if (utcHour === 8 && lastRanDate !== utcDateStr) {
      try {
        await runBirthdayJob(utcDateStr);
        lastRanDate = utcDateStr;
      } catch (err) {
        logger.error({ err }, "[birthday] Unhandled error — will retry next tick");
      }
    }
  }

  setInterval(() => { tick().catch(() => {}); }, 5 * 60 * 1000);
  tick().catch(() => {}); // no-op outside 08:xx UTC

  logger.info("[birthday] Scheduler started (checks every 5 min, fires at 08:00 UTC)");
}
