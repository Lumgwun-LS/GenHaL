import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, propertiesTable, propertyInquiriesTable, vendorsTable } from "@workspace/db";

const router: IRouter = Router();

// Public: list all available properties for a vendor (shareable listings page)
router.get("/real-estate/public/:vendorId", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.params.vendorId);
  if (!vendorId) { res.status(400).json({ error: "Invalid vendorId" }); return; }

  const [vendor] = await db
    .select({ id: vendorsTable.id, name: vendorsTable.name, industry: vendorsTable.industry })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const properties = await db
    .select()
    .from(propertiesTable)
    .where(and(eq(propertiesTable.vendorId, vendorId), eq(propertiesTable.status, "available")))
    .orderBy(desc(propertiesTable.createdAt));

  res.json({
    vendor,
    properties: properties.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
});

// Public: submit an inquiry on a property listing
router.post("/real-estate/inquiries", async (req, res): Promise<void> => {
  const { propertyId, vendorId, name, email, phone, message } = req.body;
  if (!vendorId || !name) { res.status(400).json({ error: "vendorId and name are required" }); return; }
  const [row] = await db
    .insert(propertyInquiriesTable)
    .values({ propertyId: propertyId || null, vendorId, name, email, phone, message, source: "public_page" })
    .returning();
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

// Public: increment view count when someone opens a property listing
router.post("/real-estate/properties/:id/view", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db
    .update(propertiesTable)
    .set({ views: sql`${propertiesTable.views} + 1` })
    .where(eq(propertiesTable.id, id));
  res.status(204).end();
});

export default router;
