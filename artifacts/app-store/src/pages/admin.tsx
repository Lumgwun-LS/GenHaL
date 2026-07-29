import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "@clerk/react";
import { apiFetch, StoreApiError, getClerkToken } from "../lib/api";
import type { App, AdminStats, Developer, UpdateRequest, OfflinePayment } from "../lib/types";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const STATUS_COLOR: Record<string, string> = {
  pending_payment: "#ffb300", pending_review: "#a78bfa",
  approved: "#00c853", rejected: "#ff5252", draft: "#8892a4",
};

const REQ_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  pending:  { bg: "rgba(255,179,0,0.1)",  color: "#ffb300" },
  approved: { bg: "rgba(0,200,83,0.1)",   color: "#00c853" },
  rejected: { bg: "rgba(255,82,82,0.1)",  color: "#ff5252" },
  cancelled:{ bg: "rgba(255,255,255,0.05)", color: "#8892a4" },
};

const PLATFORM_ICON: Record<string, string> = {
  github: "🐙", gitlab: "🦊", gitbucket: "🪣", bitbucket: "🗂️",
  heroku: "🚂", netlify: "🌐", vercel: "▲", render: "🎨",
};

type Tab = "overview" | "pending" | "all" | "developers" | "updates" | "analytics" | "offline" | "our-apps";

// ── Analytics tab ─────────────────────────────────────────────────────────────

interface EventAnalytics {
  period: number;
  totalViews: number;
  totalInstalls: number;
  totalUninstalls: number;
  totalNewUsers: number;
  totalReviews: number;
  avgRating: number;
  conversionRate: number;
  viewsByCountry: { country: string; count: number }[];
  installsByCountry: { country: string; count: number }[];
  uninstallsByCountry: { country: string; count: number }[];
  newUsersByCountry: { country: string; count: number }[];
  viewsByRegion: { region: string; count: number }[];
  installsByRegion: { region: string; count: number }[];
  viewsByCity: { city: string; count: number }[];
  installsByCity: { city: string; count: number }[];
  topAppsByInstalls: { name: string; count: number }[];
  topAppsByViews: { name: string; count: number }[];
  topAppsByUninstalls: { name: string; count: number }[];
  topReviewedApps: { name: string; count: number; avgRating: number }[];
  ratingDistribution: { stars: number; count: number }[];
  daily: { date: string; views: number; installs: number; uninstalls: number; newUsers: number }[];
}

const COUNTRY_FLAG: Record<string, string> = {
  NG: "🇳🇬", GH: "🇬🇭", KE: "🇰🇪", ZA: "🇿🇦", ET: "🇪🇹", TZ: "🇹🇿",
  UG: "🇺🇬", RW: "🇷🇼", SN: "🇸🇳", CM: "🇨🇲", US: "🇺🇸", GB: "🇬🇧",
  CA: "🇨🇦", DE: "🇩🇪", FR: "🇫🇷", IN: "🇮🇳",
};

function AnalyticsTab() {
  const [data, setData] = useState<EventAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    apiFetch<EventAnalytics>(`/admin/event-analytics?days=${days}`)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [days]);

  if (loading) return <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" style={{ margin: "0 auto" }} /></div>;
  if (!data) return <div style={{ color: "#8892a4", padding: 40 }}>No data yet.</div>;

  const kpis = [
    { icon: "👁️",  label: "Page Views",      value: data.totalViews.toLocaleString(),     color: "#a78bfa" },
    { icon: "📥",  label: "Installs",         value: data.totalInstalls.toLocaleString(),  color: "#00c853" },
    { icon: "🗑️",  label: "Uninstalls",       value: data.totalUninstalls.toLocaleString(), color: "#ff5252" },
    { icon: "🙋",  label: "New Users",        value: data.totalNewUsers.toLocaleString(),  color: "#ffb300" },
    { icon: "🔄",  label: "Conversion Rate",  value: `${data.conversionRate}%`,             color: "#38bdf8" },
  ];

  const section = (title: string) => (
    <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14, marginTop: 28 }}>{title}</div>
  );

  return (
    <div>
      {/* Period selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[7, 14, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)}
            style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${days === d ? "#00c853" : "rgba(255,255,255,0.1)"}`,
              background: days === d ? "rgba(0,200,83,0.1)" : "transparent",
              color: days === d ? "#00c853" : "#8892a4" }}>
            {d}d
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
        {kpis.map(k => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{k.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 12, color: "#8892a4" }}>{k.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Activity trend */}
      {section("📈 Daily Activity")}
      <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.daily} margin={{ left: -20, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={{ fill: "#8892a4", fontSize: 10 }} tickFormatter={d => d.slice(5)} />
            <YAxis tick={{ fill: "#8892a4", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "#131920", border: "none", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#e8eaf0" }} />
            <Line type="monotone" dataKey="views"     stroke="#a78bfa" strokeWidth={2} dot={false} name="Views" />
            <Line type="monotone" dataKey="installs"  stroke="#00c853" strokeWidth={2} dot={false} name="Installs" />
            <Line type="monotone" dataKey="uninstalls" stroke="#ff5252" strokeWidth={2} dot={false} name="Uninstalls" />
            <Line type="monotone" dataKey="newUsers"  stroke="#ffb300" strokeWidth={2} dot={false} name="New Users" />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
          {[["#a78bfa","Views"],["#00c853","Installs"],["#ff5252","Uninstalls"],["#ffb300","New Users"]].map(([color,label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#8892a4" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />{label}
            </div>
          ))}
        </div>
      </div>

      {/* Top apps */}
      {section("🏆 Top Apps by Installs")}
      <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.topAppsByInstalls} margin={{ left: -20, right: 8 }} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#8892a4", fontSize: 10 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#8892a4", fontSize: 11 }} width={120} />
            <Tooltip contentStyle={{ background: "#131920", border: "none", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="count" name="Installs" radius={[0,6,6,0]}>
              {data.topAppsByInstalls.map((_, i) => (
                <Cell key={i} fill={i === 0 ? "#00c853" : i === 1 ? "#38bdf8" : "#a78bfa"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Countries — 2 column grid */}
      {section("🌍 Geo Breakdown — Country")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {[
          { title: "📥 Installs by Country", items: data.installsByCountry, key: "country" as const, bar: "#00c853" },
          { title: "🗑️ Uninstalls by Country", items: data.uninstallsByCountry, key: "country" as const, bar: "#ff5252" },
          { title: "👁️ Views by Country", items: data.viewsByCountry, key: "country" as const, bar: "#a78bfa" },
          { title: "🙋 New Users by Country", items: data.newUsersByCountry, key: "country" as const, bar: "#ffb300" },
        ].map(({ title, items, bar }) => (
          <div key={title} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>{title}</div>
            {items.length === 0 ? (
              <div style={{ color: "#8892a4", fontSize: 13 }}>No data yet</div>
            ) : items.slice(0, 8).map(({ country, count }) => {
              const max = items[0]!.count;
              return (
                <div key={country} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                    <span>{COUNTRY_FLAG[country] ?? "🌍"} {country}</span>
                    <span style={{ color: "#8892a4" }}>{count}</span>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 5 }}>
                    <div style={{ background: bar, borderRadius: 4, height: 5, width: `${(count / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Region / State */}
      {(data.installsByRegion.length > 0 || data.viewsByRegion.length > 0) && (
        <>
          {section("📍 Geo Breakdown — State / Region")}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {[
              { title: "📥 Installs by Region", items: data.installsByRegion, bar: "#00c853" },
              { title: "👁️ Views by Region", items: data.viewsByRegion, bar: "#a78bfa" },
            ].map(({ title, items, bar }) => (
              <div key={title} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>{title}</div>
                {items.length === 0 ? <div style={{ color: "#8892a4", fontSize: 13 }}>No data yet</div>
                  : items.slice(0, 10).map(({ region, count }) => {
                    const max = items[0]!.count;
                    return (
                      <div key={region} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                          <span>📍 {region}</span><span style={{ color: "#8892a4" }}>{count}</span>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 5 }}>
                          <div style={{ background: bar, borderRadius: 4, height: 5, width: `${(count / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
          {/* City breakdown */}
          {data.installsByCity.length > 0 && (
            <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18, marginTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>🏙️ Installs by City</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {data.installsByCity.slice(0, 20).map(({ city, count }) => (
                  <div key={city} style={{ background: "rgba(0,200,83,0.08)", border: "1px solid rgba(0,200,83,0.15)", borderRadius: 20, padding: "4px 12px", fontSize: 12 }}>
                    {city} <span style={{ color: "#8892a4", marginLeft: 4 }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {(data.installsByRegion.length === 0 && data.viewsByRegion.length === 0) && (
        <div style={{ marginTop: 16, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "14px 18px", fontSize: 13, color: "#8892a4", border: "1px solid rgba(255,255,255,0.06)" }}>
          📍 <strong style={{ color: "#c0c8d8" }}>State / Region tracking</strong> — data will appear here once users visit from a Cloudflare-proxied request. Region is extracted from CF-IPRegion headers automatically.
        </div>
      )}

      {/* Review stats */}
      {section("⭐ Review Analytics")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>⭐ Rating Distribution</div>
          {data.ratingDistribution.every(r => r.count === 0) ? (
            <div style={{ color: "#8892a4", fontSize: 13 }}>No reviews yet</div>
          ) : [...data.ratingDistribution].reverse().map(({ stars, count }) => {
            const total = data.ratingDistribution.reduce((s, r) => s + r.count, 0);
            return (
              <div key={stars} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#ffb300", width: 20 }}>{stars}★</span>
                <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 8 }}>
                  <div style={{ background: "#ffb300", borderRadius: 4, height: 8, width: total > 0 ? `${(count / total) * 100}%` : "0%" }} />
                </div>
                <span style={{ fontSize: 11, color: "#8892a4", width: 28 }}>{count}</span>
              </div>
            );
          })}
          <div style={{ marginTop: 12, fontSize: 12, color: "#8892a4" }}>
            Avg rating: <strong style={{ color: "#ffb300" }}>{data.avgRating > 0 ? `${data.avgRating}★` : "—"}</strong> · {data.totalReviews} reviews
          </div>
        </div>
        <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>🏆 Most Reviewed Apps</div>
          {data.topReviewedApps.length === 0 ? (
            <div style={{ color: "#8892a4", fontSize: 13 }}>No reviews yet</div>
          ) : data.topReviewedApps.map((app, i) => (
            <div key={app.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? "#ffb300" : "#8892a4", width: 18 }}>#{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.name}</div>
                <div style={{ fontSize: 11, color: "#8892a4" }}>{app.count} reviews · {app.avgRating}★ avg</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function cell(extra?: React.CSSProperties): React.CSSProperties {
  return { padding: "12px 14px", fontSize: 13, color: "#e8eaf0", ...extra };
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number | string; color?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}
    >
      <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: color ?? "#e8eaf0" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#8892a4" }}>{label}</div>
    </motion.div>
  );
}

// ── UpdateRequests tab ────────────────────────────────────────────────────────

function UpdateRequestsTab() {
  const [requests, setRequests] = useState<UpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [actingId, setActingId] = useState<number | null>(null);
  const [rejectModal, setRejectModal] = useState<UpdateRequest | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  function load(status = statusFilter) {
    setLoading(true);
    apiFetch<UpdateRequest[]>(`/admin/update-requests?status=${status}`)
      .then(r => setRequests(r ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [statusFilter]);

  async function approve(req: UpdateRequest) {
    if (!confirm(`Approve update for "${req.appName}"? This will apply the new version/URL to the live app.`)) return;
    setActingId(req.id);
    try {
      await apiFetch(`/admin/update-requests/${req.id}/approve`, { method: "POST", body: JSON.stringify({ note: "Approved by admin" }) });
      load();
    } catch { alert("Failed to approve"); } finally { setActingId(null); }
  }

  async function reject() {
    if (!rejectModal) return;
    setActingId(rejectModal.id);
    try {
      await apiFetch(`/admin/update-requests/${rejectModal.id}/reject`, { method: "POST", body: JSON.stringify({ note: rejectNote || "Did not meet update requirements." }) });
      setRejectModal(null); setRejectNote(""); load();
    } catch { alert("Failed to reject"); } finally { setActingId(null); }
  }

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["pending", "approved", "rejected", "all"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${statusFilter === s ? "#00c853" : "rgba(255,255,255,0.1)"}`, background: statusFilter === s ? "rgba(0,200,83,0.1)" : "transparent", color: statusFilter === s ? "#00c853" : "#8892a4" }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button onClick={() => load()} style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 20, fontSize: 12, background: "rgba(255,255,255,0.06)", border: "none", color: "#8892a4", cursor: "pointer" }}>↻ Refresh</button>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" style={{ margin: "0 auto" }} /></div> : (
        requests.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#8892a4" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <div>No {statusFilter === "all" ? "" : statusFilter} update requests</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {requests.map(req => {
              const sc = REQ_STATUS_COLOR[req.status] ?? REQ_STATUS_COLOR.pending;
              return (
                <motion.div key={req.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
                >
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{req.appName}</span>
                        <span style={{ fontSize: 11, background: sc.bg, color: sc.color, padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>{req.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#8892a4" }}>by {req.developerName} · {new Date(req.createdAt).toLocaleString()}</div>
                    </div>
                    {req.status === "pending" && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => approve(req)} disabled={actingId === req.id} className="btn-green" style={{ fontSize: 12, padding: "6px 16px" }}>{actingId === req.id ? "..." : "✅ Approve"}</button>
                        <button onClick={() => { setRejectModal(req); setRejectNote(""); }} className="btn-outline" style={{ fontSize: 12, padding: "6px 14px", color: "#ff5252", borderColor: "rgba(255,82,82,0.3)" }}>❌ Reject</button>
                      </div>
                    )}
                  </div>

                  {/* Commit info */}
                  <div style={{ background: "#060811", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 16 }}>{PLATFORM_ICON[req.platform] ?? "🔗"}</span>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#a78bfa" }}>{req.repoPath}</span>
                      {req.commitSha && <span style={{ fontFamily: "monospace", fontSize: 11, background: "rgba(124,77,255,0.15)", color: "#a78bfa", padding: "1px 6px", borderRadius: 4 }}>{req.commitSha}</span>}
                    </div>
                    {req.commitMessage && <div style={{ fontSize: 13, color: "#e8eaf0", marginBottom: 4 }}>📝 {req.commitMessage}</div>}
                    {req.commitAuthor && <div style={{ fontSize: 11, color: "#8892a4" }}>👤 {req.commitAuthor}</div>}
                    {req.commitUrl && <a href={req.commitUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#00c853" }}>View commit →</a>}
                  </div>

                  {/* Changes */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                    {req.newVersion && <div style={{ background: "rgba(0,200,83,0.06)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}><div style={{ color: "#8892a4", marginBottom: 2 }}>New Version</div><div style={{ fontWeight: 700, color: "#00c853" }}>{req.newVersion}</div></div>}
                    {req.newDownloadUrl && <div style={{ background: "rgba(124,77,255,0.06)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}><div style={{ color: "#8892a4", marginBottom: 2 }}>New Download URL</div><a href={req.newDownloadUrl} target="_blank" rel="noreferrer" style={{ color: "#a78bfa", wordBreak: "break-all" }}>{req.newDownloadUrl.slice(0, 50)}…</a></div>}
                    {req.newDescription && <div style={{ background: "rgba(255,179,0,0.06)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}><div style={{ color: "#8892a4", marginBottom: 2 }}>Description Update</div><div style={{ color: "#ffb300" }}>{req.newDescription.slice(0, 100)}{req.newDescription.length > 100 ? "…" : ""}</div></div>}
                  </div>

                  {req.changesSummary && <div style={{ fontSize: 12, color: "#8892a4" }}>ℹ️ {req.changesSummary}</div>}
                  {req.adminNote && <div style={{ fontSize: 12, color: req.status === "approved" ? "#00c853" : "#ff5252" }}>Admin note: {req.adminNote}</div>}
                </motion.div>
              );
            })}
          </div>
        )
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} style={{ background: "#0d1117", border: "1px solid rgba(255,82,82,0.2)", borderRadius: 20, padding: 28, maxWidth: 420, width: "100%" }}>
            <h3 style={{ fontWeight: 800, fontSize: 18, marginBottom: 8, color: "#ff5252" }}>❌ Reject Update</h3>
            <p style={{ color: "#8892a4", fontSize: 13, marginBottom: 16 }}>Rejecting update for <strong style={{ color: "#e8eaf0" }}>{rejectModal.appName}</strong>. The developer will be notified.</p>
            <label className="form-label">Rejection Reason</label>
            <textarea className="input" value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Explain why the update was rejected..." style={{ minHeight: 80, marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setRejectModal(null)} className="btn-outline" style={{ flex: 1 }}>Cancel</button>
              <button onClick={reject} disabled={actingId === rejectModal.id} className="btn-green" style={{ flex: 2, background: "#ff5252", color: "#fff" }}>{actingId === rejectModal.id ? "..." : "Reject Update"}</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ── OfflinePaymentsTab ────────────────────────────────────────────────────────

const OP_STATUS: Record<string, { bg: string; color: string; label: string }> = {
  submitted:      { bg: "rgba(255,179,0,0.1)",  color: "#ffb300", label: "⏳ Submitted" },
  admin_approved: { bg: "rgba(124,77,255,0.1)", color: "#a78bfa", label: "🔍 Admin Approved" },
  super_approved: { bg: "rgba(0,200,83,0.1)",   color: "#00c853", label: "✅ Final Approved" },
  rejected:       { bg: "rgba(255,82,82,0.1)",  color: "#ff5252", label: "❌ Rejected" },
  cancelled:      { bg: "rgba(255,255,255,0.05)", color: "#8892a4", label: "🚫 Cancelled" },
};

function OfflinePaymentsTab() {
  const [payments, setPayments] = useState<OfflinePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("submitted");
  const [actingId, setActingId] = useState<number | null>(null);
  const [rejectModal, setRejectModal] = useState<OfflinePayment | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [noteModal, setNoteModal] = useState<{ op: OfflinePayment; type: "admin" | "super" } | null>(null);
  const [note, setNote] = useState("");

  function load(s = statusFilter) {
    setLoading(true);
    apiFetch<OfflinePayment[]>(`/admin/offline-payments?status=${s}`)
      .then(r => setPayments(r ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [statusFilter]);

  async function adminApprove(op: OfflinePayment, n = "") {
    setActingId(op.id);
    try {
      await apiFetch(`/admin/offline-payments/${op.id}/admin-approve`, { method: "POST", body: JSON.stringify({ note: n }) });
      setNoteModal(null); setNote(""); load();
    } catch { alert("Failed to approve"); } finally { setActingId(null); }
  }

  async function superApprove(op: OfflinePayment, n = "") {
    if (!confirm(`Grant FINAL approval for "${op.appName}"? This will mark the publishing fee as paid and move the app to review.`)) return;
    setActingId(op.id);
    try {
      await apiFetch(`/admin/offline-payments/${op.id}/super-approve`, { method: "POST", body: JSON.stringify({ note: n }) });
      setNoteModal(null); setNote(""); load();
    } catch (err: any) { alert(err.message ?? "Failed — you may not have super admin access"); } finally { setActingId(null); }
  }

  async function doReject() {
    if (!rejectModal) return;
    setActingId(rejectModal.id);
    try {
      await apiFetch(`/admin/offline-payments/${rejectModal.id}/reject`, { method: "POST", body: JSON.stringify({ reason: rejectReason || "Proof of payment not accepted." }) });
      setRejectModal(null); setRejectReason(""); load();
    } catch { alert("Failed to reject"); } finally { setActingId(null); }
  }

  return (
    <div>
      {/* Info banner */}
      <div style={{ background: "rgba(124,77,255,0.06)", border: "1px solid rgba(124,77,255,0.15)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#c0c8d8" }}>
        🏦 <strong>Two-step approval:</strong> Any admin can give first-level approval. <strong>Final approval (super admin only)</strong> marks the fee as paid and moves the app to review.
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {["submitted", "admin_approved", "super_approved", "rejected", "all"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${statusFilter === s ? "#00c853" : "rgba(255,255,255,0.1)"}`,
              background: statusFilter === s ? "rgba(0,200,83,0.1)" : "transparent",
              color: statusFilter === s ? "#00c853" : "#8892a4" }}>
            {s === "admin_approved" ? "Admin Approved" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button onClick={() => load()} style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 20, fontSize: 12, background: "rgba(255,255,255,0.06)", border: "none", color: "#8892a4", cursor: "pointer" }}>↻ Refresh</button>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" style={{ margin: "0 auto" }} /></div> : (
        payments.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#8892a4" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div>No {statusFilter === "all" ? "" : statusFilter.replace("_", " ")} offline payments</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {payments.map(op => {
              const sc = OP_STATUS[op.status] ?? OP_STATUS.submitted;
              return (
                <motion.div key={op.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{op.appName ?? `App #${op.appId}`}</span>
                        <span style={{ fontSize: 11, background: sc.bg, color: sc.color, padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>{sc.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#8892a4" }}>by {op.developerName} ({op.developerEmail}) · {new Date(op.createdAt).toLocaleString()}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {op.status === "submitted" && (
                        <>
                          <button onClick={() => setNoteModal({ op, type: "admin" })} disabled={actingId === op.id}
                            className="btn-green" style={{ fontSize: 12, padding: "6px 14px" }}>
                            {actingId === op.id ? "..." : "✅ Admin Approve"}
                          </button>
                          <button onClick={() => { setRejectModal(op); setRejectReason(""); }}
                            style={{ fontSize: 12, padding: "6px 12px", background: "rgba(255,82,82,0.1)", color: "#ff5252", border: "1px solid rgba(255,82,82,0.2)", borderRadius: 8, cursor: "pointer" }}>
                            ❌ Reject
                          </button>
                        </>
                      )}
                      {op.status === "admin_approved" && (
                        <>
                          <button onClick={() => setNoteModal({ op, type: "super" })} disabled={actingId === op.id}
                            style={{ fontSize: 12, padding: "6px 14px", background: "rgba(124,77,255,0.15)", color: "#a78bfa", border: "1px solid rgba(124,77,255,0.3)", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>
                            {actingId === op.id ? "..." : "🔑 Super Approve (Final)"}
                          </button>
                          <button onClick={() => { setRejectModal(op); setRejectReason(""); }}
                            style={{ fontSize: 12, padding: "6px 12px", background: "rgba(255,82,82,0.1)", color: "#ff5252", border: "1px solid rgba(255,82,82,0.2)", borderRadius: 8, cursor: "pointer" }}>
                            ❌ Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Details grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
                    {op.amountPaid && <div style={{ background: "rgba(0,200,83,0.06)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}><div style={{ color: "#8892a4", marginBottom: 2 }}>Amount</div><div style={{ fontWeight: 700, color: "#00c853" }}>{op.amountPaid}</div></div>}
                    {op.bankReference && <div style={{ background: "rgba(255,179,0,0.06)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}><div style={{ color: "#8892a4", marginBottom: 2 }}>Bank Reference</div><div style={{ fontWeight: 700, color: "#ffb300", fontFamily: "monospace" }}>{op.bankReference}</div></div>}
                    <div style={{ background: "rgba(124,77,255,0.06)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                      <div style={{ color: "#8892a4", marginBottom: 2 }}>Proof</div>
                      <a href={op.proofUrl} target="_blank" rel="noreferrer" style={{ color: "#a78bfa", wordBreak: "break-all" }}>View proof →</a>
                    </div>
                  </div>

                  {op.proofNote && <div style={{ fontSize: 12, color: "#8892a4", marginBottom: 8 }}>📝 Note: {op.proofNote}</div>}
                  {op.adminNote && <div style={{ fontSize: 12, color: "#a78bfa", marginBottom: 4 }}>Admin note: {op.adminNote} {op.adminApprovedAt ? `· ${new Date(op.adminApprovedAt).toLocaleDateString()}` : ""}</div>}
                  {op.superNote && <div style={{ fontSize: 12, color: "#00c853", marginBottom: 4 }}>Super admin note: {op.superNote}</div>}
                  {op.rejectionReason && <div style={{ fontSize: 12, color: "#ff5252" }}>Rejection: {op.rejectionReason}</div>}
                </motion.div>
              );
            })}
          </div>
        )
      )}

      {/* Note + approve modal */}
      {noteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 28, maxWidth: 420, width: "100%" }}>
            <h3 style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
              {noteModal.type === "super" ? "🔑 Final Approval (Super Admin)" : "✅ Admin First-Level Approval"}
            </h3>
            <p style={{ color: "#8892a4", fontSize: 13, marginBottom: 16 }}>
              {noteModal.type === "super"
                ? "This will mark the publishing fee as paid and move the app to the review queue."
                : "Approves at admin level. A super admin must still give final approval."}
            </p>
            <label className="form-label">Note (optional)</label>
            <textarea className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note..." style={{ minHeight: 72, marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setNoteModal(null); setNote(""); }} className="btn-outline" style={{ flex: 1 }}>Cancel</button>
              <button
                onClick={() => noteModal.type === "super" ? superApprove(noteModal.op, note) : adminApprove(noteModal.op, note)}
                disabled={actingId === noteModal.op.id}
                className="btn-green" style={{ flex: 2 }}>
                {actingId === noteModal.op.id ? "..." : noteModal.type === "super" ? "Final Approve" : "Admin Approve"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} style={{ background: "#0d1117", border: "1px solid rgba(255,82,82,0.2)", borderRadius: 20, padding: 28, maxWidth: 420, width: "100%" }}>
            <h3 style={{ fontWeight: 800, fontSize: 18, marginBottom: 8, color: "#ff5252" }}>❌ Reject Proof</h3>
            <p style={{ color: "#8892a4", fontSize: 13, marginBottom: 16 }}>Rejecting offline payment for <strong style={{ color: "#e8eaf0" }}>{rejectModal.appName}</strong>. The developer can resubmit.</p>
            <label className="form-label">Rejection Reason</label>
            <textarea className="input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. Screenshot is unreadable, wrong amount, etc." style={{ minHeight: 72, marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setRejectModal(null)} className="btn-outline" style={{ flex: 1 }}>Cancel</button>
              <button onClick={doReject} disabled={actingId === rejectModal.id} style={{ flex: 2, background: "#ff5252", color: "#fff", border: "none", borderRadius: 20, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                {actingId === rejectModal.id ? "..." : "Reject"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ── OurAppsTab ────────────────────────────────────────────────────────────────

interface AdminVersion {
  id: number;
  appId: number;
  version: string;
  versionCode: number | null;
  releaseNotes: string | null;
  fileUrl: string | null;
  fileSize: number | null;
  minOsVersion: string | null;
  status: string; // pending | live | deprecated
  activatedAt: string | null;
  createdAt: string;
}

interface PlatformApp {
  id: number;
  name: string;
  tagline: string;
  description: string;
  category: string;
  platform: string;
  iconUrl: string;
  screenshots: string[];
  downloadUrl: string;
  webUrl?: string | null;
  currentVersion?: string | null;
  packageName?: string | null;
  isFeatured: boolean;
  totalDownloads: number;
  status: string;
  createdAt: string;
  publicId?: string | null;
  publicUrl?: string | null;
}

const AFRICA_CATS = [
  "Mobile Money & Fintech","Agriculture & Farming","Health & Telemedicine",
  "Education & E-Learning","Logistics & Delivery","Food & Restaurant",
  "Entertainment & Music","Social & Community","Business & Commerce",
  "Government & E-Services","Transport & Ride-Hailing","Utilities & Infrastructure",
  "Fashion & Beauty","Real Estate","Productivity & Tools","Emergencies","Community Engagements",
];

const PLATFORMS = [
  { value: "android", label: "🤖 Android" },
  { value: "ios",     label: "🍎 iOS" },
  { value: "web",     label: "🌐 Web" },
  { value: "all",     label: "📱 All" },
];

const PLATFORM_STORE_LABEL: Record<string, string> = {
  android: "Download APK",
  ios: "Download on App Store",
  web: "Open App",
  all: "Download / Open",
};

function emptyForm() {
  return {
    name: "", tagline: "", description: "", categories: [AFRICA_CATS[0]] as string[],
    platform: "android", webUrl: "", currentVersion: "", packageName: "",
    iconUrl: "", downloadUrl: "", screenshots: [] as string[],
    isFeatured: false,
  };
}

function CategoryPicker({ selected, onChange, all, max = 5 }: {
  selected: string[]; onChange: (v: string[]) => void; all: string[]; max?: number;
}) {
  function toggle(cat: string) {
    if (selected.includes(cat)) onChange(selected.filter(c => c !== cat));
    else if (selected.length < max) onChange([...selected, cat]);
  }
  const atMax = selected.length >= max;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#8892a4", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
          Categories * <span style={{ fontWeight: 400, textTransform: "none" as const }}>— up to {max}</span>
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: selected.length > 0 ? "#00c853" : "#8892a4" }}>{selected.length}/{max}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
        {all.map(cat => {
          const active = selected.includes(cat);
          const disabled = !active && atMax;
          return (
            <button key={cat} type="button" onClick={() => toggle(cat)} disabled={disabled} style={{
              padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: active ? 700 : 500,
              cursor: disabled ? "not-allowed" : "pointer",
              border: `1px solid ${active ? "#00c853" : disabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.1)"}`,
              background: active ? "rgba(0,200,83,0.12)" : "transparent",
              color: active ? "#00c853" : disabled ? "#2e3848" : "#8892a4",
            }}>{active ? `✓ ${cat}` : cat}</button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div style={{ fontSize: 11, color: "#5a6478", marginTop: 5 }}>
          Primary: <span style={{ color: "#00c853" }}>{selected[0]}</span>{selected.length > 1 && ` + ${selected.length - 1} more`}
        </div>
      )}
    </div>
  );
}

async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const token = await getClerkToken();
  const res = await fetch("/api/store/admin/platform-apps/upload-file", {
    method: "POST",
    body: form,
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `Upload failed (${res.status})`);
  }
  const { url } = await res.json();
  return url;
}

function VersionsModal({ app, onClose }: { app: PlatformApp; onClose: () => void }) {
  const [versions, setVersions] = useState<AdminVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [versionStr, setVersionStr] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [minOs, setMinOs] = useState("");
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const identifier = app.packageName || (app as any).slug || String(app.id);
  const canonicalBase = `https://awajimaaappstore.com/dl/${encodeURIComponent(identifier)}`;

  function load() {
    setLoading(true);
    apiFetch<AdminVersion[]>(`/admin/apps/${app.id}/versions`)
      .then(v => setVersions(v ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function activate(v: AdminVersion) {
    if (!confirm(`Make v${v.version} the live version? All users will download this version from the canonical link.`)) return;
    setActivating(v.id);
    try {
      await apiFetch(`/admin/apps/${app.id}/versions/${v.id}/activate`, { method: "POST" });
      load();
    } catch (e: any) { alert(e.message || "Failed to activate"); }
    finally { setActivating(null); }
  }

  async function upload() {
    setUploadErr(null);
    if (!versionStr.trim()) { setUploadErr("Version string is required (e.g. 1.2.0)"); return; }
    if (!file) { setUploadErr("Please choose an APK / file to upload"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("version", versionStr.trim());
      fd.append("releaseNotes", releaseNotes);
      fd.append("minOsVersion", minOs);
      fd.append("autoActivate", "true");
      const token = await getClerkToken();
      const res = await fetch(`/api/store/admin/apps/${app.id}/versions`, {
        method: "POST", body: fd,
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      setFile(null); setVersionStr(""); setReleaseNotes(""); setMinOs("");
      load();
    } catch (e: any) { setUploadErr(e.message || "Upload failed"); }
    finally { setUploading(false); }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  }

  const STATUS_STYLE: Record<string, React.CSSProperties> = {
    live:       { background: "rgba(0,200,83,0.15)",  color: "#00c853" },
    deprecated: { background: "rgba(255,183,77,0.12)", color: "#ffb74d" },
    pending:    { background: "rgba(255,255,255,0.06)", color: "#8892a4" },
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 2000, overflowY: "auto", padding: "40px 16px" }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 680 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>📦 Version History — {app.name}</div>
            <div style={{ fontSize: 12, color: "#8892a4" }}>Canonical link: <span style={{ color: "#a78bfa", fontFamily: "monospace" }}>{canonicalBase}</span></div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8892a4", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* Upload new version */}
        <div style={{ background: "rgba(0,200,83,0.05)", border: "1px solid rgba(0,200,83,0.2)", borderRadius: 14, padding: 18, marginBottom: 22 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "#00c853", marginBottom: 14 }}>⬆️ Upload New Version</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: "#8892a4", fontWeight: 700, display: "block", marginBottom: 4 }}>VERSION STRING *</label>
              <input className="input" value={versionStr} onChange={e => setVersionStr(e.target.value)} placeholder="e.g. 1.2.0" style={{ fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#8892a4", fontWeight: 700, display: "block", marginBottom: 4 }}>MIN OS VERSION</label>
              <input className="input" value={minOs} onChange={e => setMinOs(e.target.value)} placeholder="e.g. Android 6.0" style={{ fontSize: 13 }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: "#8892a4", fontWeight: 700, display: "block", marginBottom: 4 }}>RELEASE NOTES</label>
            <textarea className="input" value={releaseNotes} onChange={e => setReleaseNotes(e.target.value)} placeholder="What changed in this version? Bug fixes, new features…" rows={2} style={{ fontSize: 13 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: "#8892a4", fontWeight: 700, display: "block", marginBottom: 4 }}>APK / INSTALL FILE *</label>
            <input type="file" accept=".apk,.aab,.ipa,.zip,.exe,.dmg,*" style={{ display: "none" }} id="versionFileInput"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
            <label htmlFor="versionFileInput" style={{ display: "inline-block", padding: "8px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "#c0c8d8" }}>
              {file ? `✅ ${file.name} (${(file.size/1024/1024).toFixed(1)} MB)` : "📁 Choose file…"}
            </label>
          </div>
          {uploadErr && <div style={{ color: "#ff5252", fontSize: 12, marginBottom: 10 }}>⚠️ {uploadErr}</div>}
          <button onClick={upload} disabled={uploading}
            style={{ background: "#00c853", color: "#000", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, fontWeight: 800, cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.7 : 1 }}>
            {uploading ? "Uploading & Activating…" : "⬆️ Upload & Make Live"}
          </button>
        </div>

        {/* Version list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 32 }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
        ) : versions.length === 0 ? (
          <div style={{ textAlign: "center", color: "#8892a4", padding: "24px 0", fontSize: 14 }}>No versions yet. Upload the first one above.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {versions.map(v => {
              const isLive = v.status === "live";
              const versionUrl = `${canonicalBase}/${v.version}`;
              return (
                <div key={v.id} style={{ background: "#161b22", border: `1px solid ${isLive ? "rgba(0,200,83,0.3)" : "rgba(255,255,255,0.07)"}`, borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800, fontSize: 15 }}>v{v.version}</span>
                      {v.versionCode && <span style={{ fontSize: 11, color: "#8892a4" }}>build {v.versionCode}</span>}
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, textTransform: "uppercase", ...STATUS_STYLE[v.status] ?? STATUS_STYLE.pending }}>
                        {isLive ? "● Live" : v.status}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#8892a4" }}>{new Date(v.createdAt).toLocaleDateString()}</span>
                      {v.fileSize && <span style={{ fontSize: 11, color: "#8892a4" }}>{(v.fileSize/1024/1024).toFixed(1)} MB</span>}
                      {!isLive && v.fileUrl && (
                        <button onClick={() => activate(v)} disabled={activating === v.id}
                          style={{ fontSize: 11, background: "rgba(124,77,255,0.15)", color: "#a78bfa", border: "1px solid rgba(124,77,255,0.25)", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontWeight: 700 }}>
                          {activating === v.id ? "…" : "🔄 Make Live"}
                        </button>
                      )}
                      {isLive && <span style={{ fontSize: 11, color: "#00c853", fontWeight: 700 }}>✓ Active</span>}
                    </div>
                  </div>
                  {v.minOsVersion && <div style={{ fontSize: 11, color: "#8892a4", marginBottom: 4 }}>Min OS: {v.minOsVersion}</div>}
                  {v.releaseNotes && <p style={{ fontSize: 12, color: "#c0c8d8", lineHeight: 1.6, marginBottom: 8 }}>{v.releaseNotes}</p>}
                  {/* Per-version canonical URL */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "5px 10px" }}>
                    <span style={{ fontSize: 11, color: "#8892a4", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{versionUrl}</span>
                    <button onClick={() => copyUrl(versionUrl)}
                      style={{ fontSize: 10, background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "2px 8px", color: "#8892a4", cursor: "pointer", flexShrink: 0 }}>
                      {copiedUrl === versionUrl ? "✅" : "Copy"}
                    </button>
                    {v.fileUrl && (
                      <a href={versionUrl} target="_blank" rel="noreferrer"
                        style={{ fontSize: 10, color: "#00c853", flexShrink: 0, textDecoration: "none", fontWeight: 700 }}>⬇️</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function OurAppsTab() {
  const [apps, setApps]       = useState<PlatformApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<PlatformApp | null>(null);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [copied, setCopied]     = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadedApkUrl, setUploadedApkUrl] = useState<string | null>(null);
  const [copiedApkUrl, setCopiedApkUrl] = useState(false);
  const [versionsApp, setVersionsApp] = useState<PlatformApp | null>(null);

  // form fields
  const [form, setForm] = useState(emptyForm());
  const [iconFile,        setIconFile]        = useState<File | null>(null);
  const [apkFile,         setApkFile]         = useState<File | null>(null);
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);

  function load() {
    setLoading(true);
    apiFetch<PlatformApp[]>("/admin/platform-apps")
      .then(r => setApps(r ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setIconFile(null); setApkFile(null); setScreenshotFiles([]);
    setUploadStatus(null); setUploadedApkUrl(null); setCopiedApkUrl(false);
    setShowForm(true);
  }

  function openEdit(app: PlatformApp) {
    setEditing(app);
    setForm({
      name: app.name, tagline: app.tagline, description: app.description,
      categories: (app as any).categories?.length ? (app as any).categories : [app.category],
      platform: app.platform,
      webUrl: app.webUrl ?? "", currentVersion: app.currentVersion ?? "",
      packageName: app.packageName ?? "",
      iconUrl: app.iconUrl, downloadUrl: app.downloadUrl,
      screenshots: app.screenshots ?? [],
      isFeatured: app.isFeatured,
    });
    setIconFile(null); setApkFile(null); setScreenshotFiles([]);
    setUploadStatus(null); setUploadedApkUrl(null); setCopiedApkUrl(false);
    setShowForm(true);
  }

  function appStoreUrl(app: PlatformApp): string {
    if (app.publicUrl) return app.publicUrl;
    if (app.publicId) return `https://awajimaaappstore.com/app/${app.publicId}`;
    return app.downloadUrl; // fallback for any legacy row without publicId yet
  }

  function copyLink(app: PlatformApp) {
    navigator.clipboard.writeText(appStoreUrl(app)).catch(() => {});
    setCopied(app.id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function save() {
    if (!form.name || !form.tagline || !form.description || !form.categories?.length) {
      alert("Please fill in all required fields including at least one category.");
      return;
    }
    setSaving(true);
    try {
      let iconUrl    = form.iconUrl;
      let downloadUrl = form.downloadUrl;
      let screenshots = [...form.screenshots];

      // Upload icon if a new file was selected
      if (iconFile) {
        setUploadStatus("Uploading icon…");
        iconUrl = await uploadFile(iconFile);
      }

      // Upload APK / binary if provided
      if (apkFile) {
        setUploadStatus(`Uploading ${apkFile.name} (${(apkFile.size / 1024 / 1024).toFixed(1)} MB)…`);
        downloadUrl = await uploadFile(apkFile);
        setUploadedApkUrl(downloadUrl);
      }

      // Upload any new screenshots
      if (screenshotFiles.length > 0) {
        setUploadStatus("Uploading screenshots…");
        const urls = await Promise.all(screenshotFiles.map(uploadFile));
        screenshots = [...screenshots, ...urls];
      }

      if (!iconUrl) { alert("An app icon is required."); setSaving(false); return; }
      if (!downloadUrl) { alert("A download file or URL is required."); setSaving(false); return; }

      setUploadStatus("Saving…");

      const payload = {
        ...form,
        iconUrl, downloadUrl, screenshots,
        webUrl: form.webUrl || null,
        currentVersion: form.currentVersion || null,
        packageName: form.packageName || null,
      };

      if (editing) {
        await apiFetch(`/admin/platform-apps/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/platform-apps", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      alert(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
      setUploadStatus(null);
    }
  }

  async function remove(app: PlatformApp) {
    if (!confirm(`Remove "${app.name}"? It will no longer appear in the store.`)) return;
    setDeleting(app.id);
    try {
      await apiFetch(`/admin/platform-apps/${app.id}`, { method: "DELETE" });
      load();
    } catch { alert("Failed to remove"); } finally { setDeleting(null); }
  }

  async function toggleFeatured(app: PlatformApp) {
    try {
      await apiFetch(`/admin/platform-apps/${app.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isFeatured: !app.isFeatured }),
      });
      load();
    } catch { alert("Failed to update"); }
  }

  const field = (label: string, node: React.ReactNode, required = false) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#8892a4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}{required && <span style={{ color: "#ff5252" }}> *</span>}
      </label>
      {node}
    </div>
  );

  const inp = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className="input" />
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>🚀 Our Apps</div>
          <div style={{ fontSize: 12, color: "#8892a4", marginTop: 2 }}>
            First-party Awajimaa apps — published instantly, no fee, no review queue.
          </div>
        </div>
        <button onClick={openCreate}
          style={{ padding: "10px 22px", borderRadius: 20, background: "#00c853", color: "#000", fontWeight: 800, fontSize: 13, border: "none", cursor: "pointer" }}>
          + Publish New App
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
      ) : apps.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#8892a4" }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>📦</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>No apps published yet</div>
          <div style={{ fontSize: 13 }}>Click "Publish New App" to upload your first APK or app.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {apps.map(app => (
            <div key={app.id} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              {/* App header */}
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <img src={app.iconUrl} alt={app.name}
                  style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", background: "#161b22", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>{app.name}</span>
                    {app.isFeatured && <span style={{ fontSize: 10, background: "rgba(255,179,0,0.15)", color: "#ffb300", padding: "1px 7px", borderRadius: 8, fontWeight: 700 }}>★ Featured</span>}
                    <span style={{ fontSize: 10, background: app.status === "approved" ? "rgba(0,200,83,0.1)" : "rgba(255,82,82,0.1)", color: app.status === "approved" ? "#00c853" : "#ff5252", padding: "1px 7px", borderRadius: 8, fontWeight: 700 }}>{app.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#8892a4", marginTop: 2 }}>{app.tagline}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {app.currentVersion && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.06)", color: "#c0c8d8", padding: "2px 7px", borderRadius: 6 }}>v{app.currentVersion}</span>}
                    <span style={{ fontSize: 10, background: "rgba(255,255,255,0.06)", color: "#c0c8d8", padding: "2px 7px", borderRadius: 6 }}>{app.platform}</span>
                    <span style={{ fontSize: 10, background: "rgba(255,255,255,0.06)", color: "#c0c8d8", padding: "2px 7px", borderRadius: 6 }}>{app.totalDownloads.toLocaleString()} DLs</span>
                  </div>
                </div>
              </div>

              {/* Download link */}
              <div style={{ background: "rgba(0,200,83,0.05)", border: "1px solid rgba(0,200,83,0.15)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, color: "#8892a4", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>App Store URL</div>
                <div style={{ fontSize: 11, color: "#a78bfa", wordBreak: "break-all", marginBottom: 8 }}>{appStoreUrl(app)}</div>
                <button onClick={() => copyLink(app)}
                  style={{ fontSize: 11, background: copied === app.id ? "rgba(0,200,83,0.2)" : "rgba(0,200,83,0.08)", color: "#00c853", border: "1px solid rgba(0,200,83,0.2)", borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontWeight: 700 }}>
                  {copied === app.id ? "✅ Copied!" : "📋 Copy Link"}
                </button>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => openEdit(app)}
                  style={{ flex: 1, fontSize: 12, background: "rgba(124,77,255,0.1)", color: "#a78bfa", border: "none", borderRadius: 8, padding: "7px 0", cursor: "pointer", fontWeight: 600 }}>
                  ✏️ Edit
                </button>
                <button onClick={() => setVersionsApp(app)}
                  style={{ flex: 1, fontSize: 12, background: "rgba(0,200,83,0.08)", color: "#00c853", border: "none", borderRadius: 8, padding: "7px 0", cursor: "pointer", fontWeight: 600 }}>
                  📦 Versions
                </button>
                <button onClick={() => toggleFeatured(app)}
                  style={{ flex: 1, fontSize: 12, background: "rgba(255,179,0,0.1)", color: "#ffb300", border: "none", borderRadius: 8, padding: "7px 0", cursor: "pointer", fontWeight: 600 }}>
                  {app.isFeatured ? "Unfeature" : "★ Feature"}
                </button>
                <button onClick={() => remove(app)} disabled={deleting === app.id}
                  style={{ flex: 1, fontSize: 12, background: "rgba(255,82,82,0.08)", color: "#ff5252", border: "none", borderRadius: 8, padding: "7px 0", cursor: "pointer", fontWeight: 600 }}>
                  {deleting === app.id ? "…" : "🗑 Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Version management modal */}
      {versionsApp && (
        <VersionsModal app={versionsApp} onClose={() => { setVersionsApp(null); load(); }} />
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000, overflowY: "auto", padding: "40px 16px" }}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 600 }}>

            <h3 style={{ fontWeight: 900, fontSize: 20, marginBottom: 4 }}>
              {editing ? "✏️ Edit App" : "🚀 Publish New App"}
            </h3>
            <p style={{ color: "#8892a4", fontSize: 13, marginBottom: 24 }}>
              {editing
                ? "Update the app metadata or upload a new APK."
                : "Upload your APK (or any install file) and fill in the app details. The upload URL becomes the direct download link."}
            </p>

            {/* App Info */}
            <div style={{ fontWeight: 800, fontSize: 13, color: "#a78bfa", marginBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 8 }}>App Info</div>

            {field("App Name", inp({ value: form.name, placeholder: "e.g. Awajimaa App", onChange: e => setForm(f => ({ ...f, name: e.target.value })) }), true)}
            {field("Tagline", inp({ value: form.tagline, placeholder: "One-line description shown in search", onChange: e => setForm(f => ({ ...f, tagline: e.target.value })) }), true)}
            {field("Description", (
              <textarea className="input" value={form.description} placeholder="Full app description…" rows={4}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            ), true)}

            <CategoryPicker selected={form.categories} onChange={v => setForm(f => ({ ...f, categories: v }))} all={AFRICA_CATS} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {field("Platform", (
                <select className="input" value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}>
                  {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {field("Version", inp({ value: form.currentVersion, placeholder: "1.0.0", onChange: e => setForm(f => ({ ...f, currentVersion: e.target.value })) }))}
              {field("Package Name", inp({ value: form.packageName, placeholder: "io.awajimaaapp.android", onChange: e => setForm(f => ({ ...f, packageName: e.target.value })) }))}
            </div>

            {/* File Uploads */}
            <div style={{ fontWeight: 800, fontSize: 13, color: "#a78bfa", margin: "20px 0 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 8 }}>Files & Assets</div>

            {field("App Icon", (
              <div>
                <input type="file" accept="image/*" style={{ display: "none" }} id="iconInput"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setIconFile(f); setForm(ff => ({ ...ff, iconUrl: URL.createObjectURL(f) })); } }} />
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {form.iconUrl && <img src={form.iconUrl} alt="icon" style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover" }} />}
                  <label htmlFor="iconInput" style={{ padding: "8px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "#c0c8d8" }}>
                    {iconFile ? iconFile.name : (form.iconUrl ? "Change Icon" : "Upload Icon")}
                  </label>
                </div>
              </div>
            ), true)}

            {field(`APK / Install File (${PLATFORM_STORE_LABEL[form.platform] ?? "Download"})`, (
              <div>
                <input type="file" accept=".apk,.aab,.ipa,.zip,.exe,.dmg,*" style={{ display: "none" }} id="apkInput"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setApkFile(f); }} />
                <label htmlFor="apkInput" style={{ display: "inline-block", padding: "8px 16px", background: "rgba(0,200,83,0.08)", border: "1px solid rgba(0,200,83,0.2)", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "#00c853", fontWeight: 700 }}>
                  {apkFile ? `✅ ${apkFile.name} (${(apkFile.size / 1024 / 1024).toFixed(1)} MB)` : "📁 Choose File…"}
                </label>
                <div style={{ fontSize: 11, color: "#8892a4", marginTop: 6 }}>
                  {editing && !apkFile && form.downloadUrl ? (
                    <>Current: <a href={form.downloadUrl} target="_blank" rel="noreferrer" style={{ color: "#00c853" }}>View file →</a></>
                  ) : "The file will be stored and its public URL becomes the direct download link."}
                </div>
              </div>
            ))}

            {field("Or paste a download URL", (
              <div>
                <input className="input" type="url" value={!apkFile ? form.downloadUrl : ""} disabled={!!apkFile}
                  placeholder="https://example.com/app.apk (leave empty if uploading a file above)"
                  onChange={e => setForm(f => ({ ...f, downloadUrl: e.target.value }))} />
                {apkFile && <div style={{ fontSize: 11, color: "#8892a4", marginTop: 4 }}>URL will be set automatically from the uploaded file.</div>}
              </div>
            ))}

            {field("Screenshots", (
              <div>
                <input type="file" accept="image/*" multiple style={{ display: "none" }} id="ssInput"
                  onChange={e => { const fs = Array.from(e.target.files ?? []); setScreenshotFiles(fs); }} />
                <label htmlFor="ssInput" style={{ display: "inline-block", padding: "8px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "#c0c8d8" }}>
                  {screenshotFiles.length > 0 ? `${screenshotFiles.length} file(s) selected` : "Add Screenshots"}
                </label>
                {form.screenshots.length > 0 && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {form.screenshots.map((s, i) => (
                      <div key={i} style={{ position: "relative" }}>
                        <img src={s} alt="" style={{ width: 60, height: 100, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }} />
                        <button onClick={() => setForm(f => ({ ...f, screenshots: f.screenshots.filter((_, j) => j !== i) }))}
                          style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#ff5252", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {field("Web URL (optional)", inp({ value: form.webUrl, type: "url", placeholder: "https://awajimaaapp.io", onChange: e => setForm(f => ({ ...f, webUrl: e.target.value })) }))}

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <input type="checkbox" id="featuredChk" checked={form.isFeatured} onChange={e => setForm(f => ({ ...f, isFeatured: e.target.checked }))} />
              <label htmlFor="featuredChk" style={{ fontSize: 13, color: "#c0c8d8", cursor: "pointer" }}>Feature this app on the store homepage</label>
            </div>

            {uploadStatus && (
              <div style={{ background: "rgba(0,200,83,0.07)", border: "1px solid rgba(0,200,83,0.15)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#00c853", marginBottom: 16 }}>
                ⏳ {uploadStatus}
              </div>
            )}

            {uploadedApkUrl && !uploadStatus && (
              <div style={{ background: "rgba(0,200,83,0.08)", border: "1px solid rgba(0,200,83,0.25)", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#00c853", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>✅ File Uploaded — Download Link Generated</div>
                <div style={{ fontSize: 11, color: "#a78bfa", wordBreak: "break-all", marginBottom: 8, fontFamily: "monospace" }}>{uploadedApkUrl}</div>
                <button onClick={() => { navigator.clipboard.writeText(uploadedApkUrl); setCopiedApkUrl(true); setTimeout(() => setCopiedApkUrl(false), 2000); }}
                  style={{ fontSize: 11, background: copiedApkUrl ? "rgba(0,200,83,0.3)" : "rgba(0,200,83,0.12)", color: "#00c853", border: "1px solid rgba(0,200,83,0.3)", borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontWeight: 700 }}>
                  {copiedApkUrl ? "✅ Copied!" : "📋 Copy Download Link"}
                </button>
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowForm(false)} disabled={saving}
                style={{ flex: 1, background: "rgba(255,255,255,0.06)", color: "#c0c8d8", border: "none", borderRadius: 14, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                style={{ flex: 2, background: "#00c853", color: "#000", border: "none", borderRadius: 14, padding: "12px 0", fontSize: 14, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Publishing…" : editing ? "Save Changes" : "🚀 Publish App"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ── Main Admin ────────────────────────────────────────────────────────────────

export default function Admin() {
  const { isSignedIn, isLoaded, user } = useUser();
  const [tab, setTab] = useState<Tab>("overview");
  const [accessState, setAccessState] = useState<"loading" | "granted" | "denied">("loading");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [pending, setPending] = useState<App[]>([]);
  const [allApps, setAllApps] = useState<App[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [rejectModal, setRejectModal] = useState<App | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [downloadModal, setDownloadModal] = useState<App | null>(null);
  const [downloadUrl, setDownloadUrl] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { setAccessState("denied"); return; }
    setStatsLoading(true);
    apiFetch<AdminStats>("/admin/stats")
      .then(data => { setStats(data); setAccessState("granted"); })
      .catch((err) => {
        if (err instanceof StoreApiError && err.status === 403) setAccessState("denied");
        else setAccessState("granted"); // server error — let them in, individual calls will fail gracefully
      })
      .finally(() => setStatsLoading(false));
    loadPending();
  }, [isLoaded, isSignedIn]);

  function loadPending() {
    apiFetch<App[]>("/admin/apps/pending").then(setPending).catch(() => {});
  }

  function loadAll() {
    setLoading(true);
    apiFetch<App[]>("/admin/apps").then(setAllApps).catch(() => {}).finally(() => setLoading(false));
  }
  function loadDevelopers() {
    setLoading(true);
    apiFetch<Developer[]>("/admin/developers").then(setDevelopers).catch(() => {}).finally(() => setLoading(false));
  }

  function handleTab(t: Tab) {
    setTab(t);
    if (t === "all" && !allApps.length) loadAll();
    if (t === "developers" && !developers.length) loadDevelopers();
  }

  async function aiReview(app: App) {
    setAiLoading(app.id);
    try { await apiFetch(`/admin/apps/${app.id}/ai-review`, { method: "POST" }); loadPending(); loadAll(); }
    catch { alert("AI review failed"); } finally { setAiLoading(null); }
  }
  async function approve(app: App) {
    setActionLoading(app.id);
    try { await apiFetch(`/admin/apps/${app.id}/approve`, { method: "POST" }); loadPending(); loadAll(); }
    catch { alert("Failed"); } finally { setActionLoading(null); }
  }
  async function reject(app: App) {
    setActionLoading(app.id);
    try { await apiFetch(`/admin/apps/${app.id}/reject`, { method: "POST", body: JSON.stringify({ reason: rejectReason }) }); setRejectModal(null); loadPending(); loadAll(); }
    catch { alert("Failed"); } finally { setActionLoading(null); }
  }
  async function toggleFeature(app: App) {
    setActionLoading(app.id);
    try { await apiFetch(`/admin/apps/${app.id}/feature`, { method: "POST" }); loadAll(); }
    catch { alert("Failed"); } finally { setActionLoading(null); }
  }
  async function toggleSuspend(dev: Developer) {
    setActionLoading(dev.id);
    try { await apiFetch(`/admin/developers/${dev.id}/suspend`, { method: "POST" }); loadDevelopers(); }
    catch { alert("Failed"); } finally { setActionLoading(null); }
  }
  async function toggleFeeExempt(dev: Developer) {
    setActionLoading(dev.id);
    try { await apiFetch(`/admin/developers/${dev.id}/toggle-fee-exempt`, { method: "POST" }); loadDevelopers(); }
    catch { alert("Failed"); } finally { setActionLoading(null); }
  }
  async function directApprove(app: App) {
    if (!confirm(`Directly approve "${app.name}" and waive the publishing fee?`)) return;
    setActionLoading(app.id);
    try { await apiFetch(`/admin/apps/${app.id}/direct-approve`, { method: "POST" }); loadPending(); loadAll(); }
    catch (e: any) { alert(e.message ?? "Failed"); } finally { setActionLoading(null); }
  }
  async function assignDownload() {
    if (!downloadModal || !downloadUrl) return;
    setActionLoading(downloadModal.id);
    try { await apiFetch(`/admin/apps/${downloadModal.id}/assign-download`, { method: "POST", body: JSON.stringify({ downloadUrl }) }); setDownloadModal(null); setDownloadUrl(""); loadAll(); }
    catch { alert("Failed"); } finally { setActionLoading(null); }
  }

  if (!isLoaded || accessState === "loading") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "120px 20px", gap: 20 }}>
        <div className="spinner" />
        <div style={{ color: "#8892a4", fontSize: 14 }}>Checking admin access…</div>
      </div>
    );
  }

  if (accessState === "denied") {
    return (
      <div style={{ textAlign: "center", padding: "100px 20px" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: "#e8eaf0", marginBottom: 8 }}>Access Denied</div>
        <div style={{ color: "#8892a4", fontSize: 14 }}>
          {!isSignedIn
            ? "Please sign in with an admin account to access this panel."
            : "Your account does not have admin privileges."}
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "our-apps",   label: "🚀 Our Apps" },
    { id: "overview",   label: "📊 Overview" },
    { id: "analytics",  label: "📈 Analytics" },
    { id: "pending",    label: `🔍 Pending (${pending.length})` },
    { id: "all",        label: "📱 All Apps" },
    { id: "developers", label: "👥 Developers" },
    { id: "updates",    label: "🔄 Updates" },
    { id: "offline",    label: "🏦 Offline Payments" },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 20px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900 }}>⚙️ Admin Panel</h1>
          <div style={{ fontSize: 13, color: "#8892a4", marginTop: 2 }}>Africa App Store · Super Admin</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "#8892a4" }}>👤 {user?.fullName ?? user?.primaryEmailAddress?.emailAddress}</div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 28, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => handleTab(t.id)}
            style={{ padding: "10px 18px", background: "none", border: "none", borderBottom: tab === t.id ? "2px solid #00c853" : "2px solid transparent", color: tab === t.id ? "#00c853" : "#8892a4", fontWeight: tab === t.id ? 700 : 400, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        statsLoading
          ? <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
          : stats
            ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
                <StatCard icon="📱" label="Total Apps"      value={stats.totalApps} />
                <StatCard icon="💳" label="Pending Payment" value={stats.pendingPayment} color="#ffb300" />
                <StatCard icon="🔍" label="Pending Review"  value={stats.pendingReview}  color="#a78bfa" />
                <StatCard icon="✅" label="Live Apps"       value={stats.approvedApps}   color="#00c853" />
                <StatCard icon="👥" label="Developers"      value={stats.totalDevelopers} />
                <StatCard icon="📥" label="Total Downloads" value={(stats.totalDownloads ?? 0).toLocaleString()} />
              </div>
            : <div style={{ color: "#8892a4", padding: 40, textAlign: "center" }}>Could not load stats. Try refreshing.</div>
      )}

      {/* Our Apps (first-party) */}
      {tab === "our-apps" && <OurAppsTab />}

      {/* Analytics */}
      {tab === "analytics" && <AnalyticsTab />}

      {/* Pending review */}
      {tab === "pending" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {pending.length === 0 ? <div style={{ textAlign: "center", padding: "60px 0", color: "#8892a4" }}>🎉 No apps pending review</div> : (
            pending.map(app => (
              <motion.div key={app.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}
              >
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <img src={app.iconUrl} alt={app.name} style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", background: "#131920", flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).src = `https://placehold.co/52x52/0d1117/00c853?text=${app.name[0]}`; }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{app.name}</div>
                    <div style={{ fontSize: 12, color: "#8892a4", marginBottom: 6 }}>{app.developerName} · {app.category} · {app.platform}</div>
                    <div style={{ fontSize: 13, color: "#c0c8d8", lineHeight: 1.5, marginBottom: 8 }}>{app.description?.slice(0, 200)}{(app.description?.length ?? 0) > 200 ? "…" : ""}</div>
                    {app.downloadUrl && <a href={app.downloadUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#00c853" }}>📥 Download link →</a>}
                    {app.aiSummary && (
                      <div style={{ marginTop: 12, background: "rgba(124,77,255,0.06)", border: "1px solid rgba(124,77,255,0.15)", borderRadius: 10, padding: "10px 14px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 4 }}>🤖 AI REVIEW</div>
                        <div style={{ fontSize: 12, color: "#c0c8d8", marginBottom: 4 }}>{app.aiSummary}</div>
                        {app.aiReviewScore !== null && <div style={{ fontSize: 11, color: "#8892a4" }}>Score: {app.aiReviewScore}/100 · Flags: {app.aiPolicyFlags && app.aiPolicyFlags !== "[]" ? app.aiPolicyFlags : "none"}</div>}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 120 }}>
                    <button onClick={() => aiReview(app)} disabled={aiLoading === app.id} style={{ background: "rgba(124,77,255,0.1)", color: "#a78bfa", border: "1px solid rgba(124,77,255,0.2)", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>{aiLoading === app.id ? "Analyzing..." : "🤖 AI Review"}</button>
                    <button onClick={() => approve(app)} disabled={actionLoading === app.id} className="btn-green" style={{ fontSize: 12, padding: "6px 12px" }}>✅ Approve</button>
                    <button onClick={() => { setRejectModal(app); setRejectReason(""); }} style={{ background: "rgba(255,82,82,0.1)", color: "#ff5252", border: "1px solid rgba(255,82,82,0.2)", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>❌ Reject</button>
                    <button onClick={() => directApprove(app)} disabled={actionLoading === app.id} title="Bypass fee & immediately approve" style={{ background: "rgba(0,200,83,0.08)", color: "#00c853", border: "1px solid rgba(0,200,83,0.2)", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>⚡ Direct Launch</button>
                    <button onClick={() => { setDownloadModal(app); setDownloadUrl(app.downloadUrl ?? ""); }} style={{ background: "rgba(255,179,0,0.1)", color: "#ffb300", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>🔗 Set URL</button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* All apps */}
      {tab === "all" && (
        loading ? <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" style={{ margin: "0 auto" }} /></div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["App","Developer","Category","Status","Rating","Downloads","Featured","Actions"].map(h => (
                    <th key={h} style={{ ...cell(), color: "#8892a4", fontWeight: 600, textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allApps.map(app => (
                  <tr key={app.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={cell()}><div style={{ fontWeight: 600 }}>{app.name}</div><div style={{ fontSize: 11, color: "#8892a4" }}>{app.slug}</div></td>
                    <td style={cell({ color: "#8892a4" })}>{app.developerName}</td>
                    <td style={cell({ color: "#8892a4", fontSize: 11 })}>{app.category}</td>
                    <td style={cell()}><span style={{ fontSize: 11, color: STATUS_COLOR[app.status] ?? "#8892a4", background: `${STATUS_COLOR[app.status]}18`, padding: "2px 8px", borderRadius: 10 }}>{app.status.replace("_"," ")}</span></td>
                    <td style={cell()}>{app.rating > 0 ? `⭐ ${app.rating.toFixed(1)}` : "—"}</td>
                    <td style={cell()}>{app.totalDownloads.toLocaleString()}</td>
                    <td style={cell({ textAlign: "center" })}>{app.isFeatured ? "⭐" : "—"}</td>
                    <td style={cell()}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {app.status === "pending_review" && <button onClick={() => approve(app)} disabled={actionLoading === app.id} style={{ fontSize: 11, background: "rgba(0,200,83,0.1)", color: "#00c853", border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Approve</button>}
                        {app.status === "pending_review" && <button onClick={() => { setRejectModal(app); setRejectReason(""); }} style={{ fontSize: 11, background: "rgba(255,82,82,0.1)", color: "#ff5252", border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Reject</button>}
                        {["pending_payment","draft"].includes(app.status) && <button onClick={() => directApprove(app)} disabled={actionLoading === app.id} title="Bypass fee — approve directly" style={{ fontSize: 11, background: "rgba(0,200,83,0.12)", color: "#00c853", border: "1px solid rgba(0,200,83,0.25)", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>⚡ Launch</button>}
                        <button onClick={() => toggleFeature(app)} disabled={actionLoading === app.id} style={{ fontSize: 11, background: "rgba(255,179,0,0.1)", color: "#ffb300", border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>{app.isFeatured ? "Unfeature" : "Feature"}</button>
                        <button onClick={() => { setDownloadModal(app); setDownloadUrl(app.downloadUrl ?? ""); }} style={{ fontSize: 11, background: "rgba(124,77,255,0.1)", color: "#a78bfa", border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>URL</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Developers */}
      {tab === "developers" && (
        loading ? <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" style={{ margin: "0 auto" }} /></div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Developer","Email","Country","Status","Fee Exempt","NGN Account","Joined","Actions"].map(h => (
                    <th key={h} style={{ ...cell(), color: "#8892a4", fontWeight: 600, textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {developers.map(dev => (
                  <tr key={dev.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={cell()}><div style={{ fontWeight: 600 }}>{dev.displayName}</div><div style={{ fontSize: 11, color: "#8892a4" }}>{dev.company}</div></td>
                    <td style={{ ...cell(), color: "#8892a4" }}>{dev.email}</td>
                    <td style={{ ...cell(), color: "#8892a4" }}>{dev.country}</td>
                    <td style={cell()}><span style={{ fontSize: 11, color: dev.status === "active" ? "#00c853" : "#ff5252", background: dev.status === "active" ? "rgba(0,200,83,0.1)" : "rgba(255,82,82,0.1)", padding: "2px 8px", borderRadius: 10 }}>{dev.status}</span></td>
                    <td style={{ ...cell(), textAlign: "center" }}>
                      <span title={dev.feeExempt ? "Fee waived — no publishing fee required" : "Normal — publishing fee applies"} style={{ fontSize: 14 }}>{dev.feeExempt ? "✅" : "—"}</span>
                    </td>
                    <td style={{ ...cell(), fontFamily: "monospace", fontSize: 12 }}>{dev.dedicatedNgnAccount?.accountNumber ?? "—"}</td>
                    <td style={{ ...cell(), color: "#8892a4", fontSize: 11 }}>{new Date(dev.createdAt).toLocaleDateString()}</td>
                    <td style={cell()}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => toggleSuspend(dev)} disabled={actionLoading === dev.id} style={{ fontSize: 11, background: dev.status === "active" ? "rgba(255,82,82,0.1)" : "rgba(0,200,83,0.1)", color: dev.status === "active" ? "#ff5252" : "#00c853", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                          {actionLoading === dev.id ? "..." : dev.status === "active" ? "Suspend" : "Unsuspend"}
                        </button>
                        <button onClick={() => toggleFeeExempt(dev)} disabled={actionLoading === dev.id} title={dev.feeExempt ? "Remove fee exemption" : "Grant fee exemption (waive publishing fee)"} style={{ fontSize: 11, background: dev.feeExempt ? "rgba(255,179,0,0.1)" : "rgba(0,200,83,0.08)", color: dev.feeExempt ? "#ffb300" : "#00c853", border: `1px solid ${dev.feeExempt ? "rgba(255,179,0,0.25)" : "rgba(0,200,83,0.2)"}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                          {dev.feeExempt ? "⚡ Exempt" : "Waive Fee"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Updates */}
      {tab === "updates" && <UpdateRequestsTab />}

      {/* Offline payments */}
      {tab === "offline" && <OfflinePaymentsTab />}

      {/* Reject modal */}
      {rejectModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div style={{ background: "#0d1117", border: "1px solid rgba(255,82,82,0.2)", borderRadius: 20, padding: 28, maxWidth: 420, width: "100%" }}>
            <h3 style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>❌ Reject "{rejectModal.name}"</h3>
            <label className="form-label">Rejection Reason</label>
            <textarea className="input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Explain why the app was rejected..." style={{ minHeight: 80, marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setRejectModal(null)} className="btn-outline" style={{ flex: 1 }}>Cancel</button>
              <button onClick={() => reject(rejectModal)} disabled={actionLoading === rejectModal.id} style={{ flex: 2, background: "#ff5252", color: "#fff", border: "none", borderRadius: 20, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{actionLoading === rejectModal.id ? "..." : "Reject App"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign download modal */}
      {downloadModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 28, maxWidth: 420, width: "100%" }}>
            <h3 style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>🔗 Set Download URL</h3>
            <div style={{ fontSize: 14, color: "#8892a4", marginBottom: 16 }}>"{downloadModal.name}"</div>
            <input className="input" type="url" value={downloadUrl} onChange={e => setDownloadUrl(e.target.value)} placeholder="https://..." style={{ marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDownloadModal(null)} className="btn-outline" style={{ flex: 1 }}>Cancel</button>
              <button onClick={assignDownload} disabled={actionLoading === downloadModal.id} className="btn-green" style={{ flex: 2 }}>{actionLoading === downloadModal.id ? "..." : "Save URL"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
