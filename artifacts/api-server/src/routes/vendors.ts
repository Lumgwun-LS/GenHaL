import { Router, type IRouter } from "express";
import { eq, ilike, sql, desc } from "drizzle-orm";
import { db, vendorsTable } from "@workspace/db";
import {
  ListVendorsQueryParams,
  CreateVendorBody,
  GetVendorParams,
  UpdateVendorParams,
  UpdateVendorBody,
  DeleteVendorParams,
  ListVendorsResponse,
  CreateVendorResponse,
  GetVendorResponse,
  UpdateVendorResponse,
  GetVendorStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/vendors/stats", async (req, res): Promise<void> => {
  const vendors = await db.select().from(vendorsTable);
  const total = vendors.length;
  const active = vendors.filter((v) => v.status === "active").length;
  const recentSignups = vendors.filter((v) => {
    const d = new Date(v.createdAt);
    return d > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }).length;
  const industryMap: Record<string, number> = {};
  for (const v of vendors) {
    industryMap[v.industry] = (industryMap[v.industry] ?? 0) + 1;
  }
  const industries = Object.entries(industryMap).map(([industry, count]) => ({ industry, count }));
  res.json(
    GetVendorStatsResponse.parse({ totalVendors: total, activeVendors: active, industries, recentSignups }),
  );
});

router.get("/vendors", async (req, res): Promise<void> => {
  const params = ListVendorsQueryParams.safeParse(req.query);
  let query = db.select().from(vendorsTable).orderBy(desc(vendorsTable.createdAt)).$dynamic();
  if (params.success && params.data.status) {
    query = query.where(eq(vendorsTable.status, params.data.status));
  }
  const vendors = await query;
  const filtered = params.success && params.data.search
    ? vendors.filter(
        (v) =>
          v.name.toLowerCase().includes(params.data.search!.toLowerCase()) ||
          v.industry.toLowerCase().includes(params.data.search!.toLowerCase()),
      )
    : vendors;
  res.json(ListVendorsResponse.parse(filtered));
});

router.post("/vendors", async (req, res): Promise<void> => {
  const parsed = CreateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [vendor] = await db.insert(vendorsTable).values(parsed.data).returning();
  res.status(201).json(CreateVendorResponse.parse(vendor));
});

router.get("/vendors/:id", async (req, res): Promise<void> => {
  const params = GetVendorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, params.data.id));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  res.json(GetVendorResponse.parse(vendor));
});

router.patch("/vendors/:id", async (req, res): Promise<void> => {
  const params = UpdateVendorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateVendorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [vendor] = await db.update(vendorsTable).set(parsed.data).where(eq(vendorsTable.id, params.data.id)).returning();
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  res.json(UpdateVendorResponse.parse(vendor));
});

router.delete("/vendors/:id", async (req, res): Promise<void> => {
  const params = DeleteVendorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [vendor] = await db.delete(vendorsTable).where(eq(vendorsTable.id, params.data.id)).returning();
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  res.sendStatus(204);
});

export default router;
