/**
 * Embedded Services — lets Connected Business vendors embed Awa Biz Suite
 * services (and their product catalog) directly into any website or mobile app.
 *
 * Public routes (no Clerk, CORS *):
 *   GET  /embed.js                    — embeddable JS widget + product showcase
 *   GET  /embed/manifest              — service list + gateway info for a given API key
 *   GET  /embed/products              — vendor's public product catalog
 *   GET  /embed/products/:id          — single product detail
 *   POST /embed/checkout              — create order + initiate payment
 *   GET  /embed/order-status          — poll order / payment status
 *   GET  /embed/checkout-return       — Stripe redirect landing page (auto-close)
 *
 * Usage — floating services panel:
 *   <script src="…/api/embed.js" data-key="awa_sk_xxx"></script>
 *
 * Usage — product showcase (anywhere):
 *   <div data-awa="products" data-key="awa_sk_xxx" data-view="grid"></div>
 *   <script src="…/api/embed.js" data-key="awa_sk_xxx"></script>
 */

import { Router, type Request } from "express";
import { createHash } from "node:crypto";
import { eq, and, desc, asc, sql, count as drizzleCount, inArray } from "drizzle-orm";
import {
  db,
  vendorApiKeysTable,
  vendorsTable,
  platformPartnersTable,
  productsTable,
  ordersTable,
  orderItemsTable,
  paymentsTable,
} from "@workspace/db";
import { resolvePaystackKey } from "../lib/vendor-keys";

const router = Router();
export default router;

// ─── CORS helper (all embed routes need CORS for cross-origin embeds) ─────────

function embedCors(res: import("express").Response) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

// ─── API key resolution ───────────────────────────────────────────────────────

type KeyContext = { vendorId: number; subscriptionTier: string; defaultCurrency: string };

async function resolveKey(rawKey: string): Promise<KeyContext | null> {
  if (!rawKey.startsWith("awa_sk_")) return null;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const [key] = await db
    .select({ vendorId: vendorApiKeysTable.vendorId, isActive: vendorApiKeysTable.isActive, revokedAt: vendorApiKeysTable.revokedAt, expiresAt: vendorApiKeysTable.expiresAt })
    .from(vendorApiKeysTable).where(eq(vendorApiKeysTable.keyHash, keyHash)).limit(1);
  if (!key || !key.isActive || key.revokedAt) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  const [vendor] = await db
    .select({ id: vendorsTable.id, subscriptionTier: vendorsTable.subscriptionTier, defaultCurrency: vendorsTable.defaultCurrency })
    .from(vendorsTable).where(eq(vendorsTable.id, key.vendorId)).limit(1);
  if (!vendor) return null;
  db.update(vendorApiKeysTable).set({ lastUsedAt: new Date() }).where(eq(vendorApiKeysTable.keyHash, keyHash)).catch(() => {});
  return { vendorId: vendor.id, subscriptionTier: vendor.subscriptionTier ?? "free", defaultCurrency: vendor.defaultCurrency ?? "USD" };
}

// ─── Service catalog ─────────────────────────────────────────────────────────

type ServiceEntry = {
  id: string; name: string; description: string; emoji: string;
  category: "commerce" | "marketing" | "support" | "developer";
  urlPath: (ctx: { vendorId: number; slug: string; baseHost: string }) => string;
};

const ALL_SERVICES: ServiceEntry[] = [
  { id: "storefront",     name: "Shop",            description: "Browse products and services",    emoji: "🛍️", category: "commerce",   urlPath: ({ vendorId, baseHost }) => `${baseHost}/store/${vendorId}` },
  { id: "payments",       name: "Payments",         description: "Make or track a payment",         emoji: "💳", category: "commerce",   urlPath: ({ vendorId, baseHost }) => `${baseHost}/store/${vendorId}?tab=pay` },
  { id: "order-status",   name: "My Orders",        description: "Track your orders",               emoji: "📦", category: "commerce",   urlPath: ({ vendorId, baseHost }) => `${baseHost}/store/${vendorId}?tab=orders` },
  { id: "support",        name: "Support",          description: "Contact us or submit an inquiry", emoji: "💬", category: "support",    urlPath: ({ vendorId, baseHost }) => `${baseHost}/store/${vendorId}?tab=contact` },
  { id: "newsletter",     name: "Stay Updated",     description: "Subscribe to news and updates",   emoji: "📧", category: "marketing",  urlPath: ({ vendorId, baseHost }) => `${baseHost}/store/${vendorId}?tab=subscribe` },
  { id: "voice-callback", name: "Request Callback", description: "We'll call you back shortly",     emoji: "📞", category: "support",    urlPath: ({ vendorId, baseHost }) => `${baseHost}/store/${vendorId}?tab=callback` },
  { id: "social-feed",    name: "Social Feed",      description: "View our latest updates",         emoji: "📱", category: "marketing",  urlPath: ({ vendorId, baseHost }) => `${baseHost}/store/${vendorId}?tab=social` },
  { id: "developer",      name: "Developer API",    description: "Access API documentation",        emoji: "🔗", category: "developer",  urlPath: ({ slug, baseHost }) => `${baseHost}/docs/${slug}` },
];

const TIER_SERVICE_IDS: Record<string, string[]> = {
  free:       ["storefront"],
  basic:      ["storefront", "order-status"],
  starter:    ["storefront", "payments", "order-status", "support"],
  pro:        ["storefront", "payments", "order-status", "support", "newsletter", "voice-callback"],
  connected:  ["storefront", "payments", "order-status", "support", "newsletter", "voice-callback", "social-feed", "developer"],
  enterprise: ["storefront", "payments", "order-status", "support", "newsletter", "voice-callback", "social-feed", "developer"],
};

function getBaseHost(req: Request): string {
  return process.env.SITE_BASE_URL ?? `${req.protocol}://${req.headers.host}`;
}

// ─── OPTIONS preflight for all embed routes ────────────────────────────────────

for (const path of [
  "/embed.js",
  "/embed/manifest",
  "/embed/products",
  "/embed/products/:id",
  "/embed/checkout",
  "/embed/order-status",
  "/embed/checkout-return",
]) {
  router.options(path, (_req, res) => { embedCors(res); res.sendStatus(204); });
}

// ─── GET /embed.js ────────────────────────────────────────────────────────────

router.get("/embed.js", (_req, res) => {
  embedCors(res);
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(buildWidgetScript());
});

// ─── GET /embed/manifest ──────────────────────────────────────────────────────

router.get("/embed/manifest", async (req, res): Promise<void> => {
  embedCors(res);
  const rawKey = (req.query.key as string) || "";
  const ctx = await resolveKey(rawKey);
  if (!ctx) { res.status(401).json({ error: "Invalid or revoked API key" }); return; }

  const [vendor] = await db
    .select({
      name: vendorsTable.name,
      logoUrl: vendorsTable.logoUrl,
      paystackEnabled: vendorsTable.paystackEnabled,
      stripeEnabled: vendorsTable.stripeEnabled,
      paypalEnabled: vendorsTable.paypalEnabled,
      nombaEnabled: vendorsTable.nombaEnabled,
    })
    .from(vendorsTable).where(eq(vendorsTable.id, ctx.vendorId)).limit(1);

  const [profile] = await db
    .select({ slug: platformPartnersTable.slug })
    .from(platformPartnersTable).where(eq(platformPartnersTable.vendorId, ctx.vendorId)).limit(1);

  const baseHost = getBaseHost(req);
  const slug = profile?.slug ?? "";
  const allowedIds = TIER_SERVICE_IDS[ctx.subscriptionTier] ?? TIER_SERVICE_IDS.free;
  const services = ALL_SERVICES.filter(s => allowedIds.includes(s.id))
    .map(s => ({ id: s.id, name: s.name, description: s.description, emoji: s.emoji, category: s.category, url: s.urlPath({ vendorId: ctx.vendorId, slug, baseHost }) }));

  // Build the list of gateways enabled for embedded checkout
  // Only expose gateways that have a working embed checkout implementation.
  // PayPal and Nomba are enabled for dashboard orders but embed checkout does
  // not yet support them — exposing them here would cause deterministic failures.
  const enabledGateways: string[] = [];
  if (vendor?.paystackEnabled) enabledGateways.push("paystack");
  if (vendor?.stripeEnabled)   enabledGateways.push("stripe");

  res.json({
    vendor: { name: vendor?.name ?? "Business", logoUrl: vendor?.logoUrl ?? null, tier: ctx.subscriptionTier },
    services,
    meta: { slug, docsUrl: slug ? `${baseHost}/docs/${slug}` : null },
    enabledGateways,
    currency: ctx.defaultCurrency,
  });
});

// ─── GET /embed/products ──────────────────────────────────────────────────────

router.get("/embed/products", async (req, res): Promise<void> => {
  embedCors(res);
  const rawKey = (req.query.key as string) || "";
  const ctx = await resolveKey(rawKey);
  if (!ctx) { res.status(401).json({ error: "Invalid or revoked API key" }); return; }

  const limit = Math.min(parseInt(req.query.limit as string) || 12, 48);
  const page  = Math.max(parseInt(req.query.page  as string) || 1, 1);
  const offset = (page - 1) * limit;
  const category = (req.query.category as string) || undefined;
  const sort = (req.query.sort as string) || "newest";

  const conditions = [
    eq(productsTable.vendorId, ctx.vendorId),
    eq(productsTable.status, "active"),
    ...(category ? [eq(productsTable.category, category)] : []),
  ];

  const orderBy = sort === "price_asc"  ? asc(productsTable.price)
    : sort === "price_desc" ? desc(productsTable.price)
    : sort === "name"       ? asc(productsTable.name)
    : desc(productsTable.createdAt);

  const [items, [{ total }]] = await Promise.all([
    db.select({
      id:            productsTable.id,
      name:          productsTable.name,
      description:   productsTable.description,
      price:         productsTable.price,
      imageUrl:      productsTable.imageUrl,
      category:      productsTable.category,
      inStock:       sql<boolean>`${productsTable.stockQuantity} > 0`,
      stockQuantity: productsTable.stockQuantity,
      unit:          productsTable.unit,
    }).from(productsTable).where(and(...conditions)).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ total: drizzleCount() }).from(productsTable).where(and(...conditions)),
  ]);

  const baseHost = getBaseHost(req);
  const products = items.map(p => ({
    ...p,
    price: Number(p.price),
    currency: ctx.defaultCurrency,
    buyUrl: `${baseHost}/store/${ctx.vendorId}?product=${p.id}`,
  }));

  const [vendor] = await db
    .select({ name: vendorsTable.name, logoUrl: vendorsTable.logoUrl })
    .from(vendorsTable).where(eq(vendorsTable.id, ctx.vendorId)).limit(1);

  res.json({
    products,
    total: Number(total),
    page,
    limit,
    pages: Math.ceil(Number(total) / limit),
    vendor: { name: vendor?.name ?? "Business", logoUrl: vendor?.logoUrl ?? null },
  });
});

// ─── GET /embed/products/:id ──────────────────────────────────────────────────

router.get("/embed/products/:id", async (req, res): Promise<void> => {
  embedCors(res);
  const rawKey = (req.query.key as string) || "";
  const ctx = await resolveKey(rawKey);
  if (!ctx) { res.status(401).json({ error: "Invalid or revoked API key" }); return; }

  const productId = parseInt(req.params.id);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid product ID" }); return; }

  const [product] = await db
    .select({
      id: productsTable.id, name: productsTable.name, description: productsTable.description,
      price: productsTable.price, imageUrl: productsTable.imageUrl, category: productsTable.category,
      inStock: sql<boolean>`${productsTable.stockQuantity} > 0`,
      stockQuantity: productsTable.stockQuantity, unit: productsTable.unit,
    })
    .from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.vendorId, ctx.vendorId), eq(productsTable.status, "active")))
    .limit(1);

  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const baseHost = getBaseHost(req);
  res.json({
    product: {
      ...product,
      price: Number(product.price),
      currency: ctx.defaultCurrency,
      buyUrl: `${baseHost}/store/${ctx.vendorId}?product=${product.id}`,
    },
  });
});

// ─── POST /embed/checkout ─────────────────────────────────────────────────────
// Creates an order and returns payment initialization details.
// No Clerk auth — key-based only. Amount is always server-calculated.

router.post("/embed/checkout", async (req, res): Promise<void> => {
  embedCors(res);
  const {
    key,
    items,
    customer,
    gateway,
  } = req.body as {
    key: string;
    items: Array<{ productId: number; qty: number }>;
    customer: { name: string; email: string; phone?: string; address?: string };
    gateway: string;
  };

  if (!key)           { res.status(400).json({ error: "key is required" }); return; }
  if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ error: "items must be a non-empty array" }); return; }
  if (!customer?.name || !customer?.email) { res.status(400).json({ error: "customer name and email are required" }); return; }
  if (!gateway)       { res.status(400).json({ error: "gateway is required" }); return; }

  // Strictly validate every item before any DB work
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

  // Aggregate quantities by productId — prevents duplicate entries bypassing stock checks
  const qtyByProductId = new Map<number, number>();
  for (const item of items) {
    const pid = Number(item.productId);
    qtyByProductId.set(pid, (qtyByProductId.get(pid) ?? 0) + Number(item.qty));
  }
  const dedupedItems = Array.from(qtyByProductId.entries()).map(([productId, qty]) => ({ productId, qty }));

  const ctx = await resolveKey(key);
  if (!ctx) { res.status(401).json({ error: "Invalid or revoked API key" }); return; }

  // Fetch vendor for gateway-enable flags
  const [vendor] = await db
    .select({
      id: vendorsTable.id,
      paystackEnabled: vendorsTable.paystackEnabled,
      stripeEnabled: vendorsTable.stripeEnabled,
      defaultCurrency: vendorsTable.defaultCurrency,
    })
    .from(vendorsTable).where(eq(vendorsTable.id, ctx.vendorId)).limit(1);

  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  if (gateway === "paystack" && !vendor.paystackEnabled) {
    res.status(403).json({ error: "Paystack is not enabled for this vendor" }); return;
  }
  if (gateway === "stripe" && !vendor.stripeEnabled) {
    res.status(403).json({ error: "Stripe is not enabled for this vendor" }); return;
  }

  // Validate deduplicated items — all must belong to this vendor and be active
  const productIds = dedupedItems.map(i => i.productId);
  const productRows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      price: productsTable.price,
      stockQuantity: productsTable.stockQuantity,
    })
    .from(productsTable)
    .where(and(
      eq(productsTable.vendorId, ctx.vendorId),
      eq(productsTable.status, "active"),
      inArray(productsTable.id, productIds),
    ));

  const productMap = new Map(productRows.map(p => [p.id, p]));

  // Stock check against aggregated quantities (not raw per-line)
  for (const item of dedupedItems) {
    const p = productMap.get(item.productId);
    if (!p) {
      res.status(400).json({ error: `Product ${item.productId} not found or unavailable` }); return;
    }
    if (p.stockQuantity !== null && p.stockQuantity < item.qty) {
      res.status(409).json({ error: `Not enough stock for "${p.name}" (${p.stockQuantity} available)` }); return;
    }
  }

  // Server-authoritative total — never trust client-supplied amount
  let totalAmount = 0;
  for (const item of dedupedItems) {
    const p = productMap.get(item.productId)!;
    totalAmount += parseFloat(p.price as string) * item.qty;
  }
  const currency = vendor.defaultCurrency ?? "USD";

  // Create order
  const [order] = await db.insert(ordersTable).values({
    vendorId: ctx.vendorId,
    customerName: customer.name.trim(),
    customerEmail: customer.email.trim().toLowerCase(),
    customerPhone: customer.phone?.trim() ?? null,
    shippingAddress: customer.address?.trim() ?? null,
    status: "pending",
    paymentStatus: "unpaid",
    currency,
    totalAmount: totalAmount.toFixed(2),
    source: "embed",
  }).returning();

  if (!order) { res.status(500).json({ error: "Failed to create order" }); return; }

  // Create order items (one row per deduplicated product)
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

  // ── Paystack ──────────────────────────────────────────────────────────────
  if (gateway === "paystack") {
    let secretKey: string;
    try {
      secretKey = await resolvePaystackKey(ctx.vendorId, vendor as Parameters<typeof resolvePaystackKey>[1]);
    } catch (err) {
      res.status(503).json({ error: err instanceof Error ? err.message : "Paystack key unavailable" });
      return;
    }

    const baseHost = getBaseHost(req);
    const callbackUrl = `${baseHost}/api/embed/checkout-return`;
    const amountInKobo = Math.round(totalAmount * 100);

    const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: customer.email,
        amount: amountInKobo,
        currency: currency.toUpperCase(),
        callback_url: callbackUrl,
        metadata: { orderId: String(order.id), vendorId: String(ctx.vendorId), source: "embed" },
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
      vendorId: ctx.vendorId,
      provider: "paystack",
      providerReference: reference,
      amount: totalAmount.toFixed(2),
      currency: currency.toUpperCase(),
      status: "pending",
      metadata: { reference, authorization_url, access_code, source: "embed" },
    });

    res.json({ orderId: order.id, reference, accessCode: access_code, paymentUrl: authorization_url, gateway: "paystack" });
    return;
  }

  // ── Stripe ────────────────────────────────────────────────────────────────
  if (gateway === "stripe") {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) { res.status(503).json({ error: "Stripe payments not configured" }); return; }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);
    const baseHost = getBaseHost(req);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: items.map(item => {
        const p = productMap.get(Number(item.productId))!;
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
      metadata: { orderId: String(order.id), vendorId: String(ctx.vendorId), source: "embed" },
    });

    const reference = session.id;

    await db.insert(paymentsTable).values({
      orderId: order.id,
      vendorId: ctx.vendorId,
      provider: "stripe",
      providerReference: reference,
      amount: totalAmount.toFixed(2),
      currency: currency.toUpperCase(),
      status: "pending",
      metadata: { sessionId: session.id, source: "embed" },
    });

    res.json({ orderId: order.id, reference, paymentUrl: session.url, gateway: "stripe" });
    return;
  }

  res.status(400).json({ error: `Unsupported gateway: ${gateway}` });
});

// ─── GET /embed/order-status ──────────────────────────────────────────────────

router.get("/embed/order-status", async (req, res): Promise<void> => {
  embedCors(res);
  const rawKey = (req.query.key as string) || "";
  const orderId = parseInt(req.query.orderId as string);

  if (!rawKey || isNaN(orderId)) { res.status(400).json({ error: "key and orderId are required" }); return; }

  const ctx = await resolveKey(rawKey);
  if (!ctx) { res.status(401).json({ error: "Invalid or revoked API key" }); return; }

  const [order] = await db
    .select({ id: ordersTable.id, status: ordersTable.status, paymentStatus: ordersTable.paymentStatus })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.vendorId, ctx.vendorId)))
    .limit(1);

  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  // Also get the latest payment reference for this order
  const [payment] = await db
    .select({ providerReference: paymentsTable.providerReference, status: paymentsTable.status })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.orderId, orderId), eq(paymentsTable.vendorId, ctx.vendorId)))
    .orderBy(desc(paymentsTable.id))
    .limit(1);

  res.json({
    orderId: order.id,
    status: order.status,
    paymentStatus: payment?.status ?? order.paymentStatus,
    reference: payment?.providerReference ?? null,
  });
});

// ─── GET /embed/checkout-return ───────────────────────────────────────────────
// Tiny HTML landing page for Stripe redirect. Sends postMessage to opener then
// closes itself so the embed widget can poll for the final order status.

router.get("/embed/checkout-return", (_req, res) => {
  // Strict allowlist for status — anything outside this set maps to "cancelled"
  const rawStatus = (_req.query.status as string) || "";
  const safeStatus: "success" | "cancelled" = rawStatus === "success" ? "success" : "cancelled";

  // orderId must be a positive integer — reject anything else
  const rawOrderId = (_req.query.orderId as string) || "";
  const parsedOrderId = parseInt(rawOrderId, 10);
  const safeOrderId: number | null = Number.isInteger(parsedOrderId) && parsedOrderId > 0 ? parsedOrderId : null;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // No user-controlled strings are interpolated into HTML or JS context.
  // safeStatus comes from a hard-coded two-value allowlist.
  // safeOrderId is either a validated positive integer or null — both JSON-safe.
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Order ${safeStatus}</title>
<style>body{margin:0;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f0f13;color:#f8fafc;text-align:center}
.box{max-width:360px;padding:32px}h2{font-size:22px;margin:0 0 12px}p{font-size:14px;opacity:.6;margin:0}</style></head><body>
<div class="box">
  ${safeStatus === "success"
    ? '<div style="font-size:52px;margin-bottom:16px">✅</div><h2>Payment Confirmed!</h2><p>You may close this window.</p>'
    : '<div style="font-size:52px;margin-bottom:16px">❌</div><h2>Payment Cancelled</h2><p>You may close this window and try again.</p>'}
</div>
<script>
try {
  if (window.opener) {
    window.opener.postMessage({ type: "awa_checkout_return", status: ${JSON.stringify(safeStatus)}, orderId: ${JSON.stringify(safeOrderId)} }, "*");
    setTimeout(function() { window.close(); }, 1500);
  }
} catch(e) {}
</script></body></html>`);
});

// ─── Widget JavaScript ────────────────────────────────────────────────────────

function buildWidgetScript(): string {
  return /* javascript */`
/* Awa Biz Suite — Embedded Services & Product Showcase Widget v3.0 */
(function () {
  "use strict";

  // ── Config ────────────────────────────────────────────────────────────────
  var script = document.currentScript || (function () {
    var s = document.getElementsByTagName("script"); return s[s.length - 1];
  })();
  var globalKey  = script.getAttribute("data-key") || "";
  var theme      = script.getAttribute("data-theme") || "dark";
  var label      = script.getAttribute("data-label") || "Services";
  var position   = script.getAttribute("data-position") || "bottom-right";
  var host       = script.getAttribute("data-host") || script.src.replace(/\\/api\\/embed\\.js.*$/, "");
  var hideWidget = script.getAttribute("data-hide-widget") === "true";

  if (!globalKey) { console.warn("[Awa Embed] No data-key on <script> tag."); }

  // ── Theme vars ────────────────────────────────────────────────────────────
  var isLeft = position === "bottom-left";
  var isDark = theme !== "light";
  var bg      = isDark ? "#0f0f13" : "#ffffff";
  var fg      = isDark ? "#f8fafc"  : "#0f172a";
  var muted   = isDark ? "rgba(255,255,255,0.4)"  : "rgba(0,0,0,0.4)";
  var border  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  var cardBg  = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  var hoverBg = isDark ? "rgba(124,58,237,0.08)"  : "rgba(124,58,237,0.05)";

  // ── CSS ───────────────────────────────────────────────────────────────────
  var css = [
    // ── Services FAB ────────────────────────────────────────────────────────
    "#awa-btn{position:fixed;"+(isLeft?"left:20px":"right:20px")+";bottom:20px;z-index:2147483646;display:flex;align-items:center;gap:8px;padding:11px 18px;border-radius:50px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:700;cursor:pointer;border:none;box-shadow:0 4px 24px rgba(124,58,237,.45);transition:transform .2s,box-shadow .2s;line-height:1}",
    "#awa-btn:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(124,58,237,.55)}",
    "#awa-btn svg{width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}",
    // ── Cart FAB ─────────────────────────────────────────────────────────────
    "#awa-cart-btn{position:fixed;"+(isLeft?"left:20px":"right:20px")+";bottom:"+(hideWidget?"20px":"75px")+";z-index:2147483646;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;display:none;align-items:center;justify-content:center;cursor:pointer;border:none;box-shadow:0 4px 24px rgba(124,58,237,.45);transition:transform .2s,box-shadow .2s}",
    "#awa-cart-btn:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(124,58,237,.55)}",
    "#awa-cart-btn svg{width:22px;height:22px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}",
    "#awa-cart-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:9px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid "+bg+";pointer-events:none}",
    // ── Panels ───────────────────────────────────────────────────────────────
    "#awa-panel{position:fixed;top:0;"+(isLeft?"left:0":"right:0")+";width:380px;max-width:100vw;height:100vh;z-index:2147483647;background:"+bg+";color:"+fg+";font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;box-shadow:"+(isLeft?"4px":"-4px")+" 0 40px rgba(0,0,0,.4);transform:translateX("+(isLeft?"-100%":"100%")+");transition:transform .3s cubic-bezier(.4,0,.2,1)}",
    "#awa-panel.open{transform:translateX(0)}",
    "#awa-cart-panel{position:fixed;top:0;"+(isLeft?"left:0":"right:0")+";width:420px;max-width:100vw;height:100vh;z-index:2147483647;background:"+bg+";color:"+fg+";font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;box-shadow:"+(isLeft?"4px":"-4px")+" 0 40px rgba(0,0,0,.4);transform:translateX("+(isLeft?"-100%":"100%")+");transition:transform .3s cubic-bezier(.4,0,.2,1)}",
    "#awa-cart-panel.open{transform:translateX(0)}",
    "#awa-overlay{position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .3s}",
    "#awa-overlay.open{opacity:1;pointer-events:auto}",
    // ── Panel chrome ─────────────────────────────────────────────────────────
    ".awa-hd{padding:18px 16px;border-bottom:1px solid "+border+";display:flex;align-items:center;gap:12px;flex-shrink:0}",
    ".awa-logo{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#4f46e5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:17px;font-weight:900;flex-shrink:0;overflow:hidden}",
    ".awa-logo img{width:100%;height:100%;object-fit:contain}",
    ".awa-vname{font-size:15px;font-weight:700;margin:0}",
    ".awa-pwby{font-size:10px;color:"+muted+";margin:2px 0 0}",
    ".awa-x{margin-left:auto;background:none;border:none;color:"+muted+";cursor:pointer;padding:6px;border-radius:8px;font-size:20px;line-height:1;flex-shrink:0}",
    ".awa-x:hover{background:"+cardBg+"}",
    ".awa-body{flex:1;overflow-y:auto;padding:14px}",
    ".awa-ft{padding:10px 16px;border-top:1px solid "+border+";text-align:center;flex-shrink:0}",
    ".awa-ft a{font-size:10px;color:"+muted+";text-decoration:none}",
    ".awa-ft a:hover{color:#7c3aed}",
    ".awa-spin{text-align:center;padding:40px;color:"+muted+";font-size:13px}",
    ".awa-empty-panel{text-align:center;padding:40px 16px;color:"+muted+";font-size:13px}",
    // ── Services grid ─────────────────────────────────────────────────────────
    ".awa-cat-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:"+muted+";margin:0 0 8px}",
    ".awa-svc-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}",
    ".awa-svc-card{padding:13px;border-radius:12px;background:"+cardBg+";border:1px solid "+(isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)")+";cursor:pointer;text-align:left;transition:all .15s;text-decoration:none;display:block;color:"+fg+"}",
    ".awa-svc-card:hover{border-color:rgba(124,58,237,.4);background:"+hoverBg+";transform:translateY(-1px)}",
    ".awa-svc-icon{font-size:22px;margin-bottom:7px;display:block}",
    ".awa-svc-name{font-size:12px;font-weight:700;margin:0 0 3px}",
    ".awa-svc-desc{font-size:10px;color:"+muted+";margin:0;line-height:1.4}",
    ".awa-back-btn{display:flex;align-items:center;gap:6px;background:none;border:none;color:"+muted+";cursor:pointer;font-size:12px;font-weight:600;padding:4px 0;margin-bottom:14px}",
    ".awa-back-btn:hover{color:"+fg+"}",
    ".awa-panel-plist{display:flex;flex-direction:column;gap:10px}",
    ".awa-panel-pitem{display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;background:"+cardBg+";border:1px solid "+(isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)")+";text-decoration:none;color:"+fg+";transition:all .15s}",
    ".awa-panel-pitem:hover{border-color:rgba(124,58,237,.4);background:"+hoverBg+"}",
    ".awa-panel-pthumb{width:52px;height:52px;border-radius:10px;object-fit:cover;flex-shrink:0;background:linear-gradient(135deg,rgba(124,58,237,.2),rgba(79,70,229,.2));display:flex;align-items:center;justify-content:center;font-size:22px;overflow:hidden}",
    ".awa-panel-pthumb img{width:100%;height:100%;object-fit:cover}",
    ".awa-panel-pinfo{flex:1;min-width:0}",
    ".awa-panel-pname{font-size:13px;font-weight:700;margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".awa-panel-pprice{font-size:14px;font-weight:800;color:#7c3aed;margin:0}",
    ".awa-panel-pbuy{flex-shrink:0;padding:7px 13px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-size:11px;font-weight:700;text-decoration:none;border:none;cursor:pointer}",
    // ── Product grid / cards ──────────────────────────────────────────────────
    ".awa-ps{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;width:100%;box-sizing:border-box}",
    ".awa-ps *{box-sizing:border-box}",
    ".awa-ps-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;gap:12px}",
    ".awa-ps-title{font-size:24px;font-weight:900;margin:0;color:"+fg+"}",
    ".awa-ps-subtitle{font-size:13px;color:"+muted+";margin:4px 0 0}",
    ".awa-ps-count{font-size:12px;color:"+muted+";background:"+cardBg+";padding:4px 10px;border-radius:20px;border:1px solid "+border+"}",
    ".awa-grid{display:grid;grid-template-columns:repeat(var(--awa-cols,3),1fr);gap:20px}",
    "@media(max-width:900px){.awa-grid{grid-template-columns:repeat(2,1fr)}}",
    "@media(max-width:500px){.awa-grid{grid-template-columns:1fr}}",
    ".awa-card{border-radius:18px;overflow:hidden;background:"+(isDark?"#1a1a24":"#ffffff")+";border:1px solid "+(isDark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.07)")+";transition:transform .25s cubic-bezier(.4,0,.2,1),box-shadow .25s cubic-bezier(.4,0,.2,1),border-color .25s;animation:awaFadeUp .45s ease both}",
    ".awa-card:hover{transform:translateY(-8px);box-shadow:0 28px 56px rgba(0,0,0,"+(isDark?".45":".15")+");border-color:rgba(124,58,237,.35)}",
    ".awa-card-img-wrap{position:relative;overflow:hidden;aspect-ratio:1}",
    ".awa-card-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}",
    ".awa-card:hover .awa-card-img{transform:scale(1.06)}",
    ".awa-card-img-ph{width:100%;height:100%;background:linear-gradient(135deg,rgba(124,58,237,.15),rgba(79,70,229,.15));display:flex;align-items:center;justify-content:center;font-size:52px}",
    ".awa-card-badge{position:absolute;top:10px;left:10px;font-size:10px;font-weight:800;padding:4px 10px;border-radius:20px;backdrop-filter:blur(8px)}",
    ".awa-card-badge.in{background:rgba(16,185,129,.18);color:#10b981;border:1px solid rgba(16,185,129,.3)}",
    ".awa-card-badge.out{background:rgba(239,68,68,.18);color:#ef4444;border:1px solid rgba(239,68,68,.3)}",
    // Heart / favourite button
    ".awa-heart{position:absolute;top:8px;right:10px;background:rgba(0,0,0,.35);backdrop-filter:blur(6px);border:none;color:#fff;font-size:16px;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;z-index:2;line-height:1}",
    ".awa-heart:hover{background:rgba(239,68,68,.35);transform:scale(1.1)}",
    ".awa-heart.fav{background:rgba(239,68,68,.75);color:#fff}",
    ".awa-card-body{padding:16px}",
    ".awa-card-cat{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7c3aed;margin:0 0 6px}",
    ".awa-card-name{font-size:15px;font-weight:800;margin:0 0 6px;color:"+fg+";line-height:1.3}",
    ".awa-card-price{font-size:22px;font-weight:900;color:#7c3aed;margin:0 0 8px}",
    ".awa-card-unit{font-size:11px;color:"+muted+";font-weight:500}",
    ".awa-card-desc{font-size:12px;color:"+muted+";margin:0 0 14px;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
    ".awa-card-btn{display:block;width:100%;padding:11px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:800;font-size:13px;text-align:center;text-decoration:none;border:none;cursor:pointer;transition:opacity .2s,transform .15s,background .3s}",
    ".awa-card-btn:hover{opacity:.88;transform:translateY(-1px)}",
    ".awa-card-btn.disabled{background:"+(isDark?"rgba(255,255,255,.1)":"rgba(0,0,0,.1)")+";color:"+muted+";cursor:not-allowed}",
    // Skeleton
    ".awa-skel-card{border-radius:18px;overflow:hidden;background:"+(isDark?"#1a1a24":"#f0f0f0")+"}",
    ".awa-skel-img{aspect-ratio:1;background:linear-gradient(90deg,"+(isDark?"#2a2a38 25%,#35354a 50%,#2a2a38 75%":"#e8e8e8 25%,#f5f5f5 50%,#e8e8e8 75%")+");background-size:200% 100%;animation:awaShimmer 1.5s infinite}",
    ".awa-skel-body{padding:16px;display:flex;flex-direction:column;gap:8px}",
    ".awa-skel-line{height:12px;border-radius:6px;background:linear-gradient(90deg,"+(isDark?"#2a2a38 25%,#35354a 50%,#2a2a38 75%":"#e8e8e8 25%,#f5f5f5 50%,#e8e8e8 75%")+");background-size:200% 100%;animation:awaShimmer 1.5s infinite}",
    ".awa-skel-price{height:22px;width:60%;border-radius:6px;background:linear-gradient(90deg,"+(isDark?"#2a2a38 25%,#35354a 50%,#2a2a38 75%":"#e8e8e8 25%,#f5f5f5 50%,#e8e8e8 75%")+");background-size:200% 100%;animation:awaShimmer 1.5s infinite}",
    ".awa-skel-btn{height:42px;border-radius:12px;background:linear-gradient(90deg,"+(isDark?"#2a2a38 25%,#35354a 50%,#2a2a38 75%":"#e8e8e8 25%,#f5f5f5 50%,#e8e8e8 75%")+");background-size:200% 100%;animation:awaShimmer 1.5s infinite}",
    // Slider
    ".awa-slider{position:relative;overflow:hidden;border-radius:24px;background:"+(isDark?"#1a1a24":"#f8f8ff")+";border:1px solid "+(isDark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.06)")+"}",
    ".awa-slider-track{display:flex;transition:transform .55s cubic-bezier(.4,0,.2,1);will-change:transform}",
    ".awa-slide{min-width:100%;display:grid;grid-template-columns:1fr 1fr;gap:0;align-items:stretch}",
    "@media(max-width:600px){.awa-slide{grid-template-columns:1fr}}",
    ".awa-slide-img-wrap{overflow:hidden;aspect-ratio:1}",
    "@media(max-width:600px){.awa-slide-img-wrap{aspect-ratio:16/9}}",
    ".awa-slide-img{width:100%;height:100%;object-fit:cover;transition:transform .4s}",
    ".awa-slide-img-ph{width:100%;height:100%;background:linear-gradient(135deg,rgba(124,58,237,.15),rgba(79,70,229,.1));display:flex;align-items:center;justify-content:center;font-size:80px}",
    ".awa-slide-body{padding:40px 36px;display:flex;flex-direction:column;justify-content:center;gap:12px}",
    "@media(max-width:600px){.awa-slide-body{padding:24px 20px}}",
    ".awa-slide-cat{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#7c3aed}",
    ".awa-slide-name{font-size:28px;font-weight:900;color:"+fg+";line-height:1.2;margin:0}",
    "@media(max-width:600px){.awa-slide-name{font-size:20px}}",
    ".awa-slide-price{font-size:32px;font-weight:900;color:#7c3aed;margin:0}",
    "@media(max-width:600px){.awa-slide-price{font-size:24px}}",
    ".awa-slide-desc{font-size:13px;color:"+muted+";line-height:1.6;margin:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}",
    ".awa-slide-btn{align-self:flex-start;padding:12px 28px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:800;font-size:14px;text-decoration:none;border:none;cursor:pointer;transition:opacity .2s,transform .15s,background .3s;margin-top:4px}",
    ".awa-slide-btn:hover{opacity:.88;transform:translateY(-1px)}",
    ".awa-slider-arrow{position:absolute;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;background:"+(isDark?"rgba(15,15,19,.7)":"rgba(255,255,255,.9)")+";backdrop-filter:blur(8px);border:1px solid "+border+";color:"+fg+";font-size:16px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;transition:all .2s}",
    ".awa-slider-arrow:hover{background:#7c3aed;color:#fff;border-color:#7c3aed}",
    ".awa-slider-prev{left:12px}",
    ".awa-slider-next{right:12px}",
    ".awa-slider-dots{display:flex;justify-content:center;gap:6px;margin-top:16px;align-items:center}",
    ".awa-dot{width:7px;height:7px;border-radius:50%;background:"+(isDark?"rgba(255,255,255,.2)":"rgba(0,0,0,.2)")+";transition:all .35s cubic-bezier(.4,0,.2,1);cursor:pointer;border:none;padding:0}",
    ".awa-dot.active{background:#7c3aed;width:22px;border-radius:4px}",
    // Featured
    ".awa-featured-hero{display:grid;grid-template-columns:1fr 1fr;gap:0;border-radius:24px;overflow:hidden;background:"+(isDark?"#1a1a24":"#f8f8ff")+";border:1px solid "+(isDark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.06)")+";margin-bottom:20px}",
    "@media(max-width:700px){.awa-featured-hero{grid-template-columns:1fr}}",
    ".awa-hero-img-wrap{overflow:hidden}",
    ".awa-hero-img{width:100%;height:100%;min-height:300px;object-fit:cover;display:block;transition:transform .5s ease}",
    ".awa-featured-hero:hover .awa-hero-img{transform:scale(1.04)}",
    ".awa-hero-img-ph{width:100%;min-height:300px;background:linear-gradient(135deg,rgba(124,58,237,.15),rgba(79,70,229,.1));display:flex;align-items:center;justify-content:center;font-size:90px}",
    ".awa-hero-body{padding:40px 36px;display:flex;flex-direction:column;justify-content:center;gap:14px}",
    "@media(max-width:700px){.awa-hero-body{padding:24px 20px}}",
    ".awa-hero-badge{align-self:flex-start;font-size:10px;font-weight:800;padding:5px 12px;border-radius:20px;background:linear-gradient(135deg,rgba(124,58,237,.2),rgba(79,70,229,.2));color:#7c3aed;border:1px solid rgba(124,58,237,.25)}",
    ".awa-hero-name{font-size:32px;font-weight:900;color:"+fg+";line-height:1.15;margin:0}",
    "@media(max-width:700px){.awa-hero-name{font-size:24px}}",
    ".awa-hero-price{font-size:36px;font-weight:900;color:#7c3aed;margin:0}",
    ".awa-hero-desc{font-size:14px;color:"+muted+";line-height:1.65;margin:0}",
    ".awa-hero-actions{display:flex;gap:10px;flex-wrap:wrap}",
    ".awa-hero-btn{padding:14px 28px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:800;font-size:14px;text-decoration:none;border:none;cursor:pointer;transition:opacity .2s,transform .15s,background .3s}",
    ".awa-hero-btn:hover{opacity:.88;transform:translateY(-1px)}",
    ".awa-hero-btn.outline{background:none;border:2px solid "+(isDark?"rgba(255,255,255,.15)":"rgba(0,0,0,.15)")+";color:"+fg+"}",
    ".awa-hero-btn.outline:hover{border-color:#7c3aed;color:#7c3aed}",
    // Load more
    ".awa-loadmore{display:flex;align-items:center;justify-content:center;margin-top:28px}",
    ".awa-loadmore-btn{padding:12px 32px;border-radius:50px;border:2px solid "+(isDark?"rgba(255,255,255,.12)":"rgba(0,0,0,.12)")+";color:"+fg+";background:none;font-size:13px;font-weight:700;cursor:pointer;transition:all .2s}",
    ".awa-loadmore-btn:hover{border-color:#7c3aed;color:#7c3aed;background:rgba(124,58,237,.05)}",
    ".awa-ps-footer{margin-top:20px;text-align:center}",
    ".awa-ps-footer a{font-size:11px;color:"+muted+";text-decoration:none}",
    ".awa-ps-footer a:hover{color:#7c3aed}",
    // ── Cart Panel UI ─────────────────────────────────────────────────────────
    ".awa-cart-list{display:flex;flex-direction:column;gap:10px}",
    ".awa-cart-item{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;background:"+cardBg+";border:1px solid "+border+"}",
    ".awa-cart-stepper{display:flex;align-items:center;gap:6px;flex-shrink:0}",
    ".awa-step-btn{width:28px;height:28px;border-radius:50%;border:1px solid "+border+";background:none;color:"+fg+";font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;transition:all .15s}",
    ".awa-step-btn:hover{background:#7c3aed;color:#fff;border-color:#7c3aed}",
    ".awa-cart-empty{text-align:center;padding:48px 20px}",
    ".awa-cart-total{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-top:1px solid "+border+";margin-top:16px}",
    // ── Checkout form ─────────────────────────────────────────────────────────
    ".awa-form-field{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}",
    ".awa-form-field label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:"+muted+"}",
    ".awa-form-field input{width:100%;padding:11px 13px;border-radius:10px;border:1px solid "+border+";background:"+cardBg+";color:"+fg+";font-size:14px;outline:none;transition:border-color .2s;font-family:inherit}",
    ".awa-form-field input:focus{border-color:#7c3aed}",
    ".awa-gw-btn{padding:9px 16px;border-radius:10px;border:1px solid "+border+";background:none;color:"+muted+";font-size:12px;font-weight:700;cursor:pointer;transition:all .15s}",
    ".awa-gw-btn.active{border-color:#7c3aed;background:rgba(124,58,237,.12);color:"+fg+"}",
    ".awa-gw-btn:hover:not(.active){border-color:rgba(124,58,237,.4);color:"+fg+"}",
    // Keyframes
    "@keyframes awaFadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}",
    "@keyframes awaShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}",
  ].join("\\n");

  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── Utility ───────────────────────────────────────────────────────────────
  function formatPrice(price, currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(price);
    } catch (e) { return (currency || "$") + " " + Number(price).toFixed(2); }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── Cart store (sessionStorage per vendorId) ──────────────────────────────
  var cartVendorId = "";

  function cartKey() { return "awa_cart_" + (cartVendorId || "0"); }

  function getCart() {
    try { var r = sessionStorage.getItem(cartKey()); return r ? JSON.parse(r) : []; } catch(e) { return []; }
  }

  function saveCart(items) {
    try { sessionStorage.setItem(cartKey(), JSON.stringify(items)); } catch(e) {}
    updateCartBadge();
  }

  function addToCart(p) {
    var items = getCart();
    var ex = null;
    for (var i = 0; i < items.length; i++) { if (items[i].id === p.id) { ex = items[i]; break; } }
    if (ex) { ex.qty++; } else { items.push({ id: p.id, name: p.name, price: p.price, currency: p.currency, imageUrl: p.imageUrl || "", qty: 1 }); }
    saveCart(items);
  }

  function updateCartQty(productId, delta) {
    var items = getCart();
    var found = false;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === productId) {
        items[i].qty = Math.max(0, items[i].qty + delta);
        if (items[i].qty === 0) items.splice(i, 1);
        found = true; break;
      }
    }
    if (found) saveCart(items);
  }

  function clearCart() { saveCart([]); }

  function cartTotal() {
    return getCart().reduce(function(s, i) { return s + i.price * i.qty; }, 0);
  }
  function cartCount() {
    return getCart().reduce(function(s, i) { return s + i.qty; }, 0);
  }

  // ── Favourites store (localStorage per vendorId) ──────────────────────────
  function favKey() { return "awa_fav_" + (cartVendorId || "0"); }

  function getFavs() {
    try { var r = localStorage.getItem(favKey()); return r ? JSON.parse(r) : []; } catch(e) { return []; }
  }

  function isFav(id) {
    var favs = getFavs();
    for (var i = 0; i < favs.length; i++) { if (favs[i].id === id) return true; }
    return false;
  }

  function toggleFav(p) {
    var favs = getFavs();
    var idx = -1;
    for (var i = 0; i < favs.length; i++) { if (favs[i].id === p.id) { idx = i; break; } }
    if (idx >= 0) { favs.splice(idx, 1); } else { favs.push({ id: p.id, name: p.name }); }
    try { localStorage.setItem(favKey(), JSON.stringify(favs)); } catch(e) {}
    return idx < 0;
  }

  // ── DOM ───────────────────────────────────────────────────────────────────
  var overlay = document.createElement("div");
  overlay.id = "awa-overlay";
  document.body.appendChild(overlay);

  var btn = null, panelEl;
  if (!hideWidget) {
    btn = document.createElement("button");
    btn.id = "awa-btn";
    btn.setAttribute("aria-label", label + " — Powered by Awa Biz Suite");
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>' + label;
    document.body.appendChild(btn);
  }

  panelEl = document.createElement("div");
  panelEl.id = "awa-panel";
  panelEl.setAttribute("role", "dialog");
  panelEl.setAttribute("aria-modal", "true");
  panelEl.innerHTML = '<div class="awa-spin">Loading services…</div>';
  document.body.appendChild(panelEl);

  // Cart FAB (always in DOM, shown when cart has items)
  var cartBtn = document.createElement("button");
  cartBtn.id = "awa-cart-btn";
  cartBtn.setAttribute("aria-label", "Shopping Cart");
  cartBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6" stroke-linecap="round"/><path d="M16 10a4 4 0 01-8 0"/></svg><span id="awa-cart-badge" class="awa-cart-badge"></span>';
  document.body.appendChild(cartBtn);

  var cartPanelEl = document.createElement("div");
  cartPanelEl.id = "awa-cart-panel";
  cartPanelEl.setAttribute("role", "dialog");
  cartPanelEl.setAttribute("aria-modal", "true");
  document.body.appendChild(cartPanelEl);

  // ── Panel management ──────────────────────────────────────────────────────
  var panelOpen = false, cartOpen = false;

  function showPanel() { cartPanelEl.classList.remove("open"); cartOpen = false; panelEl.classList.add("open"); overlay.classList.add("open"); panelOpen = true; if (btn) btn.setAttribute("aria-expanded", "true"); }
  function hidePanel() { panelEl.classList.remove("open"); overlay.classList.remove("open"); panelOpen = false; if (btn) btn.setAttribute("aria-expanded", "false"); }
  function openCart() { panelEl.classList.remove("open"); panelOpen = false; if (btn) btn.setAttribute("aria-expanded","false"); overlay.classList.add("open"); cartPanelEl.classList.add("open"); cartOpen = true; renderCartView(); }
  function closeCart() { cartPanelEl.classList.remove("open"); overlay.classList.remove("open"); cartOpen = false; }

  if (btn) btn.addEventListener("click", function() { panelOpen ? hidePanel() : showPanel(); });
  overlay.addEventListener("click", function() { hidePanel(); closeCart(); });
  document.addEventListener("keydown", function(e) { if (e.key === "Escape") { hidePanel(); closeCart(); } });
  cartBtn.addEventListener("click", function() { cartOpen ? closeCart() : openCart(); });

  // Cart badge
  function updateCartBadge() {
    var n = cartCount();
    var badge = document.getElementById("awa-cart-badge");
    if (badge) { badge.textContent = n > 9 ? "9+" : String(n); badge.style.display = n > 0 ? "flex" : "none"; }
    cartBtn.style.display = (n > 0 || hideWidget === false) ? "flex" : "none";
  }

  function flashCartAdded(cartBtnRef) {
    updateCartBadge();
    cartBtnRef.style.transform = "scale(1.2)";
    setTimeout(function() { cartBtnRef.style.transform = ""; }, 300);
  }

  // ── Cart panel state machine ──────────────────────────────────────────────
  var cartViewState = "items"; // items | checkout | paying | success | failed
  var cartManifest  = null;    // cached manifest (gateways, currency)
  var cartCustomer  = { name: "", email: "", phone: "", address: "" };
  var cartGateway   = "";
  var cartOrderId   = null;
  var pollTimer     = null;

  function renderCartView() {
    if      (cartViewState === "items")    renderCartItems();
    else if (cartViewState === "checkout") renderCheckoutForm();
    else if (cartViewState === "paying")   renderPayingState();
    else if (cartViewState === "success")  renderSuccessState();
    else if (cartViewState === "failed")   renderFailedState();
  }

  function cartPanelHeader(title, backFn) {
    return '<div class="awa-hd">'
      + '<div class="awa-logo" style="background:linear-gradient(135deg,#7c3aed,#4f46e5)"><span style="color:#fff;font-size:17px;font-weight:900">A</span></div>'
      + '<div><p class="awa-vname">' + esc(title) + '</p><p class="awa-pwby">Powered by Awa Biz Suite</p></div>'
      + (backFn ? '<button class="awa-back-btn" style="margin:0 0 0 auto;flex-shrink:0" id="awa-cp-back">&#8592; Back</button>' : '<button class="awa-x" style="margin-left:auto" id="awa-cp-close">&#x2715;</button>')
      + '</div>';
  }

  function cartPanelFooter() {
    return '<div class="awa-ft"><a href="https://awajimaaai.com" target="_blank" rel="noopener">Secure checkout powered by Awa Biz Suite</a></div>';
  }

  function bindCartPanelNav(backFn) {
    var closeBtn = cartPanelEl.querySelector("#awa-cp-close");
    if (closeBtn) closeBtn.addEventListener("click", closeCart);
    var backBtn = cartPanelEl.querySelector("#awa-cp-back");
    if (backBtn && backFn) backBtn.addEventListener("click", backFn);
  }

  // ── Cart Items view ───────────────────────────────────────────────────────
  function renderCartItems() {
    var items = getCart();
    var total = cartTotal();
    var currency = items.length ? items[0].currency : "USD";

    var bodyHtml;
    if (items.length === 0) {
      bodyHtml = '<div class="awa-cart-empty"><div style="font-size:48px;margin-bottom:12px">🛒</div>'
        + '<p style="font-size:15px;font-weight:700;margin:0 0 6px">Your cart is empty</p>'
        + '<p style="font-size:12px;color:'+muted+';margin:0">Browse products and tap \\"Add to Cart\\".</p></div>';
    } else {
      bodyHtml = '<div class="awa-cart-list">'
        + items.map(function(item) {
          var thumb = item.imageUrl
            ? '<img src="'+esc(item.imageUrl)+'" style="width:52px;height:52px;border-radius:10px;object-fit:cover;flex-shrink:0" loading="lazy">'
            : '<div style="width:52px;height:52px;border-radius:10px;background:linear-gradient(135deg,rgba(124,58,237,.15),rgba(79,70,229,.15));display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🛍️</div>';
          return '<div class="awa-cart-item">'
            + thumb
            + '<div style="flex:1;min-width:0">'
            + '<p style="font-size:13px;font-weight:700;margin:0 0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(item.name)+'</p>'
            + '<p style="font-size:14px;font-weight:800;color:#7c3aed;margin:0">'+formatPrice(item.price*item.qty, item.currency)+'</p>'
            + '</div>'
            + '<div class="awa-cart-stepper">'
            + '<button class="awa-step-btn" data-pid="'+item.id+'" data-d="-1">−</button>'
            + '<span style="font-size:14px;font-weight:700;min-width:24px;text-align:center">'+item.qty+'</span>'
            + '<button class="awa-step-btn" data-pid="'+item.id+'" data-d="1">+</button>'
            + '</div></div>';
        }).join("")
        + '</div>'
        + '<div class="awa-cart-total">'
        + '<span style="font-size:13px;color:'+muted+'">Subtotal</span>'
        + '<span style="font-size:20px;font-weight:900;color:#7c3aed">'+formatPrice(total, currency)+'</span>'
        + '</div>';
    }

    var footerAction = items.length > 0
      ? '<div style="padding:12px 16px;border-top:1px solid '+border+'">'
        + '<button class="awa-card-btn" id="awa-to-checkout">Proceed to Checkout →</button>'
        + '</div>'
      : '';

    cartPanelEl.innerHTML = cartPanelHeader("Cart" + (items.length ? ' ('+items.length+' item'+(items.length>1?'s':'')+')' : ''))
      + '<div class="awa-body">' + bodyHtml + '</div>'
      + footerAction
      + cartPanelFooter();

    bindCartPanelNav(null);

    cartPanelEl.querySelectorAll(".awa-step-btn").forEach(function(b) {
      b.addEventListener("click", function() {
        var pid = parseInt(b.getAttribute("data-pid"));
        var d   = parseInt(b.getAttribute("data-d"));
        updateCartQty(pid, d);
        renderCartItems();
      });
    });

    var chkBtn = document.getElementById("awa-to-checkout");
    if (chkBtn) {
      chkBtn.addEventListener("click", function() {
        if (cartManifest) { cartViewState = "checkout"; renderCartView(); return; }
        chkBtn.textContent = "Loading…"; chkBtn.disabled = true;
        fetch(host + "/api/embed/manifest?key=" + encodeURIComponent(globalKey))
          .then(function(r) { return r.json(); })
          .then(function(data) {
            cartManifest = data;
            if (!cartGateway && data.enabledGateways && data.enabledGateways.length) cartGateway = data.enabledGateways[0];
            cartViewState = "checkout";
            renderCartView();
          })
          .catch(function() { chkBtn.textContent = "Proceed to Checkout →"; chkBtn.disabled = false; });
      });
    }
  }

  // ── Checkout Form view ────────────────────────────────────────────────────
  function renderCheckoutForm() {
    var gateways = (cartManifest && cartManifest.enabledGateways) || [];
    if (!cartGateway && gateways.length) cartGateway = gateways[0];

    var gwHtml = gateways.length
      ? '<div style="margin:4px 0 16px"><p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:'+muted+';margin:0 0 8px">Payment Method</p>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + gateways.map(function(gw) {
            var lbl = gw==="paystack" ? "💳 Paystack" : gw==="stripe" ? "💳 Stripe" : gw==="paypal" ? "🅿️ PayPal" : "💳 "+gw;
            return '<button class="awa-gw-btn'+(cartGateway===gw?" active":"")+'" data-gw="'+esc(gw)+'">'+lbl+'</button>';
          }).join("")
        + '</div></div>'
      : '<p style="font-size:12px;color:#ef4444;margin:0 0 16px">⚠️ No payment gateways enabled.</p>';

    var items = getCart();
    var total = cartTotal();
    var currency = items.length ? items[0].currency : (cartManifest && cartManifest.currency) || "USD";

    cartPanelEl.innerHTML = cartPanelHeader("Checkout", function() { cartViewState = "items"; renderCartView(); })
      + '<div class="awa-body"><form id="awa-chk-form">'
      + '<div class="awa-form-field"><label>Full Name *</label><input name="name" required placeholder="John Doe" value="'+esc(cartCustomer.name)+'"></div>'
      + '<div class="awa-form-field"><label>Email *</label><input name="email" type="email" required placeholder="you@example.com" value="'+esc(cartCustomer.email)+'"></div>'
      + '<div class="awa-form-field"><label>Phone</label><input name="phone" placeholder="+234 800 000 0000" value="'+esc(cartCustomer.phone)+'"></div>'
      + '<div class="awa-form-field"><label>Delivery Address</label><input name="address" placeholder="Optional" value="'+esc(cartCustomer.address)+'"></div>'
      + gwHtml
      + '<div class="awa-cart-total" style="margin-top:0">'
      + '<span style="font-size:13px;color:'+muted+'">Total</span>'
      + '<span style="font-size:20px;font-weight:900;color:#7c3aed">'+formatPrice(total,currency)+'</span>'
      + '</div>'
      + '<button type="submit" class="awa-card-btn" style="margin-top:12px" id="awa-pay-btn">Pay '+formatPrice(total,currency)+' →</button>'
      + '</form></div>'
      + cartPanelFooter();

    bindCartPanelNav(function() { cartViewState = "items"; renderCartView(); });

    cartPanelEl.querySelectorAll(".awa-gw-btn").forEach(function(b) {
      b.addEventListener("click", function(e) {
        e.preventDefault();
        cartGateway = b.getAttribute("data-gw");
        cartPanelEl.querySelectorAll(".awa-gw-btn").forEach(function(x) { x.classList.remove("active"); });
        b.classList.add("active");
      });
    });

    var form = document.getElementById("awa-chk-form");
    if (form) {
      form.addEventListener("submit", function(e) {
        e.preventDefault();
        cartCustomer.name    = form.elements.namedItem("name").value;
        cartCustomer.email   = form.elements.namedItem("email").value;
        cartCustomer.phone   = form.elements.namedItem("phone").value || "";
        cartCustomer.address = form.elements.namedItem("address").value || "";
        submitCheckout();
      });
    }
  }

  // ── Paying state ──────────────────────────────────────────────────────────
  function renderPayingState() {
    cartPanelEl.innerHTML = cartPanelHeader("Processing Payment")
      + '<div class="awa-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60%">'
      + '<div style="font-size:56px;margin-bottom:16px;animation:awaFadeUp .4s ease both">💳</div>'
      + '<p style="font-size:16px;font-weight:700;margin:0 0 8px">Waiting for payment…</p>'
      + '<p style="font-size:12px;color:'+muted+';text-align:center;margin:0">Complete the payment in the window.<br>This page updates automatically.</p>'
      + '<p id="awa-poll-msg" style="font-size:11px;color:'+muted+';margin-top:20px;opacity:.7">Checking status…</p>'
      + '</div>'
      + cartPanelFooter();

    bindCartPanelNav(null);
  }

  // ── Success state ─────────────────────────────────────────────────────────
  function renderSuccessState() {
    clearCart();
    var oid = cartOrderId;
    cartPanelEl.innerHTML = cartPanelHeader("Order Confirmed! 🎉")
      + '<div class="awa-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60%;text-align:center">'
      + '<div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:32px;color:#fff;animation:awaFadeUp .4s ease both">✓</div>'
      + '<p style="font-size:18px;font-weight:900;margin:0 0 8px">Payment Successful!</p>'
      + '<p style="font-size:13px;color:'+muted+';margin:0">Your order has been placed.<br>The seller will be in touch shortly.</p>'
      + (oid ? '<p style="font-size:11px;color:'+muted+';margin-top:16px;padding:8px 16px;border-radius:8px;background:'+cardBg+';border:1px solid '+border+'">Order #'+oid+'</p>' : '')
      + '<button id="awa-close-success" style="margin-top:24px;padding:10px 24px;border-radius:50px;border:1px solid '+border+';background:none;color:'+fg+';font-weight:700;cursor:pointer;font-size:13px">Close</button>'
      + '</div>'
      + cartPanelFooter();

    bindCartPanelNav(null);
    var c = document.getElementById("awa-close-success");
    if (c) c.addEventListener("click", function() { cartViewState = "items"; cartOrderId = null; closeCart(); });
  }

  // ── Failed state ──────────────────────────────────────────────────────────
  function renderFailedState() {
    cartPanelEl.innerHTML = cartPanelHeader("Payment Failed")
      + '<div class="awa-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60%;text-align:center">'
      + '<div style="width:72px;height:72px;border-radius:50%;background:rgba(239,68,68,.15);border:2px solid rgba(239,68,68,.3);display:flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:32px;animation:awaFadeUp .4s ease both">✕</div>'
      + '<p style="font-size:18px;font-weight:900;margin:0 0 8px;color:#ef4444">Payment Failed</p>'
      + '<p style="font-size:13px;color:'+muted+';margin:0">Your payment was not completed.<br>No charge was made.</p>'
      + '<button id="awa-retry-btn" class="awa-card-btn" style="margin:24px 0 10px;max-width:200px">Try Again</button>'
      + '<button id="awa-back-cart" style="padding:8px 20px;border-radius:50px;border:1px solid '+border+';background:none;color:'+muted+';cursor:pointer;font-size:12px">Back to Cart</button>'
      + '</div>'
      + cartPanelFooter();

    bindCartPanelNav(null);
    var r = document.getElementById("awa-retry-btn");
    if (r) r.addEventListener("click", function() { cartViewState = "checkout"; renderCartView(); });
    var b = document.getElementById("awa-back-cart");
    if (b) b.addEventListener("click", function() { cartViewState = "items"; renderCartView(); });
  }

  // ── Checkout submission ───────────────────────────────────────────────────
  function submitCheckout() {
    if (!cartGateway) { alert("Please select a payment method."); return; }
    var items = getCart();
    if (!items.length) { alert("Your cart is empty."); return; }

    var payBtn = document.getElementById("awa-pay-btn");
    if (payBtn) { payBtn.textContent = "Processing…"; payBtn.disabled = true; }

    fetch(host + "/api/embed/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: globalKey,
        items: items.map(function(i) { return { productId: i.id, qty: i.qty }; }),
        customer: cartCustomer,
        gateway: cartGateway,
      }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) {
        if (payBtn) {
          var total = cartTotal();
          var currency = items[0].currency;
          payBtn.textContent = "Pay " + formatPrice(total, currency) + " →";
          payBtn.disabled = false;
        }
        alert("Checkout error: " + data.error);
        return;
      }

      cartOrderId = data.orderId;

      cartViewState = "paying";
      renderCartView();

      if (data.gateway === "paystack" && data.accessCode) {
        openPaystackInline(data.accessCode, data.orderId);
      } else if (data.paymentUrl) {
        var w = window.open(data.paymentUrl, "_blank", "width=500,height=700,noopener");
        startPolling(data.orderId, w);
      }
    })
    .catch(function() {
      if (payBtn) {
        var t = cartTotal(); var c = items.length ? items[0].currency : "USD";
        payBtn.textContent = "Pay " + formatPrice(t, c) + " →";
        payBtn.disabled = false;
      }
      cartViewState = "checkout"; renderCartView();
      alert("Network error. Please try again.");
    });
  }

  // ── Paystack inline popup ─────────────────────────────────────────────────
  function openPaystackInline(accessCode, orderId) {
    if (window.PaystackPop) { doPaystackPop(accessCode, orderId); return; }
    var s = document.createElement("script");
    s.src = "https://js.paystack.co/v2/inline.js";
    s.onload = function() { doPaystackPop(accessCode, orderId); };
    s.onerror = function() {
      // Fallback: open authorization URL directly
      startPolling(orderId, null);
    };
    document.head.appendChild(s);
  }

  function doPaystackPop(accessCode, orderId) {
    try {
      var popup = window.PaystackPop.setup({
        key: "",
        access_code: accessCode,
        onSuccess: function() {
          if (pollTimer) clearInterval(pollTimer);
          // Immediately check order status once (webhook may have already fired)
          checkOrderStatus(orderId, true);
        },
        onCancel: function() {
          // Poll to see if payment actually went through despite cancel
          startPolling(orderId, null);
        },
      });
      popup.openIframe();
    } catch(e) {
      console.error("[Awa Embed] Paystack popup error", e);
      startPolling(orderId, null);
    }
  }

  // ── Order status polling ──────────────────────────────────────────────────
  function startPolling(orderId, openedWindow) {
    var attempts = 0, maxAttempts = 40;
    if (pollTimer) clearInterval(pollTimer);

    pollTimer = setInterval(function() {
      attempts++;
      if (openedWindow && openedWindow.closed) { clearInterval(pollTimer); checkOrderStatus(orderId, false); return; }
      checkOrderStatus(orderId, false);
      if (attempts >= maxAttempts) clearInterval(pollTimer);
    }, 3000);

    // When the user returns focus (e.g. closed the Stripe tab), check immediately
    window.addEventListener("focus", function onFocus() {
      window.removeEventListener("focus", onFocus);
      setTimeout(function() { checkOrderStatus(orderId, false); }, 800);
    });

    // Listen for postMessage from checkout-return page
    window.addEventListener("message", function onMsg(e) {
      if (e.data && e.data.type === "awa_checkout_return") {
        window.removeEventListener("message", onMsg);
        if (pollTimer) clearInterval(pollTimer);
        if (e.data.status === "success") {
          cartViewState = "success"; renderCartView();
        } else {
          checkOrderStatus(orderId, false);
        }
      }
    });
  }

  function checkOrderStatus(orderId, immediate) {
    fetch(host + "/api/embed/order-status?key=" + encodeURIComponent(globalKey) + "&orderId=" + orderId)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var ps = data.paymentStatus || data.status;
        if (ps === "paid") {
          if (pollTimer) clearInterval(pollTimer);
          cartViewState = "success"; renderCartView();
        } else if (ps === "failed" || (immediate && ps !== "paid")) {
          var msg = document.getElementById("awa-poll-msg");
          if (ps === "failed") {
            if (pollTimer) clearInterval(pollTimer);
            cartViewState = "failed"; renderCartView();
          } else if (msg) {
            msg.textContent = "Payment pending, still checking…";
          }
        } else {
          var msg2 = document.getElementById("awa-poll-msg");
          if (msg2) msg2.textContent = "Waiting for confirmation…";
        }
      })
      .catch(function() {
        var msg = document.getElementById("awa-poll-msg");
        if (msg) msg.textContent = "Checking…";
      });
  }

  // ── Services panel rendering ──────────────────────────────────────────────
  if (globalKey) {
    fetch(host + "/api/embed/manifest?key=" + encodeURIComponent(globalKey))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) { panelEl.innerHTML = '<div class="awa-empty-panel">⚠️ ' + esc(data.error) + '</div>'; return; }
        cartManifest = data;
        if (data.vendorId) cartVendorId = String(data.vendorId);
        if (!cartGateway && data.enabledGateways && data.enabledGateways.length) cartGateway = data.enabledGateways[0];
        renderServicesPanel(data);
        updateCartBadge();
      })
      .catch(function() { panelEl.innerHTML = '<div class="awa-empty-panel">Could not load services.</div>'; });
  } else {
    panelEl.innerHTML = '<div class="awa-empty-panel">Add data-key to configure.</div>';
  }

  function renderServicesPanel(data) {
    var v = data.vendor;
    var services = data.services || [];
    var logoHtml = v.logoUrl ? '<img src="'+esc(v.logoUrl)+'" alt="">' : esc(v.name.trim().charAt(0).toUpperCase());

    var catOrder = [], cats = {};
    services.forEach(function(s) {
      if (!cats[s.category]) { cats[s.category] = []; catOrder.push(s.category); }
      cats[s.category].push(s);
    });
    var catLabels = { commerce: "🛒 Commerce", marketing: "📣 Marketing", support: "💬 Support", developer: "🔗 Developer" };

    function buildServiceCards(svcs) {
      return svcs.map(function(s) {
        if (s.id === "storefront") {
          return '<button class="awa-svc-card" data-products-btn="1"><span class="awa-svc-icon">'+s.emoji+'</span><p class="awa-svc-name">Products</p><p class="awa-svc-desc">Browse our catalog</p></button>';
        }
        return '<a class="awa-svc-card" href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer"><span class="awa-svc-icon">'+s.emoji+'</span><p class="awa-svc-name">'+esc(s.name)+'</p><p class="awa-svc-desc">'+esc(s.description)+'</p></a>';
      }).join("");
    }

    var sectionsHtml = catOrder.length === 0
      ? '<div class="awa-empty-panel">No services on this plan.</div>'
      : catOrder.map(function(cat) {
          return '<p class="awa-cat-lbl">'+(catLabels[cat]||cat)+'</p><div class="awa-svc-grid">'+buildServiceCards(cats[cat])+'</div>';
        }).join("");

    panelEl.innerHTML =
      '<div class="awa-hd"><div class="awa-logo">'+logoHtml+'</div><div><p class="awa-vname">'+esc(v.name)+'</p><p class="awa-pwby">Powered by Awa Biz Suite</p></div><button class="awa-x" id="awa-close">&#x2715;</button></div>'
      + '<div class="awa-body" id="awa-panel-body">'+sectionsHtml+'</div>'
      + '<div class="awa-ft"><a href="https://awajimaaai.com" target="_blank" rel="noopener">Powered by Awa Biz Suite</a></div>';

    document.getElementById("awa-close").addEventListener("click", hidePanel);

    var prodBtn = panelEl.querySelector("[data-products-btn]");
    if (prodBtn) prodBtn.addEventListener("click", function() { showPanelProducts(v); });
  }

  function showPanelProducts(vendor) {
    var body = document.getElementById("awa-panel-body");
    if (!body) return;
    body.innerHTML = '<button class="awa-back-btn" id="awa-back">&#8592; Back</button><div id="awa-plist"><div class="awa-spin">Loading products…</div></div>';
    document.getElementById("awa-back").addEventListener("click", function() {
      fetch(host + "/api/embed/manifest?key=" + encodeURIComponent(globalKey)).then(function(r) { return r.json(); }).then(renderServicesPanel);
    });

    fetch(host + "/api/embed/products?key=" + encodeURIComponent(globalKey) + "&limit=20")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var list = document.getElementById("awa-plist");
        if (!list) return;
        if (data.error || !data.products) { list.innerHTML = '<div class="awa-empty-panel">⚠️ '+(data.error||"Failed to load")+'</div>'; return; }
        if (!data.products.length) { list.innerHTML = '<div class="awa-empty-panel">No products available yet.</div>'; return; }
        list.innerHTML = '<div class="awa-panel-plist">'
          + data.products.map(function(p) {
            var thumb = p.imageUrl
              ? '<img src="'+esc(p.imageUrl)+'" alt="'+esc(p.name)+'">'
              : '<span>'+(p.category ? p.category.charAt(0) : "🛍")+'</span>';
            return '<div class="awa-panel-pitem">'
              + '<div class="awa-panel-pthumb">'+thumb+'</div>'
              + '<div class="awa-panel-pinfo"><p class="awa-panel-pname">'+esc(p.name)+'</p><p class="awa-panel-pprice">'+formatPrice(p.price, p.currency)+(p.unit?' <span style="font-size:10px;font-weight:500;opacity:.6">/ '+esc(p.unit)+'</span>':'')+'</p></div>'
              + (p.inStock
                  ? '<button class="awa-panel-pbuy" data-product="'+esc(JSON.stringify({id:p.id,name:p.name,price:p.price,currency:p.currency,imageUrl:p.imageUrl||""}))+'">Add</button>'
                  : '<span style="font-size:11px;color:#ef4444;font-weight:700">Sold Out</span>')
              + '</div>';
          }).join("")
          + '</div>';

        // Bind add to cart in panel
        list.querySelectorAll(".awa-panel-pbuy").forEach(function(btn) {
          btn.addEventListener("click", function() {
            var p = JSON.parse(btn.getAttribute("data-product"));
            addToCart(p);
            btn.textContent = "✓ Added";
            btn.style.background = "linear-gradient(135deg,#10b981,#059669)";
            setTimeout(function() { btn.textContent = "Add"; btn.style.background = ""; }, 1500);
            flashCartAdded(cartBtn);
          });
        });
      })
      .catch(function() {
        var list = document.getElementById("awa-plist");
        if (list) list.innerHTML = '<div class="awa-empty-panel">Could not load products.</div>';
      });
  }

  // ── Product Showcase Auto-Init ────────────────────────────────────────────
  function initShowcases() {
    var els = document.querySelectorAll('[data-awa="products"]');
    for (var i = 0; i < els.length; i++) initOneShowcase(els[i]);
  }

  function initOneShowcase(container) {
    var key      = container.getAttribute("data-key") || globalKey;
    var view     = container.getAttribute("data-view") || "grid";
    var limit    = parseInt(container.getAttribute("data-limit") || "12", 10);
    var cols     = parseInt(container.getAttribute("data-columns") || "3", 10);
    var cta      = container.getAttribute("data-cta") || "Add to Cart";
    var title    = container.getAttribute("data-title") || "Our Products";
    var subtitle = container.getAttribute("data-subtitle") || "";
    var category = container.getAttribute("data-category") || "";
    var sort     = container.getAttribute("data-sort") || "newest";
    var showLoad = container.getAttribute("data-loadmore") !== "false";

    if (!key) { container.innerHTML = '<p style="color:#ef4444;font-size:13px">⚠️ Add data-key to this element.</p>'; return; }

    var cfg = { key, view, limit, cols, cta, title, subtitle, category, sort, showLoad, page: 1, totalPages: 1 };

    renderSkeleton(container, cfg);
    loadProducts(cfg, function(data) {
      cfg.totalPages = data.pages || 1;
      // Set cart vendor context from first product
      if (data.products && data.products.length && !cartVendorId) {
        // Try to pick up vendorId from manifest if loaded, else leave as default
      }
      renderShowcase(container, data, cfg);
    });
  }

  function loadProducts(cfg, cb) {
    var url = host + "/api/embed/products?key=" + encodeURIComponent(cfg.key)
      + "&limit=" + cfg.limit + "&page=" + cfg.page + "&sort=" + cfg.sort
      + (cfg.category ? "&category=" + encodeURIComponent(cfg.category) : "");
    fetch(url).then(function(r) { return r.json(); }).then(cb)
      .catch(function() { cb({ error: "Network error", products: [] }); });
  }

  function renderSkeleton(container, cfg) {
    var n = Math.min(cfg.limit, 6), cards = "";
    for (var i = 0; i < n; i++) {
      cards += '<div class="awa-skel-card" style="animation-delay:'+(i*0.06)+'s"><div class="awa-skel-img"></div><div class="awa-skel-body"><div class="awa-skel-line" style="width:80%"></div><div class="awa-skel-price"></div><div class="awa-skel-line" style="width:60%"></div><div class="awa-skel-btn"></div></div></div>';
    }
    container.innerHTML = '<div class="awa-ps"><div class="awa-grid" style="--awa-cols:'+cfg.cols+'">' + cards + '</div></div>';
  }

  function renderShowcase(container, data, cfg) {
    if (data.error || !data.products) {
      container.innerHTML = '<div class="awa-ps"><p style="color:#ef4444;font-size:13px">⚠️ '+(data.error||"Failed to load products")+'</p></div>';
      return;
    }
    switch (cfg.view) {
      case "slider":   renderSlider(container, data, cfg); break;
      case "featured": renderFeatured(container, data, cfg); break;
      default:         renderGrid(container, data, cfg); break;
    }
  }

  // ── Build product card with Add to Cart + heart ───────────────────────────
  function buildCardHtml(p, cfg) {
    var imgHtml = p.imageUrl
      ? '<img class="awa-card-img" src="'+esc(p.imageUrl)+'" alt="'+esc(p.name)+'" loading="lazy">'
      : '<div class="awa-card-img-ph">🛍️</div>';
    var badge = p.inStock
      ? '<span class="awa-card-badge in">● In Stock</span>'
      : '<span class="awa-card-badge out">✕ Sold Out</span>';
    var heartCls = isFav(p.id) ? "awa-heart fav" : "awa-heart";
    var heartBtn = '<button class="'+heartCls+'" data-hid="'+p.id+'" aria-label="Favourite" title="'+(isFav(p.id)?"Remove from":"Add to")+ ' favourites">♥</button>';

    var productJson = esc(JSON.stringify({ id:p.id, name:p.name, price:p.price, currency:p.currency, imageUrl:p.imageUrl||"" }));
    var btnHtml = p.inStock
      ? '<button class="awa-card-btn awa-atc" data-p="'+productJson+'">'+esc(cfg.cta||"Add to Cart")+'</button>'
      : '<span class="awa-card-btn disabled">Sold Out</span>';

    return '<div class="awa-card">'
      + '<div class="awa-card-img-wrap">' + imgHtml + badge + heartBtn + '</div>'
      + '<div class="awa-card-body">'
      + (p.category ? '<p class="awa-card-cat">'+esc(p.category)+'</p>' : '')
      + '<p class="awa-card-name">'+esc(p.name)+'</p>'
      + '<p class="awa-card-price">'+formatPrice(p.price, p.currency)+(p.unit?' <span class="awa-card-unit">/ '+esc(p.unit)+'</span>' : '')+'</p>'
      + (p.description ? '<p class="awa-card-desc">'+esc(p.description)+'</p>' : '')
      + btnHtml
      + '</div></div>';
  }

  // Bind "Add to Cart" and heart events on a rendered container
  function bindCardEvents(container) {
    container.querySelectorAll(".awa-atc").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var p; try { p = JSON.parse(btn.getAttribute("data-p")); } catch(e) { return; }
        addToCart(p);
        var orig = btn.textContent;
        btn.textContent = "✓ Added!";
        btn.style.background = "linear-gradient(135deg,#10b981,#059669)";
        setTimeout(function() { btn.textContent = orig; btn.style.background = ""; }, 1400);
        flashCartAdded(cartBtn);
      });
    });

    container.querySelectorAll(".awa-heart").forEach(function(h) {
      h.addEventListener("click", function(e) {
        e.stopPropagation();
        var pid = parseInt(h.getAttribute("data-hid"));
        var btn = container.querySelector('.awa-atc[data-p]');
        // Find the product data from any sibling .awa-atc in the same card
        var card = h.closest(".awa-card");
        var atcBtn = card ? card.querySelector(".awa-atc") : null;
        var p = null;
        if (atcBtn) { try { p = JSON.parse(atcBtn.getAttribute("data-p")); } catch(e) {} }
        if (!p) p = { id: pid, name: "" };
        var nowFav = toggleFav(p);
        h.classList.toggle("fav", nowFav);
        h.title = nowFav ? "Remove from favourites" : "Add to favourites";
        h.style.transform = "scale(1.4)";
        setTimeout(function() { h.style.transform = ""; }, 200);
      });
    });
  }

  // ── Grid ──────────────────────────────────────────────────────────────────
  function renderGrid(container, data, cfg) {
    var cards = data.products.map(function(p, i) {
      return '<div style="animation-delay:'+(i*0.07)+'s">'+buildCardHtml(p, cfg)+'</div>';
    }).join("");
    var totalLabel = data.total > 0 ? '<span class="awa-ps-count">'+data.total+' products</span>' : '';
    var headerHtml = cfg.title
      ? '<div class="awa-ps-header"><div><p class="awa-ps-title">'+esc(cfg.title)+'</p>'+(cfg.subtitle?'<p class="awa-ps-subtitle">'+esc(cfg.subtitle)+'</p>':'')+'</div>'+totalLabel+'</div>'
      : '';
    var loadMore = (cfg.showLoad && cfg.page < cfg.totalPages)
      ? '<div class="awa-loadmore"><button class="awa-loadmore-btn" id="awa-lm">Load More →</button></div>'
      : '';
    container.innerHTML = '<div class="awa-ps">'
      + headerHtml
      + '<div class="awa-grid" id="awa-grid-inner" style="--awa-cols:'+cfg.cols+'">' + cards + '</div>'
      + loadMore
      + '<div class="awa-ps-footer"><a href="https://awajimaaai.com" target="_blank" rel="noopener">Powered by Awa Biz Suite</a></div></div>';

    bindCardEvents(container);

    var lmBtn = container.querySelector("#awa-lm");
    if (lmBtn) {
      lmBtn.addEventListener("click", function() {
        lmBtn.textContent = "Loading…"; lmBtn.disabled = true;
        cfg.page++;
        loadProducts(cfg, function(more) {
          var grid = container.querySelector("#awa-grid-inner");
          if (!grid || !more.products) return;
          var frag = more.products.map(function(p, i) {
            return '<div style="animation-delay:'+(i*0.07)+'s">'+buildCardHtml(p, cfg)+'</div>';
          }).join("");
          grid.insertAdjacentHTML("beforeend", frag);
          bindCardEvents(grid);
          if (cfg.page >= (more.pages||1)) lmBtn.parentElement.remove();
          else { lmBtn.textContent = "Load More →"; lmBtn.disabled = false; }
        });
      });
    }
  }

  // ── Slider ────────────────────────────────────────────────────────────────
  function renderSlider(container, data, cfg) {
    var products = data.products;
    if (!products.length) { renderGrid(container, data, cfg); return; }

    function buildSlide(p) {
      var imgHtml = p.imageUrl
        ? '<img class="awa-slide-img" src="'+esc(p.imageUrl)+'" alt="'+esc(p.name)+'" loading="lazy">'
        : '<div class="awa-slide-img-ph">🛍️</div>';
      var productJson = esc(JSON.stringify({ id:p.id, name:p.name, price:p.price, currency:p.currency, imageUrl:p.imageUrl||"" }));
      var btnHtml = p.inStock
        ? '<button class="awa-slide-btn awa-atc" data-p="'+productJson+'">'+(cfg.cta||"Add to Cart")+'</button>'
        : '<span class="awa-slide-btn" style="opacity:.5;cursor:not-allowed">Sold Out</span>';
      return '<div class="awa-slide">'
        + '<div class="awa-slide-img-wrap">'+imgHtml+'</div>'
        + '<div class="awa-slide-body">'
        + (p.category?'<p class="awa-slide-cat">'+esc(p.category)+'</p>':'')
        + '<p class="awa-slide-name">'+esc(p.name)+'</p>'
        + '<p class="awa-slide-price">'+formatPrice(p.price,p.currency)+(p.unit?' <span style="font-size:14px;opacity:.6">/ '+esc(p.unit)+'</span>':'')+'</p>'
        + (p.description?'<p class="awa-slide-desc">'+esc(p.description)+'</p>':'')
        + btnHtml + '</div></div>';
    }

    var dots = products.map(function(_, i) { return '<button class="awa-dot'+(i===0?' active':'')+'" data-i="'+i+'"></button>'; }).join("");
    var header = cfg.title ? '<div class="awa-ps-header"><p class="awa-ps-title">'+esc(cfg.title)+'</p>'+(cfg.subtitle?'<p class="awa-ps-subtitle">'+esc(cfg.subtitle)+'</p>':'')+'</div>' : '';
    container.innerHTML = '<div class="awa-ps">' + header
      + '<div class="awa-slider"><div class="awa-slider-track" id="awa-track">'+products.map(buildSlide).join("")+'</div>'
      + '<button class="awa-slider-arrow awa-slider-prev" id="awa-prev">&#8592;</button>'
      + '<button class="awa-slider-arrow awa-slider-next" id="awa-next">&#8594;</button></div>'
      + '<div class="awa-slider-dots" id="awa-dots">'+dots+'</div>'
      + '<div class="awa-ps-footer"><a href="https://awajimaaai.com" target="_blank" rel="noopener">Powered by Awa Biz Suite</a></div></div>';

    bindCardEvents(container);

    var track = container.querySelector("#awa-track");
    var dotsEl = container.querySelector("#awa-dots");
    var cur = 0, total = products.length, autoTimer;

    function goTo(idx) {
      cur = (idx + total) % total;
      track.style.transform = "translateX(-" + cur * 100 + "%)";
      dotsEl.querySelectorAll(".awa-dot").forEach(function(d, i) { d.classList.toggle("active", i === cur); });
    }
    function startAuto() { autoTimer = setInterval(function() { goTo(cur+1); }, 4000); }
    function stopAuto()  { clearInterval(autoTimer); }

    container.querySelector("#awa-prev").addEventListener("click", function() { stopAuto(); goTo(cur-1); startAuto(); });
    container.querySelector("#awa-next").addEventListener("click", function() { stopAuto(); goTo(cur+1); startAuto(); });
    dotsEl.querySelectorAll(".awa-dot").forEach(function(d) {
      d.addEventListener("click", function() { stopAuto(); goTo(parseInt(d.getAttribute("data-i"))); startAuto(); });
    });

    var startX = 0, dragging = false;
    track.addEventListener("pointerdown", function(e) { startX = e.clientX; dragging = true; stopAuto(); });
    document.addEventListener("pointerup", function(e) {
      if (!dragging) return; dragging = false;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 40) goTo(dx < 0 ? cur+1 : cur-1);
      startAuto();
    });
    startAuto();
  }

  // ── Featured ──────────────────────────────────────────────────────────────
  function renderFeatured(container, data, cfg) {
    var products = data.products;
    if (!products.length) { container.innerHTML = '<div class="awa-ps"><p style="color:'+muted+';font-size:13px">No products yet.</p></div>'; return; }

    var hero = products[0];
    var rest = products.slice(1);

    var heroImg = hero.imageUrl
      ? '<img class="awa-hero-img" src="'+esc(hero.imageUrl)+'" alt="'+esc(hero.name)+'" loading="lazy">'
      : '<div class="awa-hero-img-ph">🛍️</div>';
    var heroPJson = esc(JSON.stringify({ id:hero.id, name:hero.name, price:hero.price, currency:hero.currency, imageUrl:hero.imageUrl||"" }));
    var heroBtnHtml = hero.inStock
      ? '<button class="awa-hero-btn awa-atc" data-p="'+heroPJson+'">'+(cfg.cta||"Add to Cart")+'</button>'
        + '<a class="awa-hero-btn outline" href="'+esc((typeof host!=="undefined"?host:""))+'/store/'+'" target="_blank" rel="noopener">View Details</a>'
      : '<span class="awa-hero-btn" style="opacity:.5;cursor:not-allowed">Sold Out</span>';

    var heroHtml = '<div class="awa-featured-hero">'
      + '<div class="awa-hero-img-wrap">'+heroImg+'</div>'
      + '<div class="awa-hero-body">'
      + (hero.category?'<span class="awa-hero-badge">'+esc(hero.category)+'</span>':'')
      + '<p class="awa-hero-name">'+esc(hero.name)+'</p>'
      + '<p class="awa-hero-price">'+formatPrice(hero.price,hero.currency)+(hero.unit?' <span style="font-size:16px;opacity:.6">/ '+esc(hero.unit)+'</span>':'')+'</p>'
      + (hero.description?'<p class="awa-hero-desc">'+esc(hero.description)+'</p>':'')
      + '<div class="awa-hero-actions">'+heroBtnHtml+'</div>'
      + '</div></div>';

    var restHtml = rest.length
      ? '<div class="awa-grid" style="--awa-cols:'+Math.min(cfg.cols,3)+'">'
        + rest.map(function(p, i) { return '<div style="animation-delay:'+(i*0.07)+'s">'+buildCardHtml(p, cfg)+'</div>'; }).join("")
        + '</div>'
      : '';

    var header = cfg.title ? '<div class="awa-ps-header"><p class="awa-ps-title">'+esc(cfg.title)+'</p>'+(cfg.subtitle?'<p class="awa-ps-subtitle">'+esc(cfg.subtitle)+'</p>':'')+'</div>' : '';

    container.innerHTML = '<div class="awa-ps">' + header + heroHtml + restHtml
      + '<div class="awa-ps-footer"><a href="https://awajimaaai.com" target="_blank" rel="noopener">Powered by Awa Biz Suite</a></div></div>';

    bindCardEvents(container);
  }

  // ── Auto-init product showcases ───────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initShowcases);
  } else {
    initShowcases();
  }

})();
`.trim();
}
