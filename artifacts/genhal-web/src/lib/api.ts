/**
 * Resolves the API base URL for direct fetch calls that bypass the generated
 * OpenAPI client.  The api-server is mounted at /api relative to the app base.
 */
export function getApiBaseUrl(): string {
  // In production the api-server sits at /api on the same origin.
  // import.meta.env.BASE_URL gives us the artifact's base path (e.g. /genhal/).
  // We want to call /api/... not /genhal/api/...
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api`;
}
