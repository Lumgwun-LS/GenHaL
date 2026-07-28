import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, leadFormsTable, vendorsTable } from "@workspace/db";

const router: IRouter = Router();

async function resolveAuthedVendor(req: import("express").Request) {
  const { userId } = getAuth(req as never);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

function serializeForm(f: typeof leadFormsTable.$inferSelect) {
  return { ...f, createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString() };
}

/** GET /lead-forms */
router.get("/lead-forms", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const forms = await db
    .select()
    .from(leadFormsTable)
    .where(authed.vendorId !== null ? eq(leadFormsTable.vendorId, authed.vendorId) : undefined)
    .orderBy(desc(leadFormsTable.createdAt));

  res.json(forms.map(serializeForm));
});

/** POST /lead-forms */
router.post("/lead-forms", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { name, description, fields, redirectUrl, buttonText, thankYouMessage } = req.body as Record<string, unknown>;
  if (!name || typeof name !== "string") { res.status(400).json({ error: "name is required" }); return; }

  const [form] = await db.insert(leadFormsTable).values({
    vendorId: authed.vendorId,
    name,
    description: typeof description === "string" ? description : undefined,
    fields: Array.isArray(fields) ? fields as typeof leadFormsTable.$inferInsert["fields"] : [],
    redirectUrl: typeof redirectUrl === "string" ? redirectUrl : undefined,
    buttonText: typeof buttonText === "string" ? buttonText : "Submit",
    thankYouMessage: typeof thankYouMessage === "string" ? thankYouMessage : undefined,
  }).returning();

  res.status(201).json(serializeForm(form!));
});

/** PATCH /lead-forms/:id */
router.patch("/lead-forms/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select({ id: leadFormsTable.id, vendorId: leadFormsTable.vendorId })
    .from(leadFormsTable).where(eq(leadFormsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Form not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { name, description, fields, redirectUrl, buttonText, thankYouMessage, status } = req.body as Record<string, unknown>;
  const updates: Partial<typeof leadFormsTable.$inferInsert> = {};
  if (typeof name === "string") updates.name = name;
  if (typeof description === "string") updates.description = description;
  if (Array.isArray(fields)) updates.fields = fields as typeof leadFormsTable.$inferInsert["fields"];
  if (typeof redirectUrl === "string") updates.redirectUrl = redirectUrl;
  if (typeof buttonText === "string") updates.buttonText = buttonText;
  if (typeof thankYouMessage === "string") updates.thankYouMessage = thankYouMessage;
  if (typeof status === "string") updates.status = status;

  const [updated] = await db.update(leadFormsTable).set(updates).where(eq(leadFormsTable.id, id)).returning();
  res.json(serializeForm(updated!));
});

/** DELETE /lead-forms/:id */
router.delete("/lead-forms/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select({ id: leadFormsTable.id, vendorId: leadFormsTable.vendorId })
    .from(leadFormsTable).where(eq(leadFormsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Form not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(leadFormsTable).where(eq(leadFormsTable.id, id));
  res.status(204).end();
});

export default router;
