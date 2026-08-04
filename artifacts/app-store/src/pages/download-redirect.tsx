import { useEffect } from "react";
import { useParams } from "wouter";

// On the custom domain (awajimaaappstore.com) the static artifact owns the
// host, so root-relative /api/* calls never reach the API server.
const _API_ORIGIN =
  typeof window !== "undefined" &&
  (window.location.hostname === "awajimaaappstore.com" ||
    window.location.hostname === "www.awajimaaappstore.com")
    ? "https://account.awajimaaai.com"
    : "";

/**
 * Handles https://awajimaaappstore.com/dl/:identifier
 * Immediately bounces to the API download route, which:
 *  - resolves the latest live APK via store_app_versions
 *  - increments the download counter
 *  - 302-redirects to the actual file URL (R2)
 */
export default function DownloadRedirect() {
  const params = useParams<{ identifier: string }>();

  useEffect(() => {
    const id = encodeURIComponent(params.identifier ?? "");
    window.location.replace(`${_API_ORIGIN}/api/store/dl/${id}`);
  }, [params.identifier]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#555" }}>
      <p>Preparing download…</p>
    </div>
  );
}
