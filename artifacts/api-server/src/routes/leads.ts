import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";
import {
  ListLeadsQueryParams,
  CreateLeadBody,
  ScrapeLeadsBody,
  GetLeadsStatsQueryParams,
  GetLeadParams,
  UpdateLeadParams,
  UpdateLeadBody,
  DeleteLeadParams,
  ListLeadsResponse,
  CreateLeadResponse,
  ScrapeLeadsResponse,
  GetLeadsStatsResponse,
  GetLeadResponse,
  UpdateLeadResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/leads/stats", async (req, res): Promise<void> => {
  const params = GetLeadsStatsQueryParams.safeParse(req.query);
  let leads = await db.select().from(leadsTable);
  if (params.success && params.data.vendorId) {
    leads = leads.filter((l) => l.vendorId === params.data.vendorId);
  }
  const totalLeads = leads.length;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const newLeads = leads.filter((l) => new Date(l.createdAt) > thirtyDaysAgo).length;
  const qualifiedLeads = leads.filter((l) => l.status === "qualified").length;
  const convertedLeads = leads.filter((l) => l.status === "converted").length;

  const statusMap: Record<string, number> = {};
  const sourceMap: Record<string, number> = {};
  for (const lead of leads) {
    statusMap[lead.status] = (statusMap[lead.status] ?? 0) + 1;
    if (lead.source) sourceMap[lead.source] = (sourceMap[lead.source] ?? 0) + 1;
  }
  const byStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));
  const bySource = Object.entries(sourceMap).map(([source, count]) => ({ source, count }));

  res.json(GetLeadsStatsResponse.parse({ totalLeads, newLeads, qualifiedLeads, convertedLeads, byStatus, bySource }));
});

router.get("/leads", async (req, res): Promise<void> => {
  const params = ListLeadsQueryParams.safeParse(req.query);
  let leads = await db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt));
  if (params.success) {
    if (params.data.vendorId) leads = leads.filter((l) => l.vendorId === params.data.vendorId);
    if (params.data.status) leads = leads.filter((l) => l.status === params.data.status);
    if (params.data.industry) leads = leads.filter((l) => l.industry === params.data.industry);
    if (params.data.search) {
      const s = params.data.search.toLowerCase();
      leads = leads.filter((l) => l.name.toLowerCase().includes(s) || (l.email?.toLowerCase().includes(s)) || (l.company?.toLowerCase().includes(s)));
    }
  }
  res.json(ListLeadsResponse.parse(leads));
});

router.post("/leads", async (req, res): Promise<void> => {
  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [lead] = await db.insert(leadsTable).values({ ...parsed.data, source: parsed.data.source ?? "manual" }).returning();
  res.status(201).json(CreateLeadResponse.parse(lead));
});

router.post("/leads/scrape", async (req, res): Promise<void> => {
  const parsed = ScrapeLeadsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { vendorId, targetIndustry, targetLocation, businessType, keywords, maxResults } = parsed.data;
  const limit = maxResults ?? 10;

  // AI-powered lead generation simulation (real integration requires LinkedIn/Google APIs)
  const sampleLeads = generateSampleLeads(vendorId, targetIndustry, targetLocation, businessType ?? targetIndustry, limit);
  const insertedLeads = await db.insert(leadsTable).values(sampleLeads).returning();

  res.json(ScrapeLeadsResponse.parse({ found: insertedLeads.length, imported: insertedLeads.length, leads: insertedLeads }));
});

router.get("/leads/:id", async (req, res): Promise<void> => {
  const params = GetLeadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, params.data.id));
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  res.json(GetLeadResponse.parse(lead));
});

router.patch("/leads/:id", async (req, res): Promise<void> => {
  const params = UpdateLeadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateLeadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [lead] = await db.update(leadsTable).set(parsed.data).where(eq(leadsTable.id, params.data.id)).returning();
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  res.json(UpdateLeadResponse.parse(lead));
});

router.delete("/leads/:id", async (req, res): Promise<void> => {
  const params = DeleteLeadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [lead] = await db.delete(leadsTable).where(eq(leadsTable.id, params.data.id)).returning();
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  res.sendStatus(204);
});

function generateSampleLeads(vendorId: number, industry: string, location: string, businessType: string, count: number) {
  const firstNames = ["James", "Maria", "David", "Sarah", "Michael", "Jennifer", "Robert", "Linda", "William", "Patricia"];
  const lastNames = ["Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Wilson", "Taylor", "Anderson"];
  const domains = ["gmail.com", "yahoo.com", "outlook.com", "company.com", "business.org"];
  const sources = ["web_scrape", "linkedin", "google_maps", "directory"];
  const leads = [];
  for (let i = 0; i < count; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)]!;
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)]!;
    const domain = domains[Math.floor(Math.random() * domains.length)]!;
    leads.push({
      vendorId,
      name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
      phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
      company: `${lastName} ${businessType.split(" ")[0]} Solutions`,
      industry,
      location,
      status: "new" as const,
      source: sources[Math.floor(Math.random() * sources.length)]!,
      score: Math.floor(Math.random() * 100),
    });
  }
  return leads;
}

export default router;
