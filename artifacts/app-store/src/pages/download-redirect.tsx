import { onMount } from "solid-js";
import { useParams } from "@solidjs/router";

/**
 * Handles https://awajimaaappstore.com/dl/:identifier
 * Immediately bounces to the API download route, which:
 *  - resolves the latest live APK via store_app_versions
 *  - increments the download counter
 *  - 302-redirects to the actual file URL (GCS)
 */
export default function DownloadRedirect() {
  const params = useParams<{ identifier: string }>();

  onMount(() => {
    const id = encodeURIComponent(params.identifier ?? "");
    window.location.replace(`/api/store/dl/${id}`);
  });

  return (
    <div style={{ display: "flex", "align-items": "center", "justify-content": "center", height: "100vh", "font-family": "sans-serif", color: "#555" }}>
      <p>Preparing download…</p>
    </div>
  );
}
