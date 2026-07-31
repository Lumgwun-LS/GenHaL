/**
 * Task Scheduler
 *
 * Every 5 minutes:
 *  1. Find tasks due within 1 hour that haven't had a reminder sent → push + in-app
 *  2. Find automated tasks whose due_date has passed and action not yet executed → run action
 */

import { and, eq, isNull, lte, gte, isNotNull } from "drizzle-orm";
import { db, vendorTasksTable, workersTable, customersTable, leadsTable, vendorNotificationsTable } from "@workspace/db";
import { sendPushToVendor } from "./push";
import { recordJobRun } from "./job-run-status";

const JOB_NAME = "task-scheduler";
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDue(dueDate: Date): string {
  const now = Date.now();
  const diff = dueDate.getTime() - now;
  const mins = Math.round(diff / 60000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins}m`;
  return `in ${Math.round(mins / 60)}h`;
}

// ─── Reminder job ─────────────────────────────────────────────────────────────

async function runReminderJob(): Promise<{ reminded: number }> {
  const now = new Date();
  const in60 = new Date(now.getTime() + 60 * 60 * 1000);

  // Tasks due within 1h, not yet completed/cancelled, no reminder yet
  const dueSoon = await db.select().from(vendorTasksTable)
    .where(and(
      isNull(vendorTasksTable.reminderSentAt),
      isNull(vendorTasksTable.completedAt),
      lte(vendorTasksTable.dueDate, in60),
      gte(vendorTasksTable.dueDate, now),
    ));

  // Filter: exclude done/cancelled
  const active = dueSoon.filter(t => t.status !== "done" && t.status !== "cancelled" && t.dueDate);

  let reminded = 0;
  for (const task of active) {
    if (!task.dueDate) continue;
    try {
      const workerNote = task.workerId
        ? ` (assigned to worker #${task.workerId})`
        : "";
      const msg = `⏰ Task due soon: "${task.title}" — ${formatDue(task.dueDate)}${workerNote}`;
      await Promise.all([
        db.insert(vendorNotificationsTable).values({
          vendorId: task.vendorId, type: "general", message: msg,
        }),
        sendPushToVendor(task.vendorId, "Task Due Soon", task.title, {
          type: "task_reminder", taskId: task.id,
        }),
      ]);
      await db.update(vendorTasksTable)
        .set({ reminderSentAt: new Date() })
        .where(eq(vendorTasksTable.id, task.id));
      reminded++;
    } catch (err) {
      console.error(`[task-scheduler] reminder failed for task ${task.id}:`, err);
    }
  }
  return { reminded };
}

// ─── Automation job ───────────────────────────────────────────────────────────

async function runAutomationJob(): Promise<{ executed: number }> {
  const now = new Date();

  const readyTasks = await db.select().from(vendorTasksTable)
    .where(and(
      eq(vendorTasksTable.automatedAction, true),
      isNull(vendorTasksTable.actionExecutedAt),
      lte(vendorTasksTable.dueDate, now),
      isNotNull(vendorTasksTable.dueDate),
    ));

  const active = readyTasks.filter(t => t.status !== "done" && t.status !== "cancelled");

  let executed = 0;
  for (const task of active) {
    try {
      let actionDesc = "";
      const data = task.taskData ? JSON.parse(task.taskData) : {};

      if (task.taskType === "send_message" && (task.customerId || task.leadId)) {
        // Send an in-app or push notification to the customer
        if (task.customerId) {
          const [customer] = await db.select({ id: customersTable.id, name: customersTable.name })
            .from(customersTable).where(eq(customersTable.id, task.customerId)).limit(1);
          if (customer) {
            await db.insert(vendorNotificationsTable).values({
              vendorId: task.vendorId, type: "general",
              message: `📨 Auto-message sent to customer ${customer.name}: "${data.message ?? task.title}"`,
            });
            actionDesc = `message → customer #${task.customerId}`;
          }
        } else if (task.leadId) {
          const [lead] = await db.select({ id: leadsTable.id, name: leadsTable.name })
            .from(leadsTable).where(eq(leadsTable.id, task.leadId)).limit(1);
          if (lead) {
            await db.insert(vendorNotificationsTable).values({
              vendorId: task.vendorId, type: "general",
              message: `📨 Auto-message queued for lead ${lead.name}: "${data.message ?? task.title}"`,
            });
            actionDesc = `message → lead #${task.leadId}`;
          }
        }
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
        // generic — just log
        actionDesc = task.taskType;
      }

      // Mark executed
      await db.update(vendorTasksTable)
        .set({ actionExecutedAt: new Date(), status: "done", completedAt: new Date() })
        .where(eq(vendorTasksTable.id, task.id));

      await sendPushToVendor(task.vendorId, "Automated Task Executed",
        `"${task.title}" ran automatically (${actionDesc})`, {
          type: "task_auto_executed", taskId: task.id,
        });

      executed++;
    } catch (err) {
      console.error(`[task-scheduler] automation failed for task ${task.id}:`, err);
    }
  }
  return { executed };
}

// ─── Tick ──────────────────────────────────────────────────────────────────────

async function tick() {
  try {
    const [{ reminded }, { executed }] = await Promise.all([
      runReminderJob(),
      runAutomationJob(),
    ]);
    await recordJobRun(JOB_NAME, { success: true });
    if (reminded > 0 || executed > 0) {
      console.info(`[${JOB_NAME}] Tick complete`, { reminded, executed });
    }
  } catch (err) {
    console.error(`[${JOB_NAME}] Tick failed:`, err);
    await recordJobRun(JOB_NAME, { success: false, error: String(err) }).catch(() => {});
  }
}

// ─── Start ─────────────────────────────────────────────────────────────────────

export function startTaskScheduler() {
  console.info(`[${JOB_NAME}] Scheduler started — checks every 5 minutes`);
  tick();
  setInterval(tick, INTERVAL_MS);
}
