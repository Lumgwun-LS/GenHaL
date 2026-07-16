import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import AppCard from "../components/app-card";
import { apiFetch } from "../lib/api";
import type { AppSummary, Category } from "../lib/types";

const AFRICA_CATEGORIES = [
  "Mobile Money & Fintech","Agriculture & Farming","Health & Telemedicine","Education & E-Learning",
  "Logistics & Delivery","Food & Restaurant","Entertainment & Music","Social & Community",
  "Business & Commerce","Government & E-Services","Transport & Ride-Hailing","Utilities & Infrastructure",
  "Fashion & Beauty","Real Estate",
];

const PLATFORMS = ["all","android","ios","web"];
const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Top Rated" },
  { value: "downloads", label: "Most Downloaded" },
];

export default function Search() {
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  const params = new URLSearchParams(searchString);
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const platform = params.get("platform") ?? "all";
  const sort = params.get("sort") ?? "newest";
  const page = parseInt(params.get("page") ?? "1");
  const LIMIT = 24;

  function update(patch: Record<string, string>) {
    const next = new URLSearchParams(searchString);
    Object.entries(patch).forEach(([k, v]) => v ? next.set(k, v) : next.delete(k));
    next.delete("page");
    navigate(`/search?${next.toString()}`);
  }

  function setPage(p: number) {
    const next = new URLSearchParams(searchString);
    next.set("page", String(p));
    navigate(`/search?${next.toString()}`);
  }

  useEffect(() => {
    apiFetch<Category[]>("/apps/categories").then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ sort, page: String(page), limit: String(LIMIT) });
    if (q) qs.set("search", q);
    if (category) qs.set("category", category);
    if (platform && platform !== "all") qs.set("platform", platform);
    apiFetch<{ apps: AppSummary[]; total: number }>(`/apps?${qs}`)
      .then(d => { setApps(d.apps ?? []); setTotal(d.total ?? 0); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [q, category, platform, sort, page]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 20px 80px", display: "grid", gridTemplateColumns: "220px 1fr", gap: 32, alignItems: "start" }}>

      {/* Sidebar filters */}
      <aside>
        <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16, position: "sticky", top: 80 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#8892a4", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Platform</div>
          {PLATFORMS.map(p => (
            <button key={p} onClick={() => update({ platform: p })} style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 8, background: platform === p ? "rgba(0,200,83,0.1)" : "transparent", color: platform === p ? "#00c853" : "#c0c8d8", border: "none", cursor: "pointer", fontSize: 13, fontWeight: platform === p ? 600 : 400, textTransform: "capitalize", marginBottom: 2 }}>
              {p === "all" ? "All Platforms" : p === "android" ? "🤖 Android" : p === "ios" ? "🍎 iOS" : "🌐 Web"}
            </button>
          ))}

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "14px 0" }} />

          <div style={{ fontWeight: 700, fontSize: 13, color: "#8892a4", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Category</div>
          <button onClick={() => update({ category: "" })} style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 8, background: !category ? "rgba(0,200,83,0.1)" : "transparent", color: !category ? "#00c853" : "#c0c8d8", border: "none", cursor: "pointer", fontSize: 13, fontWeight: !category ? 600 : 400, marginBottom: 2 }}>
            All Categories
          </button>
          {AFRICA_CATEGORIES.map(c => (
            <button key={c} onClick={() => update({ category: c })} style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 8, background: category === c ? "rgba(0,200,83,0.1)" : "transparent", color: category === c ? "#00c853" : "#c0c8d8", border: "none", cursor: "pointer", fontSize: 12, fontWeight: category === c ? 600 : 400, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {categories.find(x => x.name === c)?.iconEmoji ?? "•"} {c}
            </button>
          ))}
        </div>
      </aside>

      {/* Results */}
      <main>
        {/* Search bar + sort */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <input
            defaultValue={q}
            placeholder="Search apps..."
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            onKeyDown={(e) => { if (e.key === "Enter") update({ q: (e.target as HTMLInputElement).value }); }}
          />
          <select
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
            className="input"
            style={{ width: 160 }}
          >
            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* Active filters */}
        {(category || q) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {q && <span style={{ background: "rgba(0,200,83,0.1)", color: "#00c853", border: "1px solid rgba(0,200,83,0.25)", borderRadius: 16, padding: "3px 10px", fontSize: 12 }}>🔍 "{q}" <button onClick={() => update({ q: "" })} style={{ background: "none", border: "none", color: "#00c853", cursor: "pointer", marginLeft: 4 }}>×</button></span>}
            {category && <span style={{ background: "rgba(0,200,83,0.1)", color: "#00c853", border: "1px solid rgba(0,200,83,0.25)", borderRadius: 16, padding: "3px 10px", fontSize: 12 }}>{category} <button onClick={() => update({ category: "" })} style={{ background: "none", border: "none", color: "#00c853", cursor: "pointer", marginLeft: 4 }}>×</button></span>}
          </div>
        )}

        <div style={{ color: "#8892a4", fontSize: 13, marginBottom: 20 }}>
          {loading ? "Searching..." : `${total.toLocaleString()} app${total !== 1 ? "s" : ""} found`}
        </div>

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 220, borderRadius: 16 }} />)}
          </div>
        ) : apps.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>No apps found</div>
            <div style={{ color: "#8892a4", fontSize: 14 }}>Try a different search or category.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {apps.map(app => <AppCard key={app.id} app={app} />)}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 40 }}>
            {page > 1 && <button className="btn-outline" style={{ padding: "6px 16px", fontSize: 13 }} onClick={() => setPage(page - 1)}>← Prev</button>}
            <span style={{ padding: "6px 16px", color: "#8892a4", fontSize: 13 }}>Page {page} of {totalPages}</span>
            {page < totalPages && <button className="btn-outline" style={{ padding: "6px 16px", fontSize: 13 }} onClick={() => setPage(page + 1)}>Next →</button>}
          </div>
        )}
      </main>
    </div>
  );
}
