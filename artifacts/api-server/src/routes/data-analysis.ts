/**
 * Data Analysis routes — Excel/CSV upload, AI analysis, and import.
 * Sessions are stored in-memory with a 24-hour TTL.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  db,
  vendorsTable,
  salesTable,
  expensesTable,
  productsTable,
} from "@workspace/db";

const router: IRouter = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

export type ColumnType = "numeric" | "date" | "categorical" | "text";

export type ColumnMeta = {
  name: string;
  type: ColumnType;
  sample: string[];
  min?: number;
  max?: number;
  avg?: number;
  uniqueCount?: number;
};

export type ParsedSession = {
  sessionId: string;
  fileName: string;
  rowCount: number;
  columns: ColumnMeta[];
  preview: Record<string, string>[];  // first 20 rows
  allRows: Record<string, string>[];  // all rows (for import)
  detectedSchema: "sales" | "expenses" | "products" | "contacts" | "generic";
  expiresAt: number;
  vendorId: number;
  history: Array<{ role: "user" | "assistant"; content: string }>;
};

// In-memory session store with 24h TTL
const sessions = new Map<string, ParsedSession>();

// Cleanup sessions older than 24h every hour
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (v.expiresAt < now) sessions.delete(k);
  }
}, 60 * 60 * 1000);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolveVendor(req: Request) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const [v] = await db.select({ id: vendorsTable.id, name: vendorsTable.name })
    .from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return v ?? null;
}

const LIKELY_DATE_PATTERNS = [
  /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/,
  /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/,
  /^[A-Za-z]{3}[\s-]\d{4}$/,
  /^\d{4}[-/]\d{1,2}$/,
  /^Q[1-4]\s*\d{4}$/,
];

function inferType(values: string[]): ColumnType {
  const nonempty = values.filter(v => v !== "" && v !== null && v !== undefined);
  if (nonempty.length === 0) return "text";

  // Try numeric (strip currency symbols, commas)
  const numericCount = nonempty.filter(v => !isNaN(parseFloat(v.replace(/[₦$€£,\s]/g, "")))).length;
  if (numericCount / nonempty.length > 0.8) return "numeric";

  // Try date
  const dateCount = nonempty.filter(v =>
    LIKELY_DATE_PATTERNS.some(p => p.test(v.trim())) ||
    (!isNaN(Date.parse(v)) && v.trim().length > 4)
  ).length;
  if (dateCount / nonempty.length > 0.7) return "date";

  // Categorical vs text: low cardinality = categorical
  const unique = new Set(nonempty.map(v => v.toLowerCase())).size;
  if (unique <= Math.min(20, nonempty.length * 0.5)) return "categorical";

  return "text";
}

function numericStats(values: string[]): { min: number; max: number; avg: number } {
  const nums = values
    .map(v => parseFloat(v.replace(/[₦$€£,\s]/g, "")))
    .filter(n => !isNaN(n));
  if (nums.length === 0) return { min: 0, max: 0, avg: 0 };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return { min, max, avg };
}

function detectSchema(columns: ColumnMeta[]): ParsedSession["detectedSchema"] {
  const names = columns.map(c => c.name.toLowerCase());
  const hasDate = columns.some(c => c.type === "date" ||
    names.some(n => n.includes("date") || n.includes("month") || n.includes("year") || n.includes("time")));
  const hasAmount = names.some(n =>
    n.includes("amount") || n.includes("total") || n.includes("revenue") || n.includes("price") ||
    n.includes("cost") || n.includes("fee") || n.includes("value") || n.includes("sum"));
  const hasCategory = names.some(n => n.includes("category") || n.includes("type") || n.includes("expense") || n.includes("description"));
  const hasStock = names.some(n => n.includes("stock") || n.includes("quantity") || n.includes("inventory") || n.includes("qty"));
  const hasName = names.some(n => n.includes("name") || n.includes("product") || n.includes("item") || n.includes("sku"));
  const hasEmail = names.some(n => n.includes("email") || n.includes("phone") || n.includes("contact"));

  if (hasDate && hasAmount && hasCategory) return "expenses";
  if (hasDate && hasAmount) return "sales";
  if (hasName && hasStock && hasAmount) return "products";
  if (hasEmail || (hasName && !hasAmount)) return "contacts";
  return "generic";
}

function buildDataSummaryText(session: ParsedSession): string {
  const numCols = session.columns.filter(c => c.type === "numeric");
  const dateCols = session.columns.filter(c => c.type === "date");
  const catCols = session.columns.filter(c => c.type === "categorical");

  const statsLines = numCols.map(c =>
    `  - ${c.name}: min=${c.min?.toFixed(2)}, max=${c.max?.toFixed(2)}, avg=${c.avg?.toFixed(2)}`
  );

  const sampleRows = session.preview.slice(0, 10).map(row =>
    session.columns.map(c => `${c.name}=${row[c.name] ?? ""}`).join(", ")
  );

  return [
    `Dataset: "${session.fileName}"`,
    `Total rows: ${session.rowCount}`,
    `Columns (${session.columns.length}): ${session.columns.map(c => `${c.name} (${c.type})`).join(", ")}`,
    dateCols.length > 0 ? `Date columns: ${dateCols.map(c => c.name).join(", ")}` : "",
    catCols.length > 0 ? `Categorical columns with unique values: ${catCols.map(c => `${c.name} (${c.uniqueCount} unique)`).join(", ")}` : "",
    numCols.length > 0 ? `Numeric column statistics:\n${statsLines.join("\n")}` : "",
    `\nSample rows (first 10):\n${sampleRows.join("\n")}`,
  ].filter(Boolean).join("\n");
}

// ── Upload ────────────────────────────────────────────────────────────────────

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/data-analysis/upload", upload.single("file"), async (req: any, res: any): Promise<void> => {
  const vendor = await resolveVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const { originalname, buffer, mimetype } = req.file;
  const ext = originalname.toLowerCase().split(".").pop() ?? "";

  let rows: Record<string, string>[] = [];

  try {
    if (ext === "csv" || mimetype === "text/csv" || mimetype === "text/plain") {
      // Parse CSV manually (same pattern as sales import)
      const text = buffer.toString("utf8");
      const rawRows: string[][] = [];
      let row: string[] = [], current = "", inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]!;
        if (ch === '"') {
          if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) { row.push(current.trim()); current = ""; }
        else if ((ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) && !inQuotes) {
          if (ch === '\r') i++;
          row.push(current.trim());
          if (row.some(v => v !== '')) rawRows.push(row);
          row = []; current = "";
        } else current += ch;
      }
      if (current !== '' || row.length > 0) { row.push(current.trim()); if (row.some(v => v !== '')) rawRows.push(row); }

      if (rawRows.length < 2) { res.status(400).json({ error: "CSV must have a header row and at least one data row" }); return; }
      const headers = rawRows[0]!;
      rows = rawRows.slice(1).map(r =>
        Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))
      );
    } else if (["xlsx", "xls", "ods"].includes(ext)) {
      const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) { res.status(400).json({ error: "Workbook has no sheets" }); return; }
      const sheet = workbook.Sheets[sheetName]!;
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      rows = raw.map(r =>
        Object.fromEntries(
          Object.entries(r).map(([k, v]) => [
            String(k),
            v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ""),
          ])
        )
      );
    } else {
      res.status(400).json({ error: "Unsupported file type. Upload .xlsx, .xls, or .csv" });
      return;
    }
  } catch (e: unknown) {
    res.status(400).json({ error: `Failed to parse file: ${e instanceof Error ? e.message : "unknown error"}` });
    return;
  }

  if (rows.length === 0) { res.status(400).json({ error: "File is empty or has no data rows" }); return; }

  const columnNames = Object.keys(rows[0]!);
  const columns: ColumnMeta[] = columnNames.map(name => {
    const values = rows.map(r => r[name] ?? "");
    const type = inferType(values);
    const meta: ColumnMeta = { name, type, sample: values.slice(0, 5), uniqueCount: new Set(values.map(v => v.toLowerCase())).size };
    if (type === "numeric") Object.assign(meta, numericStats(values));
    return meta;
  });

  const preview = rows.slice(0, 20);
  const detectedSchema = detectSchema(columns);
  const sessionId = randomUUID();

  sessions.set(sessionId, {
    sessionId,
    fileName: originalname,
    rowCount: rows.length,
    columns,
    preview,
    allRows: rows,
    detectedSchema,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    vendorId: vendor.id,
    history: [],
  });

  res.json({
    sessionId,
    fileName: originalname,
    rowCount: rows.length,
    columns: columns.map(({ allRows: _r, ...c }: any) => c),
    preview,
    detectedSchema,
  });
});

// ── Analyze (SSE streaming) ───────────────────────────────────────────────────

router.post("/data-analysis/analyze", async (req: Request, res: Response): Promise<void> => {
  const vendor = await resolveVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { sessionId, question } = req.body as { sessionId: string; question?: string };
  if (!sessionId) { res.status(400).json({ error: "sessionId is required" }); return; }

  const session = sessions.get(sessionId);
  if (!session) { res.status(404).json({ error: "Session not found or expired" }); return; }
  if (session.vendorId !== vendor.id) { res.status(403).json({ error: "Forbidden" }); return; }

  const userQuestion = question?.trim() || "Summarise this dataset: describe what it contains, highlight key statistics, identify any trends or anomalies, and suggest 2-3 business insights.";

  const dataSummary = buildDataSummaryText(session);

  const systemPrompt = `You are a business data analyst helping a vendor understand their spreadsheet data. 
Be concise, use plain English, and format your response with clear sections using markdown (## headings, bullet points, bold key numbers).
Focus on actionable insights relevant to a small business owner.`;

  // Build message list: system prompt, grounding context as first user turn,
  // then the full prior history, then the new question.
  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Here is the dataset information:\n\n${dataSummary}`,
    },
    {
      role: "assistant",
      content: "Understood. I have reviewed the dataset. Please ask your question.",
    },
    ...session.history.map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: userQuestion },
  ];

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let fullResponse = "";

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      stream: true,
      max_tokens: 1200,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullResponse += delta;
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }

    // Save to history
    session.history.push(
      { role: "user", content: userQuestion },
      { role: "assistant", content: fullResponse }
    );
    // Keep history bounded
    if (session.history.length > 20) session.history = session.history.slice(-20);

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (e: unknown) {
    res.write(`data: ${JSON.stringify({ error: e instanceof Error ? e.message : "AI error" })}\n\n`);
  }

  res.end();
});

// ── Import ────────────────────────────────────────────────────────────────────

router.post("/data-analysis/import", async (req: Request, res: Response): Promise<void> => {
  const vendor = await resolveVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { sessionId, mapping, targetSchema } = req.body as {
    sessionId: string;
    targetSchema: "sales" | "expenses" | "products";
    mapping: Record<string, string>; // our field → column name in file
  };

  const session = sessions.get(sessionId);
  if (!session) { res.status(404).json({ error: "Session not found or expired" }); return; }
  if (session.vendorId !== vendor.id) { res.status(403).json({ error: "Forbidden" }); return; }

  const get = (row: Record<string, string>, key: string): string =>
    (mapping[key] ? row[mapping[key]] : undefined) ?? "";

  const parseNum = (v: string) => parseFloat(v.replace(/[₦$€£,\s]/g, "")) || 0;
  const parseDate = (v: string) => {
    const d = new Date(v);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  let imported = 0;
  const errors: Array<{ row: number; error: string }> = [];

  try {
    if (targetSchema === "sales") {
      for (let i = 0; i < session.allRows.length; i++) {
        const row = session.allRows[i]!;
        const amount = parseNum(get(row, "amount"));
        if (!amount) { errors.push({ row: i + 1, error: "Missing or zero amount" }); continue; }
        try {
          await db.insert(salesTable).values({
            vendorId: vendor.id,
            source: "manual",
            description: get(row, "description") || session.fileName,
            customerName: get(row, "customerName") || null,
            amount: amount.toString(),
            currency: get(row, "currency") || "NGN",
            saleDate: parseDate(get(row, "date")),
          });
          imported++;
        } catch (e) { errors.push({ row: i + 1, error: String(e) }); }
      }
    } else if (targetSchema === "expenses") {
      for (let i = 0; i < session.allRows.length; i++) {
        const row = session.allRows[i]!;
        const amount = parseNum(get(row, "amount"));
        if (!amount) { errors.push({ row: i + 1, error: "Missing or zero amount" }); continue; }
        try {
          await db.insert(expensesTable).values({
            vendorId: vendor.id,
            category: get(row, "category") || "Other",
            description: get(row, "description") || session.fileName,
            amount: amount.toString(),
            currency: get(row, "currency") || "NGN",
            expenseDate: parseDate(get(row, "date")),
          });
          imported++;
        } catch (e) { errors.push({ row: i + 1, error: String(e) }); }
      }
    } else if (targetSchema === "products") {
      for (let i = 0; i < session.allRows.length; i++) {
        const row = session.allRows[i]!;
        const name = get(row, "name");
        if (!name) { errors.push({ row: i + 1, error: "Missing product name" }); continue; }
        const price = parseNum(get(row, "price"));
        try {
          await db.insert(productsTable).values({
            vendorId: vendor.id,
            name,
            sku: get(row, "sku") || null,
            description: get(row, "description") || null,
            price: price.toString(),
            stockQuantity: parseInt(get(row, "stock") || "0") || 0,
            status: "active",
          });
          imported++;
        } catch (e) { errors.push({ row: i + 1, error: String(e) }); }
      }
    } else {
      res.status(400).json({ error: `Unknown targetSchema: ${targetSchema}` });
      return;
    }
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
    return;
  }

  res.json({ imported, errors: errors.slice(0, 20), total: session.allRows.length });
});

export default router;
