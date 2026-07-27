/**
 * Visitor analytics beacon — fire-and-forget, never throws.
 *
 * trackPageView()  — call on every route change (includes UTM, geo, auth context)
 * trackEvent()     — call for menu clicks / feature interactions
 */

const PLATFORM = "vendor-hub";
const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const PV_ENDPOINT  = `${BASE}/api/analytics/pageview`;
const EVT_ENDPOINT = `${BASE}/api/analytics/event`;

// ── Session ID ────────────────────────────────────────────────────────────────
function getOrCreateSessionId(): string {
  const KEY = "__awa_sid";
  let sid = sessionStorage.getItem(KEY);
  if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem(KEY, sid); }
  return sid;
}

// ── UTM params from current URL ───────────────────────────────────────────────
function getUTMParams(): Record<string, string | null> {
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      utmSource:   p.get("utm_source"),
      utmMedium:   p.get("utm_medium"),
      utmCampaign: p.get("utm_campaign"),
      utmContent:  p.get("utm_content"),
    };
  } catch { return {}; }
}

// ── Timezone ──────────────────────────────────────────────────────────────────
function getTimezone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; }
}

// ── Beacon helper ─────────────────────────────────────────────────────────────
function beacon(url: string, data: Record<string, unknown>): void {
  try {
    const body = JSON.stringify(data);
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* never throw */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface TrackPageViewOptions {
  isAuthenticated?: boolean;
  vendorId?: number | null;
}

export function trackPageView(path: string, opts: TrackPageViewOptions = {}): void {
  const utm = getUTMParams();
  beacon(PV_ENDPOINT, {
    platform: PLATFORM,
    path,
    referrer:        document.referrer || null,
    sessionId:       getOrCreateSessionId(),
    timezone:        getTimezone(),
    isAuthenticated: opts.isAuthenticated ?? false,
    vendorId:        opts.vendorId ?? null,
    ...utm,
  });
}

export function trackEvent(eventType: string, eventName: string, opts: { vendorId?: number | null } = {}): void {
  beacon(EVT_ENDPOINT, {
    platform:  PLATFORM,
    eventType,
    eventName,
    path:      window.location.pathname,
    sessionId: getOrCreateSessionId(),
    vendorId:  opts.vendorId ?? null,
  });
}
