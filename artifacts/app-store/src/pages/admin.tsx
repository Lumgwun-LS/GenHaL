import { useState, useEffect } from "react";
import { useUser } from "@clerk/react";
import { apiFetch } from "../lib/api";
import type { App, AdminStats, Developer } from "../lib/types";

const STATUS_COLOR: Record<string, string> = {
  pending_payment: "#ffb300", pending_review: "#a78bfa",
  approved: "#00c853", rejected: "#ff5252", draft: "#8892a4",
};

export default function Admin() {
  const { isSignedIn } = useUser();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pending, setPending] = useState<App[]>([]);
  const [allApps, setAllApps] = useState<App[]>([]);
  const [devs, setDevs] = useState<Developer[]>([]);
  const [tab, setTab] = useState<"overview"|"pending"|"all"|"developers">("overview");
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [aiLoading, setAiLoading] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [aiResults, setAiResults] = useState<Record<number, any>>({});
  const [downloadAppId, setDownloadAppId] = useState<number | null>(null);
  const [downloadUrl, setDownloadUrl] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const [s, p, a, d] = await Promise.all([
        apiFetch<AdminStats>("/admin/stats"),
        apiFetch<App[]>("/admin/apps/pending"),
        apiFetch<App[]>("/admin/apps"),
        apiFetch<Developer[]>("/admin/developers"),
      ]);
      setStats(s);
      setPending(p ?? []);
      setAllApps(a ?? []);
      setDevs(d ?? []);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { if (isSignedIn) loadData(); }, [isSignedIn]);

  async function aiReview(id: number) {
    setAiLoading(id);
    try {
      const r = await apiFetch<any>(`/admin/apps/${id}/ai-review`, { method: "POST" });
      setAiResults(prev => ({ ...prev, [id]: r }));
    } catch {}
    finally { setAiLoading(null); }
  }

  async function approve(id: number) {
    setActionLoading(id);
    try { await apiFetch(`/admin/apps/${id}/approve`, { method: "POST" }); await loadData(); }
    catch {} finally { setActionLoading(null); }
  }

  async function reject(id: number) {
    if (!rejectReason) return;
    setActionLoading(id);
    try { await apiFetch(`/admin/apps/${id}/reject`, { method: "POST", body: JSON.stringify({ reason: rejectReason }) }); setRejectId(null); setRejectReason(""); await loadData(); }
    catch {} finally { setActionLoading(null); }
  }

  async function toggleFeature(id: number) {
    setActionLoading(id);
    try { await apiFetch(`/admin/apps/${id}/feature`, { method: "POST" }); await loadData(); }
    catch {} finally { setActionLoading(null); }
  }

  async function toggleSuspend(devId: number) {
    try { await apiFetch(`/admin/developers/${devId}/suspend`, { method: "POST", body: JSON.stringify({ reason: "Policy violation" }) }); await loadData(); }
    catch {}
  }

  async function assignDownload(id: number) {
    if (!downloadUrl) return;
    try { await apiFetch(`/admin/apps/${id}/assign-download`, { method: "POST", body: JSON.stringify({ downloadUrl }) }); setDownloadAppId(null); setDownloadUrl(""); await loadData(); }
    catch {}
  }

  if (!isSignedIn) return <div style={{ textAlign: "center", padding: 80, color: "#8892a4" }}>Sign in as admin to access this panel.</div>;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 20px 80px" }}>
      <h1 style={{ fontWeight: 800, fontSize: 24, marginBottom: 4 }}>🌍 Africa App Store — Admin</h1>
      <p style={{ color: "#8892a4", fontSize: 14, marginBottom: 28 }}>Review and manage apps, developers, and platform settings.</p>

      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 28 }}>
        {(["overview","pending","all","developers"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 18px", background: "none", border: "none", borderBottom: tab === t ? "2px solid #00c853" : "2px solid transparent", color: tab === t ? "#00c853" : "#8892a4", fontWeight: tab === t ? 700 : 400, fontSize: 13, cursor: "pointer", textTransform: "capitalize" }}>
            {t === "pending" ? `🔍 Pending (${pending.length})` : t === "all" ? `📱 All Apps` : t === "developers" ? `👥 Developers (${devs.length})` : "📊 Overview"}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40 }}><div className="spinner" style={{ margin: "0 auto" }} /></div>}

      {!loading && tab === "overview" && stats && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, marginBottom: 32 }}>
            {[
              { label: "Total Apps", value: stats.totalApps, icon: "📱" },
              { label: "Awaiting Payment", value: stats.pendingPayment, icon: "💳", color: "#ffb300" },
              { label: "Pending Review", value: stats.pendingReview, icon: "🔍", color: "#a78bfa" },
              { label: "Live Apps", value: stats.approvedApps, icon: "✅", color: "#00c853" },
              { label: "Developers", value: stats.totalDevelopers, icon: "👥" },
              { label: "Total Downloads", value: stats.totalDownloads.toLocaleString(), icon: "📥" },
            ].map(s => (
              <div key={s.label} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color ?? "#e8eaf0" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#8892a4" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && tab === "pending" && (
        <div>
          {pending.length === 0 ? <div style={{ color: "#8892a4", fontSize: 14, padding: "40px 0", textAlign: "center" }}>No apps pending review. 🎉</div> : pending.map(app => (
            <div key={app.id} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
                <img src={app.iconUrl} alt={app.name} style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover", background: "#131920", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{app.name}</div>
                  <div style={{ fontSize: 13, color: "#8892a4" }}>{app.developerName} · {app.category} · {app.platform}</div>
                  <div style={{ fontSize: 13, color: "#c0c8d8", marginTop: 6, lineHeight: 1.5 }}>{app.tagline}</div>
                  {app.downloadUrl && <div style={{ fontSize: 12, color: "#00c853", marginTop: 4 }}>🔗 {app.downloadUrl}</div>}
                </div>
              </div>

              {aiResults[app.id] && (
                <div style={{ background: "rgba(124,77,255,0.05)", border: "1px solid rgba(124,77,255,0.15)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: "#a78bfa", marginBottom: 8 }}>🤖 AI REVIEW RESULT</div>
                  <p style={{ fontSize: 13, color: "#c0c8d8", marginBottom: 8 }}>{aiResults[app.id].summary}</p>
                  {aiResults[app.id].africanRelevance && <p style={{ fontSize: 12, color: "#8892a4", marginBottom: 8 }}>🌍 Africa relevance: {aiResults[app.id].africanRelevance}</p>}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ background: aiResults[app.id].score >= 70 ? "rgba(0,200,83,0.1)" : "rgba(255,179,0,0.1)", color: aiResults[app.id].score >= 70 ? "#00c853" : "#ffb300", border: "1px solid", borderColor: aiResults[app.id].score >= 70 ? "rgba(0,200,83,0.3)" : "rgba(255,179,0,0.3)", borderRadius: 10, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>Score: {aiResults[app.id].score}/100</span>
                    <span style={{ background: "rgba(124,77,255,0.1)", color: "#a78bfa", border: "1px solid rgba(124,77,255,0.3)", borderRadius: 10, padding: "2px 10px", fontSize: 12 }}>Recommendation: {aiResults[app.id].recommendation}</span>
                    {aiResults[app.id].policyFlags?.length > 0 && <span style={{ background: "rgba(255,82,82,0.1)", color: "#ff5252", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 10, padding: "2px 10px", fontSize: 12 }}>⚠️ Flags: {aiResults[app.id].policyFlags.join(", ")}</span>}
                  </div>
                </div>
              )}

              {rejectId === app.id && (
                <div style={{ background: "rgba(255,82,82,0.05)", border: "1px solid rgba(255,82,82,0.2)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <label className="form-label">Rejection Reason</label>
                  <textarea className="input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Explain why this app is rejected..." style={{ minHeight: 72 }} />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => setRejectId(null)} className="btn-outline" style={{ fontSize: 13 }}>Cancel</button>
                    <button onClick={() => reject(app.id)} disabled={!rejectReason || actionLoading === app.id} style={{ background: "#ff5252", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Confirm Reject</button>
                  </div>
                </div>
              )}

              {downloadAppId === app.id && (
                <div style={{ background: "rgba(0,200,83,0.05)", border: "1px solid rgba(0,200,83,0.2)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <label className="form-label">Assign Download Link</label>
                  <input className="input" value={downloadUrl} onChange={e => setDownloadUrl(e.target.value)} placeholder="https://..." />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => setDownloadAppId(null)} className="btn-outline" style={{ fontSize: 13 }}>Cancel</button>
                    <button onClick={() => assignDownload(app.id)} className="btn-green" style={{ fontSize: 13 }}>Save Link</button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => aiReview(app.id)} disabled={aiLoading === app.id} style={{ background: "rgba(124,77,255,0.15)", color: "#a78bfa", border: "1px solid rgba(124,77,255,0.3)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  {aiLoading === app.id ? "Analyzing..." : "🤖 AI Review"}
                </button>
                <button onClick={() => setDownloadAppId(app.id)} style={{ background: "rgba(0,188,212,0.1)", color: "#00bcd4", border: "1px solid rgba(0,188,212,0.3)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>🔗 Assign Download</button>
                <button onClick={() => approve(app.id)} disabled={actionLoading === app.id} style={{ background: "rgba(0,200,83,0.15)", color: "#00c853", border: "1px solid rgba(0,200,83,0.3)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✅ Approve</button>
                <button onClick={() => { setRejectId(app.id); setRejectReason(""); }} style={{ background: "rgba(255,82,82,0.1)", color: "#ff5252", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>❌ Reject</button>
                <button onClick={() => toggleFeature(app.id)} disabled={actionLoading === app.id} style={{ background: "rgba(255,179,0,0.1)", color: "#ffb300", border: "1px solid rgba(255,179,0,0.3)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{app.isFeatured ? "★ Unfeature" : "☆ Feature"}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === "all" && (
        <div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["App","Developer","Category","Platform","Status","Downloads","Rating","Actions"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#8892a4", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allApps.map(app => (
                  <tr key={app.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "12px", display: "flex", alignItems: "center", gap: 8 }}>
                      <img src={app.iconUrl} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover", background: "#131920" }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{app.name}</div>
                        <div style={{ fontSize: 11, color: "#8892a4" }}>id:{app.id}</div>
                      </div>
                    </td>
                    <td style={{ padding: "12px", color: "#c0c8d8" }}>{app.developerName}</td>
                    <td style={{ padding: "12px", color: "#c0c8d8", fontSize: 12 }}>{app.category}</td>
                    <td style={{ padding: "12px", color: "#c0c8d8" }}>{app.platform}</td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ background: `rgba(${STATUS_COLOR[app.status] ? STATUS_COLOR[app.status].replace("#","") : "255,255,255"},0.1)`, color: STATUS_COLOR[app.status] ?? "#8892a4", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{app.status}</span>
                    </td>
                    <td style={{ padding: "12px", color: "#c0c8d8" }}>{app.totalDownloads.toLocaleString()}</td>
                    <td style={{ padding: "12px", color: "#ffb300" }}>{app.rating > 0 ? `★ ${app.rating.toFixed(1)}` : "—"}</td>
                    <td style={{ padding: "12px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {app.status === "pending_review" && <button onClick={() => approve(app.id)} style={{ background: "rgba(0,200,83,0.1)", color: "#00c853", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>Approve</button>}
                        <button onClick={() => toggleFeature(app.id)} style={{ background: "rgba(255,179,0,0.1)", color: "#ffb300", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>{app.isFeatured ? "Unfeature" : "Feature"}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === "developers" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                {["Developer","Email","Country","Status","NGN Account","Joined","Actions"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#8892a4", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devs.map(dev => (
                <tr key={dev.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontWeight: 600 }}>{dev.displayName}</div>
                    {dev.company && <div style={{ fontSize: 11, color: "#8892a4" }}>{dev.company}</div>}
                  </td>
                  <td style={{ padding: "12px", color: "#c0c8d8", fontSize: 12 }}>{dev.email}</td>
                  <td style={{ padding: "12px", color: "#c0c8d8" }}>{dev.country}</td>
                  <td style={{ padding: "12px" }}>
                    <span style={{ background: dev.status === "active" ? "rgba(0,200,83,0.1)" : "rgba(255,82,82,0.1)", color: dev.status === "active" ? "#00c853" : "#ff5252", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{dev.status}</span>
                  </td>
                  <td style={{ padding: "12px", color: "#8892a4", fontSize: 12, fontFamily: "monospace" }}>
                    {dev.dedicatedNgnAccount ? `${dev.dedicatedNgnAccount.accountNumber} (${dev.dedicatedNgnAccount.bankName})` : "—"}
                  </td>
                  <td style={{ padding: "12px", color: "#8892a4", fontSize: 12 }}>{new Date(dev.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: "12px" }}>
                    <button onClick={() => toggleSuspend(dev.id)} style={{ background: dev.status === "active" ? "rgba(255,82,82,0.1)" : "rgba(0,200,83,0.1)", color: dev.status === "active" ? "#ff5252" : "#00c853", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>
                      {dev.status === "active" ? "Suspend" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
