/**
 * Task Scheduler
 *
 * Every 5 minutes:
 *  1. Find tasks due within 1 hour → push + in-app reminder (once)
 *  2. Find automated tasks whose due_date has passed → execute real action
 *
 * Supported automated task types:
 *   send_message      → real email to customer / lead via SMTP
 *   call_customer     → Twilio voice call (ElevenLabs TTS)
 *   post_social_media → AI-generated caption → draft post in Social Media Manager
 *   create_strategy   → AI-written strategy → email to vendor + in-app
 *   send_invoice      → in-app notification (manual follow-up)
 *   send_product      → in-app notification (manual follow-up)
 *   general           → in-app notification
 */

import { and, eq, isNull, lte, gte, isNotNull } from "drizzle-orm";
import {
  db, vendorTasksTable, workersTable, customersTable, leadsTable,
  vendorNotificationsTable, vendorsTable, postsTable,
} from "@workspace/db";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { placeCall } from "./voice-caller";
import { sendPushToVendor } from "./push";
import { recordJobRun } from "./job-run-status";
import { logger } from "./logger";
import { openai } from "@workspace/integrations-openai-ai-server";

const JOB_NAME = "task-scheduler";
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDue(dueDate: Date): string {
  const diff = dueDate.getTime() - Date.now();
  const mins = Math.round(diff / 60_000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins}m`;
  return `in ${Math.round(mins / 60)}h`;
}

async function getVendorInfo(vendorId: number) {
  const [v] = await db
    .select({ name: vendorsTable.name, email: vendorsTable.email })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId))
    .limit(1);
  return v ?? { name: "Awa Biz Suite", email: null };
}

async function getCustomerContact(id: number) {
  const [c] = await db
    .select({ name: customersTable.name, email: customersTable.email, phone: customersTable.phone })
    .from(customersTable).where(eq(customersTable.id, id)).limit(1);
  return c ?? null;
}

async function getLeadContact(id: number) {
  const [l] = await db
    .select({ name: leadsTable.name, email: leadsTable.email, phone: leadsTable.phone })
    .from(leadsTable).where(eq(leadsTable.id, id)).limit(1);
  return l ?? null;
}

// ─── Reminder job ─────────────────────────────────────────────────────────────

async function runReminderJob(): Promise<{ reminded: number }> {
  const now = new Date();
  const in60 = new Date(now.getTime() + 60 * 60 * 1000);

  const dueSoon = await db.select().from(vendorTasksTable).where(
    and(
      isNull(vendorTasksTable.reminderSentAt),
      isNull(vendorTasksTable.completedAt),
      lte(vendorTasksTable.dueDate, in60),
      gte(vendorTasksTable.dueDate, now),
    ),
  );

  const active = dueSoon.filter(t => t.status !== "done" && t.status !== "cancelled" && t.dueDate);

  let reminded = 0;
  for (const task of active) {
    if (!task.dueDate) continue;
    try {
      const workerNote = task.workerId ? ` (assigned to worker #${task.workerId})` : "";
      const msg = `⏰ Task due soon: "${task.title}" — ${formatDue(task.dueDate)}${workerNote}`;
      await Promise.all([
        db.insert(vendorNotificationsTable).values({ vendorId: task.vendorId, type: "general", message: msg }),
        sendPushToVendor(task.vendorId, "Task Due Soon", task.title, { type: "task_reminder", taskId: task.id }),
      ]);
      await db.update(vendorTasksTable).set({ reminderSentAt: new Date() }).where(eq(vendorTasksTable.id, task.id));
      reminded++;
    } catch (err) {
      logger.error({ err, taskId: task.id }, "[task-scheduler] reminder failed");
    }
  }
  return { reminded };
}

// ─── Automation job ───────────────────────────────────────────────────────────

async function runAutomationJob(): Promise<{ executed: number }> {
  const now = new Date();

  const readyTasks = await db.select().from(vendorTasksTable).where(
    and(
      eq(vendorTasksTable.automatedAction, true),
      isNull(vendorTasksTable.actionExecutedAt),
      lte(vendorTasksTable.dueDate, now),
      isNotNull(vendorTasksTable.dueDate),
    ),
  );

  const active = readyTasks.filter(t => t.status !== "done" && t.status !== "cancelled");

  let executed = 0;
  for (const task of active) {
    try {
      let actionDesc = "";
      const data: Record<string, any> = task.taskData ? JSON.parse(task.taskData) : {};

      // ── send_message → real email ─────────────────────────────────────────
      if (task.taskType === "send_message") {
        const contact = task.customerId
          ? await getCustomerContact(task.customerId)
          : task.leadId ? await getLeadContact(task.leadId) : null;

        const recipientEmail = contact?.email ?? null;
        const recipientName  = contact?.name  ?? "Valued Customer";
        const message  = data.message ?? task.description ?? task.title;
        const subject  = data.subject ?? task.title;

        if (recipientEmail) {
          const vendor     = await getVendorInfo(task.vendorId);
          const emailHtml  = wrapVendorEmail({
            bodyHtml: `
              <p style="font-size:15px;line-height:1.7;color:#444;margin:0 0 12px;">
                Hi ${escapeHtml(recipientName)},
              </p>
              <p style="font-size:15px;line-height:1.7;color:#444;margin:0 0 12px;">
                ${escapeHtml(message)}
              </p>
              <p style="font-size:13px;color:#888;margin:0;">
                — ${escapeHtml(vendor.name)}
              </p>`,
          });
          const result = await sendEmail({ to: recipientEmail, subject, html: emailHtml });
          actionDesc = `email → ${recipientName} (${result.status})`;
          await db.insert(vendorNotificationsTable).values({
            vendorId: task.vendorId, type: "general",
            message: `📧 Task "${task.title}" — email to ${recipientName}: ${result.status}`,
          });
        } else {
          actionDesc = "send_message (no email address found)";
          await db.insert(vendorNotificationsTable).values({
            vendorId: task.vendorId, type: "general",
            message: `📨 Task "${task.title}" — no email address found for recipient`,
          });
        }

      // ── call_customer → Twilio voice call ─────────────────────────────────
      } else if (task.taskType === "call_customer") {
        const contact = task.customerId
          ? await getCustomerContact(task.customerId)
          : task.leadId ? await getLeadContact(task.leadId) : null;

        const phone         = contact?.phone ?? null;
        const recipientName = contact?.name  ?? "Customer";
        const script = data.script ?? task.description ?? task.title;

        if (phone) {
          const result = await placeCall({
            to: phone,
            message: script,
            purpose: `task:${task.id}`,
            vendorId: task.vendorId,
          });
          actionDesc = `call → ${recipientName} (${result.status})`;
          await db.insert(vendorNotificationsTable).values({
            vendorId: task.vendorId, type: "general",
            message: `📞 Task "${task.title}" — call to ${recipientName}: ${result.status}`,
          });
        } else {
          actionDesc = "call_customer (no phone number)";
          await db.insert(vendorNotificationsTable).values({
            vendorId: task.vendorId, type: "general",
            message: `📞 Task "${task.title}" — no phone number found for ${recipientName}`,
          });
        }

      // ── post_social_media → AI caption → draft post ───────────────────────
      } else if (task.taskType === "post_social_media") {
        const topic     = data.topic ?? task.description ?? task.title;
        const platforms: string[] = Array.isArray(data.platforms) && data.platforms.length
          ? data.platforms
          : ["instagram", "facebook"];

        // Fetch vendor links to weave into the caption naturally
        const { getVendorLinks, linksSystemContext } = await import("./vendor-links");
        const vendorLinks = await getVendorLinks(task.vendorId).catch(() => null);

        let caption = topic;
        try {
          const aiRes = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are a professional social media content creator. Write an engaging, concise post " +
                  "for a business audience. Include relevant emojis. Keep it under 280 characters." +
                  linksSystemContext(vendorLinks),
              },
              { role: "user", content: `Write a social media post about: ${topic}` },
            ],
            max_tokens: 300,
          });
          caption = aiRes.choices[0]?.message?.content?.trim() ?? topic;
        } catch (aiErr) {
          logger.warn({ aiErr, taskId: task.id }, "[task-scheduler] AI caption failed — using topic as caption");
        }

        const [post] = await db.insert(postsTable).values({
          vendorId:  task.vendorId,
          caption,
          platforms,
          status:    "draft",
          mediaType: null,
        } as any).returning({ id: postsTable.id });

        actionDesc = `social draft created (id=${post?.id})`;
        await db.insert(vendorNotificationsTable).values({
          vendorId: task.vendorId, type: "general",
          message:  `📱 AI post drafted for "${topic.slice(0, 60)}" — review and publish in Social Media Manager.`,
        });

      // ── create_strategy → AI strategy → email vendor ──────────────────────
      } else if (task.taskType === "create_strategy") {
        const problem = data.problem ?? task.description ?? task.title;
        const vendor  = await getVendorInfo(task.vendorId);

        let strategy = "Strategy could not be generated — please try again.";
        try {
          const aiRes = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are a senior business strategist. Produce a structured, actionable strategy. " +
                  "Use these sections: Executive Summary | Root Cause Analysis | " +
                  "3 Strategic Options | Recommended Approach | KPIs | 30-60-90 Day Timeline. " +
                  "Be specific and practical.",
              },
              { role: "user", content: `Business problem: ${problem}` },
            ],
            max_tokens: 1500,
          });
          strategy = aiRes.choices[0]?.message?.content?.trim() ?? strategy;
        } catch (aiErr) {
          logger.warn({ aiErr, taskId: task.id }, "[task-scheduler] AI strategy failed");
        }

        if (vendor.email) {
          const html = wrapVendorEmail({
            bodyHtml: `
              <h2 style="color:#1a1a1a;margin:0 0 8px;font-size:18px;">🧠 AI Business Strategy</h2>
              <p style="color:#666;font-size:13px;margin:0 0 16px;"><strong>Problem:</strong> ${escapeHtml(problem)}</p>
              <div style="background:#f8f9ff;border-left:4px solid #6366f1;padding:16px 20px;border-radius:4px;">
                <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.8;color:#333;margin:0;">${escapeHtml(strategy)}</pre>
              </div>`,
          });
          await sendEmail({
            to:      vendor.email,
            subject: `🧠 AI Strategy: ${problem.slice(0, 70)}`,
            html,
          });
        }

        await db.insert(vendorNotificationsTable).values({
          vendorId: task.vendorId, type: "general",
          message:  `🧠 AI Strategy generated for "${problem.slice(0, 80)}" — check your email for the full plan.`,
        });
        actionDesc = `strategy for: ${problem.slice(0, 50)}`;

      // ── send_invoice / send_product / general → vendor notification ────────
      } else if (task.taskType === "send_invoice" && data.invoiceId) {
        await db.insert(vendorNotificationsTable).values({
          vendorId: task.vendorId, type: "general",
          message: `📄 Auto-send invoice #${data.invoiceId} triggered by task "${task.title}"`,
        });
        actionDesc = `invoice #${data.invoiceId}`;
      } else if (task.taskType === "send_product" && data.productId) {
        await db.insert(vendorNotificationsTable).values({
          vendorId: task.vendorId, type: "general",
          message: `🛍 Auto-share product #${data.productId} triggered by task "${task.title}"`,
        });
        actionDesc = `product #${data.productId}`;
      } else {
        await db.insert(vendorNotificationsTable).values({
          vendorId: task.vendorId, type: "general",
          message: `⚡ Automated task "${task.title}" executed`,
        });
        actionDesc = task.taskType;
      }

      // ── Mark executed ──────────────────────────────────────────────────────
      await db.update(vendorTasksTable)
        .set({ actionExecutedAt: new Date(), status: "done", completedAt: new Date() })
        .where(eq(vendorTasksTable.id, task.id));

      await sendPushToVendor(task.vendorId, "Automated Task Executed",
        `"${task.title}" ran automatically`, { type: "task_auto_executed", taskId: task.id });

      logger.info({ taskId: task.id, taskType: task.taskType, actionDesc }, "[task-scheduler] automation executed");
      executed++;
    } catch (err) {
      logger.error({ err, taskId: task.id }, "[task-scheduler] automation failed");
    }
  }
  return { executed };
}

// ─── Tick ──────────────────────────────────────────────────────────────────────

async function tick() {
  try {
    const [{ reminded }, { executed }] = await Promise.all([runReminderJob(), runAutomationJob()]);
    await recordJobRun(JOB_NAME, { success: true });
    if (reminded > 0 || executed > 0) {
      logger.info({ reminded, executed }, `[${JOB_NAME}] Tick complete`);
    }
  } catch (err) {
    logger.error({ err }, `[${JOB_NAME}] Tick failed`);
    await recordJobRun(JOB_NAME, { success: false, error: String(err) }).catch(() => {});
  }
}

// ─── Start ─────────────────────────────────────────────────────────────────────

export function startTaskScheduler() {
  logger.info(`[${JOB_NAME}] Scheduler started — checks every 5 minutes`);
  tick();
  setInterval(tick, INTERVAL_MS);
}
