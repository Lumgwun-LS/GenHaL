/**
 * authFetch — authenticated fetch() wrapper for Awa Biz Suite API calls.
 *
 * Drop-in replacement for fetch() that:
 *  - Attaches a Clerk Bearer token so requireAuth() doesn't redirect to
 *    sign-in (which the browser follows cross-origin, causing "Failed to fetch")
 *  - Always sends Accept: application/json so auth errors return 401, not 302
 *  - Merges credentials: "include" so session cookies are sent as well
 *  - On Cloudflare Pages, prepends VITE_API_BASE_URL so relative /api/* paths
 *    reach the real API server (CF Pages _redirects can't proxy external origins)
 *
 * Use this instead of raw fetch() for every /api/* call in vendor-hub pages.
 * For Orval-generated hooks the fix is already in custom-fetch.ts.
 */

// CF_PAGES=1 is auto-injected by Cloudflare at build time — no dashboard env var needed.
// On Replit the flag is false and relative paths work via the platform proxy.
declare const __CF_PAGES__: boolean;
const _API_ORIGIN = __CF_PAGES__
  ? 'https://api.awajimaaai.com'
  : ((import.meta.env as Record<string, string>).VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

function resolveApiUrl(url: string | URL): string | URL {
  if (_API_ORIGIN && typeof url === 'string' && url.startsWith('/')) {
    return `${_API_ORIGIN}${url}`;
  }
  return url;
}

async function getClerkToken(): Promise<string | null> {
  try {
    return (await (window as any).Clerk?.session?.getToken?.()) ?? null;
  } catch {
    return null;
  }
}

export async function authFetch(
  url: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getClerkToken();
  const headers = new Headers((init.headers as HeadersInit) ?? {});

  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  return fetch(resolveApiUrl(url), {
    credentials: "include",
    ...init,
    headers,
  });
}
