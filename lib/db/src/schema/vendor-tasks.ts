import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";
import { branchesTable } from "./branches";
import { workersTable } from "./workers";
import { customersTable } from "./customers";
import { leadsTable } from "./leads";

export const vendorTasksTable = pgTable("vendor_tasks", {
  id:                   serial("id").primaryKey(),
  vendorId:             integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  title:                text("title").notNull(),
  description:          text("description"),
  status:               text("status").notNull().default("todo"),    // todo | in_progress | done | cancelled
  priority:             text("priority").notNull().default("medium"), // low | medium | high | urgent
  dueDate:              timestamp("due_date", { withTimezone: true }),
  imageUrl:             text("image_url"),
  videoUrl:             text("video_url"),
  branchId:             integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  workerId:             integer("worker_id").references(() => workersTable.id, { onDelete: "set null" }),
  customerId:           integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  leadId:               integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  taskType:             text("task_type").notNull().default("general"), // general | call_customer | send_message | send_invoice | send_product
  taskData:             text("task_data"),    // JSON string
  automatedAction:      boolean("automated_action").notNull().default(false),
  reminderSentAt:       timestamp("reminder_sent_at", { withTimezone: true }),
  actionExecutedAt:     timestamp("action_executed_at", { withTimezone: true }),
  completedAt:          timestamp("completed_at", { withTimezone: true }),
  completedByClerkId:   text("completed_by_clerk_id"),
  notes:                text("notes"),
  createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type VendorTask = typeof vendorTasksTable.$inferSelect;
