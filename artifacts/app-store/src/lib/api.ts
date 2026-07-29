// All API calls go to the shared API server via root-relative /api/store/* paths.
// The Replit proxy routes /api/* to the API server regardless of which frontend artifact
// the browser is currently viewing.
const API_BASE = "/api/store";

export class StoreApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "StoreApiError";
  }
}

/** Try to get a fresh Clerk session token for the Authorization header.
 *  Falls back silently — routes that don't need auth still work. */
async function getClerkToken(): Promise<string | null> {
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
