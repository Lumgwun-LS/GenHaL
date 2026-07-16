/**
 * Lightweight pageview beacon — fire and forget, never throws.
 * Call trackPageView() once per route change.
 */

const PLATFORM = "app-store";
const ENDPOINT = `${import.meta.env.BASE_URL ?? "/"}api/analytics/pageview`.replace(/\/+/g, "/");

function getOrCreateSessionId(): string {
  const KEY = "__awa_sid";
  let sid = sessionStorage.getItem(KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(KEY, sid);
  }
  return sid;
}

export function trackPageView(path: string): void {
  try {
    const body = JSON.stringify({
      platform: PLATFORM,
      path,
      referrer: document.referrer || null,
      sessionId: getOrCreateSessionId(),
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    } else {
      fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* never throw */
  }
}
