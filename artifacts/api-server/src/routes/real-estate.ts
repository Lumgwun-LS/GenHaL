import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db,
  vendorsTable,
  propertiesTable,
  realEstateClientsTable,
  propertyViewingsTable,
  propertyContractsTable,
  propertyInquiriesTable,
} from "@workspace/db";

const router: IRouter = Router();

function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

async function resolveVendorAccess(
  req: import("express").Request,
  vendorId: number,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { userId } = getAuth(req);
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) return { ok: false, status: 404, error: "Vendor not found" };
  if (vendor.clerkUserId !== userId && !isAdmin(userId))
    return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true };
}

function ser(r: Record<string, unknown>) {
  return {
    ...r,
    createdAt: (r.createdAt as Date)?.toISOString?.() ?? r.createdAt,
    updatedAt: (r.updatedAt as Date)?.toISOString?.() ?? r.updatedAt,
    scheduledAt: (r.scheduledAt as Date)?.toISOString?.() ?? r.scheduledAt,
    validFrom: (r.validFrom as Date)?.toISOString?.() ?? r.validFrom,
    validUntil: (r.validUntil as Date)?.toISOString?.() ?? r.validUntil,
  };
}

// ─── PROPERTIES ────────────────────────────────────────────────────────────

router.get("/real-estate/properties", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.query.vendorId as string);
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  let rows = await db.select().from(propertiesTable)
    .where(eq(propertiesTable.vendorId, vendorId))
    .orderBy(desc(propertiesTable.createdAt));

  const { status, type, listingType } = req.query as Record<string, string>;
  if (status) rows = rows.filter((r) => r.status === status);
  if (type) rows = rows.filter((r) => r.propertyType === type);
  if (listingType) rows = rows.filter((r) => r.listingType === listingType);

  res.json(rows.map((r) => ser(r as unknown as Record<string, unknown>)));
});

router.post("/real-estate/properties", async (req, res): Promise<void> => {
  const {
    vendorId, title, description, propertyType, listingType,
    status = "available", price, rentPrice, rentPeriod,
    bedrooms, bathrooms, area, areaUnit, address, city, state, country,
    features, images,
  } = req.body;
  if (!vendorId || !title || !propertyType || !listingType) {
    res.status(400).json({ error: "vendorId, title, propertyType and listingType are required" }); return;
  }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const [row] = await db.insert(propertiesTable).values({
    vendorId, title, description, propertyType, listingType, status,
    price, rentPrice, rentPeriod,
    bedrooms: bedrooms ? parseInt(bedrooms) : null,
    bathrooms: bathrooms ? parseInt(bathrooms) : null,
    area, areaUnit: areaUnit ?? "sqm",
    address, city, state, country,
    features: Array.isArray(features) ? features : (features ? features.split(",").map((s: string) => s.trim()).filter(Boolean) : null),
    images: Array.isArray(images) ? images : (images ? images.split(",").map((s: string) => s.trim()).filter(Boolean) : null),
  }).returning();
  res.status(201).json(ser(row as unknown as Record<string, unknown>));
});

router.patch("/real-estate/properties/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Property not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const {
    title, description, propertyType, listingType, status,
    price, rentPrice, rentPeriod, bedrooms, bathrooms, area, areaUnit,
    address, city, state, country, features, images,
  } = req.body;
  const [updated] = await db.update(propertiesTable).set({
    title, description, propertyType, listingType, status,
    price, rentPrice, rentPeriod,
    bedrooms: bedrooms !== undefined ? (bedrooms ? parseInt(bedrooms) : null) : existing.bedrooms,
    bathrooms: bathrooms !== undefined ? (bathrooms ? parseInt(bathrooms) : null) : existing.bathrooms,
    area, areaUnit,
    address, city, state, country,
    features: Array.isArray(features) ? features : (features ? features.split(",").map((s: string) => s.trim()).filter(Boolean) : existing.features),
    images: Array.isArray(images) ? images : (images ? images.split(",").map((s: string) => s.trim()).filter(Boolean) : existing.images),
    updatedAt: new Date(),
  }).where(eq(propertiesTable.id, id)).returning();
  res.json(ser(updated as unknown as Record<string, unknown>));
});

router.delete("/real-estate/properties/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Property not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  await db.delete(propertiesTable).where(eq(propertiesTable.id, id));
  res.status(204).end();
});

// ─── CLIENTS ────────────────────────────────────────────────────────────────

router.get("/real-estate/clients", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.query.vendorId as string);
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const rows = await db.select().from(realEstateClientsTable)
    .where(eq(realEstateClientsTable.vendorId, vendorId))
    .orderBy(desc(realEstateClientsTable.createdAt));
  res.json(rows.map((r) => ser(r as unknown as Record<string, unknown>)));
});

router.post("/real-estate/clients", async (req, res): Promise<void> => {
  const { vendorId, name, email, phone, clientType = "buyer", budget, preferredAreas, notes } = req.body;
  if (!vendorId || !name) { res.status(400).json({ error: "vendorId and name are required" }); return; }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const [row] = await db.insert(realEstateClientsTable).values({ vendorId, name, email, phone, clientType, budget, preferredAreas, notes }).returning();
  res.status(201).json(ser(row as unknown as Record<string, unknown>));
});

router.patch("/real-estate/clients/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(realEstateClientsTable).where(eq(realEstateClientsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Client not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const { name, email, phone, clientType, budget, preferredAreas, notes, status } = req.body;
  const [updated] = await db.update(realEstateClientsTable).set({ name, email, phone, clientType, budget, preferredAreas, notes, status }).where(eq(realEstateClientsTable.id, id)).returning();
  res.json(ser(updated as unknown as Record<string, unknown>));
});

router.delete("/real-estate/clients/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(realEstateClientsTable).where(eq(realEstateClientsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Client not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  await db.delete(realEstateClientsTable).where(eq(realEstateClientsTable.id, id));
  res.status(204).end();
});

// ─── VIEWINGS ────────────────────────────────────────────────────────────────

router.get("/real-estate/viewings", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.query.vendorId as string);
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const rows = await db.select().from(propertyViewingsTable)
    .where(eq(propertyViewingsTable.vendorId, vendorId))
    .orderBy(desc(propertyViewingsTable.scheduledAt));
  res.json(rows.map((r) => ser(r as unknown as Record<string, unknown>)));
});

router.post("/real-estate/viewings", async (req, res): Promise<void> => {
  const { vendorId, propertyId, clientId, clientName, clientEmail, clientPhone, scheduledAt, notes } = req.body;
  if (!vendorId || !clientName || !scheduledAt) {
    res.status(400).json({ error: "vendorId, clientName, and scheduledAt are required" }); return;
  }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const [row] = await db.insert(propertyViewingsTable).values({
    vendorId, propertyId: propertyId || null, clientId: clientId || null,
    clientName, clientEmail, clientPhone, scheduledAt: new Date(scheduledAt), notes,
  }).returning();
  res.status(201).json(ser(row as unknown as Record<string, unknown>));
});

router.patch("/real-estate/viewings/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(propertyViewingsTable).where(eq(propertyViewingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Viewing not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const { status, notes, scheduledAt, propertyId, clientName, clientEmail, clientPhone } = req.body;
  const updateData: Record<string, unknown> = { status, notes, propertyId, clientName, clientEmail, clientPhone };
  if (scheduledAt) updateData.scheduledAt = new Date(scheduledAt);
  const [updated] = await db.update(propertyViewingsTable).set(updateData as never).where(eq(propertyViewingsTable.id, id)).returning();
  res.json(ser(updated as unknown as Record<string, unknown>));
});

router.delete("/real-estate/viewings/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(propertyViewingsTable).where(eq(propertyViewingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Viewing not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  await db.delete(propertyViewingsTable).where(eq(propertyViewingsTable.id, id));
  res.status(204).end();
});

// ─── CONTRACTS ────────────────────────────────────────────────────────────────

router.get("/real-estate/contracts", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.query.vendorId as string);
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const rows = await db.select().from(propertyContractsTable)
    .where(eq(propertyContractsTable.vendorId, vendorId))
    .orderBy(desc(propertyContractsTable.createdAt));
  res.json(rows.map((r) => ser(r as unknown as Record<string, unknown>)));
});

router.post("/real-estate/contracts", async (req, res): Promise<void> => {
  const { vendorId, propertyId, clientId, contractType, documentUrl, documentName, status = "draft", validFrom, validUntil, notes } = req.body;
  if (!vendorId || !contractType) { res.status(400).json({ error: "vendorId and contractType are required" }); return; }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const [row] = await db.insert(propertyContractsTable).values({
    vendorId, propertyId: propertyId || null, clientId: clientId || null,
    contractType, documentUrl, documentName, status,
    validFrom: validFrom ? new Date(validFrom) : null,
    validUntil: validUntil ? new Date(validUntil) : null,
    notes,
  }).returning();
  res.status(201).json(ser(row as unknown as Record<string, unknown>));
});

router.patch("/real-estate/contracts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(propertyContractsTable).where(eq(propertyContractsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Contract not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const { status, documentUrl, documentName, validFrom, validUntil, notes, propertyId, clientId } = req.body;
  const updateData: Record<string, unknown> = { status, documentUrl, documentName, notes, propertyId, clientId };
  if (validFrom) updateData.validFrom = new Date(validFrom);
  if (validUntil) updateData.validUntil = new Date(validUntil);
  const [updated] = await db.update(propertyContractsTable).set(updateData as never).where(eq(propertyContractsTable.id, id)).returning();
  res.json(ser(updated as unknown as Record<string, unknown>));
});

router.delete("/real-estate/contracts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(propertyContractsTable).where(eq(propertyContractsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Contract not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  await db.delete(propertyContractsTable).where(eq(propertyContractsTable.id, id));
  res.status(204).end();
});

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

router.get("/real-estate/analytics", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.query.vendorId as string);
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const [properties, viewings, clients, inquiries] = await Promise.all([
    db.select().from(propertiesTable).where(eq(propertiesTable.vendorId, vendorId)),
    db.select().from(propertyViewingsTable).where(eq(propertyViewingsTable.vendorId, vendorId)),
    db.select().from(realEstateClientsTable).where(eq(realEstateClientsTable.vendorId, vendorId)),
    db.select().from(propertyInquiriesTable).where(eq(propertyInquiriesTable.vendorId, vendorId)).orderBy(desc(propertyInquiriesTable.createdAt)),
  ]);

  const totalViews = properties.reduce((sum, p) => sum + (p.views ?? 0), 0);
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const p of properties) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    byType[p.propertyType] = (byType[p.propertyType] ?? 0) + 1;
  }

  const now = new Date();
  const upcomingViewings = viewings.filter((v) => v.status === "scheduled" && v.scheduledAt > now).length;

  res.json({
    totalProperties: properties.length,
    totalClients: clients.length,
    totalViewings: viewings.length,
    upcomingViewings,
    completedViewings: viewings.filter((v) => v.status === "completed").length,
    totalInquiries: inquiries.length,
    totalViews,
    byStatus,
    byType,
    recentInquiries: inquiries.slice(0, 10).map((r) => ser(r as unknown as Record<string, unknown>)),
  });
});

export default router;
