/**
 * Public (unauthenticated) website routes.
 * Mounted before requireAuth in routes/index.ts.
 */
import { Router, type IRouter, type Request } from "express";
import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  vendorWebsitesTable,
  vendorsTable,
  productsTable,
  ordersTable,
  orderItemsTable,
  paymentsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { TEMPLATES } from "../lib/website-templates";
import { resolvePaystackKey } from "../lib/vendor-keys";

const router: IRouter = Router();

function getBaseHost(req: Request): string {
  return process.env.SITE_BASE_URL ?? `${req.protocol}://${req.headers.host}`;
}

// ── Helper: look up a published site + vendor by slug ─────────────────────────

async function resolveSite(slug: string) {
  const [site] = await db
    .select({
      id: vendorWebsitesTable.id,
      slug: vendorWebsitesTable.slug,
      templateId: vendorWebsitesTable.templateId,
      themeColor: vendorWebsitesTable.themeColor,
      sectionsJson: vendorWebsitesTable.sectionsJson,
      pageTitle: vendorWebsitesTable.pageTitle,
      metaDescription: vendorWebsitesTable.metaDescription,
      logoUrl: vendorWebsitesTable.logoUrl,
      publishedAt: vendorWebsitesTable.publishedAt,
      vendorId: vendorsTable.id,
      vendorName: vendorsTable.name,
      vendorEmail: vendorsTable.email,
      vendorPhone: vendorsTable.phone,
      vendorAddress: vendorsTable.address,
      defaultCurrency: vendorsTable.defaultCurrency,
      subscriptionTier: vendorsTable.subscriptionTier,
      verificationLevel: vendorsTable.verificationLevel,
      paystackEnabled: vendorsTable.paystackEnabled,
      stripeEnabled: vendorsTable.stripeEnabled,
    })
    .from(vendorWebsitesTable)
    .innerJoin(vendorsTable, eq(vendorWebsitesTable.vendorId, vendorsTable.id))
    .where(and(
      eq(vendorWebsitesTable.slug, slug),
      eq(vendorWebsitesTable.published, true),
    ));
  return site ?? null;
}

/** GET /api/sites/:slug — public, returns published site data */
router.get("/sites/:slug", async (req, res): Promise<void> => {
  const site = await resolveSite(req.params.slug);
  if (!site) { res.status(404).json({ error: "Site not found or not published" }); return; }

  const template = TEMPLATES[site.templateId as keyof typeof TEMPLATES] ?? TEMPLATES["modern-shop"];

  // Only expose gateways that have a working site checkout implementation
  const enabledGateways: string[] = [];
  if (site.paystackEnabled) enabledGateways.push("paystack");
  if (site.stripeEnabled)   enabledGateways.push("stripe");

  res.json({
    slug: site.slug,
    templateId: site.templateId,
    themeColor: site.themeColor,
    sections: site.sectionsJson,
    pageTitle: site.pageTitle ?? site.vendorName,
    metaDescription: site.metaDescription ?? "",
    logoUrl: site.logoUrl,
    publishedAt: site.publishedAt,
    // Shop integration fields
    enabledGateways,
    currency: site.defaultCurrency ?? "USD",
    vendor: {
      name: site.vendorName,
      email: site.vendorEmail,
      phone: site.vendorPhone,
      address: site.vendorAddress,
    },
    template: {
      id: template.id,
      name: template.name,
      palette: template.palette,
      primaryFont: template.primaryFont,
    },
  });
});

// ── GET /api/sites/:slug/products ─────────────────────────────────────────────
// Public — returns the vendor's active product catalog for the live shop section.

router.get("/sites/:slug/products", async (req, res): Promise<void> => {
  const site = await resolveSite(req.params.slug);
  if (!site) { res.status(404).json({ error: "Site not found" }); return; }

  const limit  = Math.min(parseInt(req.query.limit as string) || 24, 100);
  const page   = Math.max(1, parseInt(req.query.page as string) || 1);
  const offset = (page - 1) * limit;
  const category = (req.query.category as string) || "";
  const sort     = (req.query.sort as string) || "newest";

  let query = db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      description: productsTable.description,
      price: productsTable.price,
      category: productsTable.category,
      imageUrl: productsTable.imageUrl,
      stockQuantity: productsTable.stockQuantity,
      unit: productsTable.unit,
      currency: vendorsTable.defaultCurrency,
    })
    .from(productsTable)
    .innerJoin(vendorsTable, eq(productsTable.vendorId, vendorsTable.id))
    .where(and(
      eq(productsTable.vendorId, site.vendorId),
      eq(productsTable.status, "active"),
      ...(category ? [eq(productsTable.category, category)] : []),
    ))
    .$dynamic();

  if (sort === "price-asc")  query = query.orderBy(sql`${productsTable.price}::numeric asc`);
  else if (sort === "price-desc") query = query.orderBy(sql`${productsTable.price}::numeric desc`);
  else if (sort === "name")  query = query.orderBy(productsTable.name);
  else                       query = query.orderBy(productsTable.id);

  query = query.limit(limit).offset(offset);

  const rows = await query;

  const [countRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(productsTable)
    .where(and(
      eq(productsTable.vendorId, site.vendorId),
      eq(productsTable.status, "active"),
      ...(category ? [eq(productsTable.category, category)] : []),
    ));

  const total = Number(countRow?.total ?? 0);

  res.json({
    products: rows.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: parseFloat(p.price as string),
      category: p.category,
      imageUrl: p.imageUrl,
      inStock: p.stockQuantity === null || p.stockQuantity > 0,
      stockQuantity: p.stockQuantity,
      unit: p.unit,
      currency: p.currency ?? "USD",
    })),
    total,
    pages: Math.ceil(total / limit),
    page,
  });
});

// ── POST /api/sites/:slug/checkout ────────────────────────────────────────────
// Public — creates an order and initiates payment for a site shop purchase.
// Authenticated only by slug (shop is public). Amount is always server-calculated.

router.post("/sites/:slug/checkout", async (req, res): Promise<void> => {
  const site = await resolveSite(req.params.slug);
  if (!site) { res.status(404).json({ error: "Site not found" }); return; }

  const { items, customer, gateway } = req.body as {
    items: Array<{ productId: number; qty: number }>;
    customer: { name: string; email: string; phone?: string; address?: string };
    gateway: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "items must be a non-empty array" }); return;
  }
  if (!customer?.name || !customer?.email) {
    res.status(400).json({ error: "customer name and email are required" }); return;
  }
  if (!gateway) {
    res.status(400).json({ error: "gateway is required" }); return;
  }

  // Validate item fields strictly
  for (const item of items) {
    const pid = Number(item.productId);
    const qty = Number(item.qty);
    if (!Number.isInteger(pid) || pid < 1) {
      res.status(400).json({ error: "Each item.productId must be a positive integer" }); return;
    }
    if (!Number.isInteger(qty) || qty < 1) {
      res.status(400).json({ error: "Each item.qty must be a positive integer (≥ 1)" }); return;
    }
  }

  // Deduplicate quantities by productId
  const qtyByProductId = new Map<number, number>();
  for (const item of items) {
    const pid = Number(item.productId);
    qtyByProductId.set(pid, (qtyByProductId.get(pid) ?? 0) + Number(item.qty));
  }
  const dedupedItems = Array.from(qtyByProductId.entries()).map(([productId, qty]) => ({ productId, qty }));

  // Gateway check (only paystack + stripe supported in site checkout)
  if (gateway === "paystack" && !site.paystackEnabled) {
    res.status(403).json({ error: "Paystack is not enabled for this store" }); return;
  }
  if (gateway === "stripe" && !site.stripeEnabled) {
    res.status(403).json({ error: "Stripe is not enabled for this store" }); return;
  }
  if (!["paystack", "stripe"].includes(gateway)) {
    res.status(400).json({ error: `Unsupported gateway: ${gateway}` }); return;
  }

  // Fetch and validate products
  const productIds = dedupedItems.map(i => i.productId);
  const productRows = await db
    .select({ id: productsTable.id, name: productsTable.name, price: productsTable.price, stockQuantity: productsTable.stockQuantity })
    .from(productsTable)
    .where(and(
      eq(productsTable.vendorId, site.vendorId),
      eq(productsTable.status, "active"),
      inArray(productsTable.id, productIds),
    ));

  const productMap = new Map(productRows.map(p => [p.id, p]));

  for (const item of dedupedItems) {
    const p = productMap.get(item.productId);
    if (!p) { res.status(400).json({ error: `Product ${item.productId} not found or unavailable` }); return; }
    if (p.stockQuantity !== null && p.stockQuantity < item.qty) {
      res.status(409).json({ error: `Not enough stock for "${p.name}" (${p.stockQuantity} available)` }); return;
    }
  }

  // Server-authoritative total
  let totalAmount = 0;
  for (const item of dedupedItems) {
    totalAmount += parseFloat(productMap.get(item.productId)!.price as string) * item.qty;
  }
  const currency = site.defaultCurrency ?? "USD";

  // Create order
  const [order] = await db.insert(ordersTable).values({
    vendorId: site.vendorId,
    customerName: customer.name.trim(),
    customerEmail: customer.email.trim().toLowerCase(),
    customerPhone: customer.phone?.trim() ?? null,
    shippingAddress: customer.address?.trim() ?? null,
    status: "pending",
    paymentStatus: "unpaid",
    currency,
    totalAmount: totalAmount.toFixed(2),
    source: "site",
  }).returning();

  if (!order) { res.status(500).json({ error: "Failed to create order" }); return; }

  // Create order items
  await db.insert(orderItemsTable).values(
    dedupedItems.map(item => {
      const p = productMap.get(item.productId)!;
      const unitPrice = parseFloat(p.price as string);
      return {
        orderId: order.id,
        productId: item.productId,
        productName: p.name,
        quantity: item.qty,
        unitPrice: unitPrice.toFixed(2),
        totalPrice: (unitPrice * item.qty).toFixed(2),
      };
    }),
  );

  const baseHost = getBaseHost(req);

  // ── Paystack ────────────────────────────────────────────────────────────────
  if (gateway === "paystack") {
    let secretKey: string;
    try {
      secretKey = await resolvePaystackKey(site.vendorId, site as Parameters<typeof resolvePaystackKey>[1]);
    } catch (err) {
      res.status(503).json({ error: err instanceof Error ? err.message : "Paystack key unavailable" }); return;
    }

    const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: customer.email,
        amount: Math.round(totalAmount * 100),
        currency: currency.toUpperCase(),
        callback_url: `${baseHost}/api/embed/checkout-return`,
        metadata: { orderId: String(order.id), vendorId: String(site.vendorId), source: "site" },
      }),
    });

    const psData = await psRes.json() as {
      status: boolean; message: string;
      data?: { authorization_url: string; access_code: string; reference: string };
    };

    if (!psData.status || !psData.data) {
      res.status(502).json({ error: `Paystack error: ${psData.message}` }); return;
    }

    const { authorization_url, access_code, reference } = psData.data;

    await db.insert(paymentsTable).values({
      orderId: order.id,
      vendorId: site.vendorId,
      provider: "paystack",
      providerReference: reference,
      amount: totalAmount.toFixed(2),
      currency: currency.toUpperCase(),
      status: "pending",
      metadata: { reference, authorization_url, access_code, source: "site" },
    });

    res.json({ orderId: order.id, reference, accessCode: access_code, paymentUrl: authorization_url, gateway: "paystack" });
    return;
  }

  // ── Stripe ──────────────────────────────────────────────────────────────────
  if (gateway === "stripe") {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) { res.status(503).json({ error: "Stripe payments not configured" }); return; }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: dedupedItems.map(item => {
        const p = productMap.get(item.productId)!;
        return {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: p.name },
            unit_amount: Math.round(parseFloat(p.price as string) * 100),
          },
          quantity: item.qty,
        };
      }),
      mode: "payment",
      customer_email: customer.email,
      success_url: `${baseHost}/api/embed/checkout-return?status=success&orderId=${order.id}`,
      cancel_url:  `${baseHost}/api/embed/checkout-return?status=cancelled&orderId=${order.id}`,
      metadata: { orderId: String(order.id), vendorId: String(site.vendorId), source: "site" },
    });

    await db.insert(paymentsTable).values({
      orderId: order.id,
      vendorId: site.vendorId,
      provider: "stripe",
      providerReference: session.id,
      amount: totalAmount.toFixed(2),
      currency: currency.toUpperCase(),
      status: "pending",
      metadata: { sessionId: session.id, source: "site" },
    });

    res.json({ orderId: order.id, reference: session.id, paymentUrl: session.url, gateway: "stripe" });
    return;
  }

  res.status(400).json({ error: `Unsupported gateway: ${gateway}` });
});

// ── GET /api/sites/:slug/order-status ─────────────────────────────────────────
// Public — poll payment/order status for a site shop order.

router.get("/sites/:slug/order-status", async (req, res): Promise<void> => {
  const site = await resolveSite(req.params.slug);
  if (!site) { res.status(404).json({ error: "Site not found" }); return; }

  const orderId = parseInt(req.query.orderId as string);
  if (isNaN(orderId) || orderId < 1) { res.status(400).json({ error: "orderId is required" }); return; }

  const [order] = await db
    .select({ id: ordersTable.id, status: ordersTable.status, paymentStatus: ordersTable.paymentStatus })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.vendorId, site.vendorId)))
    .limit(1);

  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const [payment] = await db
    .select({ providerReference: paymentsTable.providerReference, status: paymentsTable.status })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.orderId, orderId), eq(paymentsTable.vendorId, site.vendorId)))
    .orderBy(paymentsTable.id)
    .limit(1);

  res.json({
    orderId: order.id,
    status: order.status,
    paymentStatus: payment?.status ?? order.paymentStatus,
    reference: payment?.providerReference ?? null,
  });
});

export default router;
