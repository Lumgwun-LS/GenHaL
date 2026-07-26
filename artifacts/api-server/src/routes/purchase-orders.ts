import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  db,
  purchaseOrdersTable,
  purchaseOrderItemsTable,
  productsTable,
  vendorsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../lib/email-branding";

const router: IRouter = Router();

async function resolveAuthedVendor(req: import("express").Request) {
  const { userId } = getAuth(req);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id, name: vendorsTable.name, email: vendorsTable.email, phone: vendorsTable.phone, address: vendorsTable.address }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin, vendorName: vendor?.name, vendorEmail: vendor?.email, vendorPhone: vendor?.phone, vendorAddress: vendor?.address };
}

/** Generate a PO number: PO-YYYYMMDD-XXXX */
async function generatePoNumber(vendorId: number): Promise<string> {
  const date = new Date();
  const ds = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrdersTable)
    .where(eq(purchaseOrdersTable.vendorId, vendorId));
  const seq = String((row?.count ?? 0) + 1).padStart(4, "0");
  return `PO-${ds}-${seq}`;
}

// ── List purchase orders ──────────────────────────────────────────────────────
router.get("/purchase-orders", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  const vendorId = authed.isAdmin && req.query.vendorId ? Number(req.query.vendorId) : authed.vendorId!;

  const orders = await db
    .select()
    .from(purchaseOrdersTable)
    .where(eq(purchaseOrdersTable.vendorId, vendorId))
    .orderBy(desc(purchaseOrdersTable.createdAt));

  res.json(orders.map(o => ({
    ...o,
    subtotal: parseFloat(o.subtotal),
    taxAmount: parseFloat(o.taxAmount),
    totalAmount: parseFloat(o.totalAmount),
  })));
});

// ── Get single purchase order with items ─────────────────────────────────────
router.get("/purchase-orders/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, Number(req.params.id)));
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  if (!authed.isAdmin && order.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const items = await db.select({
    id: purchaseOrderItemsTable.id,
    purchaseOrderId: purchaseOrderItemsTable.purchaseOrderId,
    productId: purchaseOrderItemsTable.productId,
    description: purchaseOrderItemsTable.description,
    quantity: purchaseOrderItemsTable.quantity,
    unitPrice: purchaseOrderItemsTable.unitPrice,
    totalPrice: purchaseOrderItemsTable.totalPrice,
    createdAt: purchaseOrderItemsTable.createdAt,
  }).from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, order.id));

  res.json({
    ...order,
    subtotal: parseFloat(order.subtotal),
    taxAmount: parseFloat(order.taxAmount),
    totalAmount: parseFloat(order.totalAmount),
    items: items.map(i => ({
      ...i,
      unitPrice: parseFloat(i.unitPrice),
      totalPrice: parseFloat(i.totalPrice),
    })),
  });
});

// ── Create purchase order ─────────────────────────────────────────────────────
router.post("/purchase-orders", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { supplierName, supplierEmail, supplierPhone, supplierAddress, notes, currency, taxRate, items: rawItems } = req.body;
  if (!supplierName) { res.status(400).json({ error: "supplierName is required" }); return; }
  if (!Array.isArray(rawItems) || rawItems.length === 0) { res.status(400).json({ error: "At least one item is required" }); return; }

  type ItemInput = { description: string; quantity: number; unitPrice: number; productId?: number };
  const items: ItemInput[] = rawItems.map((i: Record<string, unknown>) => ({
    description: String(i.description ?? ""),
    quantity: Math.max(1, Number(i.quantity) || 1),
    unitPrice: parseFloat(String(i.unitPrice)) || 0,
    productId: i.productId ? Number(i.productId) : undefined,
  }));

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = subtotal * (parseFloat(String(taxRate ?? 0)) / 100);
  const totalAmount = subtotal + taxAmount;
  const orderNumber = await generatePoNumber(authed.vendorId);

  const [order] = await db.insert(purchaseOrdersTable).values({
    vendorId: authed.vendorId,
    orderNumber,
    supplierName,
    supplierEmail: supplierEmail || null,
    supplierPhone: supplierPhone || null,
    supplierAddress: supplierAddress || null,
    notes: notes || null,
    currency: currency || "USD",
    subtotal: String(subtotal),
    taxAmount: String(taxAmount),
    totalAmount: String(totalAmount),
  }).returning();

  if (order) {
    await db.insert(purchaseOrderItemsTable).values(
      items.map(i => ({
        purchaseOrderId: order.id,
        productId: i.productId ?? null,
        description: i.description,
        quantity: i.quantity,
        unitPrice: String(i.unitPrice),
        totalPrice: String(i.quantity * i.unitPrice),
      }))
    );
  }

  res.status(201).json({ ...order, subtotal, taxAmount, totalAmount });
});

// ── Update purchase order status ──────────────────────────────────────────────
router.patch("/purchase-orders/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, Number(req.params.id)));
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  if (!authed.isAdmin && order.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { status, notes, supplierEmail, supplierPhone, supplierAddress } = req.body;
  const updates: Partial<typeof order> = {};
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (supplierEmail !== undefined) updates.supplierEmail = supplierEmail;
  if (supplierPhone !== undefined) updates.supplierPhone = supplierPhone;
  if (supplierAddress !== undefined) updates.supplierAddress = supplierAddress;

  const [updated] = await db.update(purchaseOrdersTable).set(updates).where(eq(purchaseOrdersTable.id, order.id)).returning();
  res.json({ ...updated, subtotal: parseFloat(updated!.subtotal), taxAmount: parseFloat(updated!.taxAmount), totalAmount: parseFloat(updated!.totalAmount) });
});

// ── Delete purchase order ─────────────────────────────────────────────────────
router.delete("/purchase-orders/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, Number(req.params.id)));
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  if (!authed.isAdmin && order.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, order.id));
  res.status(204).send();
});

// ── Email PO to supplier ──────────────────────────────────────────────────────
router.post("/purchase-orders/:id/email", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, Number(req.params.id)));
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  if (!authed.isAdmin && order.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const toEmail = req.body.email || order.supplierEmail;
  if (!toEmail) { res.status(400).json({ error: "Supplier email is required" }); return; }

  const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, order.id));

  const rowsHtml = items.map(i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(i.description)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${i.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${parseFloat(i.unitPrice).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${parseFloat(i.totalPrice).toFixed(2)}</td>
    </tr>
  `).join("");

  const bodyHtml = `
    <h2 style="color:#1a1a1a;">Purchase Order: ${escapeHtml(order.orderNumber)}</h2>
    <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
    <p><strong>From:</strong> ${escapeHtml(authed.vendorName ?? "Vendor")}</p>
    <p><strong>To:</strong> ${escapeHtml(order.supplierName)}${order.supplierAddress ? `<br>${escapeHtml(order.supplierAddress)}` : ""}</p>
    ${order.notes ? `<p><strong>Notes:</strong> ${escapeHtml(order.notes)}</p>` : ""}
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:10px 12px;text-align:left;">Description</th>
          <th style="padding:10px 12px;text-align:right;">Qty</th>
          <th style="padding:10px 12px;text-align:right;">Unit Price</th>
          <th style="padding:10px 12px;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr><td colspan="3" style="padding:8px 12px;text-align:right;font-weight:600;">Subtotal</td><td style="padding:8px 12px;text-align:right;">${order.currency} ${parseFloat(order.subtotal).toFixed(2)}</td></tr>
        ${parseFloat(order.taxAmount) > 0 ? `<tr><td colspan="3" style="padding:8px 12px;text-align:right;">Tax</td><td style="padding:8px 12px;text-align:right;">${order.currency} ${parseFloat(order.taxAmount).toFixed(2)}</td></tr>` : ""}
        <tr style="background:#f5f5f5;"><td colspan="3" style="padding:10px 12px;text-align:right;font-weight:700;">TOTAL</td><td style="padding:10px 12px;text-align:right;font-weight:700;">${order.currency} ${parseFloat(order.totalAmount).toFixed(2)}</td></tr>
      </tfoot>
    </table>
  `;

  const html = wrapVendorEmail({ bodyHtml });
  const result = await sendEmail({ to: toEmail, subject: `Purchase Order ${order.orderNumber}`, html });

  if (result.status === "sent") {
    await db.update(purchaseOrdersTable).set({ status: "sent" }).where(eq(purchaseOrdersTable.id, order.id));
  }

  res.json({ status: result.status, error: result.error });
});

// ── Get stock alert settings ──────────────────────────────────────────────────
router.get("/inventory/alert-settings", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { vendorStockAlertSettingsTable: settingsTable } = await import("@workspace/db");
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.vendorId, authed.vendorId));

  res.json(settings ?? { vendorId: authed.vendorId, alert60Enabled: true, alert40Enabled: true, alert20Enabled: true });
});

// ── Update stock alert settings ───────────────────────────────────────────────
router.patch("/inventory/alert-settings", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { alert60Enabled, alert40Enabled, alert20Enabled } = req.body;
  const { vendorStockAlertSettingsTable: settingsTable } = await import("@workspace/db");

  const [existing] = await db.select({ id: settingsTable.id }).from(settingsTable).where(eq(settingsTable.vendorId, authed.vendorId));

  const values = {
    vendorId: authed.vendorId,
    ...(alert60Enabled !== undefined && { alert60Enabled: Boolean(alert60Enabled) }),
    ...(alert40Enabled !== undefined && { alert40Enabled: Boolean(alert40Enabled) }),
    ...(alert20Enabled !== undefined && { alert20Enabled: Boolean(alert20Enabled) }),
  };

  if (existing) {
    const [updated] = await db.update(settingsTable).set(values).where(eq(settingsTable.id, existing.id)).returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(settingsTable).values(values).returning();
    res.status(201).json(created);
  }
});

export default router;
