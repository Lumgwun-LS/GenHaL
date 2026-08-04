// CF_PAGES=1 is auto-injected by Cloudflare Pages at build time — no dashboard
// env var needed. On Replit, relative /api/* paths work via the platform proxy.
// When served via the custom domain (awajimaaappstore.com) the static artifact
// owns that host, so relative /api/* calls never reach the API server — we must
// use the absolute origin instead.
declare const __CF_PAGES__: boolean;
const _onCustomDomain =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'awajimaaappstore.com' ||
    window.location.hostname === 'www.awajimaaappstore.com');
const API_ORIGIN =
  __CF_PAGES__ || _onCustomDomain
    ? 'https://account.awajimaaai.com'
    : ((import.meta.env.VITE_API_BASE_URL ?? '') as string).replace(/\/+$/, '');
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
