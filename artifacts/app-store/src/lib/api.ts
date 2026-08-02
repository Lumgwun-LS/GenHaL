// On Replit, /api/* is proxied to the API server by the platform.
// On Cloudflare Pages, _redirects cannot proxy to external origins, so
// VITE_API_BASE_URL must be set to https://account.awajimaaai.com in the CF
// Pages environment variables to call the API server directly.
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const API_BASE = `${API_ORIGIN}/api/store`;

export class StoreApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "StoreApiError";
  }
}

/** Get a fresh Clerk session token — exported for raw fetch() callers. */
export async function getClerkToken(): Promise<string | null> {
  try {
    // Clerk attaches itself to window.Clerk when loaded via ClerkProvider.
    const clerk = (window as any).Clerk;
    if (!clerk?.session) return null;
    return await clerk.session.getToken();
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getClerkToken();
  const authHeader: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeader,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new StoreApiError(res.status, text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}
