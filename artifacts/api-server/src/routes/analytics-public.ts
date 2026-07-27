/**
 * Public analytics routes — no auth required.
 * POST /analytics/pageview — rich visitor beacon with UTM, geo, device parsing.
 * POST /analytics/event   — menu/interaction event beacon.
 */
import { Router } from "express";
import { db, pageViewsTable, eventLogsTable } from "@workspace/db";

const router = Router();

// ── UA parsing ────────────────────────────────────────────────────────────────
function parseUA(ua: string | null): { device: string; browser: string; os: string } {
  if (!ua) return { device: "unknown", browser: "unknown", os: "unknown" };

  // Device
  let device = "desktop";
  if (/ipad|tablet/i.test(ua)) device = "tablet";
  else if (/mobile|android.*mobile|iphone|ipod|blackberry|windows phone/i.test(ua)) device = "mobile";

  // OS
  let os = "other";
  if (/windows nt/i.test(ua)) os = "Windows";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/mac os x|macintosh/i.test(ua) && !/iphone|ipad/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";
  else if (/cros/i.test(ua)) os = "ChromeOS";

  // Browser (order matters — Edge/Opera check before Chrome)
  let browser = "other";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\/|opera/i.test(ua)) browser = "Opera";
  else if (/samsungbrowser/i.test(ua)) browser = "Samsung";
  else if (/ucbrowser/i.test(ua)) browser = "UC Browser";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/msie|trident/i.test(ua)) browser = "IE";

  return { device, browser, os };
}

// ── Traffic source parsing ────────────────────────────────────────────────────
function parseTrafficSource(referrer: string | null, utmSource: string | null): string {
  if (utmSource) {
    const s = utmSource.toLowerCase();
    if (s.includes("google") || s === "cpc" || s === "adwords") return "Google";
    if (s.includes("facebook") || s.includes("fb")) return "Facebook";
    if (s.includes("instagram") || s === "ig") return "Instagram";
    if (s.includes("twitter") || s.includes("x.com") || s === "x") return "Twitter / X";
    if (s.includes("linkedin") || s === "li") return "LinkedIn";
    if (s.includes("youtube") || s === "yt") return "YouTube";
    if (s.includes("tiktok") || s === "tt") return "TikTok";
    if (s.includes("telegram") || s === "tg") return "Telegram";
    if (s.includes("whatsapp") || s === "wa") return "WhatsApp";
    if (s.includes("email") || s.includes("newsletter") || s.includes("mail")) return "Email";
    if (s.includes("bing")) return "Bing";
    if (s.includes("reddit")) return "Reddit";
    return utmSource.charAt(0).toUpperCase() + utmSource.slice(1);
  }
  if (!referrer) return "Direct";
  const r = referrer.toLowerCase();
  if (r.includes("google")) return "Google";
  if (r.includes("bing")) return "Bing";
  if (r.includes("yahoo")) return "Yahoo";
  if (r.includes("facebook") || r.includes("fb.com") || r.includes("fb.me")) return "Facebook";
  if (r.includes("instagram")) return "Instagram";
  if (r.includes("twitter") || r.includes("t.co") || r.includes("x.com")) return "Twitter / X";
  if (r.includes("linkedin")) return "LinkedIn";
  if (r.includes("youtube") || r.includes("youtu.be")) return "YouTube";
  if (r.includes("tiktok")) return "TikTok";
  if (r.includes("telegram") || r.includes("t.me")) return "Telegram";
  if (r.includes("whatsapp")) return "WhatsApp";
  if (r.includes("reddit")) return "Reddit";
  if (r.includes("pinterest")) return "Pinterest";
  return "Other";
}

// ── Country from locale tag (e.g. "en-NG" → "Nigeria") ───────────────────────
const COUNTRY_CODES: Record<string, string> = {
  NG: "Nigeria", GH: "Ghana", KE: "Kenya", ZA: "South Africa", TZ: "Tanzania",
  ET: "Ethiopia", EG: "Egypt", SN: "Senegal", CM: "Cameroon", CI: "Côte d'Ivoire",
  UG: "Uganda", RW: "Rwanda", ZW: "Zimbabwe", ZM: "Zambia", MW: "Malawi",
  MZ: "Mozambique", AO: "Angola", NA: "Namibia", BW: "Botswana", MG: "Madagascar",
  US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
  DE: "Germany", FR: "France", IT: "Italy", ES: "Spain", NL: "Netherlands",
  BE: "Belgium", CH: "Switzerland", SE: "Sweden", NO: "Norway", DK: "Denmark",
  IN: "India", PK: "Pakistan", BD: "Bangladesh", SG: "Singapore", MY: "Malaysia",
  ID: "Indonesia", PH: "Philippines", TH: "Thailand", VN: "Vietnam", JP: "Japan",
  CN: "China", KR: "South Korea", AE: "United Arab Emirates", SA: "Saudi Arabia",
  BR: "Brazil", MX: "Mexico", AR: "Argentina", CO: "Colombia", CL: "Chile",
};

function countryFromLocale(locale: string | null): string | null {
  if (!locale) return null;
  // Accept-Language: "en-NG,en;q=0.9" → extract "NG"
  const match = locale.match(/[a-z]{2}-([A-Z]{2})/);
  if (match && match[1]) return COUNTRY_CODES[match[1]] ?? null;
  return null;
}

// ── POST /analytics/pageview ──────────────────────────────────────────────────
router.post("/analytics/pageview", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const { platform, path, referrer, sessionId, utmSource, utmMedium, utmCampaign, utmContent, timezone, isAuthenticated, vendorId } = body;

  if (!platform || !path) { res.status(400).json({ error: "platform and path are required" }); return; }

  const ua = req.headers["user-agent"] ?? null;
  const { device, browser, os } = parseUA(ua as string | null);
  const trafficSource = parseTrafficSource(referrer ?? null, utmSource ?? null);

  // Country: prefer CF-IPCountry → X-Vercel-IP-Country → Accept-Language locale
  const cfCountryCode = (req.headers["cf-ipcountry"] as string | undefined) ??
                        (req.headers["x-vercel-ip-country"] as string | undefined);
  let country: string | null = cfCountryCode ? (COUNTRY_CODES[cfCountryCode] ?? cfCountryCode) : null;
  if (!country) {
    const acceptLang = req.headers["accept-language"] as string | undefined;
    country = countryFromLocale(acceptLang ?? null);
  }

  try {
    await db.insert(pageViewsTable).values({
      platform:        String(platform).slice(0, 32),
      path:            String(path).slice(0, 512),
      referrer:        referrer ? String(referrer).slice(0, 512) : null,
      sessionId:       sessionId ? String(sessionId).slice(0, 64) : null,
      userAgent:       ua ? String(ua).slice(0, 512) : null,
      trafficSource,
      device,
      browser,
      os,
      country,
      timezone:        timezone ? String(timezone).slice(0, 64) : null,
      utmSource:       utmSource ? String(utmSource).slice(0, 128) : null,
      utmMedium:       utmMedium ? String(utmMedium).slice(0, 128) : null,
      utmCampaign:     utmCampaign ? String(utmCampaign).slice(0, 128) : null,
      utmContent:      utmContent ? String(utmContent).slice(0, 128) : null,
      isAuthenticated: Boolean(isAuthenticated),
      vendorId:        vendorId ? Number(vendorId) : null,
    });
  } catch { /* swallow — never block UI */ }

  res.status(204).end();
});

// ── POST /analytics/event ─────────────────────────────────────────────────────
router.post("/analytics/event", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const { platform, eventType, eventName, path, sessionId, vendorId } = body;
  if (!platform || !eventType || !eventName) { res.status(204).end(); return; }

  try {
    await db.insert(eventLogsTable).values({
      platform:  String(platform).slice(0, 32),
      eventType: String(eventType).slice(0, 64),
      eventName: String(eventName).slice(0, 128),
      path:      path ? String(path).slice(0, 512) : null,
      sessionId: sessionId ? String(sessionId).slice(0, 64) : null,
      vendorId:  vendorId ? Number(vendorId) : null,
    });
  } catch { /* swallow */ }

  res.status(204).end();
});

export default router;
