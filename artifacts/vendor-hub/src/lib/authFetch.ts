/**
 * authFetch — authenticated fetch() wrapper for Awa Biz Suite API calls.
 *
 * Drop-in replacement for fetch() that:
 *  - Attaches a Clerk Bearer token so requireAuth() doesn't redirect to
 *    sign-in (which the browser follows cross-origin, causing "Failed to fetch")
 *  - Always sends Accept: application/json so auth errors return 401, not 302
 *  - Merges credentials: "include" so session cookies are sent as well
 *
 * Use this instead of raw fetch() for every /api/* call in vendor-hub pages.
 * For Orval-generated hooks the fix is already in custom-fetch.ts.
 */

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

  return fetch(url, {
    credentials: "include",
    ...init,
    headers,
  });
}
