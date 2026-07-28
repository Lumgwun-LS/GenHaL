/**
 * Embedded Services — lets Connected Business vendors embed Awa Biz Suite
 * services (and their product catalog) directly into any website or mobile app.
 *
 * Public routes (no Clerk, CORS *):
 *   GET  /embed.js                  — embeddable JS widget + product showcase
 *   GET  /embed/manifest            — service list for a given API key
 *   GET  /embed/products            — vendor's public product catalog
 *   GET  /embed/products/:id        — single product detail
 *
 * Usage — floating services panel:
 *   <script src="…/api/embed.js" data-key="awa_sk_xxx"></script>
 *
 * Usage — product showcase (drop anywhere on the page):
 *   <div data-awa="products" data-key="awa_sk_xxx" data-view="grid"></div>
 *   <script src="…/api/embed.js" data-key="awa_sk_xxx"></script>
 */

import { Router, type Request } from "express";
import { createHash } from "node:crypto";
import { eq, and, desc, asc, sql, count as drizzleCount } from "drizzle-orm";
import {
  db,
  vendorApiKeysTable,
  vendorsTable,
  platformPartnersTable,
  productsTable,
} from "@workspace/db";

const router = Router();
export default router;

// ─── CORS helper ─────────────────────────────────────────────────────────────

function embedCors(res: import("express").Response) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

// ─── API key resolution (shared) ─────────────────────────────────────────────

type KeyContext = { vendorId: number; subscriptionTier: string; defaultCurrency: string };

async function resolveKey(rawKey: string): Promise<KeyContext | null> {
  if (!rawKey.startsWith("awa_sk_")) return null;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const [key] = await db.select({ vendorId: vendorApiKeysTable.vendorId, isActive: vendorApiKeysTable.isActive, revokedAt: vendorApiKeysTable.revokedAt, expiresAt: vendorApiKeysTable.expiresAt })
    .from(vendorApiKeysTable).where(eq(vendorApiKeysTable.keyHash, keyHash)).limit(1);
  if (!key || !key.isActive || key.revokedAt) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  const [vendor] = await db.select({ id: vendorsTable.id, subscriptionTier: vendorsTable.subscriptionTier, defaultCurrency: vendorsTable.defaultCurrency })
    .from(vendorsTable).where(eq(vendorsTable.id, key.vendorId)).limit(1);
  if (!vendor) return null;
  // bump lastUsedAt async
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

// ─── OPTIONS preflight ────────────────────────────────────────────────────────

for (const path of ["/embed.js", "/embed/manifest", "/embed/products", "/embed/products/:id"]) {
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

  const [vendor] = await db.select({ businessName: vendorsTable.businessName, logoUrl: vendorsTable.logoUrl })
    .from(vendorsTable).where(eq(vendorsTable.id, ctx.vendorId)).limit(1);

  const [profile] = await db.select({ slug: platformPartnersTable.slug })
    .from(platformPartnersTable).where(eq(platformPartnersTable.vendorId, ctx.vendorId)).limit(1);

  const baseHost = getBaseHost(req);
  const slug = profile?.slug ?? "";
  const allowedIds = TIER_SERVICE_IDS[ctx.subscriptionTier] ?? TIER_SERVICE_IDS.free;
  const services = ALL_SERVICES.filter(s => allowedIds.includes(s.id))
    .map(s => ({ id: s.id, name: s.name, description: s.description, emoji: s.emoji, category: s.category, url: s.urlPath({ vendorId: ctx.vendorId, slug, baseHost }) }));

  res.json({
    vendor: { name: vendor?.businessName ?? "Business", logoUrl: vendor?.logoUrl ?? null, tier: ctx.subscriptionTier },
    services,
    meta: { slug, docsUrl: slug ? `${baseHost}/docs/${slug}` : null },
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

  const orderBy = sort === "price_asc" ? asc(productsTable.price)
    : sort === "price_desc" ? desc(productsTable.price)
    : sort === "name"       ? asc(productsTable.name)
    : desc(productsTable.createdAt);

  const [items, [{ total }]] = await Promise.all([
    db.select({
      id:          productsTable.id,
      name:        productsTable.name,
      description: productsTable.description,
      price:       productsTable.price,
      imageUrl:    productsTable.imageUrl,
      category:    productsTable.category,
      inStock:     sql<boolean>`${productsTable.stockQuantity} > 0`,
      unit:        productsTable.unit,
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

  const [vendor] = await db.select({ businessName: vendorsTable.businessName, logoUrl: vendorsTable.logoUrl })
    .from(vendorsTable).where(eq(vendorsTable.id, ctx.vendorId)).limit(1);

  res.json({
    products,
    total: Number(total),
    page,
    limit,
    pages: Math.ceil(Number(total) / limit),
    vendor: { name: vendor?.businessName ?? "Business", logoUrl: vendor?.logoUrl ?? null },
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

  const [product] = await db.select({
    id: productsTable.id, name: productsTable.name, description: productsTable.description,
    price: productsTable.price, imageUrl: productsTable.imageUrl, category: productsTable.category,
    inStock: sql<boolean>`${productsTable.stockQuantity} > 0`, unit: productsTable.unit,
  }).from(productsTable)
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

// ─── Widget JavaScript ────────────────────────────────────────────────────────

function buildWidgetScript(): string {
  return /* javascript */`
/* Awa Biz Suite — Embedded Services & Product Showcase Widget v2.0 */
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

  // ── Styles ────────────────────────────────────────────────────────────────
  var isLeft = position === "bottom-left";
  var isDark = theme !== "light";
  var bg     = isDark ? "#0f0f13" : "#ffffff";
  var fg     = isDark ? "#f8fafc"  : "#0f172a";
  var muted  = isDark ? "rgba(255,255,255,0.4)"  : "rgba(0,0,0,0.4)";
  var border = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  var cardBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  var hoverBg= isDark ? "rgba(124,58,237,0.08)"  : "rgba(124,58,237,0.05)";

  var css = [
    // ── Floating panel ──────────────────────────────────────────────────────
    "#awa-btn{position:fixed;"+(isLeft?"left:20px":"right:20px")+";bottom:20px;z-index:2147483646;display:flex;align-items:center;gap:8px;padding:11px 18px;border-radius:50px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:700;cursor:pointer;border:none;box-shadow:0 4px 24px rgba(124,58,237,.45);transition:transform .2s,box-shadow .2s;line-height:1}",
    "#awa-btn:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(124,58,237,.55)}",
    "#awa-btn svg{width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}",
    "#awa-panel{position:fixed;top:0;"+(isLeft?"left:0":"right:0")+";width:380px;max-width:100vw;height:100vh;z-index:2147483647;background:"+bg+";color:"+fg+";font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;box-shadow:"+(isLeft?"4px":"-4px")+" 0 40px rgba(0,0,0,.4);transform:translateX("+(isLeft?"-100%":"100%")+");transition:transform .3s cubic-bezier(.4,0,.2,1)}",
    "#awa-panel.open{transform:translateX(0)}",
    "#awa-overlay{position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .3s}",
    "#awa-overlay.open{opacity:1;pointer-events:auto}",
    ".awa-hd{padding:18px 16px;border-bottom:1px solid "+border+";display:flex;align-items:center;gap:12px;flex-shrink:0}",
    ".awa-logo{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#4f46e5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:17px;font-weight:900;flex-shrink:0;overflow:hidden}",
    ".awa-logo img{width:100%;height:100%;object-fit:contain}",
    ".awa-vname{font-size:15px;font-weight:700;margin:0}",
    ".awa-pwby{font-size:10px;color:"+muted+";margin:2px 0 0}",
    ".awa-x{margin-left:auto;background:none;border:none;color:"+muted+";cursor:pointer;padding:6px;border-radius:8px;font-size:20px;line-height:1;flex-shrink:0}",
    ".awa-x:hover{background:"+cardBg+"}",
    ".awa-body{flex:1;overflow-y:auto;padding:14px}",
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
    ".awa-panel-pitem{display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;background:"+cardBg+";border:1px solid "+(isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)"+"")+";text-decoration:none;color:"+fg+";transition:all .15s}",
    ".awa-panel-pitem:hover{border-color:rgba(124,58,237,.4);background:"+hoverBg+"}",
    ".awa-panel-pthumb{width:52px;height:52px;border-radius:10px;object-fit:cover;flex-shrink:0;background:linear-gradient(135deg,rgba(124,58,237,.2),rgba(79,70,229,.2));display:flex;align-items:center;justify-content:center;font-size:22px;overflow:hidden}",
    ".awa-panel-pthumb img{width:100%;height:100%;object-fit:cover}",
    ".awa-panel-pinfo{flex:1;min-width:0}",
    ".awa-panel-pname{font-size:13px;font-weight:700;margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".awa-panel-pprice{font-size:14px;font-weight:800;color:#7c3aed;margin:0}",
    ".awa-panel-pbuy{flex-shrink:0;padding:7px 13px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-size:11px;font-weight:700;text-decoration:none}",
    ".awa-ft{padding:10px 16px;border-top:1px solid "+border+";text-align:center;flex-shrink:0}",
    ".awa-ft a{font-size:10px;color:"+muted+";text-decoration:none}",
    ".awa-ft a:hover{color:#7c3aed}",
    ".awa-spin{text-align:center;padding:40px;color:"+muted+";font-size:13px}",
    ".awa-empty-panel{text-align:center;padding:40px 16px;color:"+muted+";font-size:13px}",
    // ── Product showcase ─────────────────────────────────────────────────────
    ".awa-ps{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;width:100%;box-sizing:border-box}",
    ".awa-ps *{box-sizing:border-box}",
    ".awa-ps-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;gap:12px}",
    ".awa-ps-title{font-size:24px;font-weight:900;margin:0;color:"+fg+"}",
    ".awa-ps-subtitle{font-size:13px;color:"+muted+";margin:4px 0 0}",
    ".awa-ps-count{font-size:12px;color:"+muted+";background:"+cardBg+";padding:4px 10px;border-radius:20px;border:1px solid "+border+"}",
    // Grid
    ".awa-grid{display:grid;grid-template-columns:repeat(var(--awa-cols,3),1fr);gap:20px}",
    "@media(max-width:900px){.awa-grid{grid-template-columns:repeat(2,1fr)}}",
    "@media(max-width:500px){.awa-grid{grid-template-columns:1fr}}",
    // Card
    ".awa-card{border-radius:18px;overflow:hidden;background:"+(isDark?"#1a1a24":"#ffffff")+";border:1px solid "+(isDark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.07)")+";transition:transform .25s cubic-bezier(.4,0,.2,1),box-shadow .25s cubic-bezier(.4,0,.2,1),border-color .25s;animation:awaFadeUp .45s ease both;cursor:pointer}",
    ".awa-card:hover{transform:translateY(-8px);box-shadow:0 28px 56px rgba(0,0,0,"+(isDark?".45":".15")+");border-color:rgba(124,58,237,.35)}",
    ".awa-card-img-wrap{position:relative;overflow:hidden;aspect-ratio:1}",
    ".awa-card-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}",
    ".awa-card:hover .awa-card-img{transform:scale(1.06)}",
    ".awa-card-img-ph{width:100%;height:100%;background:linear-gradient(135deg,rgba(124,58,237,.15),rgba(79,70,229,.15));display:flex;align-items:center;justify-content:center;font-size:52px}",
    ".awa-card-badge{position:absolute;top:10px;left:10px;font-size:10px;font-weight:800;padding:4px 10px;border-radius:20px;backdrop-filter:blur(8px)}",
    ".awa-card-badge.in{background:rgba(16,185,129,.18);color:#10b981;border:1px solid rgba(16,185,129,.3)}",
    ".awa-card-badge.out{background:rgba(239,68,68,.18);color:#ef4444;border:1px solid rgba(239,68,68,.3)}",
    ".awa-card-body{padding:16px}",
    ".awa-card-cat{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7c3aed;margin:0 0 6px}",
    ".awa-card-name{font-size:15px;font-weight:800;margin:0 0 6px;color:"+fg+";line-height:1.3}",
    ".awa-card-price{font-size:22px;font-weight:900;color:#7c3aed;margin:0 0 8px}",
    ".awa-card-unit{font-size:11px;color:"+muted+";font-weight:500}",
    ".awa-card-desc{font-size:12px;color:"+muted+";margin:0 0 14px;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
    ".awa-card-btn{display:block;width:100%;padding:11px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:800;font-size:13px;text-align:center;text-decoration:none;border:none;cursor:pointer;transition:opacity .2s,transform .15s}",
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
    ".awa-slide-btn{align-self:flex-start;padding:12px 28px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:800;font-size:14px;text-decoration:none;border:none;cursor:pointer;transition:opacity .2s,transform .15s;margin-top:4px}",
    ".awa-slide-btn:hover{opacity:.88;transform:translateY(-1px)}",
    ".awa-slider-arrow{position:absolute;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;background:"+(isDark?"rgba(15,15,19,.7)":"rgba(255,255,255,.9)")+";backdrop-filter:blur(8px);border:1px solid "+border+";color:"+fg+";font-size:16px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;transition:all .2s}",
    ".awa-slider-arrow:hover{background:#7c3aed;color:#fff;border-color:#7c3aed}",
    ".awa-slider-prev{left:12px}",
    ".awa-slider-next{right:12px}",
    ".awa-slider-dots{display:flex;justify-content:center;gap:6px;margin-top:16px;align-items:center}",
    ".awa-dot{width:7px;height:7px;border-radius:50%;background:"+(isDark?"rgba(255,255,255,.2)":"rgba(0,0,0,.2)")+";transition:all .35s cubic-bezier(.4,0,.2,1);cursor:pointer;border:none;padding:0}",
    ".awa-dot.active{background:#7c3aed;width:22px;border-radius:4px}",
    // Featured layout
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
    ".awa-hero-btn{padding:14px 28px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:800;font-size:14px;text-decoration:none;border:none;cursor:pointer;transition:opacity .2s,transform .15s}",
    ".awa-hero-btn:hover{opacity:.88;transform:translateY(-1px)}",
    ".awa-hero-btn.outline{background:none;border:2px solid "+(isDark?"rgba(255,255,255,.15)":"rgba(0,0,0,.15)")+";color:"+fg+"}",
    ".awa-hero-btn.outline:hover{border-color:#7c3aed;color:#7c3aed}",
    // Load more
    ".awa-loadmore{display:flex;align-items:center;justify-content:center;margin-top:28px}",
    ".awa-loadmore-btn{padding:12px 32px;border-radius:50px;border:2px solid "+(isDark?"rgba(255,255,255,.12)":"rgba(0,0,0,.12)")+";color:"+fg+";background:none;font-size:13px;font-weight:700;cursor:pointer;transition:all .2s}",
    ".awa-loadmore-btn:hover{border-color:#7c3aed;color:#7c3aed;background:rgba(124,58,237,.05)}",
    // Powered by footer
    ".awa-ps-footer{margin-top:20px;text-align:center}",
    ".awa-ps-footer a{font-size:11px;color:"+muted+";text-decoration:none}",
    ".awa-ps-footer a:hover{color:#7c3aed}",
    // Keyframes
    "@keyframes awaFadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}",
    "@keyframes awaShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}",
  ].join("\\n");

  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── Currency formatter ────────────────────────────────────────────────────
  function formatPrice(price, currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(price);
    } catch (e) {
      return (currency || "$") + " " + price.toFixed(2);
    }
  }

  // ── Panel DOM ─────────────────────────────────────────────────────────────
  var overlay = document.createElement("div");
  overlay.id = "awa-overlay";
  document.body.appendChild(overlay);

  var btn, panelEl;
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

  // ── Panel open/close ──────────────────────────────────────────────────────
  var isOpen = false;
  function showPanel() { panelEl.classList.add("open"); overlay.classList.add("open"); isOpen = true; if (btn) btn.setAttribute("aria-expanded", "true"); }
  function hidePanel() { panelEl.classList.remove("open"); overlay.classList.remove("open"); isOpen = false; if (btn) btn.setAttribute("aria-expanded", "false"); }
  if (btn) btn.addEventListener("click", function () { isOpen ? hidePanel() : showPanel(); });
  overlay.addEventListener("click", hidePanel);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen) hidePanel(); });

  // ── Fetch manifest + render panel ────────────────────────────────────────
  if (globalKey) {
    fetch(host + "/api/embed/manifest?key=" + encodeURIComponent(globalKey))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { panelEl.innerHTML = '<div class="awa-empty-panel">⚠️ ' + data.error + '</div>'; return; }
        renderServicesPanel(data);
      })
      .catch(function () { panelEl.innerHTML = '<div class="awa-empty-panel">Could not load services.</div>'; });
  } else {
    panelEl.innerHTML = '<div class="awa-empty-panel">Add data-key to configure.</div>';
  }

  function renderServicesPanel(data) {
    var v = data.vendor;
    var services = data.services || [];
    var logoHtml = v.logoUrl ? '<img src="' + v.logoUrl + '" alt="">' : v.name.trim().charAt(0).toUpperCase();

    // Group by category
    var catOrder = [], cats = {};
    services.forEach(function (s) {
      if (!cats[s.category]) { cats[s.category] = []; catOrder.push(s.category); }
      cats[s.category].push(s);
    });
    var catLabels = { commerce: "🛒 Commerce", marketing: "📣 Marketing", support: "💬 Support", developer: "🔗 Developer" };

    function buildServiceCards(svcs) {
      return svcs.map(function (s) {
        // Products tile opens inline product list; others open new tab
        if (s.id === "storefront") {
          return '<button class="awa-svc-card" data-products-btn="1"><span class="awa-svc-icon">' + s.emoji + '</span><p class="awa-svc-name">Products</p><p class="awa-svc-desc">Browse our catalog</p></button>';
        }
        return '<a class="awa-svc-card" href="' + s.url + '" target="_blank" rel="noopener noreferrer"><span class="awa-svc-icon">' + s.emoji + '</span><p class="awa-svc-name">' + s.name + '</p><p class="awa-svc-desc">' + s.description + '</p></a>';
      }).join("");
    }

    var sectionsHtml = catOrder.length === 0
      ? '<div class="awa-empty-panel">No services on this plan.</div>'
      : catOrder.map(function (cat) {
          return '<p class="awa-cat-lbl">' + (catLabels[cat] || cat) + '</p><div class="awa-svc-grid">' + buildServiceCards(cats[cat]) + '</div>';
        }).join("");

    panelEl.innerHTML =
      '<div class="awa-hd"><div class="awa-logo">' + logoHtml + '</div><div><p class="awa-vname">' + v.name + '</p><p class="awa-pwby">Powered by Awa Biz Suite</p></div><button class="awa-x" id="awa-close">&#x2715;</button></div>'
      + '<div class="awa-body" id="awa-panel-body">' + sectionsHtml + '</div>'
      + '<div class="awa-ft"><a href="https://awajimaaai.com" target="_blank" rel="noopener">Powered by Awa Biz Suite</a></div>';

    document.getElementById("awa-close").addEventListener("click", hidePanel);

    // Products tile — show mini product list
    var prodBtn = panelEl.querySelector("[data-products-btn]");
    if (prodBtn) {
      prodBtn.addEventListener("click", function () { showPanelProducts(v); });
    }
  }

  function showPanelProducts(vendor) {
    var body = document.getElementById("awa-panel-body");
    if (!body) return;
    body.innerHTML = '<button class="awa-back-btn" id="awa-back">&#8592; Back to Services</button><div id="awa-plist"><div class="awa-spin">Loading products…</div></div>';
    document.getElementById("awa-back").addEventListener("click", function () {
      fetch(host + "/api/embed/manifest?key=" + encodeURIComponent(globalKey))
        .then(function (r) { return r.json(); })
        .then(renderServicesPanel);
    });

    fetch(host + "/api/embed/products?key=" + encodeURIComponent(globalKey) + "&limit=20")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var list = document.getElementById("awa-plist");
        if (!list) return;
        if (data.error || !data.products) { list.innerHTML = '<div class="awa-empty-panel">⚠️ ' + (data.error || "Failed to load") + '</div>'; return; }
        if (data.products.length === 0) { list.innerHTML = '<div class="awa-empty-panel">No products available yet.</div>'; return; }
        list.innerHTML = '<div class="awa-panel-plist">' + data.products.map(function (p) {
          var thumb = p.imageUrl
            ? '<img src="' + p.imageUrl + '" alt="' + p.name + '">'
            : '<span>' + (p.category ? p.category.charAt(0) : "🛍") + '</span>';
          return '<a class="awa-panel-pitem" href="' + p.buyUrl + '" target="_blank" rel="noopener">'
            + '<div class="awa-panel-pthumb">' + thumb + '</div>'
            + '<div class="awa-panel-pinfo"><p class="awa-panel-pname">' + p.name + '</p><p class="awa-panel-pprice">' + formatPrice(p.price, p.currency) + (p.unit ? ' <span style="font-size:10px;font-weight:500;opacity:.6">/ ' + p.unit + '</span>' : '') + '</p></div>'
            + '<a class="awa-panel-pbuy" href="' + p.buyUrl + '" target="_blank">Buy</a>'
            + '</a>';
        }).join("") + '</div>';
      })
      .catch(function () {
        var list = document.getElementById("awa-plist");
        if (list) list.innerHTML = '<div class="awa-empty-panel">Could not load products.</div>';
      });
  }

  // ── Product Showcase Auto-Init ────────────────────────────────────────────
  function initShowcases() {
    var els = document.querySelectorAll('[data-awa="products"]');
    for (var i = 0; i < els.length; i++) {
      initOneShowcase(els[i]);
    }
  }

  function initOneShowcase(container) {
    var key      = container.getAttribute("data-key") || globalKey;
    var view     = container.getAttribute("data-view") || "grid";
    var limit    = parseInt(container.getAttribute("data-limit") || "12", 10);
    var cols     = parseInt(container.getAttribute("data-columns") || "3", 10);
    var cta      = container.getAttribute("data-cta") || "Buy Now";
    var title    = container.getAttribute("data-title") || "Our Products";
    var subtitle = container.getAttribute("data-subtitle") || "";
    var category = container.getAttribute("data-category") || "";
    var sort     = container.getAttribute("data-sort") || "newest";
    var showLoad = container.getAttribute("data-loadmore") !== "false";

    if (!key) { container.innerHTML = '<p style="color:#ef4444;font-size:13px">⚠️ Add data-key to this element.</p>'; return; }

    var cfg = { key: key, view: view, limit: limit, cols: cols, cta: cta, title: title, subtitle: subtitle, category: category, sort: sort, showLoad: showLoad, page: 1, totalPages: 1 };

    // Skeleton while loading
    renderSkeleton(container, cfg);

    // Fetch
    loadProducts(cfg, function (data) {
      cfg.totalPages = data.pages || 1;
      renderShowcase(container, data, cfg);
    });
  }

  function loadProducts(cfg, cb) {
    var url = host + "/api/embed/products?key=" + encodeURIComponent(cfg.key)
      + "&limit=" + cfg.limit + "&page=" + cfg.page + "&sort=" + cfg.sort
      + (cfg.category ? "&category=" + encodeURIComponent(cfg.category) : "");
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(cb)
      .catch(function () { cb({ error: "Network error", products: [] }); });
  }

  function renderSkeleton(container, cfg) {
    var n = Math.min(cfg.limit, 6);
    var cards = "";
    for (var i = 0; i < n; i++) {
      cards += '<div class="awa-skel-card" style="animation-delay:' + (i * 0.06) + 's"><div class="awa-skel-img"></div><div class="awa-skel-body"><div class="awa-skel-line" style="width:80%"></div><div class="awa-skel-price"></div><div class="awa-skel-line" style="width:60%"></div><div class="awa-skel-btn"></div></div></div>';
    }
    container.innerHTML = '<div class="awa-ps"><div class="awa-grid" style="--awa-cols:' + cfg.cols + '">' + cards + '</div></div>';
  }

  function renderShowcase(container, data, cfg) {
    if (data.error || !data.products) {
      container.innerHTML = '<div class="awa-ps"><p style="color:#ef4444;font-size:13px">⚠️ ' + (data.error || "Failed to load products") + '</p></div>';
      return;
    }
    switch (cfg.view) {
      case "slider":   renderSlider(container, data, cfg); break;
      case "featured": renderFeatured(container, data, cfg); break;
      default:         renderGrid(container, data, cfg); break;
    }
  }

  function buildCardHtml(p, cfg) {
    var imgHtml = p.imageUrl
      ? '<img class="awa-card-img" src="' + p.imageUrl + '" alt="' + p.name + '" loading="lazy">'
      : '<div class="awa-card-img-ph">🛍️</div>';
    var badge = p.inStock
      ? '<span class="awa-card-badge in">● In Stock</span>'
      : '<span class="awa-card-badge out">✕ Sold Out</span>';
    var btnClass = p.inStock ? "" : " disabled";
    var btnHref  = p.inStock ? ' href="' + p.buyUrl + '" target="_blank" rel="noopener"' : "";
    var btnTag   = p.inStock ? "a" : "span";
    return '<div class="awa-card">'
      + '<div class="awa-card-img-wrap">' + imgHtml + badge + '</div>'
      + '<div class="awa-card-body">'
      + (p.category ? '<p class="awa-card-cat">' + p.category + '</p>' : '')
      + '<p class="awa-card-name">' + p.name + '</p>'
      + '<p class="awa-card-price">' + formatPrice(p.price, p.currency) + (p.unit ? ' <span class="awa-card-unit">/ ' + p.unit + '</span>' : '') + '</p>'
      + (p.description ? '<p class="awa-card-desc">' + p.description + '</p>' : '')
      + '<' + btnTag + ' class="awa-card-btn' + btnClass + '"' + btnHref + '>' + (p.inStock ? cfg.cta : "Sold Out") + '</' + btnTag + '>'
      + '</div></div>';
  }

  function renderGrid(container, data, cfg) {
    var cards = data.products.map(function (p, i) {
      return '<div style="animation-delay:' + (i * 0.07) + 's">' + buildCardHtml(p, cfg) + '</div>';
    }).join("");
    var totalLabel = data.total > 0 ? '<span class="awa-ps-count">' + data.total + ' products</span>' : '';
    var headerHtml = cfg.title
      ? '<div class="awa-ps-header"><div><p class="awa-ps-title">' + cfg.title + '</p>' + (cfg.subtitle ? '<p class="awa-ps-subtitle">' + cfg.subtitle + '</p>' : '') + '</div>' + totalLabel + '</div>'
      : '';
    var loadMore = (cfg.showLoad && cfg.page < cfg.totalPages)
      ? '<div class="awa-loadmore"><button class="awa-loadmore-btn" id="awa-lm">Load More →</button></div>'
      : '';
    container.innerHTML = '<div class="awa-ps">' + headerHtml + '<div class="awa-grid" id="awa-grid-inner" style="--awa-cols:' + cfg.cols + '">' + cards + '</div>' + loadMore + '<div class="awa-ps-footer"><a href="https://awajimaaai.com" target="_blank" rel="noopener">Powered by Awa Biz Suite</a></div></div>';

    var lmBtn = container.querySelector("#awa-lm");
    if (lmBtn) {
      lmBtn.addEventListener("click", function () {
        lmBtn.textContent = "Loading…";
        lmBtn.disabled = true;
        cfg.page++;
        loadProducts(cfg, function (more) {
          var grid = container.querySelector("#awa-grid-inner");
          if (!grid || !more.products) return;
          var frag = more.products.map(function (p, i) {
            return '<div style="animation-delay:' + (i * 0.07) + 's">' + buildCardHtml(p, cfg) + '</div>';
          }).join("");
          grid.insertAdjacentHTML("beforeend", frag);
          if (cfg.page >= (more.pages || 1)) lmBtn.parentElement.remove();
          else { lmBtn.textContent = "Load More →"; lmBtn.disabled = false; }
        });
      });
    }
  }

  function renderSlider(container, data, cfg) {
    var products = data.products;
    if (!products.length) { renderGrid(container, data, cfg); return; }

    function buildSlide(p) {
      var imgHtml = p.imageUrl
        ? '<img class="awa-slide-img" src="' + p.imageUrl + '" alt="' + p.name + '" loading="lazy">'
        : '<div class="awa-slide-img-ph">🛍️</div>';
      var btnHtml = p.inStock
        ? '<a class="awa-slide-btn" href="' + p.buyUrl + '" target="_blank" rel="noopener">' + cfg.cta + '</a>'
        : '<span class="awa-slide-btn" style="opacity:.5;cursor:not-allowed">Sold Out</span>';
      return '<div class="awa-slide">'
        + '<div class="awa-slide-img-wrap">' + imgHtml + '</div>'
        + '<div class="awa-slide-body">'
        + (p.category ? '<p class="awa-slide-cat">' + p.category + '</p>' : '')
        + '<p class="awa-slide-name">' + p.name + '</p>'
        + '<p class="awa-slide-price">' + formatPrice(p.price, p.currency) + (p.unit ? ' <span style="font-size:14px;opacity:.6">/ ' + p.unit + '</span>' : '') + '</p>'
        + (p.description ? '<p class="awa-slide-desc">' + p.description + '</p>' : '')
        + btnHtml
        + '</div></div>';
    }

    var dots = products.map(function (_, i) { return '<button class="awa-dot' + (i === 0 ? " active" : "") + '" data-i="' + i + '"></button>'; }).join("");
    var header = cfg.title ? '<div class="awa-ps-header"><p class="awa-ps-title">' + cfg.title + '</p>' + (cfg.subtitle ? '<p class="awa-ps-subtitle">' + cfg.subtitle + '</p>' : '') + '</div>' : '';
    container.innerHTML = '<div class="awa-ps">' + header
      + '<div class="awa-slider">'
      + '<div class="awa-slider-track" id="awa-track">' + products.map(buildSlide).join("") + '</div>'
      + '<button class="awa-slider-arrow awa-slider-prev" id="awa-prev">&#8592;</button>'
      + '<button class="awa-slider-arrow awa-slider-next" id="awa-next">&#8594;</button>'
      + '</div>'
      + '<div class="awa-slider-dots" id="awa-dots">' + dots + '</div>'
      + '<div class="awa-ps-footer"><a href="https://awajimaaai.com" target="_blank" rel="noopener">Powered by Awa Biz Suite</a></div></div>';

    var track = container.querySelector("#awa-track");
    var dotsEl = container.querySelector("#awa-dots");
    var cur = 0, total = products.length, autoTimer;

    function goTo(idx) {
      cur = (idx + total) % total;
      track.style.transform = "translateX(-" + cur * 100 + "%)";
      dotsEl.querySelectorAll(".awa-dot").forEach(function (d, i) { d.classList.toggle("active", i === cur); });
    }

    function startAuto() { autoTimer = setInterval(function () { goTo(cur + 1); }, 4000); }
    function stopAuto()  { clearInterval(autoTimer); }

    container.querySelector("#awa-prev").addEventListener("click", function () { stopAuto(); goTo(cur - 1); startAuto(); });
    container.querySelector("#awa-next").addEventListener("click", function () { stopAuto(); goTo(cur + 1); startAuto(); });
    dotsEl.querySelectorAll(".awa-dot").forEach(function (d) {
      d.addEventListener("click", function () { stopAuto(); goTo(parseInt(d.getAttribute("data-i"))); startAuto(); });
    });

    // Touch/pointer drag
    var startX = 0, dragging = false;
    track.addEventListener("pointerdown", function (e) { startX = e.clientX; dragging = true; stopAuto(); });
    document.addEventListener("pointerup", function (e) {
      if (!dragging) return;
      dragging = false;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 40) goTo(dx < 0 ? cur + 1 : cur - 1);
      startAuto();
    });

    startAuto();
  }

  function renderFeatured(container, data, cfg) {
    var products = data.products;
    if (!products.length) { container.innerHTML = '<div class="awa-ps"><p style="color:' + muted + ';font-size:13px">No products yet.</p></div>'; return; }

    var hero = products[0];
    var rest = products.slice(1);

    var heroImg = hero.imageUrl
      ? '<img class="awa-hero-img" src="' + hero.imageUrl + '" alt="' + hero.name + '" loading="lazy">'
      : '<div class="awa-hero-img-ph">🛍️</div>';
    var heroBtnHtml = hero.inStock
      ? '<a class="awa-hero-btn" href="' + hero.buyUrl + '" target="_blank" rel="noopener">' + cfg.cta + '</a><a class="awa-hero-btn outline" href="' + hero.buyUrl + '" target="_blank" rel="noopener">View Details</a>'
      : '<span class="awa-hero-btn" style="opacity:.5;cursor:not-allowed">Sold Out</span>';

    var heroHtml = '<div class="awa-featured-hero">'
      + '<div class="awa-hero-img-wrap">' + heroImg + '</div>'
      + '<div class="awa-hero-body">'
      + (hero.category ? '<span class="awa-hero-badge">' + hero.category + '</span>' : '')
      + '<p class="awa-hero-name">' + hero.name + '</p>'
      + '<p class="awa-hero-price">' + formatPrice(hero.price, hero.currency) + (hero.unit ? ' <span style="font-size:16px;opacity:.6">/ ' + hero.unit + '</span>' : '') + '</p>'
      + (hero.description ? '<p class="awa-hero-desc">' + hero.description + '</p>' : '')
      + '<div class="awa-hero-actions">' + heroBtnHtml + '</div>'
      + '</div></div>';

    var restHtml = rest.length
      ? '<div class="awa-grid" style="--awa-cols:' + Math.min(cfg.cols, 3) + '">' + rest.map(function (p, i) { return '<div style="animation-delay:' + (i * 0.07) + 's">' + buildCardHtml(p, cfg) + '</div>'; }).join("") + '</div>'
      : '';

    var header = cfg.title ? '<div class="awa-ps-header"><p class="awa-ps-title">' + cfg.title + '</p>' + (cfg.subtitle ? '<p class="awa-ps-subtitle">' + cfg.subtitle + '</p>' : '') + '</div>' : '';

    container.innerHTML = '<div class="awa-ps">' + header + heroHtml + restHtml
      + '<div class="awa-ps-footer"><a href="https://awajimaaai.com" target="_blank" rel="noopener">Powered by Awa Biz Suite</a></div></div>';
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
