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
  leadsTable,
  customersTable,
  ordersTable,
  vendorTasksTable,
} from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { placeCall } from "./voice-caller";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { recordJobRun } from "./job-run-status";

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
async function runBirthdayCallJob(utcDateStr: string): Promise<{ checked: number; called: number }> {
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
    return { checked: 0, called: 0 };
  }

  logger.info({ count: todaysBirthdays.length }, "[voice-birthday] Placing birthday calls");

  let called = 0;
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

      called++;
      logger.info({ vendorId: vendor.id, name: vendor.name, result: result.status }, "[voice-birthday] Call result");
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      logger.error({ err, vendorId: vendor.id }, "[voice-birthday] Error processing birthday call");
    }
  }
  return { checked: todaysBirthdays.length, called };
}

async function runBirthdayJob(utcDateStr: string): Promise<{ checked: number; notified: number }> {
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
    return { checked: 0, notified: 0 };
  }

  logger.info({ count: todaysBirthdays.length }, "[birthday] Processing birthday vendors");

  let notified = 0;
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

      notified++;
      logger.info({ vendorId: vendor.id, name: vendor.name }, "[birthday] Messages dispatched");
    } catch (err) {
      logger.error({ err, vendorId: vendor.id }, "[birthday] Failed to send birthday message");
    }
  }
  return { checked: todaysBirthdays.length, notified };
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
 * Retries a failed birthday voice call for a given log row (admin-triggered).
 * Looks up the vendor fresh (in case the phone number changed), re-places
 * the call via placeCall, and updates the log row in place with the new
 * outcome — it does not insert a second row, so the call history stays
 * one-row-per-attempt-of-the-day.
 */
export async function retryBirthdayCall(logId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const [log] = await db
    .select()
    .from(voiceCallLogsTable)
    .where(eq(voiceCallLogsTable.id, logId))
    .limit(1);

  if (!log) {
    return { ok: false, error: "Call log entry not found." };
  }
  if (log.purpose !== "birthday") {
    return { ok: false, error: "Only birthday calls can be retried here." };
  }
  if (log.status !== "failed") {
    return { ok: false, error: "Only failed calls can be retried." };
  }
  if (!log.vendorId) {
    return { ok: false, error: "This call has no associated vendor." };
  }

  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.id, log.vendorId))
    .limit(1);

  const phone = vendor?.phone ?? log.phone;
  if (!phone) {
    return { ok: false, error: "Vendor has no phone number on file." };
  }
  const name = vendor?.name ?? "there";

  const message =
    `Good morning, ${name}! I'm calling on behalf of the Awa Biz Suite team ` +
    `to wish you a very happy birthday. We truly value having you with us, ` +
    `and we hope today brings you joy and everything you deserve. Have a wonderful day!`;

  const result = await placeCall({
    to: phone,
    message,
    purpose: "birthday",
    vendorId: log.vendorId,
  });

  // "skipped" means placeCall never actually dialed (e.g. missing
  // TWILIO_PHONE_NUMBER, invalid E.164 phone) — that's a failed retry
  // attempt, not a successful one. Only a real Twilio call ("placed")
  // counts as success. In both failure cases, leave the row's status as
  // "failed" so the Retry button in the admin UI stays available instead
  // of silently disappearing.
  if (result.status !== "placed") {
    logger.warn(
      { logId, vendorId: log.vendorId, reason: result.error, twilioStatus: result.status },
      "[voice-birthday] Manual retry did not succeed",
    );
    await db
      .update(voiceCallLogsTable)
      .set({ phone, status: "failed", callSid: result.callSid ?? null })
      .where(eq(voiceCallLogsTable.id, logId));
    return { ok: false, error: result.error ?? "Call failed to place." };
  }

  await db
    .update(voiceCallLogsTable)
    .set({ phone, status: "ringing", callSid: result.callSid ?? null, initiatedAt: new Date() })
    .where(eq(voiceCallLogsTable.id, logId));

  logger.info({ logId, vendorId: log.vendorId, result: result.status }, "[voice-birthday] Manual retry result");
  return { ok: true };
}

// ─── Customer & Lead birthday helpers ────────────────────────────────────────

/** True if a birthday log row already exists for this lead + channel + date. */
async function alreadyLoggedLeadToday(leadId: number, channel: string, utcDate: string): Promise<boolean> {
  const rows = await db.select({ id: birthdayMessageLogsTable.id })
    .from(birthdayMessageLogsTable)
    .where(and(
      eq(birthdayMessageLogsTable.leadId, leadId),
      eq(birthdayMessageLogsTable.channel, channel),
      sql`DATE(${birthdayMessageLogsTable.sentAt} AT TIME ZONE 'UTC') = ${utcDate}::date`,
    )).limit(1);
  return rows.length > 0;
}

/** True if a birthday log row already exists for this customer + channel + date. */
async function alreadyLoggedCustomerToday(customerId: number, channel: string, utcDate: string): Promise<boolean> {
  const rows = await db.select({ id: birthdayMessageLogsTable.id })
    .from(birthdayMessageLogsTable)
    .where(and(
      eq(birthdayMessageLogsTable.customerId, customerId),
      eq(birthdayMessageLogsTable.channel, channel),
      sql`DATE(${birthdayMessageLogsTable.sentAt} AT TIME ZONE 'UTC') = ${utcDate}::date`,
    )).limit(1);
  return rows.length > 0;
}

// ─── Lead birthday jobs ───────────────────────────────────────────────────────

/**
 * 06:00 UTC — place birthday voice calls to CRM leads who have a birthday today,
 * an E.164 phone number, and belong to a vendor.
 */
async function runLeadBirthdayCallJob(utcDateStr: string): Promise<{ checked: number; called: number }> {
  const [, monthStr, dayStr] = utcDateStr.split("-");
  const month = Number(monthStr);
  const day   = Number(dayStr);

  const todaysLeads = await db
    .select({
      leadId: leadsTable.id,
      leadName: leadsTable.name,
      leadPhone: leadsTable.phone,
      vendorId: leadsTable.vendorId,
      vendorName: vendorsTable.name,
    })
    .from(leadsTable)
    .innerJoin(vendorsTable, eq(vendorsTable.id, leadsTable.vendorId))
    .where(
      sql`${leadsTable.dateOfBirth} IS NOT NULL
        AND ${leadsTable.phone} IS NOT NULL
        AND ${leadsTable.phone} LIKE '+%'
        AND EXTRACT(MONTH FROM ${leadsTable.dateOfBirth}) = ${month}
        AND EXTRACT(DAY   FROM ${leadsTable.dateOfBirth}) = ${day}`,
    );

  if (todaysLeads.length === 0) return { checked: 0, called: 0 };

  logger.info({ count: todaysLeads.length }, "[voice-birthday-leads] Placing calls");

  let called = 0;
  for (const lead of todaysLeads) {
    try {
      if (await alreadyLoggedLeadToday(lead.leadId, "lead-call", utcDateStr)) {
        logger.info({ leadId: lead.leadId }, "[voice-birthday-leads] Already called today — skipping");
        continue;
      }

      const message =
        `Hello ${lead.leadName}! ` +
        `We're calling on behalf of ${lead.vendorName} to wish you ` +
        `a very happy birthday! We hope today is filled with joy. ` +
        `From all of us at ${lead.vendorName} — have a wonderful day!`;

      const result = await placeCall({
        to: lead.leadPhone!,
        message,
        purpose: "birthday",
        vendorId: lead.vendorId,
      });

      await db.insert(birthdayMessageLogsTable).values({
        vendorId: lead.vendorId,
        vendorName: lead.vendorName,
        channel: result.status === "placed" ? "lead-call" : "lead-call-failed",
        leadId: lead.leadId,
        recipientName: lead.leadName,
      }).onConflictDoNothing();

      if (result.status === "placed") called++;
      logger.info({ leadId: lead.leadId, result: result.status }, "[voice-birthday-leads] Call result");
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      logger.error({ err, leadId: lead.leadId }, "[voice-birthday-leads] Error");
    }
  }
  return { checked: todaysLeads.length, called };
}

/**
 * 08:00 UTC — send birthday emails + vendor in-app notifications for leads
 * whose birthday is today.
 */
async function runLeadBirthdayNotifJob(utcDateStr: string): Promise<{ checked: number; notified: number }> {
  const [, monthStr, dayStr] = utcDateStr.split("-");
  const month = Number(monthStr);
  const day   = Number(dayStr);

  const todaysLeads = await db
    .select({
      leadId: leadsTable.id,
      leadName: leadsTable.name,
      leadEmail: leadsTable.email,
      vendorId: leadsTable.vendorId,
      vendorName: vendorsTable.name,
    })
    .from(leadsTable)
    .innerJoin(vendorsTable, eq(vendorsTable.id, leadsTable.vendorId))
    .where(
      sql`${leadsTable.dateOfBirth} IS NOT NULL
        AND EXTRACT(MONTH FROM ${leadsTable.dateOfBirth}) = ${month}
        AND EXTRACT(DAY   FROM ${leadsTable.dateOfBirth}) = ${day}`,
    );

  if (todaysLeads.length === 0) return { checked: 0, notified: 0 };

  logger.info({ count: todaysLeads.length }, "[birthday-leads] Processing birthday leads");

  let notified = 0;
  for (const lead of todaysLeads) {
    try {
      // ── Vendor in-app notification ──────────────────────────────────────────
      if (!(await alreadyLoggedLeadToday(lead.leadId, "lead-in-app", utcDateStr))) {
        await db.insert(vendorNotificationsTable).values({
          vendorId: lead.vendorId,
          type: "birthday",
          message: `🎂 It's ${lead.leadName}'s birthday today! Send them a special offer or personal message.`,
        }).onConflictDoNothing();

        await db.insert(birthdayMessageLogsTable).values({
          vendorId: lead.vendorId,
          vendorName: lead.vendorName,
          channel: "lead-in-app",
          leadId: lead.leadId,
          recipientName: lead.leadName,
        }).onConflictDoNothing();
      }

      // ── Birthday email to the lead ──────────────────────────────────────────
      if (lead.leadEmail && !(await alreadyLoggedLeadToday(lead.leadId, "lead-email", utcDateStr))) {
        const emailHtml = wrapVendorEmail({
          bodyHtml: `
            <div style="text-align:center;margin-bottom:24px;">
              <span style="font-size:48px;">🎂</span>
            </div>
            <h1 style="text-align:center;font-size:22px;color:#1a1a1a;margin:0 0 16px;">
              Happy Birthday, ${escapeHtml(lead.leadName)}!
            </h1>
            <p style="text-align:center;font-size:15px;line-height:1.7;color:#444;">
              The whole team at <strong>${escapeHtml(lead.vendorName)}</strong> is wishing you
              an amazing birthday today. We hope it's full of joy and everything you deserve! 🎉
            </p>`,
          action: undefined,
        });

        const result = await sendEmail({
          to: lead.leadEmail,
          subject: `🎂 Happy Birthday from ${lead.vendorName}!`,
          html: emailHtml,
        });

        await db.insert(birthdayMessageLogsTable).values({
          vendorId: lead.vendorId,
          vendorName: lead.vendorName,
          channel: result.status === "sent" ? "lead-email" : "lead-email-failed",
          leadId: lead.leadId,
          recipientName: lead.leadName,
          recipientEmail: lead.leadEmail,
        }).onConflictDoNothing();
      }

      // ── Kanban task so vendor can track birthday outreach ─────────────────
      try {
        const todayNoon = new Date(`${utcDateStr}T12:00:00.000Z`);
        await db.insert(vendorTasksTable).values({
          vendorId:        lead.vendorId,
          title:           `🎂 Birthday: ${lead.leadName}`,
          description:     `Today is ${lead.leadName}'s birthday. Consider sending a personal offer or follow-up.`,
          status:          "todo" as const,
          priority:        "medium" as const,
          taskType:        "send_message",
          automatedAction: false,
          dueDate:         todayNoon,
          leadId:          lead.leadId,
          taskData:        JSON.stringify({
            subject: `Happy Birthday, ${lead.leadName}! 🎂`,
            message: `Hi ${lead.leadName}, wishing you a wonderful birthday from all of us at ${lead.vendorName}! 🎉`,
          }),
        } as any);
      } catch { /* non-fatal — duplicate guard or schema gap */ }

      notified++;
    } catch (err) {
      logger.error({ err, leadId: lead.leadId }, "[birthday-leads] Error");
    }
  }
  return { checked: todaysLeads.length, notified };
}

// ─── Customer birthday jobs ───────────────────────────────────────────────────

/**
 * 06:00 UTC — place birthday voice calls to registered customers who have
 * a birthday today and haven't opted out. Call is attributed to the vendor
 * they ordered from most recently (for quota purposes).
 */
async function runCustomerBirthdayCallJob(utcDateStr: string): Promise<{ checked: number; called: number }> {
  const [, monthStr, dayStr] = utcDateStr.split("-");
  const month = Number(monthStr);
  const day   = Number(dayStr);

  // Find customers with birthday today who have a phone and haven't opted out
  const todaysCustomers = await db
    .select()
    .from(customersTable)
    .where(
      sql`${customersTable.dateOfBirth} IS NOT NULL
        AND ${customersTable.voiceBirthdayOptOut} = FALSE
        AND ${customersTable.phone} IS NOT NULL
        AND ${customersTable.phone} LIKE '+%'
        AND EXTRACT(MONTH FROM ${customersTable.dateOfBirth}) = ${month}
        AND EXTRACT(DAY   FROM ${customersTable.dateOfBirth}) = ${day}`,
    );

  if (todaysCustomers.length === 0) return { checked: 0, called: 0 };
  logger.info({ count: todaysCustomers.length }, "[voice-birthday-customers] Placing calls");

  let called = 0;
  for (const customer of todaysCustomers) {
    try {
      if (await alreadyLoggedCustomerToday(customer.id, "customer-call", utcDateStr)) {
        logger.info({ customerId: customer.id }, "[voice-birthday-customers] Already called today — skipping");
        continue;
      }

      // Find the most recent vendor this customer ordered from (for quota)
      const [lastOrder] = await db
        .select({ vendorId: ordersTable.vendorId, vendorName: vendorsTable.name })
        .from(ordersTable)
        .innerJoin(vendorsTable, eq(vendorsTable.id, ordersTable.vendorId))
        .where(eq(ordersTable.customerId, customer.id))
        .orderBy(sql`${ordersTable.createdAt} DESC`)
        .limit(1);

      const vendorId   = lastOrder?.vendorId ?? null;
      const vendorName = lastOrder?.vendorName ?? "Awa Biz Suite";

      if (!vendorId) {
        // No orders yet — skip voice call (no vendor for quota)
        logger.info({ customerId: customer.id }, "[voice-birthday-customers] No vendor orders — skipping call");
        continue;
      }

      const message =
        `Hello ${customer.name}! ` +
        `${vendorName} is calling to wish you a very happy birthday! ` +
        `We hope you have a wonderful day filled with joy. Thank you for being with us! 🎉`;

      const result = await placeCall({
        to: customer.phone!,
        message,
        purpose: "birthday",
        vendorId,
      });

      await db.insert(birthdayMessageLogsTable).values({
        vendorId,
        vendorName,
        channel: result.status === "placed" ? "customer-call" : "customer-call-failed",
        customerId: customer.id,
        recipientName: customer.name,
        recipientEmail: customer.email,
      }).onConflictDoNothing();

      if (result.status === "placed") called++;
      logger.info({ customerId: customer.id, result: result.status }, "[voice-birthday-customers] Call result");
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      logger.error({ err, customerId: customer.id }, "[voice-birthday-customers] Error");
    }
  }
  return { checked: todaysCustomers.length, called };
}

/**
 * 08:00 UTC — send birthday emails to registered customers and notify each
 * vendor who has a relationship with that customer.
 */
async function runCustomerBirthdayNotifJob(utcDateStr: string): Promise<{ checked: number; notified: number }> {
  const [, monthStr, dayStr] = utcDateStr.split("-");
  const month = Number(monthStr);
  const day   = Number(dayStr);

  const todaysCustomers = await db
    .select()
    .from(customersTable)
    .where(
      sql`${customersTable.dateOfBirth} IS NOT NULL
        AND EXTRACT(MONTH FROM ${customersTable.dateOfBirth}) = ${month}
        AND EXTRACT(DAY   FROM ${customersTable.dateOfBirth}) = ${day}`,
    );

  if (todaysCustomers.length === 0) return { checked: 0, notified: 0 };
  logger.info({ count: todaysCustomers.length }, "[birthday-customers] Processing birthday customers");

  let notified = 0;
  for (const customer of todaysCustomers) {
    try {
      // ── Birthday email to the customer ──────────────────────────────────────
      if (!(await alreadyLoggedCustomerToday(customer.id, "customer-email", utcDateStr))) {
        // Find vendor for email branding (most recent)
        const [lastOrder] = await db
          .select({ vendorId: ordersTable.vendorId, vendorName: vendorsTable.name })
          .from(ordersTable)
          .innerJoin(vendorsTable, eq(vendorsTable.id, ordersTable.vendorId))
          .where(eq(ordersTable.customerId, customer.id))
          .orderBy(sql`${ordersTable.createdAt} DESC`)
          .limit(1);

        const vendorId   = lastOrder?.vendorId   ?? 0;
        const vendorName = lastOrder?.vendorName ?? "Awa Biz Suite";

        const emailHtml = wrapVendorEmail({
          bodyHtml: `
            <div style="text-align:center;margin-bottom:24px;">
              <span style="font-size:48px;">🎂</span>
            </div>
            <h1 style="text-align:center;font-size:22px;color:#1a1a1a;margin:0 0 16px;">
              Happy Birthday, ${escapeHtml(customer.name)}!
            </h1>
            <p style="text-align:center;font-size:15px;line-height:1.7;color:#444;">
              Wishing you a wonderful birthday from everyone at
              <strong>${escapeHtml(vendorName)}</strong>. 🎉<br/>
              We appreciate you being such a valued customer and hope today
              brings you everything you deserve!
            </p>`,
          action: undefined,
        });

        const result = await sendEmail({
          to: customer.email,
          subject: `🎂 Happy Birthday, ${customer.name}!`,
          html: emailHtml,
        });

        await db.insert(birthdayMessageLogsTable).values({
          vendorId: vendorId || 1,
          vendorName,
          channel: result.status === "sent" ? "customer-email" : "customer-email-failed",
          customerId: customer.id,
          recipientName: customer.name,
          recipientEmail: customer.email,
        }).onConflictDoNothing();
      }

      // ── Notify all vendors who have orders from this customer ───────────────
      const vendorOrders = await db
        .selectDistinct({ vendorId: ordersTable.vendorId, vendorName: vendorsTable.name })
        .from(ordersTable)
        .innerJoin(vendorsTable, eq(vendorsTable.id, ordersTable.vendorId))
        .where(eq(ordersTable.customerId, customer.id));

      for (const { vendorId, vendorName } of vendorOrders) {
        if (await alreadyLoggedCustomerToday(customer.id, `customer-in-app-v${vendorId}`, utcDateStr)) continue;

        await db.insert(vendorNotificationsTable).values({
          vendorId,
          type: "birthday",
          message: `🎂 ${customer.name} (a returning customer) has a birthday today! Consider sending them a special offer.`,
        }).onConflictDoNothing();

        await db.insert(birthdayMessageLogsTable).values({
          vendorId,
          vendorName,
          channel: `customer-in-app-v${vendorId}`,
          customerId: customer.id,
          recipientName: customer.name,
          recipientEmail: customer.email,
        }).onConflictDoNothing();

        // ── Kanban task so vendor can track birthday outreach ────────────────
        try {
          const todayNoon = new Date(`${utcDateStr}T12:00:00.000Z`);
          await db.insert(vendorTasksTable).values({
            vendorId,
            title:           `🎂 Birthday: ${customer.name}`,
            description:     `Today is ${customer.name}'s birthday. Send a personal offer or thank-you message.`,
            status:          "todo" as const,
            priority:        "medium" as const,
            taskType:        "send_message",
            automatedAction: false,
            dueDate:         todayNoon,
            customerId:      customer.id,
            taskData:        JSON.stringify({
              subject: `Happy Birthday, ${customer.name}! 🎂`,
              message: `Hi ${customer.name}, wishing you a wonderful birthday from all of us at ${vendorName}! 🎉`,
            }),
          } as any);
        } catch { /* non-fatal */ }
      }

      notified++;
    } catch (err) {
      logger.error({ err, customerId: customer.id }, "[birthday-customers] Error");
    }
  }
  return { checked: todaysCustomers.length, notified };
}

// ─── Scheduler wiring ─────────────────────────────────────────────────────────

/**
 * Starts the daily birthday scheduler.
 * - Checks every 5 minutes; fires when UTC hour is 06 (calls) or 08 (notifications).
 * - `lastRanDate` advances only AFTER a successful run so a DB error at 06:00
 *   UTC doesn't permanently skip that day — the next 5-min tick will retry.
 */
// Names each job's state is recorded under in job_run_status, for the admin panel.
export const BIRTHDAY_CALL_JOB_NAME = "birthday-calls";
export const BIRTHDAY_NOTIFY_JOB_NAME = "birthday-notifications";

// Module-level state so tick() can be exported for unit tests while still
// advancing the dedup guards across successive calls within the same instance.
let lastCallDate = "";   // tracks 06:00 UTC voice call run
let lastNotifDate = "";  // tracks 08:00 UTC in-app / email run

/** One tick: fire birthday jobs at their respective UTC hours. Exported for unit tests. */
export async function tick(): Promise<void> {
  const now        = new Date();
  const utcHour    = now.getUTCHours();
  const utcDateStr = now.toISOString().split("T")[0]!;

  // 06:00 UTC — voice birthday calls (vendors + leads + customers)
  if (utcHour === 6 && lastCallDate !== utcDateStr) {
    try {
      const [vc, lc, cc] = await Promise.all([
        runBirthdayCallJob(utcDateStr),
        runLeadBirthdayCallJob(utcDateStr),
        runCustomerBirthdayCallJob(utcDateStr),
      ]);
      lastCallDate = utcDateStr;
      await recordJobRun(BIRTHDAY_CALL_JOB_NAME, {
        success: true,
        checkedCount: vc.checked + lc.checked + cc.checked,
        affectedCount: vc.called + lc.called + cc.called,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordJobRun(BIRTHDAY_CALL_JOB_NAME, { success: false, error: message });
      logger.error({ err }, "[voice-birthday] Unhandled error — will retry next tick");
    }
  }

  // 08:00 UTC — in-app notifications + email (vendors + leads + customers)
  if (utcHour === 8 && lastNotifDate !== utcDateStr) {
    try {
      const [vn, ln, cn] = await Promise.all([
        runBirthdayJob(utcDateStr),
        runLeadBirthdayNotifJob(utcDateStr),
        runCustomerBirthdayNotifJob(utcDateStr),
      ]);
      lastNotifDate = utcDateStr;
      await recordJobRun(BIRTHDAY_NOTIFY_JOB_NAME, {
        success: true,
        checkedCount: vn.checked + ln.checked + cn.checked,
        affectedCount: vn.notified + ln.notified + cn.notified,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordJobRun(BIRTHDAY_NOTIFY_JOB_NAME, { success: false, error: message });
      logger.error({ err }, "[birthday] Unhandled error — will retry next tick");
    }
  }
}

export function startBirthdayScheduler(): void {
  setInterval(() => { tick().catch(() => {}); }, 5 * 60 * 1000);
  tick().catch(() => {}); // no-op outside the trigger hours

  logger.info("[birthday] Scheduler started — vendor + lead + customer calls at 06:00 UTC, notifications at 08:00 UTC");
}
