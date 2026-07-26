import { Router, type IRouter } from "express";
import { eq, desc, and, ilike, or } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, leadsTable, vendorsTable } from "@workspace/db";
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

/** Resolve the authenticated vendor; admins may act on any vendorId. */
async function resolveAuthedVendor(req: Parameters<IRouter["use"]>[1] extends (req: infer R, ...a: unknown[]) => unknown ? R : never) {
  const { userId } = getAuth(req as never);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

router.get("/leads/stats", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetLeadsStatsQueryParams.safeParse(req.query);
  const requestedVendorId = params.success && params.data.vendorId ? params.data.vendorId : null;

  // Non-admins can only see their own vendor's stats.
  const effectiveVendorId = authed.isAdmin ? (requestedVendorId ?? authed.vendorId) : authed.vendorId;

  const leads = effectiveVendorId
    ? await db.select().from(leadsTable).where(eq(leadsTable.vendorId, effectiveVendorId))
    : await db.select().from(leadsTable);

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
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = ListLeadsQueryParams.safeParse(req.query);
  const requestedVendorId = params.success && params.data.vendorId ? params.data.vendorId : null;

  // Non-admins are always scoped to their own vendor.
  const effectiveVendorId = authed.isAdmin ? (requestedVendorId ?? authed.vendorId) : authed.vendorId;

  let query = db.select().from(leadsTable).$dynamic();

  if (effectiveVendorId !== null) {
    query = query.where(eq(leadsTable.vendorId, effectiveVendorId));
  }
  query = query.orderBy(desc(leadsTable.createdAt));

  let leads = await query;

  // Apply remaining filters in-memory (these don't contain sensitive cross-vendor data).
  if (params.success) {
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
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Non-admins can only create leads for their own vendor.
  const vendorId = authed.isAdmin ? (parsed.data.vendorId ?? authed.vendorId) : authed.vendorId;
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }

  const [lead] = await db.insert(leadsTable).values({ ...parsed.data, vendorId, source: parsed.data.source ?? "manual" }).returning();
  res.status(201).json(CreateLeadResponse.parse(lead));
});

router.post("/leads/scrape", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = ScrapeLeadsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { targetIndustry, targetLocation, businessType, keywords, maxResults } = parsed.data;

  // Non-admins can only scrape leads for their own vendor.
  const vendorId = authed.isAdmin ? (parsed.data.vendorId ?? authed.vendorId) : authed.vendorId;
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }

  const limit = maxResults ?? 10;

  // AI-powered lead generation simulation (real integration requires LinkedIn/Google APIs)
  const sampleLeads = generateSampleLeads(vendorId, targetIndustry, targetLocation, businessType ?? targetIndustry, limit);
  const insertedLeads = await db.insert(leadsTable).values(sampleLeads).returning();

  res.json(ScrapeLeadsResponse.parse({ found: insertedLeads.length, imported: insertedLeads.length, leads: insertedLeads }));
});

router.get("/leads/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetLeadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, params.data.id));
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

  // Non-admins can only view their own vendor's leads.
  if (!authed.isAdmin && lead.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You do not have permission to view this lead." });
    return;
  }

  res.json(GetLeadResponse.parse(lead));
});

router.patch("/leads/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = UpdateLeadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateLeadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Verify ownership before updating.
  const [existing] = await db.select({ vendorId: leadsTable.vendorId }).from(leadsTable).where(eq(leadsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Lead not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You do not have permission to update this lead." });
    return;
  }

  const [lead] = await db.update(leadsTable).set(parsed.data).where(eq(leadsTable.id, params.data.id)).returning();
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  res.json(UpdateLeadResponse.parse(lead));
});

router.delete("/leads/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = DeleteLeadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Verify ownership before deleting.
  const [existing] = await db.select({ vendorId: leadsTable.vendorId }).from(leadsTable).where(eq(leadsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Lead not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You do not have permission to delete this lead." });
    return;
  }

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

// ── CSV helpers ──────────────────────────────────────────────────────────────
import multer from "multer";
const _csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function parseCSV(buffer: Buffer): string[][] {
  const text = buffer.toString("utf8");
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push(current.trim()); current = "";
    } else if ((ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) && !inQuotes) {
      if (ch === '\r') i++;
      row.push(current.trim());
      if (row.some(v => v !== '')) rows.push(row);
      row = []; current = "";
    } else {
      current += ch;
    }
  }
  if (current !== '' || row.length > 0) {
    row.push(current.trim());
    if (row.some(v => v !== '')) rows.push(row);
  }
  return rows;
}

// ── Export ───────────────────────────────────────────────────────────────────
router.get("/leads/export", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const effectiveVendorId = authed.isAdmin
    ? (req.query.vendorId ? Number(req.query.vendorId) : null)
    : authed.vendorId;

  const leads = await db.select().from(leadsTable)
    .where(effectiveVendorId !== null ? eq(leadsTable.vendorId, effectiveVendorId) : undefined)
    .orderBy(desc(leadsTable.createdAt));

  const HEADERS = ["ID", "Name", "Email", "Phone", "Company", "Industry", "Status", "Source", "Notes", "Created At"];
  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    const safe = /^[=+\-@|\t]/.test(s) ? `'${s}` : s;
    if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) return `"${safe.replace(/"/g, '""')}"`;
    return safe;
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="leads-export-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.write(HEADERS.join(",") + "\r\n");
  for (const l of leads) {
    res.write([l.id, l.name, l.email, l.phone, l.company, l.industry, l.status, l.source, l.notes, l.createdAt].map(csvCell).join(",") + "\r\n");
  }
  res.end();
});

// ── Import ───────────────────────────────────────────────────────────────────
router.post("/leads/import", _csvUpload.single("file"), async (req: any, res: any): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  const vendorId = authed.vendorId!;

  if (!req.file) { res.status(400).json({ error: "No CSV file uploaded" }); return; }
  const rows = parseCSV(req.file.buffer);
  if (rows.length < 2) { res.status(400).json({ error: "CSV must have a header row and at least one data row" }); return; }

  const header = rows[0]!.map(h => h.toLowerCase().replace(/\s+/g, "_"));
  const col = (name: string) => header.indexOf(name);

  let imported = 0; const errors: { row: number; error: string }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const name = r[col("name")] ?? "";
    if (!name) { errors.push({ row: i + 1, error: "Name is required" }); continue; }
    try {
      const status = (["new", "contacted", "qualified", "converted", "lost"].includes(r[col("status")] ?? "") ? r[col("status")] : "new") as any;
      await db.insert(leadsTable).values({
        vendorId,
        name,
        email: r[col("email")] || null,
        phone: r[col("phone")] || null,
        company: r[col("company")] || null,
        industry: r[col("industry")] || null,
        status,
        source: r[col("source")] || "manual",
        notes: r[col("notes")] || null,
      });
      imported++;
    } catch (e: any) {
      errors.push({ row: i + 1, error: e.message ?? "Insert failed" });
    }
  }
  res.json({ imported, skipped: 0, errors: errors.length, errorDetails: errors.slice(0, 20) });
});

export default router;
