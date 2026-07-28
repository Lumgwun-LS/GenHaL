import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, utmLinksTable, vendorsTable } from "@workspace/db";

const router: IRouter = Router();

async function resolveAuthedVendor(req: import("express").Request) {
  const { userId } = getAuth(req as never);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

function generateShortCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function buildFullUrl(link: typeof utmLinksTable.$inferSelect): string {
  const url = new URL(link.destinationUrl);
  url.searchParams.set("utm_source", link.utmSource);
  url.searchParams.set("utm_medium", link.utmMedium);
  url.searchParams.set("utm_campaign", link.utmCampaign);
  if (link.utmContent) url.searchParams.set("utm_content", link.utmContent);
  if (link.utmTerm) url.searchParams.set("utm_term", link.utmTerm);
  return url.toString();
}

function serialize(l: typeof utmLinksTable.$inferSelect) {
  return { ...l, fullUrl: buildFullUrl(l), createdAt: l.createdAt.toISOString() };
}

/** GET /utm-links */
router.get("/utm-links", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const links = await db
    .select()
    .from(utmLinksTable)
    .where(authed.vendorId !== null ? eq(utmLinksTable.vendorId, authed.vendorId) : undefined)
    .orderBy(desc(utmLinksTable.createdAt));

  res.json(links.map(serialize));
});

/** POST /utm-links */
router.post("/utm-links", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { name, destinationUrl, utmSource, utmMedium, utmCampaign, utmContent, utmTerm } = req.body as Record<string, string | undefined>;
  if (!name || !destinationUrl || !utmSource || !utmMedium || !utmCampaign) {
    res.status(400).json({ error: "name, destinationUrl, utmSource, utmMedium, utmCampaign are required" });
    return;
  }

  // Validate destination URL
  try { new URL(destinationUrl); } catch { res.status(400).json({ error: "destinationUrl must be a valid URL" }); return; }

  // Generate a unique short code
  let shortCode = generateShortCode();
  for (let i = 0; i < 5; i++) {
    const [existing] = await db.select({ id: utmLinksTable.id }).from(utmLinksTable).where(eq(utmLinksTable.shortCode, shortCode));
    if (!existing) break;
    shortCode = generateShortCode();
  }

  const [link] = await db.insert(utmLinksTable).values({
    vendorId: authed.vendorId,
    name,
    destinationUrl,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent: utmContent ?? undefined,
    utmTerm: utmTerm ?? undefined,
    shortCode,
  }).returning();

  res.status(201).json(serialize(link!));
});

/** DELETE /utm-links/:id */
router.delete("/utm-links/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select({ id: utmLinksTable.id, vendorId: utmLinksTable.vendorId })
    .from(utmLinksTable).where(eq(utmLinksTable.id, id));
  if (!existing) { res.status(404).json({ error: "Link not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(utmLinksTable).where(eq(utmLinksTable.id, id));
  res.status(204).end();
});

export default router;
