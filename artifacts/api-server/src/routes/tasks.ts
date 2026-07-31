import { Router } from "express";
import { eq, and, desc, isNull, or } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db, vendorTasksTable, branchesTable, workersTable,
  customersTable, leadsTable, vendorsTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { sendPushToVendor } from "../lib/push";
import { vendorNotificationsTable } from "@workspace/db";

const router = Router();

// ─── Auth helper ─────────────────────────────────────────────────────────────
async function resolveAuthedVendor(clerkUserId: string) {
  const [vendor] = await db.select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, clerkUserId))
    .limit(1);
  return vendor ?? null;
}

// ─── Serialise ────────────────────────────────────────────────────────────────
function serializeTask(t: typeof vendorTasksTable.$inferSelect) {
  return {
    ...t,
    dueDate: t.dueDate?.toISOString() ?? null,
    reminderSentAt: t.reminderSentAt?.toISOString() ?? null,
    actionExecutedAt: t.actionExecutedAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

// ─── Schemas ─────────────────────────────────────────────────────────────────
const CreateTaskBody = z.object({
  title:           z.string().min(1).max(200),
  description:     z.string().max(5000).optional(),
  status:          z.enum(["todo","in_progress","done","cancelled"]).optional(),
  priority:        z.enum(["low","medium","high","urgent"]).optional(),
  dueDate:         z.string().optional(),
  imageUrl:        z.string().url().optional(),
  videoUrl:        z.string().url().optional(),
  branchId:        z.number().int().positive().optional(),
  workerId:        z.number().int().positive().optional(),
  customerId:      z.number().int().positive().optional(),
  leadId:          z.number().int().positive().optional(),
  taskType:        z.enum(["general","call_customer","send_message","send_invoice","send_product"]).optional(),
  taskData:        z.record(z.string(), z.unknown()).optional(),
  automatedAction: z.boolean().optional(),
  notes:           z.string().max(5000).optional(),
});

const UpdateTaskBody = CreateTaskBody.partial();

const ListTasksQuery = z.object({
  status:   z.string().optional(),
  workerId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  priority: z.string().optional(),
});

// ─── GET /tasks ───────────────────────────────────────────────────────────────
router.get("/tasks", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const vendor = await resolveAuthedVendor(userId);
  if (!vendor) return res.status(403).json({ error: "Vendor not found" });

  const q = ListTasksQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "Bad query" });

  const conditions = [eq(vendorTasksTable.vendorId, vendor.id)];
  if (q.data.status)   conditions.push(eq(vendorTasksTable.status, q.data.status));
  if (q.data.workerId) conditions.push(eq(vendorTasksTable.workerId, q.data.workerId));
  if (q.data.branchId) conditions.push(eq(vendorTasksTable.branchId, q.data.branchId));
  if (q.data.priority) conditions.push(eq(vendorTasksTable.priority, q.data.priority));

  const tasks = await db.select().from(vendorTasksTable)
    .where(and(...conditions))
    .orderBy(desc(vendorTasksTable.createdAt));

  return res.json(tasks.map(serializeTask));
});

// ─── POST /tasks ──────────────────────────────────────────────────────────────
router.post("/tasks", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const vendor = await resolveAuthedVendor(userId);
  if (!vendor) return res.status(403).json({ error: "Vendor not found" });

  const body = CreateTaskBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues });

  const { taskData, dueDate, ...rest } = body.data;
  const [task] = await db.insert(vendorTasksTable).values({
    vendorId: vendor.id,
    ...rest,
    dueDate:  dueDate ? new Date(dueDate) : undefined,
    taskData: taskData ? JSON.stringify(taskData) : undefined,
  }).returning();

  // Notify vendor immediately on creation
  try {
    await db.insert(vendorNotificationsTable).values({
      vendorId: vendor.id, type: "general",
      message: `📋 New task created: "${task.title}"`,
    });
    await sendPushToVendor(vendor.id, "New Task Created", task.title, {
      type: "task_created", taskId: task.id,
    });
  } catch { /* non-fatal */ }

  // If a worker is assigned, log an assignment notification
  if (task.workerId) {
    const [worker] = await db.select({ name: workersTable.name })
      .from(workersTable).where(eq(workersTable.id, task.workerId)).limit(1);
    if (worker) {
      try {
        await db.insert(vendorNotificationsTable).values({
          vendorId: vendor.id, type: "general",
          message: `🗂 Task "${task.title}" assigned to ${worker.name}`,
        });
      } catch { /* non-fatal */ }
    }
  }

  return res.status(201).json(serializeTask(task));
});

// ─── GET /tasks/:id ───────────────────────────────────────────────────────────
router.get("/tasks/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const vendor = await resolveAuthedVendor(userId);
  if (!vendor) return res.status(403).json({ error: "Vendor not found" });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [task] = await db.select().from(vendorTasksTable)
    .where(and(eq(vendorTasksTable.id, id), eq(vendorTasksTable.vendorId, vendor.id)))
    .limit(1);
  if (!task) return res.status(404).json({ error: "Not found" });

  return res.json(serializeTask(task));
});

// ─── PATCH /tasks/:id ─────────────────────────────────────────────────────────
router.patch("/tasks/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const vendor = await resolveAuthedVendor(userId);
  if (!vendor) return res.status(403).json({ error: "Vendor not found" });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const body = UpdateTaskBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues });

  const [existing] = await db.select().from(vendorTasksTable)
    .where(and(eq(vendorTasksTable.id, id), eq(vendorTasksTable.vendorId, vendor.id)))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { taskData, dueDate, status, ...rest } = body.data;
  const updates: Partial<typeof vendorTasksTable.$inferInsert> = {
    ...rest,
    ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
    ...(taskData !== undefined ? { taskData: JSON.stringify(taskData) } : {}),
    ...(status ? { status } : {}),
  };

  // Auto-stamp completedAt
  if (status === "done" && existing.status !== "done") {
    updates.completedAt = new Date();
    updates.completedByClerkId = userId;
  }
  if (status && status !== "done") {
    updates.completedAt = null as unknown as Date;
    updates.completedByClerkId = null as unknown as string;
  }

  const [updated] = await db.update(vendorTasksTable)
    .set(updates)
    .where(eq(vendorTasksTable.id, id))
    .returning();

  // Notify on status change to done
  if (status === "done" && existing.status !== "done") {
    try {
      await db.insert(vendorNotificationsTable).values({
        vendorId: vendor.id, type: "general",
        message: `✅ Task completed: "${updated.title}"`,
      });
      await sendPushToVendor(vendor.id, "Task Completed", updated.title, {
        type: "task_done", taskId: id,
      });
    } catch { /* non-fatal */ }
  }

  // Notify on new worker assignment
  if (body.data.workerId && body.data.workerId !== existing.workerId) {
    const [worker] = await db.select({ name: workersTable.name })
      .from(workersTable).where(eq(workersTable.id, body.data.workerId)).limit(1);
    if (worker) {
      try {
        await db.insert(vendorNotificationsTable).values({
          vendorId: vendor.id, type: "general",
          message: `🗂 Task "${updated.title}" reassigned to ${worker.name}`,
        });
      } catch { /* non-fatal */ }
    }
  }

  return res.json(serializeTask(updated));
});

// ─── DELETE /tasks/:id ────────────────────────────────────────────────────────
router.delete("/tasks/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const vendor = await resolveAuthedVendor(userId);
  if (!vendor) return res.status(403).json({ error: "Vendor not found" });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [deleted] = await db.delete(vendorTasksTable)
    .where(and(eq(vendorTasksTable.id, id), eq(vendorTasksTable.vendorId, vendor.id)))
    .returning({ id: vendorTasksTable.id });

  if (!deleted) return res.status(404).json({ error: "Not found" });
  return res.json({ success: true });
});

// ─── GET /tasks/meta/assignees — list branches + workers for dropdowns ────────
router.get("/tasks/meta/assignees", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const vendor = await resolveAuthedVendor(userId);
  if (!vendor) return res.status(403).json({ error: "Vendor not found" });

  const [branches, workers] = await Promise.all([
    db.select({ id: branchesTable.id, name: branchesTable.name })
      .from(branchesTable)
      .where(and(eq(branchesTable.vendorId, vendor.id), eq(branchesTable.status, "active")))
      .orderBy(branchesTable.name),
    db.select({
      id: workersTable.id, name: workersTable.name,
      role: workersTable.role, branchId: workersTable.branchId,
    })
      .from(workersTable)
      .where(and(eq(workersTable.vendorId, vendor.id), eq(workersTable.status, "active")))
      .orderBy(workersTable.name),
  ]);

  return res.json({ branches, workers });
});

export default router;
