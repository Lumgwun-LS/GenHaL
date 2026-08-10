/**
 * Resolves the API base URL for direct fetch calls that bypass the generated
 * OpenAPI client.  The api-server is mounted at /api relative to the app base.
 *
 * When served via the custom domain (genhal.awajimaa.com) the static artifact
 * has no /api/ handler — all unmatched paths fall through to the SPA rewrite.
 * In that case we point directly at the primary deployment origin where the
 * API server lives.
 */
const _onCustomDomain =
  typeof window !== "undefined" &&
  (window.location.hostname === "genhal.awajimaa.com" ||
    window.location.hostname === "www.genhal.awajimaa.com");

export function getApiBaseUrl(): string {
  if (_onCustomDomain) {
    // Primary deployment — API server is reachable here
    return "https://awajimaaai.com/api";
  }
  // Dev / monorepo path: /api on the same origin
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api`;
}
