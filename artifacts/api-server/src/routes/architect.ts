import { Router, type IRouter } from "express";
import { eq, and, desc, asc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { openai } from "@workspace/integrations-openai-ai-server";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
import {
  db, vendorsTable,
  architectProjectsTable, projectMilestonesTable,
  drawingRevisionsTable, contractorTasksTable, floorPlansTable,
  designGenerationsTable,
} from "@workspace/db";

const router: IRouter = Router();

function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean).includes(userId);
}

async function resolveVendorAccess(req: import("express").Request, vendorId: number): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { userId } = getAuth(req);
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) return { ok: false, status: 404, error: "Vendor not found" };
  if (vendor.clerkUserId !== userId && !isAdmin(userId)) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true };
}

function ser(r: Record<string, unknown>) {
  return {
    ...r,
    createdAt: (r.createdAt as Date)?.toISOString?.() ?? r.createdAt,
    updatedAt: (r.updatedAt as Date)?.toISOString?.() ?? r.updatedAt,
    startDate: (r.startDate as Date)?.toISOString?.() ?? r.startDate,
    endDate: (r.endDate as Date)?.toISOString?.() ?? r.endDate,
    dueDate: (r.dueDate as Date)?.toISOString?.() ?? r.dueDate,
    completedAt: (r.completedAt as Date)?.toISOString?.() ?? r.completedAt,
  };
}

// ─── PROJECTS ────────────────────────────────────────────────────────────────

router.get("/architect/projects", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.query.vendorId as string);
  if (!vendorId) { res.status(400).json({ error: "vendorId required" }); return; }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const rows = await db.select().from(architectProjectsTable).where(eq(architectProjectsTable.vendorId, vendorId)).orderBy(desc(architectProjectsTable.createdAt));
  res.json(rows.map((r) => ser(r as unknown as Record<string, unknown>)));
});

router.post("/architect/projects", async (req, res): Promise<void> => {
  const { vendorId, name, clientName, clientEmail, clientPhone, description, projectType, status, budget, startDate, endDate, address, city } = req.body;
  if (!vendorId || !name) { res.status(400).json({ error: "vendorId and name are required" }); return; }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const [row] = await db.insert(architectProjectsTable).values({
    vendorId, name, clientName, clientEmail, clientPhone, description,
    projectType: projectType ?? "residential", status: status ?? "planning",
    budget, address, city,
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
  }).returning();
  res.status(201).json(ser(row as unknown as Record<string, unknown>));
});

router.patch("/architect/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(architectProjectsTable).where(eq(architectProjectsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Project not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const { name, clientName, clientEmail, clientPhone, description, projectType, status, budget, startDate, endDate, address, city } = req.body;
  const updateData: Record<string, unknown> = { name, clientName, clientEmail, clientPhone, description, projectType, status, budget, address, city, updatedAt: new Date() };
  if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
  if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
  const [updated] = await db.update(architectProjectsTable).set(updateData as never).where(eq(architectProjectsTable.id, id)).returning();
  res.json(ser(updated as unknown as Record<string, unknown>));
});

router.delete("/architect/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(architectProjectsTable).where(eq(architectProjectsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Project not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  await db.delete(architectProjectsTable).where(eq(architectProjectsTable.id, id));
  res.status(204).end();
});

// ─── MILESTONES ───────────────────────────────────────────────────────────────

router.get("/architect/milestones", async (req, res): Promise<void> => {
  const { vendorId, projectId } = req.query as Record<string, string>;
  if (!vendorId) { res.status(400).json({ error: "vendorId required" }); return; }
  const check = await resolveVendorAccess(req, parseInt(vendorId));
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const conditions = [eq(projectMilestonesTable.vendorId, parseInt(vendorId))];
  if (projectId) conditions.push(eq(projectMilestonesTable.projectId, parseInt(projectId)));
  const rows = await db.select().from(projectMilestonesTable).where(and(...conditions)).orderBy(asc(projectMilestonesTable.sortOrder), asc(projectMilestonesTable.createdAt));
  res.json(rows.map((r) => ser(r as unknown as Record<string, unknown>)));
});

router.post("/architect/milestones", async (req, res): Promise<void> => {
  const { vendorId, projectId, name, description, dueDate, status, sortOrder } = req.body;
  if (!vendorId || !projectId || !name) { res.status(400).json({ error: "vendorId, projectId, and name are required" }); return; }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const [row] = await db.insert(projectMilestonesTable).values({
    vendorId, projectId, name, description, status: status ?? "pending",
    sortOrder: sortOrder ?? 0,
    dueDate: dueDate ? new Date(dueDate) : null,
  }).returning();
  res.status(201).json(ser(row as unknown as Record<string, unknown>));
});

router.patch("/architect/milestones/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(projectMilestonesTable).where(eq(projectMilestonesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Milestone not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const { name, description, status, sortOrder, dueDate } = req.body;
  const updateData: Record<string, unknown> = { name, description, status, sortOrder };
  if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
  if (status === "completed" && existing.status !== "completed") updateData.completedAt = new Date();
  if (status !== "completed") updateData.completedAt = null;
  const [updated] = await db.update(projectMilestonesTable).set(updateData as never).where(eq(projectMilestonesTable.id, id)).returning();
  res.json(ser(updated as unknown as Record<string, unknown>));
});

router.delete("/architect/milestones/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(projectMilestonesTable).where(eq(projectMilestonesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Milestone not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  await db.delete(projectMilestonesTable).where(eq(projectMilestonesTable.id, id));
  res.status(204).end();
});

// ─── DRAWINGS ────────────────────────────────────────────────────────────────

router.get("/architect/drawings", async (req, res): Promise<void> => {
  const { vendorId, projectId } = req.query as Record<string, string>;
  if (!vendorId) { res.status(400).json({ error: "vendorId required" }); return; }
  const check = await resolveVendorAccess(req, parseInt(vendorId));
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const conditions = [eq(drawingRevisionsTable.vendorId, parseInt(vendorId))];
  if (projectId) conditions.push(eq(drawingRevisionsTable.projectId, parseInt(projectId)));
  const rows = await db.select().from(drawingRevisionsTable).where(and(...conditions)).orderBy(desc(drawingRevisionsTable.createdAt));
  res.json(rows.map((r) => ser(r as unknown as Record<string, unknown>)));
});

router.post("/architect/drawings", async (req, res): Promise<void> => {
  const { vendorId, projectId, drawingName, version, description, fileUrl, fileName, status, reviewerNotes } = req.body;
  if (!vendorId || !drawingName) { res.status(400).json({ error: "vendorId and drawingName are required" }); return; }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const [row] = await db.insert(drawingRevisionsTable).values({
    vendorId, projectId: projectId || null, drawingName,
    version: version || "R1", description, fileUrl, fileName,
    status: status || "draft", reviewerNotes,
  }).returning();
  res.status(201).json(ser(row as unknown as Record<string, unknown>));
});

router.patch("/architect/drawings/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(drawingRevisionsTable).where(eq(drawingRevisionsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Drawing not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const { drawingName, version, description, fileUrl, fileName, status, reviewerNotes } = req.body;
  const [updated] = await db.update(drawingRevisionsTable).set({ drawingName, version, description, fileUrl, fileName, status, reviewerNotes }).where(eq(drawingRevisionsTable.id, id)).returning();
  res.json(ser(updated as unknown as Record<string, unknown>));
});

router.delete("/architect/drawings/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(drawingRevisionsTable).where(eq(drawingRevisionsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Drawing not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  await db.delete(drawingRevisionsTable).where(eq(drawingRevisionsTable.id, id));
  res.status(204).end();
});

// ─── CONTRACTORS ─────────────────────────────────────────────────────────────

router.get("/architect/contractors", async (req, res): Promise<void> => {
  const { vendorId, projectId } = req.query as Record<string, string>;
  if (!vendorId) { res.status(400).json({ error: "vendorId required" }); return; }
  const check = await resolveVendorAccess(req, parseInt(vendorId));
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const conditions = [eq(contractorTasksTable.vendorId, parseInt(vendorId))];
  if (projectId) conditions.push(eq(contractorTasksTable.projectId, parseInt(projectId)));
  const rows = await db.select().from(contractorTasksTable).where(and(...conditions)).orderBy(desc(contractorTasksTable.createdAt));
  res.json(rows.map((r) => ser(r as unknown as Record<string, unknown>)));
});

router.post("/architect/contractors", async (req, res): Promise<void> => {
  const { vendorId, projectId, contractorName, contractorEmail, contractorPhone, taskName, description, startDate, endDate, status, cost } = req.body;
  if (!vendorId || !contractorName || !taskName) { res.status(400).json({ error: "vendorId, contractorName, and taskName are required" }); return; }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const [row] = await db.insert(contractorTasksTable).values({
    vendorId, projectId: projectId || null, contractorName, contractorEmail, contractorPhone,
    taskName, description, status: status || "not_started", cost,
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
  }).returning();
  res.status(201).json(ser(row as unknown as Record<string, unknown>));
});

router.patch("/architect/contractors/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(contractorTasksTable).where(eq(contractorTasksTable.id, id));
  if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const { contractorName, contractorEmail, contractorPhone, taskName, description, startDate, endDate, status, cost } = req.body;
  const updateData: Record<string, unknown> = { contractorName, contractorEmail, contractorPhone, taskName, description, status, cost };
  if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
  if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
  const [updated] = await db.update(contractorTasksTable).set(updateData as never).where(eq(contractorTasksTable.id, id)).returning();
  res.json(ser(updated as unknown as Record<string, unknown>));
});

router.delete("/architect/contractors/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(contractorTasksTable).where(eq(contractorTasksTable.id, id));
  if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  await db.delete(contractorTasksTable).where(eq(contractorTasksTable.id, id));
  res.status(204).end();
});

// ─── FLOOR PLANS ─────────────────────────────────────────────────────────────

router.get("/architect/floor-plans", async (req, res): Promise<void> => {
  const { vendorId, projectId } = req.query as Record<string, string>;
  if (!vendorId) { res.status(400).json({ error: "vendorId required" }); return; }
  const check = await resolveVendorAccess(req, parseInt(vendorId));
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const conditions = [eq(floorPlansTable.vendorId, parseInt(vendorId))];
  if (projectId) conditions.push(eq(floorPlansTable.projectId, parseInt(projectId)));
  const rows = await db.select().from(floorPlansTable).where(and(...conditions)).orderBy(desc(floorPlansTable.updatedAt));
  res.json(rows.map((r) => ser(r as unknown as Record<string, unknown>)));
});

router.post("/architect/floor-plans", async (req, res): Promise<void> => {
  const { vendorId, projectId, name, data } = req.body;
  if (!vendorId || !name) { res.status(400).json({ error: "vendorId and name are required" }); return; }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const [row] = await db.insert(floorPlansTable).values({ vendorId, projectId: projectId || null, name, data: data ? JSON.stringify(data) : null }).returning();
  res.status(201).json(ser(row as unknown as Record<string, unknown>));
});

router.patch("/architect/floor-plans/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(floorPlansTable).where(eq(floorPlansTable.id, id));
  if (!existing) { res.status(404).json({ error: "Floor plan not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const { name, data, projectId } = req.body;
  const updateData: Record<string, unknown> = { name, updatedAt: new Date() };
  if (projectId !== undefined) updateData.projectId = projectId || null;
  if (data !== undefined) updateData.data = JSON.stringify(data);
  const [updated] = await db.update(floorPlansTable).set(updateData as never).where(eq(floorPlansTable.id, id)).returning();
  res.json(ser(updated as unknown as Record<string, unknown>));
});

router.delete("/architect/floor-plans/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(floorPlansTable).where(eq(floorPlansTable.id, id));
  if (!existing) { res.status(404).json({ error: "Floor plan not found" }); return; }
  const check = await resolveVendorAccess(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  await db.delete(floorPlansTable).where(eq(floorPlansTable.id, id));
  res.status(204).end();
});

// ─── AI DESIGN GENERATION ────────────────────────────────────────────────────

const CATEGORY_CONTEXT: Record<string, string> = {
  architecture: "Professional architectural visualization, building design exterior render",
  branding: "Professional business branding design, logo and visual identity concept on clean white background",
  fashion: "Fashion design illustration, clothing design with fabric pattern details, style sketch",
  interior: "Professional interior design rendering, room decoration and furniture layout, staged presentation",
};

const STYLE_CONTEXT: Record<string, string> = {
  realistic: "photorealistic, high detail, professional photography lighting, ultra realistic",
  "3d": "high quality 3D render, studio lighting, modern architectural visualization",
  sketch: "detailed pencil sketch, technical illustration, hand-drawn architectural style",
  watercolor: "watercolor painting illustration, artistic, soft color palette, beautiful rendering",
  minimalist: "minimalist aesthetic, clean lines, simple color palette, modern flat design",
  blueprint: "technical blueprint drawing, white technical lines on deep blue background, precise",
};

router.get("/architect/designs", async (req, res): Promise<void> => {
  const { vendorId } = req.query as Record<string, string>;
  if (!vendorId) { res.status(400).json({ error: "vendorId required" }); return; }
  const check = await resolveVendorAccess(req, parseInt(vendorId));
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const rows = await db.select().from(designGenerationsTable)
    .where(eq(designGenerationsTable.vendorId, parseInt(vendorId)))
    .orderBy(desc(designGenerationsTable.createdAt))
    .limit(60);
  res.json(rows.map((r) => ser(r as unknown as Record<string, unknown>)));
});

router.post("/architect/generate-design", async (req, res): Promise<void> => {
  const { vendorId, prompt, category, style } = req.body;
  if (!vendorId || !prompt?.trim() || !category) {
    res.status(400).json({ error: "vendorId, prompt, and category are required" });
    return;
  }
  const check = await resolveVendorAccess(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const catCtx = CATEGORY_CONTEXT[category] ?? "Professional design rendering";
  const styleCtx = STYLE_CONTEXT[style ?? "realistic"] ?? "high quality, detailed";
  const fullPrompt = `${catCtx}, ${styleCtx}: ${String(prompt).trim()}. No text labels or watermarks in the image.`;

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: fullPrompt,
    n: 1,
    size: "1024x1024",
    quality: "standard",
    response_format: "url",
  });

  const imageUrl = response.data?.[0]?.url ?? null;
  const revisedPrompt = response.data?.[0]?.revised_prompt ?? null;

  const [row] = await db.insert(designGenerationsTable).values({
    vendorId, category, prompt: String(prompt).trim(),
    style: style ?? "realistic", imageUrl, revisedPrompt,
  }).returning();

  res.status(201).json(ser(row as unknown as Record<string, unknown>));
});

// Edit an existing design using GPT-4o vision analysis + DALL·E 3 regeneration
router.post("/architect/edit-design", upload.single("image"), async (req, res): Promise<void> => {
  const { vendorId, editPrompt, category, style } = req.body as Record<string, string>;
  const file = req.file;

  if (!vendorId || !editPrompt?.trim()) {
    res.status(400).json({ error: "vendorId and editPrompt are required" });
    return;
  }
  if (!file) {
    res.status(400).json({ error: "An image file is required" });
    return;
  }

  const check = await resolveVendorAccess(req, parseInt(vendorId));
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const imageBase64 = file.buffer.toString("base64");
  const mimeType = file.mimetype || "image/jpeg";

  // Step 1: GPT-4o analyzes the uploaded design and writes an edit-aware DALL·E 3 prompt
  const visionRes = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" },
          },
          {
            type: "text",
            text: `You are a professional design AI. Carefully analyze this design image and write a highly detailed DALL-E 3 image-generation prompt that recreates it faithfully but applies the following modifications: "${editPrompt}".

Requirements:
- Describe all key visual elements, colors, materials, composition, and style of the original
- Incorporate the requested changes seamlessly
- Be specific and rich in detail to get the best DALL-E 3 result
- Do NOT mention text, watermarks, or labels

Return ONLY the DALL-E 3 prompt — no explanation, no preamble.`,
          },
        ],
      },
    ],
    max_tokens: 600,
  });

  const dallePrompt = visionRes.choices[0]?.message?.content?.trim() ?? editPrompt.trim();

  // Step 2: Generate the edited design with DALL·E 3
  const catCtx = CATEGORY_CONTEXT[category ?? "architecture"] ?? "Professional design rendering";
  const styleCtx = STYLE_CONTEXT[style ?? "realistic"] ?? "high quality, detailed";
  const fullPrompt = `${catCtx}, ${styleCtx}: ${dallePrompt}. No text labels or watermarks in the image.`;

  const imgResponse = await openai.images.generate({
    model: "dall-e-3",
    prompt: fullPrompt,
    n: 1,
    size: "1024x1024",
    quality: "standard",
    response_format: "url",
  });

  const imageUrl = imgResponse.data?.[0]?.url ?? null;
  const revisedPrompt = imgResponse.data?.[0]?.revised_prompt ?? null;

  const [row] = await db.insert(designGenerationsTable).values({
    vendorId: parseInt(vendorId),
    category: category ?? "architecture",
    prompt: `[Edited] ${String(editPrompt).trim()}`,
    style: style ?? "realistic",
    imageUrl,
    revisedPrompt,
  }).returning();

  res.status(201).json(ser(row as unknown as Record<string, unknown>));
});

// Proxy the image server-side so the frontend can draw it on Canvas without CORS issues
router.get("/architect/designs/:id/image", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [design] = await db.select().from(designGenerationsTable).where(eq(designGenerationsTable.id, id));
  if (!design?.imageUrl) { res.status(404).json({ error: "Not found" }); return; }
  const check = await resolveVendorAccess(req, design.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  try {
    const imgRes = await fetch(design.imageUrl);
    if (!imgRes.ok) { res.status(502).json({ error: "Image expired — please regenerate" }); return; }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(buffer);
  } catch {
    res.status(502).json({ error: "Failed to fetch image" });
  }
});

export default router;

