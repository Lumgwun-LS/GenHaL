/**
 * AI Quick Create — voice/chat/form → structured entity → DB record + notification.
 *
 * POST /api/ai-quick-create/parse
 *   Uses OpenAI to parse a natural-language description into a structured JSON
 *   object matching the target entity type (product | order | sale).
 *
 * POST /api/ai-quick-create/create
 *   Validates and inserts the structured payload into the correct table, then
 *   fires an in-app vendor notification.
 */
import { Router } from "express";
import {
  db,
  productsTable,
  ordersTable,
  orderItemsTable,
  salesTable,
  vendorNotificationsTable,
  vendorsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { sendPushToVendor } from "../lib/push";

const router = Router();

// ── helpers ─────────────────────────────────────────────────────────────────

async function resolveVendorId(clerkUserId: string): Promise<number | null> {
  const [v] = await db
    .select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, clerkUserId))
    .limit(1);
  return v?.id ?? null;
}

async function insertNotification(
  vendorId: number,
  type: string,
  title: string,
  message: string,
) {
  await db.insert(vendorNotificationsTable).values({
    vendorId,
    type,
    message: title ? `${title}: ${message}` : message,
  });
}

// ── system prompts ───────────────────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<string, string> = {
  product: `You are a data extraction assistant. The user will describe a product or inventory item in natural language.
Extract the following fields and return ONLY valid JSON (no markdown, no explanation):
{
  "name": "string — product name",
  "sku": "string — SKU code (infer from name if not given, e.g. MJ-75CL)",
  "price": "string — numeric price (digits and decimal point only)",
  "category": "string — product category",
  "stockQuantity": number,
  "description": "string or null",
  "unit": "string or null — e.g. kg, pcs, bottle"
}
If a field cannot be determined, use a sensible default (price: "0", stockQuantity: 0, category: "General").`,

  order: `You are a data extraction assistant. The user will describe a customer order in natural language.
Extract the following fields and return ONLY valid JSON (no markdown, no explanation):
{
  "customerName": "string",
  "customerEmail": "string — use 'unknown@unknown.com' if not given",
  "customerPhone": "string or null",
  "totalAmount": "string — numeric amount (digits and decimal only)",
  "currency": "string — USD or NGN (default NGN)",
  "notes": "string or null",
  "shippingAddress": "string or null"
}`,

  sale: `You are a data extraction assistant. The user will describe a sale or invoice in natural language.
Extract the following fields and return ONLY valid JSON (no markdown, no explanation):
{
  "description": "string — brief description of what was sold",
  "customerName": "string or null",
  "amount": "string — numeric amount (digits and decimal only)",
  "currency": "string — USD or NGN (default NGN)"
}`,
};

// ── POST /api/ai-quick-create/parse ─────────────────────────────────────────

router.post("/ai-quick-create/parse", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { entityType, description } = req.body as { entityType?: string; description?: string };
  if (!entityType || !description?.trim()) {
    return void res.status(400).json({ error: "entityType and description are required" });
  }
  if (!["product", "order", "sale"].includes(entityType)) {
    return void res.status(400).json({ error: "Invalid entityType" });
  }
  if (description.length > 2000) {
    return void res.status(400).json({ error: "Description too long (max 2000 chars)" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPTS[entityType] },
        { role: "user", content: description },
      ],
      temperature: 0.1,
      max_tokens: 512,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return void res.status(422).json({ error: "AI returned unparseable response. Please rephrase." });
    }

    return void res.json(parsed);
  } catch (err) {
    console.error("[ai-quick-create] parse error", err);
    return void res.status(500).json({ error: "AI parsing failed. Please try again." });
  }
});

// ── POST /api/ai-quick-create/create ────────────────────────────────────────

router.post("/ai-quick-create/create", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const vendorId = await resolveVendorId(userId);
  if (!vendorId) return void res.status(400).json({ error: "Vendor account not found" });

  const { entityType, data } = req.body as { entityType?: string; data?: Record<string, unknown> };
  if (!entityType || !data) {
    return void res.status(400).json({ error: "entityType and data are required" });
  }

  try {
    if (entityType === "product") {
      const d = data as { name?: string; sku?: string; price?: string; category?: string; stockQuantity?: number; description?: string; unit?: string };
      if (!d.name?.trim() || !d.sku?.trim() || !d.category?.trim()) {
        return void res.status(400).json({ error: "name, sku, and category are required for a product" });
      }
      const [row] = await db.insert(productsTable).values({
        vendorId,
        name: d.name.trim(),
        sku: d.sku.trim(),
        price: String(parseFloat(d.price ?? "0") || 0),
        costPrice: null,
        category: d.category.trim(),
        stockQuantity: d.stockQuantity ?? 0,
        description: d.description?.trim() ?? null,
        unit: d.unit?.trim() ?? null,
        status: "active",
      }).returning({ id: productsTable.id });

      await insertNotification(
        vendorId,
        "product_created",
        "New Inventory Item Added",
        `"${d.name}" has been added to your inventory via AI Quick Create.`,
      );
      await sendPushToVendor(vendorId, "New Inventory Item", `"${d.name}" added to inventory.`, { screen: "products" }).catch(() => {});

      return void res.json({ id: row.id, message: `"${d.name}" added to inventory!` });
    }

    if (entityType === "order") {
      const d = data as { customerName?: string; customerEmail?: string; customerPhone?: string; totalAmount?: string; currency?: string; notes?: string; shippingAddress?: string };
      if (!d.customerName?.trim()) {
        return void res.status(400).json({ error: "customerName is required for an order" });
      }
      const [row] = await db.insert(ordersTable).values({
        vendorId,
        customerName: d.customerName.trim(),
        customerEmail: d.customerEmail?.trim() ?? "unknown@unknown.com",
        customerPhone: d.customerPhone?.trim() ?? null,
        totalAmount: String(parseFloat(d.totalAmount ?? "0") || 0),
        currency: d.currency ?? "NGN",
        notes: d.notes?.trim() ?? null,
        shippingAddress: d.shippingAddress?.trim() ?? null,
        status: "pending",
        paymentStatus: "unpaid",
      }).returning({ id: ordersTable.id });

      await insertNotification(
        vendorId,
        "order_created",
        "New Order Created",
        `Order #${row.id} for ${d.customerName} (${d.currency ?? "NGN"} ${d.totalAmount ?? "0"}) created via AI Quick Create.`,
      );
      await sendPushToVendor(vendorId, "New Order", `Order #${row.id} for ${d.customerName} created.`, { screen: "orders" }).catch(() => {});

      return void res.json({ id: row.id, message: `Order #${row.id} created for ${d.customerName}!` });
    }

    if (entityType === "sale") {
      const d = data as { description?: string; customerName?: string; amount?: string; currency?: string };
      if (!d.description?.trim()) {
        return void res.status(400).json({ error: "description is required for a sale" });
      }
      const [row] = await db.insert(salesTable).values({
        vendorId,
        source: "manual",
        description: d.description.trim(),
        customerName: d.customerName?.trim() ?? null,
        amount: String(parseFloat(d.amount ?? "0") || 0),
        currency: d.currency ?? "NGN",
        saleDate: new Date(),
      }).returning({ id: salesTable.id });

      await insertNotification(
        vendorId,
        "sale_created",
        "New Sale Recorded",
        `Sale #${row.id}: "${d.description}" (${d.currency ?? "NGN"} ${d.amount ?? "0"}) recorded via AI Quick Create.`,
      );
      await sendPushToVendor(vendorId, "New Sale", `"${d.description}" recorded.`, { screen: "sales" }).catch(() => {});

      return void res.json({ id: row.id, message: `Sale recorded successfully!` });
    }

    return void res.status(400).json({ error: "Invalid entityType" });
  } catch (err) {
    console.error("[ai-quick-create] create error", err);
    return void res.status(500).json({ error: "Failed to create record. Please try again." });
  }
});

export default router;
