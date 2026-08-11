/**
 * Resolves the API base URL for direct fetch calls that bypass the generated
 * OpenAPI client.  The api-server is mounted at /api relative to the app base.
 *
 * In development the Vite dev server proxies /api to the local API server.
 * On genhal.awajimaa.com the Cloudflare Pages _redirects file proxies
 *   /api/*  →  https://api.awajimaaai.com/api/*
 * so the same same-origin path works in both environments.
 */
export function getApiBaseUrl(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api`;
}
