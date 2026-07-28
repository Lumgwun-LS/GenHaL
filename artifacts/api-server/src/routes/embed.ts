/**
 * Embedded Services — lets Connected Business vendors embed Awa Biz Suite
 * services directly into their own website, app, or platform via a single
 * <script> tag. Their customers use Awa services without ever logging in to
 * Awa Biz Suite. Authentication is via the vendor's awa_sk_* API key.
 *
 * Public (no Clerk auth):
 *   GET  /embed.js            — embeddable JavaScript widget (CORS enabled)
 *   GET  /embed/manifest      — service manifest for a given API key (?key=awa_sk_...)
 *
 * The widget flow:
 *   1. Vendor adds  <script src="…/api/embed.js" data-key="awa_sk_xxx"></script>
 *   2. A floating "Services" button appears on their website
 *   3. When clicked, the widget fetches /embed/manifest?key=awa_sk_xxx
 *   4. A slide-in panel shows the services their subscription unlocks
 *   5. Each service links to the relevant Awa page for that vendor
 */

import { Router, type Request } from "express";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, vendorApiKeysTable, vendorsTable, platformPartnersTable } from "@workspace/db";

const router = Router();
export default router;

// ─── CORS helper ─────────────────────────────────────────────────────────────

function embedCors(res: import("express").Response) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

// ─── Service catalog ─────────────────────────────────────────────────────────

type ServiceEntry = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: "commerce" | "marketing" | "support" | "developer";
  urlPath: (ctx: { vendorId: number; slug: string; baseHost: string }) => string;
};

const ALL_SERVICES: ServiceEntry[] = [
  {
    id: "storefront",
    name: "Shop",
    description: "Browse products and services",
    emoji: "🛍️",
    category: "commerce",
    urlPath: ({ vendorId, baseHost }) => `${baseHost}/store/${vendorId}`,
  },
  {
    id: "payments",
    name: "Payments",
    description: "Make or track a payment",
    emoji: "💳",
    category: "commerce",
    urlPath: ({ vendorId, baseHost }) => `${baseHost}/store/${vendorId}?tab=pay`,
  },
  {
    id: "order-status",
    name: "My Orders",
    description: "Track your orders",
    emoji: "📦",
    category: "commerce",
    urlPath: ({ vendorId, baseHost }) => `${baseHost}/store/${vendorId}?tab=orders`,
  },
  {
    id: "support",
    name: "Support",
    description: "Contact us or submit an inquiry",
    emoji: "💬",
    category: "support",
    urlPath: ({ vendorId, baseHost }) => `${baseHost}/store/${vendorId}?tab=contact`,
  },
  {
    id: "newsletter",
    name: "Stay Updated",
    description: "Subscribe to news and updates",
    emoji: "📧",
    category: "marketing",
    urlPath: ({ vendorId, baseHost }) => `${baseHost}/store/${vendorId}?tab=subscribe`,
  },
  {
    id: "voice-callback",
    name: "Request Callback",
    description: "We'll call you back shortly",
    emoji: "📞",
    category: "support",
    urlPath: ({ vendorId, baseHost }) => `${baseHost}/store/${vendorId}?tab=callback`,
  },
  {
    id: "social-feed",
    name: "Social Feed",
    description: "View our latest updates",
    emoji: "📱",
    category: "marketing",
    urlPath: ({ vendorId, baseHost }) => `${baseHost}/store/${vendorId}?tab=social`,
  },
  {
    id: "developer",
    name: "Developer API",
    description: "Access API documentation",
    emoji: "🔗",
    category: "developer",
    urlPath: ({ slug, baseHost }) => `${baseHost}/docs/${slug}`,
  },
];

/** Services each subscription tier unlocks in the embedded widget. */
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

// ─── GET /embed.js ────────────────────────────────────────────────────────────

router.get("/embed.js", (req, res) => {
  embedCors(res);
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");

  const js = buildWidgetScript();
  res.send(js);
});

router.options("/embed.js", (req, res) => { embedCors(res); res.sendStatus(204); });
router.options("/embed/manifest", (req, res) => { embedCors(res); res.sendStatus(204); });

// ─── GET /embed/manifest ──────────────────────────────────────────────────────

router.get("/embed/manifest", async (req, res): Promise<void> => {
  embedCors(res);

  const rawKey = (req.query.key as string) || "";
  if (!rawKey.startsWith("awa_sk_")) {
    res.status(400).json({ error: "Missing or invalid key. Provide ?key=awa_sk_..." });
    return;
  }

  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const [key] = await db.select({
    vendorId:  vendorApiKeysTable.vendorId,
    isActive:  vendorApiKeysTable.isActive,
    revokedAt: vendorApiKeysTable.revokedAt,
    expiresAt: vendorApiKeysTable.expiresAt,
  }).from(vendorApiKeysTable).where(eq(vendorApiKeysTable.keyHash, keyHash)).limit(1);

  if (!key || !key.isActive || key.revokedAt) {
    res.status(401).json({ error: "Invalid or revoked API key" });
    return;
  }
  if (key.expiresAt && key.expiresAt < new Date()) {
    res.status(401).json({ error: "API key has expired" });
    return;
  }

  const [vendor] = await db.select({
    id:               vendorsTable.id,
    businessName:     vendorsTable.businessName,
    logoUrl:          vendorsTable.logoUrl,
    subscriptionTier: vendorsTable.subscriptionTier,
  }).from(vendorsTable).where(eq(vendorsTable.id, key.vendorId)).limit(1);

  if (!vendor) { res.status(401).json({ error: "Vendor not found" }); return; }

  // Look up Connected Business profile for slug
  const [profile] = await db.select({ slug: platformPartnersTable.slug })
    .from(platformPartnersTable)
    .where(eq(platformPartnersTable.vendorId, vendor.id))
    .limit(1);

  const tier = (vendor.subscriptionTier ?? "free") as string;
  const allowedIds = TIER_SERVICE_IDS[tier] ?? TIER_SERVICE_IDS.free;
  const baseHost = getBaseHost(req);
  const slug = profile?.slug ?? "";

  const services = ALL_SERVICES
    .filter((s) => allowedIds.includes(s.id))
    .map((s) => ({
      id:          s.id,
      name:        s.name,
      description: s.description,
      emoji:       s.emoji,
      category:    s.category,
      url:         s.urlPath({ vendorId: vendor.id, slug, baseHost }),
    }));

  // Update lastUsedAt async
  db.update(vendorApiKeysTable).set({ lastUsedAt: new Date() })
    .where(eq(vendorApiKeysTable.keyHash, keyHash)).catch(() => {});

  res.json({
    vendor: {
      name:    vendor.businessName ?? "Business",
      logoUrl: vendor.logoUrl ?? null,
      tier,
    },
    services,
    meta: {
      slug,
      docsUrl: slug ? `${baseHost}/docs/${slug}` : null,
    },
  });
});

// ─── Widget JavaScript ────────────────────────────────────────────────────────

function buildWidgetScript(): string {
  return `
/* Awa Biz Suite — Embedded Services Widget v1.0 */
(function () {
  "use strict";

  var script = document.currentScript || (function () {
    var s = document.getElementsByTagName("script");
    return s[s.length - 1];
  })();

  var key      = script.getAttribute("data-key") || "";
  var theme    = script.getAttribute("data-theme") || "dark";
  var label    = script.getAttribute("data-label") || "Services";
  var position = script.getAttribute("data-position") || "bottom-right";
  var host     = script.getAttribute("data-host") || script.src.replace(/\\/api\\/embed\\.js.*$/, "");

  if (!key) {
    console.warn("[Awa Embed] No data-key provided on the <script> tag.");
    return;
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  var isLeft = position === "bottom-left";
  var isDark = theme !== "light";
  var bg     = isDark ? "#0f0f13" : "#ffffff";
  var fg     = isDark ? "#f8fafc"  : "#0f172a";
  var muted  = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  var border = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  var cardBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  var cardBorder = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  var css = [
    "#awa-btn{position:fixed;" + (isLeft ? "left:20px" : "right:20px") + ";bottom:20px;z-index:2147483646;display:flex;align-items:center;gap:8px;padding:11px 18px;border-radius:50px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:700;cursor:pointer;border:none;box-shadow:0 4px 24px rgba(124,58,237,.45);transition:transform .2s,box-shadow .2s;line-height:1}",
    "#awa-btn:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(124,58,237,.55)}",
    "#awa-btn svg{width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}",
    "#awa-panel{position:fixed;top:0;" + (isLeft ? "left:0" : "right:0") + ";width:380px;max-width:100vw;height:100vh;z-index:2147483647;background:" + bg + ";color:" + fg + ";font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;box-shadow:" + (isLeft ? "4px" : "-4px") + " 0 40px rgba(0,0,0,.4);transform:translateX(" + (isLeft ? "-100%" : "100%") + ");transition:transform .3s cubic-bezier(.4,0,.2,1)}",
    "#awa-panel.open{transform:translateX(0)}",
    "#awa-overlay{position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .3s}",
    "#awa-overlay.open{opacity:1;pointer-events:auto}",
    ".awa-hd{padding:18px 16px;border-bottom:1px solid " + border + ";display:flex;align-items:center;gap:12px}",
    ".awa-logo{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#4f46e5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:17px;font-weight:900;flex-shrink:0;overflow:hidden}",
    ".awa-logo img{width:100%;height:100%;object-fit:contain}",
    ".awa-vname{font-size:15px;font-weight:700;margin:0}",
    ".awa-pwby{font-size:10px;color:" + muted + ";margin:2px 0 0}",
    ".awa-x{margin-left:auto;background:none;border:none;color:" + muted + ";cursor:pointer;padding:6px;border-radius:8px;font-size:20px;line-height:1}",
    ".awa-x:hover{background:" + cardBg + "}",
    ".awa-body{flex:1;overflow-y:auto;padding:14px}",
    ".awa-cat{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:" + muted + ";margin:0 0 8px}",
    ".awa-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}",
    ".awa-card{padding:13px;border-radius:12px;background:" + cardBg + ";border:1px solid " + cardBorder + ";cursor:pointer;text-align:left;transition:all .15s;text-decoration:none;display:block;color:" + fg + "}",
    ".awa-card:hover{border-color:rgba(124,58,237,.4);background:rgba(124,58,237,.07);transform:translateY(-1px)}",
    ".awa-icon{font-size:22px;margin-bottom:7px;display:block}",
    ".awa-sname{font-size:12px;font-weight:700;margin:0 0 3px}",
    ".awa-sdesc{font-size:10px;color:" + muted + ";margin:0;line-height:1.4}",
    ".awa-empty{text-align:center;padding:40px 16px;color:" + muted + ";font-size:13px}",
    ".awa-ft{padding:10px 16px;border-top:1px solid " + border + ";text-align:center}",
    ".awa-ft a{font-size:10px;color:" + muted + ";text-decoration:none}",
    ".awa-ft a:hover{color:#7c3aed}",
    ".awa-spin{text-align:center;padding:40px;color:" + muted + ";font-size:13px}",
  ].join("\\n");

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ── DOM ──────────────────────────────────────────────────────────────────────
  var overlay = document.createElement("div");
  overlay.id = "awa-overlay";
  document.body.appendChild(overlay);

  var btn = document.createElement("button");
  btn.id = "awa-btn";
  btn.setAttribute("aria-label", label + " — Powered by Awa Biz Suite");
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>' + label;
  document.body.appendChild(btn);

  var panel = document.createElement("div");
  panel.id = "awa-panel";
  panel.role = "dialog";
  panel.setAttribute("aria-modal", "true");
  panel.innerHTML = '<div class="awa-spin">Loading services…</div>';
  document.body.appendChild(panel);

  // ── Logic ─────────────────────────────────────────────────────────────────
  var open = false;
  function show() { panel.classList.add("open"); overlay.classList.add("open"); open = true; btn.setAttribute("aria-expanded", "true"); }
  function hide() { panel.classList.remove("open"); overlay.classList.remove("open"); open = false; btn.setAttribute("aria-expanded", "false"); }
  btn.addEventListener("click", function () { open ? hide() : show(); });
  overlay.addEventListener("click", hide);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) hide(); });

  // ── Fetch manifest ────────────────────────────────────────────────────────
  fetch(host + "/api/embed/manifest?key=" + encodeURIComponent(key))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.error) { panel.innerHTML = '<div class="awa-empty">⚠️ ' + data.error + '</div>'; return; }
      render(data);
    })
    .catch(function () { panel.innerHTML = '<div class="awa-empty">Could not load services. Check your API key.</div>'; });

  function render(data) {
    var v = data.vendor;
    var services = data.services || [];
    var logoHtml = v.logoUrl
      ? '<img src="' + v.logoUrl + '" alt="">'
      : v.name.trim().charAt(0).toUpperCase();

    // Group by category
    var cats = {};
    var catOrder = [];
    services.forEach(function (s) {
      if (!cats[s.category]) { cats[s.category] = []; catOrder.push(s.category); }
      cats[s.category].push(s);
    });

    var catLabels = { commerce: "🛒 Commerce", marketing: "📣 Marketing", support: "💬 Support", developer: "🔗 Developer" };
    var body = catOrder.length === 0
      ? '<div class="awa-empty">No services available on this plan.</div>'
      : catOrder.map(function (cat) {
          var cards = cats[cat].map(function (s) {
            return '<a class="awa-card" href="' + s.url + '" target="_blank" rel="noopener noreferrer">'
              + '<span class="awa-icon">' + s.emoji + '</span>'
              + '<p class="awa-sname">' + s.name + '</p>'
              + '<p class="awa-sdesc">' + s.description + '</p>'
              + '</a>';
          }).join("");
          return '<p class="awa-cat">' + (catLabels[cat] || cat) + '</p><div class="awa-grid">' + cards + '</div>';
        }).join("");

    panel.innerHTML =
      '<div class="awa-hd">'
        + '<div class="awa-logo">' + logoHtml + '</div>'
        + '<div><p class="awa-vname">' + v.name + '</p><p class="awa-pwby">Powered by Awa Biz Suite</p></div>'
        + '<button class="awa-x" id="awa-close" aria-label="Close">&#x2715;</button>'
      + '</div>'
      + '<div class="awa-body">' + body + '</div>'
      + '<div class="awa-ft"><a href="https://awajimaaai.com" target="_blank" rel="noopener">Powered by Awa Biz Suite</a></div>';

    document.getElementById("awa-close").addEventListener("click", hide);
  }
})();
`.trim();
}
