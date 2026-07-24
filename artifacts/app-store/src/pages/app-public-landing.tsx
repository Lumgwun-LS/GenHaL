import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { apiFetch } from "../lib/api";

const BASE = import.meta.env.BASE_URL;

const PLATFORM_LABEL: Record<string, string> = {
  android: "🤖 Android",
  ios: "🍎 iOS",
  web: "🌐 Web",
  all: "📱 All Platforms",
};

const DL_LABEL: Record<string, string> = {
  android: "Download APK",
  ios: "Download on App Store",
  web: "Open Web App",
  all: "Download / Open",
};

interface PublicApp {
  id: number;
  name: string;
  tagline: string;
  description: string;
  category: string;
  platform: string;
  iconUrl: string;
  screenshots: string[];
  currentVersion: string | null;
  packageName: string | null;
  webUrl: string | null;
  rating: number;
  ratingCount: number;
  totalDownloads: number;
  developerName: string;
  publicId: string;
  publicUrl: string;
  isFeatured: boolean;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ color: i <= Math.round(rating) ? "#ffb300" : "#2a3040", fontSize: 16 }}>★</span>
      ))}
    </span>
  );
}

export default function AppPublicLanding() {
  const { publicId } = useParams<{ publicId: string }>();
  const [app, setApp] = useState<PublicApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!publicId) return;
    setLoading(true);
    apiFetch<PublicApp>(`/p/${publicId}`)
      .then(data => { if (data) setApp(data); else setNotFound(true); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [publicId]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ color: "#8892a4", fontSize: 16 }}>Loading…</div>
      </div>
    );
  }

  if (notFound || !app) {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center", padding: "0 24px" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>📭</div>
        <h2 style={{ color: "#e8eaf0", marginBottom: 8 }}>App not found</h2>
        <p style={{ color: "#8892a4", marginBottom: 24 }}>
          This link may be invalid or the app may have been removed.
        </p>
        <Link href="/">
          <button style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 15, cursor: "pointer" }}>
            Browse the App Store →
          </button>
        </Link>
      </div>
    );
  }

  const downloadHref = `${BASE}api/store/download/${app.publicId}`;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px 80px" }}>

      {/* ── Hero row ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start", marginBottom: 36, flexWrap: "wrap" }}>
        <img
          src={app.iconUrl}
          alt={app.name}
          style={{ width: 110, height: 110, borderRadius: 22, objectFit: "cover", border: "2px solid #1e2535", flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 28, color: "#e8eaf0", fontWeight: 700 }}>{app.name}</h1>
            {app.isFeatured && (
              <span style={{ background: "rgba(255,179,0,0.15)", color: "#ffb300", border: "1px solid rgba(255,179,0,0.3)", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                ⭐ Featured
              </span>
            )}
          </div>
          <div style={{ color: "#8892a4", fontSize: 15, marginBottom: 10 }}>{app.tagline}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <span style={{ background: "#1a2235", color: "#a78bfa", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>
              {app.category}
            </span>
            <span style={{ background: "#1a2235", color: "#60a5fa", borderRadius: 6, padding: "3px 10px", fontSize: 12 }}>
              {PLATFORM_LABEL[app.platform] ?? app.platform}
            </span>
            {app.currentVersion && (
              <span style={{ background: "#1a2235", color: "#34d399", borderRadius: 6, padding: "3px 10px", fontSize: 12 }}>
                v{app.currentVersion}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <Stars rating={app.rating} />
            <span style={{ color: "#8892a4", fontSize: 13 }}>
              {app.rating.toFixed(1)} ({app.ratingCount.toLocaleString()} reviews)
            </span>
            <span style={{ color: "#4a5568", fontSize: 13 }}>·</span>
            <span style={{ color: "#8892a4", fontSize: 13 }}>
              {app.totalDownloads.toLocaleString()} downloads
            </span>
          </div>
          <a
            href={downloadHref}
            rel="noreferrer"
            style={{ textDecoration: "none" }}
          >
            <button style={{
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              color: "#fff", border: "none", borderRadius: 12,
              padding: "12px 28px", fontSize: 16, fontWeight: 700,
              cursor: "pointer", boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
              transition: "transform 0.1s",
            }}>
              📥 {DL_LABEL[app.platform] ?? "Download"}
            </button>
          </a>
          {app.webUrl && (
            <a href={app.webUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 12, color: "#a78bfa", fontSize: 14 }}>
              Visit website →
            </a>
          )}
        </div>
      </div>

      {/* ── Screenshots ──────────────────────────────────────────────── */}
      {app.screenshots.length > 0 && (
        <div style={{ marginBottom: 36 }}>
          <h2 style={{ color: "#e8eaf0", fontSize: 18, marginBottom: 14 }}>Screenshots</h2>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
            {app.screenshots.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Screenshot ${i + 1}`}
                onClick={() => setSelected(i)}
                style={{
                  height: 220, borderRadius: 12, objectFit: "cover",
                  border: selected === i ? "2px solid #7c3aed" : "2px solid #1e2535",
                  cursor: "pointer", flexShrink: 0, transition: "border-color 0.15s",
                }}
              />
            ))}
          </div>
          {app.screenshots[selected] && (
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <img
                src={app.screenshots[selected]}
                alt="Selected screenshot"
                style={{ maxHeight: 480, maxWidth: "100%", borderRadius: 16, objectFit: "contain", border: "2px solid #1e2535" }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── About ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ color: "#e8eaf0", fontSize: 18, marginBottom: 14 }}>About this app</h2>
        <p style={{ color: "#b0bdd0", lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0 }}>{app.description}</p>
      </div>

      {/* ── Meta info ────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 36 }}>
        {[
          { label: "Developer", value: app.developerName },
          { label: "Category", value: app.category },
          { label: "Platform", value: PLATFORM_LABEL[app.platform] ?? app.platform },
          ...(app.currentVersion ? [{ label: "Version", value: `v${app.currentVersion}` }] : []),
          ...(app.packageName ? [{ label: "Package", value: app.packageName }] : []),
        ].map(item => (
          <div key={item.label} style={{ background: "#0e1624", borderRadius: 12, padding: "14px 16px", border: "1px solid #1e2535" }}>
            <div style={{ color: "#4a5568", fontSize: 11, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
            <div style={{ color: "#e8eaf0", fontSize: 14, fontWeight: 500 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* ── Share / permanent link ────────────────────────────────────── */}
      <div style={{ background: "#0e1624", borderRadius: 14, padding: "18px 20px", border: "1px solid #1e2535", marginBottom: 36 }}>
        <div style={{ color: "#4a5568", fontSize: 11, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Permanent App Store Link</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <code style={{ flex: 1, color: "#a78bfa", fontSize: 13, wordBreak: "break-all" }}>
            {app.publicUrl}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(app.publicUrl).catch(() => {})}
            style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Copy Link
          </button>
        </div>
      </div>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <div style={{ textAlign: "center" }}>
        <Link href="/">
          <button style={{ background: "transparent", color: "#8892a4", border: "1px solid #1e2535", borderRadius: 10, padding: "10px 20px", fontSize: 14, cursor: "pointer" }}>
            ← More apps on Awajimaa Store
          </button>
        </Link>
      </div>
    </div>
  );
}
