import { pgTable, text, serial, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";
import { branchesTable } from "./branches";
import { workersTable } from "./workers";

// Supported recurrence cadences for `recurringFrequency`. Kept as a plain
// string column (not a pg enum) to match the loosely-typed `category`
// column style already used on this table.
export const RECURRING_EXPENSE_FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export type RecurringExpenseFrequency = (typeof RECURRING_EXPENSE_FREQUENCIES)[number];

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  workerId: integer("worker_id").references(() => workersTable.id, { onDelete: "set null" }),
  category: text("category").notNull(), // e.g. rent, supplies, payroll, utilities, marketing, other
  description: text("description"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  expenseDate: timestamp("expense_date", { withTimezone: true }).notNull().defaultNow(),
  // Recurring-expense template fields. `isRecurring` marks this row as a
  // standing template the background job (recurring-expenses.ts) keeps
  // generating fresh occurrences from; `nextOccurrenceDate` is the next date
  // it's due to fire, advanced atomically by that job. Non-template
  // (one-off, and auto-generated occurrence) rows leave these at their
  // defaults.
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurringFrequency: text("recurring_frequency"), // one of RECURRING_EXPENSE_FREQUENCIES when isRecurring
  nextOccurrenceDate: timestamp("next_occurrence_date", { withTimezone: true }),
  // Set on an auto-generated occurrence row, pointing back at the recurring
  // template it was generated from — lets the UI/exports distinguish
  // "generated from a recurring template" from a genuine one-off entry.
  recurringParentId: integer("recurring_parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
