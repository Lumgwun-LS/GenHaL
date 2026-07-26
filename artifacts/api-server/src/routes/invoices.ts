/**
 * Invoice management routes — vendor-authenticated.
 * Mounted after requireAuth in routes/index.ts.
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import crypto from "crypto";
import { db, vendorsTable, invoicesTable, invoiceItemsTable, invoiceInstalmentPaymentsTable, vendorNotificationsTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../lib/email-branding";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateShareToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

async function resolveVendor(req: import("express").Request): Promise<{ id: number; name: string; email: string | null } | null> {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const [v] = await db
    .select({ id: vendorsTable.id, name: vendorsTable.name, email: vendorsTable.email })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId));
  return v ?? null;
}

function calcTotals(items: Array<{ quantity: string; unitPrice: string }>, discountAmount: number, taxAmount: number) {
  const subtotal = items.reduce((s, it) => s + parseFloat(it.quantity) * parseFloat(it.unitPrice), 0);
  const total = Math.max(0, subtotal - discountAmount + taxAmount);
  return { subtotal, total };
}

function buildInstalments(
  invoiceId: number,
  totalAmount: number,
  dueDate: string | null | undefined,
  instalments: number,
): Array<{ invoiceId: number; instalmentNumber: number; amount: string; dueDate: string | null }> {
  if (instalments <= 1) {
    return [{ invoiceId, instalmentNumber: 1, amount: totalAmount.toFixed(2), dueDate: dueDate ?? null }];
  }
  const baseAmount = totalAmount / instalments;
  const rows = [];
  for (let n = 1; n <= instalments; n++) {
    // Space due dates monthly if base dueDate provided
    let instDueDate: string | null = null;
    if (dueDate) {
      const d = new Date(dueDate);
      d.setMonth(d.getMonth() + (n - 1));
      instDueDate = d.toISOString().split("T")[0]!;
    }
    rows.push({
      invoiceId,
      instalmentNumber: n,
      amount: (n === instalments ? totalAmount - baseAmount * (instalments - 1) : baseAmount).toFixed(2),
      dueDate: instDueDate,
    });
  }
  return rows;
}

// ── GET /invoices — list ──────────────────────────────────────────────────────

router.get("/invoices", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const invoices = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.vendorId, vendor.id))
    .orderBy(desc(invoicesTable.createdAt));

  const totalBilled = invoices.reduce((s, i) => s + parseFloat(i.totalAmount), 0);

  // Collect only actually-paid instalment amounts — accurate for partial payments
  let totalCollected = 0;
  if (invoices.length > 0) {
    const invoiceIds = invoices.map((i) => i.id);
    const paidRows = await db
      .select({ amount: invoiceInstalmentPaymentsTable.amount })
      .from(invoiceInstalmentPaymentsTable)
      .where(
        and(
          inArray(invoiceInstalmentPaymentsTable.invoiceId, invoiceIds),
          eq(invoiceInstalmentPaymentsTable.status, "paid"),
        ),
      );
    totalCollected = paidRows.reduce((s, r) => s + parseFloat(r.amount), 0);
  }

  res.json({ invoices, summary: { totalBilled, totalCollected, outstanding: totalBilled - totalCollected } });
});

// ── POST /invoices — create ───────────────────────────────────────────────────

router.post("/invoices", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    customerName, customerEmail, customerPhone,
    currency = "USD", dueDate, notes,
    discountAmount = 0, taxAmount = 0,
    items = [],
    instalments = 1,
  } = req.body as {
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    currency?: string;
    dueDate?: string;
    notes?: string;
    discountAmount?: number;
    taxAmount?: number;
    items: Array<{ description: string; quantity?: number; unitPrice: number; type?: string; productId?: number }>;
    instalments?: number;
  };

  if (!customerName?.trim()) { res.status(400).json({ error: "customerName is required" }); return; }
  if (!items.length) { res.status(400).json({ error: "At least one line item is required" }); return; }

  const itemRows = items.map((it) => ({
    description: it.description,
    quantity: String(it.quantity ?? 1),
    unitPrice: String(it.unitPrice),
    totalPrice: String((it.quantity ?? 1) * it.unitPrice),
    type: it.type ?? "service",
    productId: it.productId ?? null,
  }));

  const { subtotal, total } = calcTotals(itemRows, discountAmount, taxAmount);
  const shareToken = generateShareToken();

  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      vendorId: vendor.id,
      customerName: customerName.trim(),
      customerEmail: customerEmail?.trim() ?? null,
      customerPhone: customerPhone?.trim() ?? null,
      currency,
      subtotal: subtotal.toFixed(2),
      discountAmount: String(discountAmount),
      taxAmount: String(taxAmount),
      totalAmount: total.toFixed(2),
      status: "draft",
      dueDate: dueDate ?? null,
      shareToken,
      notes: notes ?? null,
    })
    .returning();

  // Insert line items
  if (itemRows.length > 0) {
    await db.insert(invoiceItemsTable).values(
      itemRows.map((it) => ({ ...it, invoiceId: invoice!.id })),
    );
  }

  // Insert instalment schedule
  const instalmentRows = buildInstalments(invoice!.id, total, dueDate, Math.max(1, instalments));
  await db.insert(invoiceInstalmentPaymentsTable).values(instalmentRows);

  res.status(201).json(invoice);
});

// ── GET /invoices/:id — detail ────────────────────────────────────────────────

router.get("/invoices/:id", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.vendorId, vendor.id)));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const [items, instalments] = await Promise.all([
    db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id)),
    db.select().from(invoiceInstalmentPaymentsTable).where(eq(invoiceInstalmentPaymentsTable.invoiceId, id)).orderBy(invoiceInstalmentPaymentsTable.instalmentNumber),
  ]);

  res.json({ ...invoice, items, instalments });
});

// ── PATCH /invoices/:id — update ──────────────────────────────────────────────

router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.vendorId, vendor.id)));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  if (existing.status === "paid") {
    res.status(409).json({ error: "Cannot edit a fully paid invoice" });
    return;
  }

  const { customerName, customerEmail, customerPhone, currency, dueDate, notes, status, discountAmount, taxAmount, items, instalments } = req.body;

  const updates: Partial<typeof existing> = { updatedAt: new Date() };
  if (customerName !== undefined) updates.customerName = customerName;
  if (customerEmail !== undefined) updates.customerEmail = customerEmail;
  if (customerPhone !== undefined) updates.customerPhone = customerPhone;
  if (currency !== undefined) updates.currency = currency;
  if (dueDate !== undefined) updates.dueDate = dueDate;
  if (notes !== undefined) updates.notes = notes;
  if (status !== undefined) updates.status = status;

  // If items changed, recalculate totals
  if (items && Array.isArray(items)) {
    const itemRows = items.map((it: { description: string; quantity?: number; unitPrice: number; type?: string; productId?: number }) => ({
      description: it.description,
      quantity: String(it.quantity ?? 1),
      unitPrice: String(it.unitPrice),
      totalPrice: String((it.quantity ?? 1) * it.unitPrice),
      type: it.type ?? "service",
      productId: it.productId ?? null,
    }));
    const { subtotal, total } = calcTotals(itemRows, discountAmount ?? parseFloat(existing.discountAmount), taxAmount ?? parseFloat(existing.taxAmount));
    updates.subtotal = subtotal.toFixed(2);
    updates.totalAmount = total.toFixed(2);
    if (discountAmount !== undefined) updates.discountAmount = String(discountAmount);
    if (taxAmount !== undefined) updates.taxAmount = String(taxAmount);

    // Replace items
    await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));
    await db.insert(invoiceItemsTable).values(itemRows.map((it) => ({ ...it, invoiceId: id })));

    // Replace instalments (only if invoice is still draft or pending)
    if (existing.status === "draft" || existing.status === "sent") {
      await db.delete(invoiceInstalmentPaymentsTable).where(
        and(eq(invoiceInstalmentPaymentsTable.invoiceId, id), eq(invoiceInstalmentPaymentsTable.status, "pending")),
      );
      const instCount = instalments ?? 1;
      const instRows = buildInstalments(id, total, dueDate ?? existing.dueDate, instCount);
      await db.insert(invoiceInstalmentPaymentsTable).values(instRows);
    }
  }

  const [updated] = await db.update(invoicesTable).set(updates).where(eq(invoicesTable.id, id)).returning();
  res.json(updated);
});

// ── DELETE /invoices/:id — cancel/delete ──────────────────────────────────────

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select({ id: invoicesTable.id, status: invoicesTable.status })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.vendorId, vendor.id)));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  if (existing.status === "paid") {
    res.status(409).json({ error: "Cannot delete a fully paid invoice. Cancel it instead." });
    return;
  }

  if (existing.status === "draft") {
    // Hard delete drafts
    await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
    res.json({ success: true, deleted: true });
  } else {
    // Soft cancel for sent/partially-paid invoices
    const [updated] = await db
      .update(invoicesTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(invoicesTable.id, id))
      .returning();
    res.json({ success: true, deleted: false, invoice: updated });
  }
});

// ── POST /invoices/:id/send — send to customer ────────────────────────────────

router.post("/invoices/:id/send", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.vendorId, vendor.id)));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (invoice.status === "paid" || invoice.status === "cancelled") {
    res.status(409).json({ error: `Cannot send an invoice with status '${invoice.status}'` });
    return;
  }

  const [items, instalments] = await Promise.all([
    db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id)),
    db.select().from(invoiceInstalmentPaymentsTable).where(eq(invoiceInstalmentPaymentsTable.invoiceId, id)).orderBy(invoiceInstalmentPaymentsTable.instalmentNumber),
  ]);

  const shareUrl = `${process.env.FRONTEND_URL ?? ""}${process.env.BASE_PATH ?? "/vendor-hub"}/invoice/${invoice.shareToken}`;

  if (invoice.customerEmail) {
    const itemsHtml = items
      .map(
        (it) =>
          `<tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">${escapeHtml(it.description)}</td>
           <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${parseFloat(it.quantity)} × ${parseFloat(it.unitPrice).toFixed(2)}</td>
           <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${parseFloat(it.totalPrice).toFixed(2)}</td></tr>`,
      )
      .join("");

    const instalmentHtml =
      instalments.length > 1
        ? `<p style="font-size:14px;color:#374151;margin-top:16px;">This invoice is split into ${instalments.length} instalments:</p>
           <ul style="font-size:13px;color:#374151;">
             ${instalments.map((i) => `<li>Instalment ${i.instalmentNumber}: ${escapeHtml(invoice.currency)} ${parseFloat(i.amount).toFixed(2)}${i.dueDate ? ` — due ${escapeHtml(i.dueDate)}` : ""}</li>`).join("")}
           </ul>`
        : "";

    const html = wrapVendorEmail({
      bodyHtml: `
        <h2 style="font-size:18px;color:#111827;margin:0 0 16px;">Invoice #${invoice.id} from ${escapeHtml(vendor.name)}</h2>
        <p style="font-size:14px;color:#374151;">Hi ${escapeHtml(invoice.customerName)},</p>
        <p style="font-size:14px;color:#374151;">Please find your invoice below.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;">
          <thead><tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-weight:600;">Description</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600;">Qty × Price</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600;">Total</th>
          </tr></thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot>
            <tr><td colspan="2" style="padding:8px 12px;text-align:right;font-weight:600;">Total</td>
            <td style="padding:8px 12px;text-align:right;font-weight:700;">${escapeHtml(invoice.currency)} ${parseFloat(invoice.totalAmount).toFixed(2)}</td></tr>
          </tfoot>
        </table>
        ${instalmentHtml}
        ${invoice.dueDate ? `<p style="font-size:13px;color:#6b7280;">Due date: ${escapeHtml(invoice.dueDate)}</p>` : ""}
        ${invoice.notes ? `<p style="font-size:13px;color:#6b7280;">Notes: ${escapeHtml(invoice.notes)}</p>` : ""}
      `,
      action: { label: "View & Pay Invoice", url: shareUrl },
    });

    await sendEmail({
      to: invoice.customerEmail,
      subject: `Invoice #${invoice.id} from ${vendor.name}`,
      html,
    });
  }

  const [updated] = await db
    .update(invoicesTable)
    .set({ status: invoice.status === "draft" ? "sent" : invoice.status, sentAt: new Date(), updatedAt: new Date() })
    .where(eq(invoicesTable.id, id))
    .returning();

  res.json({ success: true, shareUrl, invoice: updated });
});

// ── POST /invoices/:id/remind — send overdue reminder ────────────────────────

router.post("/invoices/:id/remind", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.vendorId, vendor.id)));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (!invoice.customerEmail) { res.status(400).json({ error: "Invoice has no customer email" }); return; }
  if (invoice.status === "paid" || invoice.status === "cancelled") {
    res.status(409).json({ error: "Cannot send a reminder for this invoice" });
    return;
  }

  const shareUrl = `${process.env.FRONTEND_URL ?? ""}${process.env.BASE_PATH ?? "/vendor-hub"}/invoice/${invoice.shareToken}`;
  const amountStr = `${invoice.currency} ${parseFloat(invoice.totalAmount).toFixed(2)}`;

  const html = wrapVendorEmail({
    bodyHtml: `
      <h2 style="font-size:18px;color:#111827;margin:0 0 16px;">Payment Reminder — Invoice #${invoice.id}</h2>
      <p style="font-size:14px;color:#374151;">Hi ${escapeHtml(invoice.customerName)},</p>
      <p style="font-size:14px;color:#374151;">
        This is a friendly reminder that Invoice #${invoice.id} for
        <strong>${escapeHtml(amountStr)}</strong> from <strong>${escapeHtml(vendor.name)}</strong>
        ${invoice.dueDate ? `was due on <strong>${escapeHtml(invoice.dueDate)}</strong> and ` : ""}is still outstanding.
      </p>
      <p style="font-size:14px;color:#374151;">Please click the button below to pay.</p>
    `,
    action: { label: "Pay Invoice", url: shareUrl },
  });

  await sendEmail({
    to: invoice.customerEmail,
    subject: `Payment Reminder — Invoice #${invoice.id} from ${vendor.name}`,
    html,
  });

  res.json({ success: true });
});

// ── POST /invoices/parse-description — AI text parsing ───────────────────────

router.post("/invoices/parse-description", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { description } = req.body as { description?: string };
  if (!description?.trim()) { res.status(400).json({ error: "description is required" }); return; }

  const openAiBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const openAiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "";

  const prompt = `Parse the following invoice description into a structured JSON object.
Description: "${description}"

Return ONLY valid JSON with this structure (omit fields you cannot determine):
{
  "customerName": "string",
  "customerEmail": "string or null",
  "currency": "USD or NGN or GBP etc",
  "items": [{ "description": "string", "quantity": number, "unitPrice": number, "type": "service or product" }],
  "discountAmount": number or 0,
  "taxAmount": number or 0,
  "dueDate": "YYYY-MM-DD or null",
  "notes": "string or null",
  "instalments": 1
}

Rules: infer currency from symbols (₦=NGN, $=USD, £=GBP). If the description says "per month" or "3 months", set instalments=3. Return ONLY the JSON object.`;

  const aiRes = await fetch(`${openAiBase}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 600,
    }),
  });

  if (!aiRes.ok) {
    res.status(502).json({ error: "AI parsing failed. Please fill in the form manually." });
    return;
  }

  const aiJson = await aiRes.json() as { choices: Array<{ message: { content: string } }> };
  const raw = (aiJson.choices?.[0]?.message?.content ?? "{}").trim();

  try {
    const parsed = JSON.parse(raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim());
    res.json({ parsed });
  } catch {
    res.status(502).json({ error: "Failed to parse AI response. Please fill in the form manually." });
  }
});

export default router;
