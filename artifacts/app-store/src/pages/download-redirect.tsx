import { useEffect, useState } from "react";
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
 *
 * The _redirects rule (status 302) redirects the browser directly to the API
 * on Cloudflare Pages, so this component only renders when navigating inside
 * the SPA (e.g. via a <Link>). It immediately bounces to the API download
 * route, which:
 *  - resolves the latest live APK via store_app_versions
 *  - increments the download counter
 *  - 302-redirects to the actual file URL (R2)
 */
export default function DownloadRedirect() {
  const params = useParams<{ identifier: string }>();
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    const id = encodeURIComponent(params.identifier ?? "");
    const target = `${_API_ORIGIN}/api/store/dl/${id}`;
    setUrl(target);
    window.location.replace(target);
  }, [params.identifier]);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: "100vh", fontFamily: "sans-serif", color: "#555",
      gap: 16, textAlign: "center", padding: "20px",
    }}>
      <div style={{ fontSize: 48 }}>⬇️</div>
      <p style={{ fontSize: 18, fontWeight: 600, color: "#111", margin: 0 }}>Preparing your download…</p>
      <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>You will be redirected automatically.</p>
      {url && (
        <a
          href={url}
          style={{
            marginTop: 8, fontSize: 14, color: "#00c853",
            textDecoration: "underline", cursor: "pointer",
          }}
        >
          Click here if the download doesn't start
        </a>
      )}
    </div>
  );
}
