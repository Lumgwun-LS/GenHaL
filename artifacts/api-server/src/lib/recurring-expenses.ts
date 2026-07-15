/**
 * Auto-creates the next occurrence of a recurring expense (rent, software
 * subscriptions, payroll, etc.) so vendors don't have to re-enter the same
 * expense every period.
 *
 * A recurring expense is just an ordinary `expenses` row with
 * `isRecurring = true`, a `recurringFrequency`, and a `nextOccurrenceDate` —
 * it stays in the table as a standing template. This job finds templates
 * whose `nextOccurrenceDate` has arrived, and for each one:
 *  1. Atomically claims that occurrence by advancing `nextOccurrenceDate` to
 *     the following period, conditioned on it still matching the value we
 *     just read (`eq(nextOccurrenceDate, current)`). This mirrors the
 *     claim-before-act pattern in post-reminders.ts: if two ticks overlap or
 *     the server restarts mid-tick, only one can win the update, so exactly
 *     one occurrence row gets created per due date.
 *  2. Inserts a new (non-recurring) expense row dated at the occurrence
 *     date, copying category/amount/branch/worker/etc. from the template,
 *     with `recurringParentId` pointing back at the template so the UI/CSV
 *     export can show it was auto-generated.
 *
 * A single tick can catch up several missed periods in a row (e.g. after
 * the job was down for a while), bounded by MAX_CATCHUP_OCCURRENCES per
 * template so one long-neglected template can't dominate a tick.
 */
import { and, eq, lte } from "drizzle-orm";
import { db, expensesTable, type RecurringExpenseFrequency } from "@workspace/db";
import { logger } from "./logger";
import { recordJobRun } from "./job-run-status";

export const RECURRING_EXPENSES_JOB_NAME = "recurring-expenses";

// Caps how many missed periods a single template can generate in one tick,
// so a template left un-run for a long time can't flood the expenses table.
const MAX_CATCHUP_OCCURRENCES = 12;

/** Advances `date` by one cadence period. Exported for reuse when a vendor first marks an expense recurring. */
export function computeNextOccurrenceDate(date: Date, frequency: RecurringExpenseFrequency): Date {
  const next = new Date(date);
  switch (frequency) {
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case "yearly":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
  }
  return next;
}

/**
 * Generates due occurrences for every recurring-expense template. Exported
 * (in addition to being used internally by tick/startRecurringExpenseScheduler)
 * so tests can exercise it directly without waiting for setInterval.
 */
export async function generateDueRecurringExpenses(): Promise<{ checked: number; created: number }> {
  const now = new Date();

  const templates = await db
    .select()
    .from(expensesTable)
    .where(and(eq(expensesTable.isRecurring, true), lte(expensesTable.nextOccurrenceDate, now)));

  let created = 0;
  for (const template of templates) {
    const frequency = template.recurringFrequency as RecurringExpenseFrequency | null;
    if (!frequency || !template.nextOccurrenceDate) continue;

    let occurrenceDue: Date | null = template.nextOccurrenceDate;
    let iterations = 0;
    while (occurrenceDue && occurrenceDue.getTime() <= now.getTime() && iterations < MAX_CATCHUP_OCCURRENCES) {
      iterations++;
      const dueDate = occurrenceDue;
      const nextDate = computeNextOccurrenceDate(dueDate, frequency);

      try {
        // Claim the occurrence and create it in the same transaction — if
        // the insert fails for any reason, the claim (nextOccurrenceDate
        // advance) is rolled back with it, so a due period is never
        // silently skipped by advancing past it without actually recording
        // an expense for it.
        const claimedAndCreated = await db.transaction(async (tx) => {
          // Only succeeds if the template's nextOccurrenceDate still matches
          // what we just read — guards against a concurrent tick/instance
          // claiming the same occurrence.
          const [claimed] = await tx
            .update(expensesTable)
            .set({ nextOccurrenceDate: nextDate })
            .where(and(eq(expensesTable.id, template.id), eq(expensesTable.isRecurring, true), eq(expensesTable.nextOccurrenceDate, dueDate)))
            .returning({ id: expensesTable.id });

          if (!claimed) return false;

          await tx.insert(expensesTable).values({
            vendorId: template.vendorId,
            branchId: template.branchId,
            workerId: template.workerId,
            category: template.category,
            description: template.description,
            amount: template.amount,
            currency: template.currency,
            expenseDate: dueDate,
            isRecurring: false,
            recurringParentId: template.id,
          });
          return true;
        });

        if (!claimedAndCreated) {
          // Another tick/instance already claimed it — stop catching up on this template.
          break;
        }

        created++;
        logger.info({ templateId: template.id, occurrenceDate: dueDate.toISOString() }, "[recurring-expenses] Generated recurring expense occurrence");
      } catch (err) {
        logger.error({ err, templateId: template.id }, "[recurring-expenses] Failed to generate recurring expense occurrence");
        break;
      }

      occurrenceDue = nextDate;
    }
  }

  return { checked: templates.length, created };
}

async function tick(): Promise<void> {
  try {
    const { checked, created } = await generateDueRecurringExpenses();
    if (created > 0) logger.info({ checked, created }, "[recurring-expenses] Created recurring expense occurrences");
    await recordJobRun(RECURRING_EXPENSES_JOB_NAME, { success: true, checkedCount: checked, affectedCount: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordJobRun(RECURRING_EXPENSES_JOB_NAME, { success: false, error: message });
    throw err;
  }
}

/** Starts the recurring-expense generator: checks every hour for templates due to fire. */
export function startRecurringExpenseScheduler(): void {
  setInterval(() => { tick().catch(() => {}); }, 60 * 60 * 1000);
  tick().catch(() => {}); // run once on boot too, in case an occurrence is already overdue
  logger.info("[recurring-expenses] Recurring expense scheduler started — checks every hour");
}
