/**
 * Order fulfillment and delivery tracking.
 *
 * PATCH  /orders/:id/delivery              — vendor updates delivery status + tracking info
 * GET    /public/orders/confirm/:token     — customer receipt confirmation page data
 * POST   /public/orders/confirm/:token     — customer clicks "I received this"
 *
 * Delivery status lifecycle:
 *   pending → processing → shipped → out_for_delivery → delivered → confirmed
 *                                                                   ↓
 *                                                               disputed
 */
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, vendorsTable, vendorNotificationsTable } from "@workspace/db";
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail } from "../lib/email-branding";
import { escapeHtml } from "../lib/email-branding";
import { z } from "zod";
import crypto from "node:crypto";

const router: IRouter = Router();

const DELIVERY_STATUSES = ["pending", "processing", "shipped", "out_for_delivery", "delivered", "confirmed", "disputed"] as const;
type DeliveryStatus = typeof DELIVERY_STATUSES[number];

const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  confirmed: "Received & Confirmed",
  disputed: "Disputed",
};

async function resolveAuthedVendor(req: import("express").Request): Promise<{ vendorId: number | null; isAdmin: boolean }> {
  const { userId } = getAuth(req);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

// ── PATCH /orders/:id/delivery ───────────────────────────────────────────────
const UpdateDeliveryBody = z.object({
  deliveryStatus: z.enum(DELIVERY_STATUSES),
  trackingNumber: z.string().max(200).optional(),
  trackingUrl: z.string().url().optional().or(z.literal("")),
  refundNote: z.string().max(1000).optional(),
});

router.patch("/orders/:id/delivery", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const orderId = parseInt(req.params.id ?? "", 10);
  if (!orderId) { res.status(400).json({ error: "Invalid order id" }); return; }

  const parsed = UpdateDeliveryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!authed.isAdmin && order.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { deliveryStatus, trackingNumber, trackingUrl, refundNote } = parsed.data;

  // Generate receipt token if not already set (so customer can confirm receipt)
  const receiptToken = order.receiptToken ?? crypto.randomBytes(20).toString("hex");

  const updateFields: Record<string, unknown> = {
    deliveryStatus,
    receiptToken,
    ...(trackingNumber !== undefined ? { trackingNumber } : {}),
    ...(trackingUrl !== undefined ? { trackingUrl: trackingUrl || null } : {}),
    ...(refundNote !== undefined ? { refundNote } : {}),
  };

  // Set timestamp fields based on new status
  if (deliveryStatus === "shipped" && !order.shippedAt) updateFields.shippedAt = new Date();
  if (deliveryStatus === "delivered" && !order.deliveredAt) updateFields.deliveredAt = new Date();

  const [updated] = await db.update(ordersTable).set(updateFields as any).where(eq(ordersTable.id, orderId)).returning();

  // Email the customer with delivery update and receipt-confirmation link
  void sendDeliveryEmail(updated!, receiptToken).catch(() => {});

  res.json(serializeOrder(updated!));
});

// ── GET /public/orders/confirm/:token ────────────────────────────────────────
router.get("/public/orders/confirm/:token", async (req, res): Promise<void> => {
  const token = req.params.token ?? "";
  if (!token) { res.status(400).json({ error: "Invalid token" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.receiptToken, token));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const [vendor] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, order.vendorId));
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));

  res.json({
    order: {
      id: order.id,
      customerName: order.customerName,
      deliveryStatus: order.deliveryStatus,
      deliveryStatusLabel: DELIVERY_STATUS_LABELS[order.deliveryStatus as DeliveryStatus] ?? order.deliveryStatus,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      totalAmount: parseFloat(order.totalAmount),
      currency: order.currency,
      shippedAt: order.shippedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      customerConfirmedAt: order.customerConfirmedAt?.toISOString() ?? null,
      refundNote: order.refundNote,
      createdAt: order.createdAt.toISOString(),
    },
    vendor: { name: vendor?.name ?? "The Vendor" },
    items: items.map(i => ({
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: parseFloat(i.unitPrice),
      totalPrice: parseFloat(i.totalPrice),
    })),
    alreadyConfirmed: !!order.customerConfirmedAt,
  });
});

// ── POST /public/orders/confirm/:token ───────────────────────────────────────
router.post("/public/orders/confirm/:token", async (req, res): Promise<void> => {
  const token = req.params.token ?? "";
  if (!token) { res.status(400).json({ error: "Invalid token" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.receiptToken, token));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  if (order.customerConfirmedAt) {
    res.json({ ok: true, alreadyConfirmed: true, confirmedAt: order.customerConfirmedAt.toISOString() });
    return;
  }

  const [updated] = await db.update(ordersTable).set({
    customerConfirmedAt: new Date(),
    deliveryStatus: "confirmed",
  }).where(eq(ordersTable.id, order.id)).returning();

  // Notify vendor in-app
  void db.insert(vendorNotificationsTable).values({
    vendorId: order.vendorId,
    type: "order_confirmed",
    title: "Customer confirmed receipt",
    message: `${order.customerName} confirmed they received order #${order.id}.`,
    resourceId: String(order.id),
  } as any).catch(() => {});

  res.json({ ok: true, alreadyConfirmed: false, confirmedAt: updated!.customerConfirmedAt!.toISOString() });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
async function sendDeliveryEmail(order: typeof ordersTable.$inferSelect, receiptToken: string): Promise<void> {
  const origin = process.env.PUBLIC_APP_DOMAIN
    ? `https://${process.env.PUBLIC_APP_DOMAIN}`
    : process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "";

  const [vendor] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, order.vendorId));
  const vendorName = vendor?.name ?? "The Vendor";
  const status = order.deliveryStatus as DeliveryStatus;
  const statusLabel = DELIVERY_STATUS_LABELS[status] ?? status;
  const confirmUrl = `${origin}/confirm-receipt/${receiptToken}`;

  let trackingSection = "";
  if (order.trackingNumber) {
    const trackHref = order.trackingUrl ? `<a href="${escapeHtml(order.trackingUrl)}" style="color:#7F50FF;">Track your package</a>` : "";
    trackingSection = `<p><strong>Tracking Number:</strong> ${escapeHtml(order.trackingNumber)}${trackHref ? ` — ${trackHref}` : ""}</p>`;
  }

  const bodyHtml = `
    <h2>Your order #${order.id} update from ${escapeHtml(vendorName)}</h2>
    <p>Hi ${escapeHtml(order.customerName)},</p>
    <p>Your order status has been updated to: <strong>${escapeHtml(statusLabel)}</strong></p>
    ${trackingSection}
    ${status === "delivered" || status === "shipped" ? `
    <p style="margin-top:24px;">
      Once you receive your order, please confirm receipt so ${escapeHtml(vendorName)} knows it arrived safely:
    </p>
    <p>
      <a href="${confirmUrl}" style="background:#7F50FF;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
        ✅ Confirm I Received My Order
      </a>
    </p>
    <p style="font-size:12px;color:#888;">Or paste this link: ${confirmUrl}</p>
    ` : ""}
    ${order.refundNote ? `<p><strong>Note from vendor:</strong> ${escapeHtml(order.refundNote)}</p>` : ""}
  `;

  await sendEmail({
    to: order.customerEmail,
    subject: `Order #${order.id}: ${statusLabel} — ${vendorName}`,
    html: wrapVendorEmail({ vendorName, bodyHtml }),
  });
}

function serializeOrder(o: typeof ordersTable.$inferSelect) {
  return {
    ...o,
    totalAmount: parseFloat(o.totalAmount),
    shippedAt: o.shippedAt?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    customerConfirmedAt: o.customerConfirmedAt?.toISOString() ?? null,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
  };
}

export default router;
