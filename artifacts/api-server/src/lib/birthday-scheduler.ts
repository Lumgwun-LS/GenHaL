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
 * Email dispatch uses SMTP (see lib/mailer.ts). A failed send is logged under
 * channel "email-failed" and does not block the in-app notification; the next
 * day's tick won't retry it (that's a new calendar day), but admins can see
 * failures in the Birthday Messages log.
 */
import { db } from "@workspace/db";
import {
  vendorsTable,
  vendorNotificationsTable,
  birthdayMessageLogsTable,
  voiceCallLogsTable,
} from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { placeCall } from "./voice-caller";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";

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

/** 06:00 UTC — place birthday calls to opted-in vendors who have a phone number. */
async function runBirthdayCallJob(utcDateStr: string): Promise<void> {
  const [, monthStr, dayStr] = utcDateStr.split("-");
  const month = Number(monthStr);
  const day   = Number(dayStr);

  logger.info({ utcDateStr }, "[voice-birthday] Running birthday call job");

  const todaysBirthdays = await db
    .select()
    .from(vendorsTable)
    .where(
      sql`${vendorsTable.dateOfBirth} IS NOT NULL
        AND ${vendorsTable.voiceCallOptOut} = FALSE
        AND ${vendorsTable.phone} IS NOT NULL
        AND ${vendorsTable.phone} LIKE '+%'
        AND EXTRACT(MONTH FROM ${vendorsTable.dateOfBirth}) = ${month}
        AND EXTRACT(DAY   FROM ${vendorsTable.dateOfBirth}) = ${day}`,
    );

  if (todaysBirthdays.length === 0) {
    logger.info("[voice-birthday] No birthday calls to place today.");
    return;
  }

  logger.info({ count: todaysBirthdays.length }, "[voice-birthday] Placing birthday calls");

  for (const vendor of todaysBirthdays) {
    try {
      // Reserve a log row FIRST (conflict = already called today → skip).
      // The unique index voice_call_logs_birthday_day_uniq on (vendor_id, DATE(initiated_at UTC))
      // WHERE purpose='birthday' makes this atomic even under concurrent scheduler instances.
      const [reserved] = await db
        .insert(voiceCallLogsTable)
        .values({
          vendorId: vendor.id,
          phone: vendor.phone!,
          purpose: "birthday",
          status: "queued",
        })
        .onConflictDoNothing()
        .returning();

      if (!reserved) {
        logger.info({ vendorId: vendor.id }, "[voice-birthday] Already called today (index conflict) — skipping");
        continue;
      }

      const message =
        `Good morning, ${vendor.name}! I'm calling on behalf of the Awa Biz Suite team ` +
        `to wish you a very happy birthday. We truly value having you with us, ` +
        `and we hope today brings you joy and everything you deserve. Have a wonderful day!`;

      // Call Twilio only after a successful reservation
      const result = await placeCall({
        to: vendor.phone!,
        message,
        purpose: "birthday",
        vendorId: vendor.id,
      });

      // Update the reserved row with the real outcome
      await db
        .update(voiceCallLogsTable)
        .set({
          status: result.status === "placed" ? "ringing" : (result.status === "skipped" ? "canceled" : "failed"),
          callSid: result.callSid ?? null,
        })
        .where(eq(voiceCallLogsTable.id, reserved.id));

      logger.info({ vendorId: vendor.id, name: vendor.name, result: result.status }, "[voice-birthday] Call result");
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      logger.error({ err, vendorId: vendor.id }, "[voice-birthday] Error processing birthday call");
    }
  }
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
        `Wishing you a wonderful day from the entire Awa Biz Suite team. ` +
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

      // ── Real birthday email ───────────────────────────────────────────────
      if (vendor.email && !(await alreadyLoggedToday(vendor.id, "email", utcDateStr))) {
        const emailHtml = wrapVendorEmail({
          bodyHtml: `
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-size: 40px;">🎂</span>
            </div>
            <h1 style="text-align: center; font-size: 22px; color: #1a1a1a; margin: 0 0 16px;">Happy Birthday, ${escapeHtml(vendor.name)}!</h1>
            <p style="text-align: center; font-size: 15px; line-height: 1.6; color: #444;">
              Wishing you a wonderful day from the entire Awa Biz Suite team.
              We're so grateful to have you with us. 🎉
            </p>`,
        });

        const result = await sendEmail({
          to: vendor.email,
          subject: `🎂 Happy Birthday, ${vendor.name}!`,
          html: emailHtml,
        });

        // Log the outcome. A failed send does NOT block the in-app notification
        // above (already inserted) — it's logged separately so admins can see it.
        await db
          .insert(birthdayMessageLogsTable)
          .values({
            vendorId: vendor.id,
            vendorName: vendor.name,
            vendorEmail: vendor.email,
            channel: result.status === "sent" ? "email" : "email-failed",
          })
          .onConflictDoNothing();

        if (result.status !== "sent") {
          logger.warn(
            { vendorId: vendor.id, email: vendor.email, reason: result.error },
            "[birthday] Email dispatch did not succeed",
          );
        }
      }

      logger.info({ vendorId: vendor.id, name: vendor.name }, "[birthday] Messages dispatched");
    } catch (err) {
      logger.error({ err, vendorId: vendor.id }, "[birthday] Failed to send birthday message");
    }
  }
}

/**
 * Resends a birthday email for a given failed log row (admin-triggered).
 * Looks up the vendor fresh (in case name/email changed), re-sends via
 * sendEmail, and updates the log row's channel on success.
 */
export async function resendBirthdayEmail(logId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const [log] = await db
    .select()
    .from(birthdayMessageLogsTable)
    .where(eq(birthdayMessageLogsTable.id, logId))
    .limit(1);

  if (!log) {
    return { ok: false, error: "Log entry not found." };
  }
  if (log.channel !== "email-failed") {
    return { ok: false, error: "Only failed email log entries can be resent." };
  }

  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.id, log.vendorId))
    .limit(1);

  const email = vendor?.email ?? log.vendorEmail;
  if (!email) {
    return { ok: false, error: "Vendor has no email address on file." };
  }
  const name = vendor?.name ?? log.vendorName;

  const emailHtml = wrapVendorEmail({
    bodyHtml: `
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 40px;">🎂</span>
      </div>
      <h1 style="text-align: center; font-size: 22px; color: #1a1a1a; margin: 0 0 16px;">Happy Birthday, ${escapeHtml(name)}!</h1>
      <p style="text-align: center; font-size: 15px; line-height: 1.6; color: #444;">
        Wishing you a wonderful day from the entire Awa Biz Suite team.
        We're so grateful to have you with us. 🎉
      </p>`,
  });

  const result = await sendEmail({
    to: email,
    subject: `🎂 Happy Birthday, ${name}!`,
    html: emailHtml,
  });

  if (result.status !== "sent") {
    logger.warn({ logId, vendorId: log.vendorId, email, reason: result.error }, "[birthday] Manual resend did not succeed");
    return { ok: false, error: result.error ?? "Email dispatch failed." };
  }

  await db
    .update(birthdayMessageLogsTable)
    .set({ channel: "email", vendorEmail: email, sentAt: new Date() })
    .where(eq(birthdayMessageLogsTable.id, logId));

  logger.info({ logId, vendorId: log.vendorId, email }, "[birthday] Manual resend succeeded");
  return { ok: true };
}

/**
 * Starts the daily birthday scheduler.
 * - Checks every 5 minutes; fires when UTC hour is 08.
 * - `lastRanDate` advances only AFTER a successful run so a DB error at 08:00
 *   UTC doesn't permanently skip that day — the next 5-min tick will retry.
 */
export function startBirthdayScheduler(): void {
  let lastCallDate = "";   // tracks 06:00 UTC voice call run
  let lastNotifDate = "";  // tracks 08:00 UTC in-app / email run

  async function tick() {
    const now        = new Date();
    const utcHour    = now.getUTCHours();
    const utcDateStr = now.toISOString().split("T")[0]!;

    // 06:00 UTC — voice birthday calls
    if (utcHour === 6 && lastCallDate !== utcDateStr) {
      try {
        await runBirthdayCallJob(utcDateStr);
        lastCallDate = utcDateStr;
      } catch (err) {
        logger.error({ err }, "[voice-birthday] Unhandled error — will retry next tick");
      }
    }

    // 08:00 UTC — in-app notifications + email queuing
    if (utcHour === 8 && lastNotifDate !== utcDateStr) {
      try {
        await runBirthdayJob(utcDateStr);
        lastNotifDate = utcDateStr;
      } catch (err) {
        logger.error({ err }, "[birthday] Unhandled error — will retry next tick");
      }
    }
  }

  setInterval(() => { tick().catch(() => {}); }, 5 * 60 * 1000);
  tick().catch(() => {}); // no-op outside the trigger hours

  logger.info("[birthday] Scheduler started — calls at 06:00 UTC, notifications at 08:00 UTC");
}
