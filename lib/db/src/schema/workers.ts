import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";
import { branchesTable } from "./branches";

/**
 * A staff member employed by a vendor's organization, optionally assigned to
 * one branch. Mirrors the Awajimaa Spring Boot WorkerEntity: name/contact,
 * a free-text role/department, and a status the vendor manages (not a
 * generic resource status — this is specifically about employment state).
 */
export const workersTable = pgTable("workers", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role"), // free-text department/role, e.g. "Sales", "Warehouse"
  status: text("status").notNull().default("active"), // "active" | "inactive" | "suspended"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorkerSchema = createInsertSchema(workersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Worker = typeof workersTable.$inferSelect;
