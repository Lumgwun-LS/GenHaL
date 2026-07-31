import { useEffect } from "react";
import { useParams } from "wouter";

/**
 * Handles https://awajimaaappstore.com/dl/:identifier
 * Immediately bounces to the API download route, which:
 *  - resolves the latest live APK via store_app_versions
 *  - increments the download counter
 *  - 302-redirects to the actual file URL (GCS)
 */
export default function DownloadRedirect() {
  const params = useParams<{ identifier: string }>();

  useEffect(() => {
    const id = encodeURIComponent(params.identifier ?? "");
    window.location.replace(`/api/store/dl/${id}`);
  }, [params.identifier]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#555" }}>
      <p>Preparing download…</p>
    </div>
  );
}
