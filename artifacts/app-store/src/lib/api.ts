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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
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
