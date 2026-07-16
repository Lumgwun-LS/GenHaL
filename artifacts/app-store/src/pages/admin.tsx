import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "@clerk/react";
import { apiFetch } from "../lib/api";
import type { App, AdminStats, Developer, UpdateRequest } from "../lib/types";

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

type Tab = "overview" | "pending" | "all" | "developers" | "updates";

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

// ── Main Admin ────────────────────────────────────────────────────────────────

export default function Admin() {
  const { isSignedIn, user } = useUser();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
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
    apiFetch<AdminStats>("/admin/stats").then(setStats).catch(() => {});
    loadPending();
  }, []);

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
  async function assignDownload() {
    if (!downloadModal || !downloadUrl) return;
    setActionLoading(downloadModal.id);
    try { await apiFetch(`/admin/apps/${downloadModal.id}/assign-download`, { method: "POST", body: JSON.stringify({ downloadUrl }) }); setDownloadModal(null); setDownloadUrl(""); loadAll(); }
    catch { alert("Failed"); } finally { setActionLoading(null); }
  }

  if (!isSignedIn) return <div style={{ textAlign: "center", padding: 80, color: "#8892a4" }}>Please sign in.</div>;

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview",   label: "📊 Overview" },
    { id: "pending",    label: `🔍 Pending (${pending.length})` },
    { id: "all",        label: "📱 All Apps" },
    { id: "developers", label: "👥 Developers" },
    { id: "updates",    label: "🔄 Updates" },
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
      {tab === "overview" && stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
          <StatCard icon="📱" label="Total Apps"     value={stats.totalApps} />
          <StatCard icon="💳" label="Pending Payment" value={stats.pendingPayment} color="#ffb300" />
          <StatCard icon="🔍" label="Pending Review"  value={stats.pendingReview}  color="#a78bfa" />
          <StatCard icon="✅" label="Live Apps"       value={stats.approvedApps}   color="#00c853" />
          <StatCard icon="👥" label="Developers"      value={stats.totalDevelopers} />
          <StatCard icon="📥" label="Total Downloads" value={(stats.totalDownloads ?? 0).toLocaleString()} />
        </div>
      )}

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
                  {["Developer","Email","Country","Status","NGN Account","Joined","Actions"].map(h => (
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
                    <td style={{ ...cell(), fontFamily: "monospace", fontSize: 12 }}>{dev.dedicatedNgnAccount?.accountNumber ?? "—"}</td>
                    <td style={{ ...cell(), color: "#8892a4", fontSize: 11 }}>{new Date(dev.createdAt).toLocaleDateString()}</td>
                    <td style={cell()}>
                      <button onClick={() => toggleSuspend(dev)} disabled={actionLoading === dev.id} style={{ fontSize: 11, background: dev.status === "active" ? "rgba(255,82,82,0.1)" : "rgba(0,200,83,0.1)", color: dev.status === "active" ? "#ff5252" : "#00c853", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                        {actionLoading === dev.id ? "..." : dev.status === "active" ? "Suspend" : "Unsuspend"}
                      </button>
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
