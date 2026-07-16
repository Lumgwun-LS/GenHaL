import { Link } from "wouter";
import type { AppSummary } from "../lib/types";

interface Props {
  app: AppSummary;
  layout?: "grid" | "row";
}

const PLATFORM_ICON: Record<string, string> = {
  android: "🤖",
  ios: "🍎",
  web: "🌐",
  all: "📱",
};

function Stars({ rating }: { rating: number }) {
  return (
    <div style={{ display: "flex", gap: 1 }}>
      {[1,2,3,4,5].map((i) => (
        <span key={i} style={{ fontSize: 10, color: i <= Math.round(rating) ? "#ffb300" : "#2a3040" }}>★</span>
      ))}
    </div>
  );
}

function formatDownloads(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function AppCard({ app, layout = "grid" }: Props) {
  if (layout === "row") {
    return (
      <Link href={`/apps/${app.slug}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 12, background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", textDecoration: "none" }}>
        <img
          src={app.iconUrl}
          alt={app.name}
          style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", flexShrink: 0, background: "#1a2030" }}
          onError={(e) => { (e.target as HTMLImageElement).src = `https://placehold.co/52x52/0d1117/00c853?text=${encodeURIComponent(app.name[0])}`; }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#e8eaf0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.name}</div>
          <div style={{ fontSize: 12, color: "#8892a4", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.tagline}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Stars rating={app.rating} />
            <span style={{ fontSize: 11, color: "#8892a4" }}>{app.rating > 0 ? app.rating.toFixed(1) : "New"}</span>
            <span style={{ fontSize: 11, color: "#8892a4" }}>· {PLATFORM_ICON[app.platform] ?? "📱"}</span>
          </div>
        </div>
        <button
          style={{ flexShrink: 0, background: "rgba(0,200,83,0.1)", color: "#00c853", border: "1px solid rgba(0,200,83,0.3)", borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `/app-store/apps/${app.slug}`; }}
        >
          GET
        </button>
      </Link>
    );
  }

  return (
    <Link href={`/apps/${app.slug}`} style={{ display: "flex", flexDirection: "column", background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 14, textDecoration: "none", transition: "border-color 0.15s" }}>
      <div style={{ position: "relative", marginBottom: 10 }}>
        <img
          src={app.iconUrl}
          alt={app.name}
          style={{ width: "100%", aspectRatio: "1", borderRadius: 14, objectFit: "cover", background: "#1a2030", display: "block" }}
          onError={(e) => { (e.target as HTMLImageElement).src = `https://placehold.co/160x160/0d1117/00c853?text=${encodeURIComponent(app.name[0])}`; }}
        />
        {app.isFeatured && (
          <span style={{ position: "absolute", top: 6, right: 6, background: "#ffb300", color: "#000", fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}>⭐ Pick</span>
        )}
      </div>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#e8eaf0", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.name}</div>
      <div style={{ fontSize: 11, color: "#8892a4", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.category}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
        <div>
          <Stars rating={app.rating} />
          <div style={{ fontSize: 10, color: "#8892a4", marginTop: 2 }}>{formatDownloads(app.totalDownloads)} DL</div>
        </div>
        <div style={{ background: "rgba(0,200,83,0.12)", color: "#00c853", border: "1px solid rgba(0,200,83,0.25)", borderRadius: 16, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>GET</div>
      </div>
    </Link>
  );
}
