import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, personActivitiesTable, leadsTable, vendorsTable } from "@workspace/db";

const router: IRouter = Router();

async function resolveAuthedVendor(req: import("express").Request) {
  const { userId } = getAuth(req as never);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

/** GET /leads/:id/activities — full timeline for a person */
router.get("/leads/:id/activities", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const personId = parseInt(req.params.id ?? "");
  if (isNaN(personId)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Verify ownership
  const [person] = await db.select({ id: leadsTable.id, vendorId: leadsTable.vendorId })
    .from(leadsTable).where(eq(leadsTable.id, personId));
  if (!person) { res.status(404).json({ error: "Person not found" }); return; }
  if (!authed.isAdmin && person.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const activities = await db
    .select()
    .from(personActivitiesTable)
    .where(eq(personActivitiesTable.personId, personId))
    .orderBy(desc(personActivitiesTable.createdAt))
    .limit(100);

  res.json(activities.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

/** POST /leads/:id/activities — add a manual note */
router.post("/leads/:id/activities", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const personId = parseInt(req.params.id ?? "");
  if (isNaN(personId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { note } = req.body as { note?: string };
  if (!note?.trim()) { res.status(400).json({ error: "note is required" }); return; }

  const [person] = await db.select({ id: leadsTable.id, vendorId: leadsTable.vendorId })
    .from(leadsTable).where(eq(leadsTable.id, personId));
  if (!person) { res.status(404).json({ error: "Person not found" }); return; }
  if (!authed.isAdmin && person.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const vendorId = person.vendorId;
  const [activity] = await db.insert(personActivitiesTable).values({
    vendorId,
    personId,
    type: "manual_note",
    data: { note: note.trim() },
  }).returning();

  res.status(201).json({ ...activity!, createdAt: activity!.createdAt.toISOString() });
});

export default router;
