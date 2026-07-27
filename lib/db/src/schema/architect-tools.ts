import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

export const architectProjectsTable = pgTable("architect_projects", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  clientName: text("client_name"),
  clientEmail: text("client_email"),
  clientPhone: text("client_phone"),
  description: text("description"),
  projectType: text("project_type").default("residential"), // residential, commercial, renovation, landscape, mixed_use
  status: text("status").notNull().default("planning"), // planning, design, permits, construction, completed, on_hold
  budget: text("budget"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  address: text("address"),
  city: text("city"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projectMilestonesTable = pgTable("project_milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => architectProjectsTable.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, delayed
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const drawingRevisionsTable = pgTable("drawing_revisions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => architectProjectsTable.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  drawingName: text("drawing_name").notNull(),
  version: text("version").notNull().default("R1"),
  description: text("description"),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  status: text("status").notNull().default("draft"), // draft, for_review, approved, superseded
  reviewerNotes: text("reviewer_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contractorTasksTable = pgTable("contractor_tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => architectProjectsTable.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  contractorName: text("contractor_name").notNull(),
  contractorEmail: text("contractor_email"),
  contractorPhone: text("contractor_phone"),
  taskName: text("task_name").notNull(),
  description: text("description"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: text("status").notNull().default("not_started"), // not_started, in_progress, completed, delayed
  cost: text("cost"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const floorPlansTable = pgTable("floor_plans", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => architectProjectsTable.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  data: text("data"), // JSON: { shapes, gridSize, canvasWidth, canvasHeight, unit }
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
