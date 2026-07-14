/**
 * Pending-item reminder scheduler.
 *
 * Nudges a vendor by email when they have:
 *  - a scheduled social post whose scheduledAt has passed without publishing, or
 *  - a payment stuck in status 'pending' for more than 24h.
 *
 * Each email includes an action button linking straight to the item on
 * VendorHub. Idempotency mirrors the birthday scheduler: a row is reserved
 * in `pending_reminder_logs` via `onConflictDoNothing` (unique on item_type +
 * item_id) BEFORE sending, so a vendor gets exactly one reminder per pending
 * item — not one every time this job ticks — even across restarts/races.
 */
import { db } from "@workspace/db";
import { postsTable, paymentsTable, vendorsTable, pendingReminderLogsTable } from "@workspace/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";
import { logger } from "./logger";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { recordJobRun } from "./job-run-status";

const PAYMENT_PENDING_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

// Name this tick's state is recorded under in job_run_status, for the admin panel.
export const PENDING_REMINDERS_JOB_NAME = "pending-reminders";

function getPublicDomain(): string | null {
  return process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || null;
}

function appUrl(path: string): string | null {
  const domain = getPublicDomain();
  if (!domain) return null;
  return `https://${domain}${path}`;
}

async function reserveReminder(itemType: "post" | "payment", itemId: number, vendorId: number): Promise<boolean> {
  const [reserved] = await db
    .insert(pendingReminderLogsTable)
    .values({ vendorId, itemType, itemId })
    .onConflictDoNothing()
    .returning();
  return Boolean(reserved);
}

async function remindPendingPosts(): Promise<void> {
  const overdue = await db
    .select({ post: postsTable, vendor: vendorsTable })
    .from(postsTable)
    .innerJoin(vendorsTable, eq(postsTable.vendorId, vendorsTable.id))
    .where(and(eq(postsTable.status, "scheduled"), lt(postsTable.scheduledAt, sql`now()`)));

  for (const { post, vendor } of overdue) {
    if (!vendor.email) continue;
    try {
      if (!(await reserveReminder("post", post.id, vendor.id))) continue; // already reminded

      const link = appUrl("/social") ?? "#";
      const html = wrapVendorEmail({
        bodyHtml: `
          <h1 style="text-align: center; font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">A scheduled post needs your attention</h1>
          <p style="font-size: 14px; line-height: 1.6; color: #444;">
            Hi ${escapeHtml(vendor.name)}, your post "<em>${escapeHtml(truncate(post.caption, 80))}</em>" was scheduled for
            ${post.scheduledAt ? escapeHtml(new Date(post.scheduledAt).toLocaleString()) : "earlier"} but hasn't gone out yet.
            Take a look and publish it when you're ready.
          </p>`,
        action: { label: "Review your post", url: `${link}?highlight=${post.id}` },
      });

      const result = await sendEmail({ to: vendor.email, subject: "A scheduled post is waiting on you", html });
      if (result.status !== "sent") {
        logger.warn({ vendorId: vendor.id, postId: post.id, reason: result.error }, "[pending-reminders] Post reminder email did not send");
      }
    } catch (err) {
      logger.error({ err, postId: post.id }, "[pending-reminders] Failed to process pending post reminder");
    }
  }
}

async function remindPendingPayments(): Promise<void> {
  const cutoff = new Date(Date.now() - PAYMENT_PENDING_THRESHOLD_MS);
  const stale = await db
    .select({ payment: paymentsTable, vendor: vendorsTable })
    .from(paymentsTable)
    .innerJoin(vendorsTable, eq(paymentsTable.vendorId, vendorsTable.id))
    .where(and(eq(paymentsTable.status, "pending"), lt(paymentsTable.createdAt, cutoff)));

  for (const { payment, vendor } of stale) {
    if (!vendor.email) continue;
    try {
      if (!(await reserveReminder("payment", payment.id, vendor.id))) continue; // already reminded

      const link = appUrl("/payments") ?? "#";
      const html = wrapVendorEmail({
        bodyHtml: `
          <h1 style="text-align: center; font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">A payment is still pending</h1>
          <p style="font-size: 14px; line-height: 1.6; color: #444;">
            Hi ${escapeHtml(vendor.name)}, a payment of ${escapeHtml(payment.currency)} ${escapeHtml(String(payment.amount))} has been pending since
            ${escapeHtml(new Date(payment.createdAt).toLocaleString())}. If you started a checkout and it didn't complete,
            you can pick up where you left off.
          </p>`,
        action: { label: "View payment", url: `${link}?highlight=${payment.id}` },
      });

      const result = await sendEmail({ to: vendor.email, subject: "Your pending payment needs attention", html });
      if (result.status !== "sent") {
        logger.warn({ vendorId: vendor.id, paymentId: payment.id, reason: result.error }, "[pending-reminders] Payment reminder email did not send");
      }
    } catch (err) {
      logger.error({ err, paymentId: payment.id }, "[pending-reminders] Failed to process pending payment reminder");
    }
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Checks every 30 minutes for pending posts/payments that need a reminder email. */
export function startPendingReminderScheduler(): void {
  async function tick() {
    const errors: string[] = [];
    try {
      await remindPendingPosts();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`post reminder pass: ${message}`);
      logger.error({ err }, "[pending-reminders] Unhandled error in post reminder pass");
    }
    try {
      await remindPendingPayments();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`payment reminder pass: ${message}`);
      logger.error({ err }, "[pending-reminders] Unhandled error in payment reminder pass");
    }

    // Recorded even on partial failure so a schema-drift crash on the very
    // first tick (before any admin would otherwise notice) shows up in the
    // admin panel's Background Jobs list, not just a log line no one is
    // watching (see job-run-status.ts).
    await recordJobRun(PENDING_REMINDERS_JOB_NAME, {
      success: errors.length === 0,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    });
  }

  setInterval(() => { tick().catch(() => {}); }, 30 * 60 * 1000);
  tick().catch(() => {});

  logger.info("[pending-reminders] Scheduler started — checks every 30 minutes");
}
