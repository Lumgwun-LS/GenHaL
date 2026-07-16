import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useUser, SignInButton } from "@clerk/react";
import { apiFetch } from "../lib/api";
import type {
  Developer, App, PaymentInitResult,
  LinkedAccount, PlatformRepo, AppRepoLink, UpdateRequest, PlatformId
} from "../lib/types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

const AFRICA_CATEGORIES = [
  "Mobile Money & Fintech","Agriculture & Farming","Health & Telemedicine","Education & E-Learning",
  "Logistics & Delivery","Food & Restaurant","Entertainment & Music","Social & Community",
  "Business & Commerce","Government & E-Services","Transport & Ride-Hailing","Utilities & Infrastructure",
  "Fashion & Beauty","Real Estate",
];

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending_payment: { bg: "rgba(255,179,0,0.1)",  color: "#ffb300", label: "💳 Awaiting Payment" },
  pending_review:  { bg: "rgba(124,77,255,0.1)", color: "#a78bfa", label: "🔍 Under Review" },
  approved:        { bg: "rgba(0,200,83,0.1)",   color: "#00c853", label: "✅ Live" },
  rejected:        { bg: "rgba(255,82,82,0.1)",  color: "#ff5252", label: "❌ Rejected" },
  draft:           { bg: "rgba(255,255,255,0.05)", color: "#8892a4", label: "📝 Draft" },
};

interface PlatformDef {
  id: PlatformId;
  name: string;
  icon: string;
  color: string;
  selfHosted?: boolean;
  needsPAT: boolean;
  hint: string;
}

const PLATFORMS: PlatformDef[] = [
  { id: "github",    name: "GitHub",    icon: "🐙", color: "#333",    needsPAT: true, hint: "Settings → Developer settings → Personal access tokens → repo scope" },
  { id: "gitlab",    name: "GitLab",    icon: "🦊", color: "#FC6D26", needsPAT: true, selfHosted: true, hint: "User Settings → Access Tokens → api + read_repository scopes" },
  { id: "gitbucket", name: "Gitbucket", icon: "🪣", color: "#2196F3", needsPAT: true, selfHosted: true, hint: "Your Gitbucket instance → Account → Applications → Generate Token" },
  { id: "bitbucket", name: "Bitbucket", icon: "🗂️", color: "#0052CC", needsPAT: true, hint: "Personal settings → App passwords → Repositories: Read" },
  { id: "heroku",    name: "Heroku",    icon: "🚂", color: "#430098", needsPAT: true, hint: "Account Settings → API Key" },
  { id: "netlify",   name: "Netlify",   icon: "🌐", color: "#00C7B7", needsPAT: true, hint: "User settings → Applications → Personal access tokens" },
  { id: "vercel",    name: "Vercel",    icon: "▲",  color: "#000",    needsPAT: true, hint: "Account Settings → Tokens → Create" },
  { id: "render",    name: "Render",    icon: "🎨", color: "#46E3B7", needsPAT: true, hint: "Account Settings → API Keys → Create API Key" },
];

// ── helpers ──────────────────────────────────────────────────────────────────

function card(extra?: React.CSSProperties): React.CSSProperties {
  return { background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18, ...extra };
}

// ── WalletCard ────────────────────────────────────────────────────────────────

function WalletCard({ dev }: { dev: Developer }) {
  return (
    <div style={{ background: "linear-gradient(135deg, #0a1628 0%, #0d2010 100%)", border: "1px solid rgba(0,200,83,0.15)", borderRadius: 16, padding: 24, marginBottom: 28 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#8892a4", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 16 }}>💳 Your Dedicated Accounts</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#00c853", marginBottom: 8, textTransform: "uppercase" }}>🇳🇬 NGN Account</div>
          {dev.dedicatedNgnAccount ? (
            <>
              <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>{dev.dedicatedNgnAccount.accountNumber}</div>
              <div style={{ fontSize: 13, color: "#8892a4" }}>{dev.dedicatedNgnAccount.bankName}</div>
              <div style={{ fontSize: 12, color: "#8892a4", marginTop: 4 }}>{dev.displayName}</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#8892a4" }}>{dev.paystackCustomerCode ? "⏳ Provisioning..." : "Contact support"}</div>
          )}
        </div>
        <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#ffb300", marginBottom: 8, textTransform: "uppercase" }}>💵 USD Account</div>
          {dev.dedicatedUsdAccount ? (
            <>
              <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>{dev.dedicatedUsdAccount.accountNumber}</div>
              <div style={{ fontSize: 13, color: "#8892a4" }}>{dev.dedicatedUsdAccount.bankName}</div>
            </>
          ) : <div style={{ fontSize: 13, color: "#8892a4" }}>Coming soon</div>}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#8892a4", marginTop: 14, lineHeight: 1.5 }}>
        ℹ️ Customers can pay into these accounts directly. Funds settle to your registered bank automatically.
      </div>
    </div>
  );
}

// ── AppSubmitForm ─────────────────────────────────────────────────────────────

function AppSubmitForm({ dev, onCreated }: { dev: Developer; onCreated: (app: App) => void }) {
  const [form, setForm] = useState({ name: "", tagline: "", description: "", category: AFRICA_CATEGORIES[0], platform: "android", iconUrl: "", downloadUrl: "", webUrl: "", currentVersion: "", screenshots: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!form.name || !form.tagline || !form.description || !form.iconUrl || !form.downloadUrl) { setError("All fields marked * are required, including a download link."); return; }
    setLoading(true);
    try {
      const app = await apiFetch<App>("/developers/me/apps", { method: "POST", body: JSON.stringify({ ...form, screenshots: form.screenshots ? form.screenshots.split("\n").map(s => s.trim()).filter(Boolean) : [] }) });
      onCreated(app);
    } catch (err: any) { setError(err.message ?? "Failed to submit."); } finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div><label className="form-label">App Name *</label><input className="input" value={form.name} onChange={e => set("name", e.target.value)} placeholder="My App" required /></div>
        <div><label className="form-label">Platform *</label>
          <select className="input" value={form.platform} onChange={e => set("platform", e.target.value)}>
            <option value="android">🤖 Android</option><option value="ios">🍎 iOS</option><option value="web">🌐 Web App</option><option value="all">📱 All Platforms</option>
          </select>
        </div>
      </div>
      <div><label className="form-label">Tagline *</label><input className="input" value={form.tagline} onChange={e => set("tagline", e.target.value)} placeholder="One sentence that describes your app" required /></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div><label className="form-label">Category *</label>
          <select className="input" value={form.category} onChange={e => set("category", e.target.value)}>
            {AFRICA_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div><label className="form-label">Version</label><input className="input" value={form.currentVersion} onChange={e => set("currentVersion", e.target.value)} placeholder="1.0.0" /></div>
      </div>
      <div><label className="form-label">Description *</label><textarea className="input" value={form.description} onChange={e => set("description", e.target.value)} placeholder="Detailed description..." style={{ minHeight: 100 }} required /></div>
      <div><label className="form-label">Icon URL *</label><input className="input" type="url" value={form.iconUrl} onChange={e => set("iconUrl", e.target.value)} placeholder="https://..." required /></div>
      <div>
        <label className="form-label">Download / Install Link *</label>
        <input className="input" type="url" value={form.downloadUrl} onChange={e => set("downloadUrl", e.target.value)} placeholder="https://..." required />
        <div style={{ fontSize: 11, color: "#8892a4", marginTop: 4 }}>APK link, App Store URL, Play Store URL, or web app URL</div>
      </div>
      <div><label className="form-label">Web App URL (optional)</label><input className="input" type="url" value={form.webUrl} onChange={e => set("webUrl", e.target.value)} placeholder="https://..." /></div>
      <div><label className="form-label">Screenshot URLs (optional, one per line)</label><textarea className="input" value={form.screenshots} onChange={e => set("screenshots", e.target.value)} placeholder="https://..." style={{ minHeight: 72 }} /></div>
      {error && <div style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff5252", fontSize: 14 }}>❌ {error}</div>}
      <div style={{ background: "rgba(255,179,0,0.08)", border: "1px solid rgba(255,179,0,0.2)", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#c0c8d8" }}>
        💳 After submission you'll pay the <strong style={{ color: "#ffb300" }}>NGN 25,000 publishing fee</strong> via Paystack or Interswitch.
      </div>
      <button className="btn-green" type="submit" disabled={loading} style={{ fontSize: 15, padding: 12 }}>{loading ? "Submitting..." : "Submit App →"}</button>
    </form>
  );
}

// ── PaymentModal ──────────────────────────────────────────────────────────────

function PaymentModal({ app, onClose }: { app: App; onClose: () => void }) {
  const [gateway, setGateway] = useState<"paystack"|"interswitch">("paystack");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handlePay() {
    setLoading(true); setError("");
    try {
      const result = await apiFetch<PaymentInitResult>("/payments/initiate", { method: "POST", body: JSON.stringify({ appId: app.id, gateway }) });
      if (result.gateway === "paystack") { window.location.href = result.authorizationUrl; }
      else if (result.gateway === "interswitch") {
        const form = document.createElement("form"); form.method = "POST"; form.action = result.paymentUrl;
        Object.entries(result.formData).forEach(([k, v]) => { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; form.appendChild(i); });
        document.body.appendChild(form); form.submit();
      }
    } catch (err: any) { setError(err.message ?? "Could not initiate payment."); setLoading(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 32, maxWidth: 440, width: "100%" }}>
        <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Pay Publishing Fee</h3>
        <p style={{ color: "#8892a4", fontSize: 14, marginBottom: 24 }}>Publishing <strong style={{ color: "#e8eaf0" }}>"{app.name}"</strong> — one-time fee of <strong style={{ color: "#00c853" }}>NGN 25,000</strong>.</p>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#8892a4", marginBottom: 10, textTransform: "uppercase" }}>Choose Payment Method</div>
        {(["paystack","interswitch"] as const).map(g => (
          <button key={g} onClick={() => setGateway(g)} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", background: gateway===g?"rgba(0,200,83,0.08)":"rgba(255,255,255,0.03)", border: `1.5px solid ${gateway===g?"#00c853":"rgba(255,255,255,0.08)"}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", marginBottom: 10, textAlign: "left" }}>
            <span style={{ fontSize: 24 }}>{g==="paystack"?"💚":"🔵"}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#e8eaf0" }}>{g==="paystack"?"Paystack":"Interswitch"}</div>
              <div style={{ fontSize: 12, color: "#8892a4" }}>{g==="paystack"?"Card, bank transfer, USSD":"Card, bank transfer (Verve, Mastercard, Visa)"}</div>
            </div>
            <span style={{ marginLeft: "auto", fontSize: 16, color: gateway===g?"#00c853":"#2a3040" }}>{gateway===g?"●":"○"}</span>
          </button>
        ))}
        {error && <div style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff5252", fontSize: 13, marginBottom: 14 }}>❌ {error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} className="btn-outline" style={{ flex: 1 }}>Cancel</button>
          <button onClick={handlePay} disabled={loading} className="btn-green" style={{ flex: 2, fontSize: 14 }}>{loading?"Redirecting...":`Pay NGN 25,000 via ${gateway==="paystack"?"Paystack":"Interswitch"}`}</button>
        </div>
      </div>
    </div>
  );
}

// ── ConnectModal ──────────────────────────────────────────────────────────────

function ConnectModal({ platform, existing, onClose, onSaved }: { platform: PlatformDef; existing?: LinkedAccount; onClose: () => void; onSaved: (a: LinkedAccount) => void }) {
  const [token, setToken] = useState("");
  const [instanceUrl, setInstanceUrl] = useState(existing?.instanceUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!token.trim()) { setError("Personal access token is required"); return; }
    setLoading(true); setError("");
    try {
      const body: any = { platform: platform.id, accessToken: token.trim() };
      if (instanceUrl.trim()) body.instanceUrl = instanceUrl.trim();
      const acct = await apiFetch<LinkedAccount>("/linked-accounts", { method: "POST", body: JSON.stringify(body) });
      onSaved(acct);
    } catch (err: any) { setError(err.message ?? "Verification failed"); } finally { setLoading(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 32, maxWidth: 460, width: "100%" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{platform.icon}</div>
        <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Connect {platform.name}</h3>
        <p style={{ color: "#8892a4", fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>Your token is encrypted and stored securely. It's only used to read your repos and fetch commit info.</p>

        {platform.selfHosted && (
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">{platform.name} Instance URL</label>
            <input className="input" value={instanceUrl} onChange={e => setInstanceUrl(e.target.value)} placeholder={`https://your-${platform.id}.company.com`} />
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Personal Access Token</label>
          <input className="input" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste your PAT here..." />
          <div style={{ fontSize: 11, color: "#8892a4", marginTop: 6, lineHeight: 1.5 }}>
            💡 {platform.hint}
          </div>
        </div>

        {error && <div style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff5252", fontSize: 13, marginBottom: 14 }}>❌ {error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} className="btn-outline" style={{ flex: 1 }}>Cancel</button>
          <button onClick={handleSave} disabled={loading} className="btn-green" style={{ flex: 2 }}>{loading ? "Verifying..." : `Connect ${platform.name}`}</button>
        </div>
      </motion.div>
    </div>
  );
}

// ── LinkRepoModal ─────────────────────────────────────────────────────────────

function LinkRepoModal({ app, accounts, onClose, onLinked }: { app: App; accounts: LinkedAccount[]; onClose: () => void; onLinked: (link: AppRepoLink) => void }) {
  const [accountId, setAccountId] = useState<number | null>(accounts[0]?.id ?? null);
  const [repos, setRepos] = useState<PlatformRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoPath, setRepoPath] = useState("");
  const [branch, setBranch] = useState("main");
  const [deploymentUrl, setDeploymentUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accountId) return;
    setReposLoading(true); setRepos([]); setRepoPath("");
    apiFetch<PlatformRepo[]>(`/linked-accounts/${accountId}/repos`)
      .then(r => { setRepos(r ?? []); if (r?.length) setBranch(r[0].defaultBranch ?? "main"); })
      .catch(() => {})
      .finally(() => setReposLoading(false));
  }, [accountId]);

  async function handleLink() {
    if (!accountId || !repoPath) { setError("Select a repository"); return; }
    setSaving(true); setError("");
    try {
      const link = await apiFetch<AppRepoLink>(`/apps/${app.id}/repo-link`, {
        method: "POST",
        body: JSON.stringify({ linkedAccountId: accountId, repoPath, branch, deploymentUrl: deploymentUrl || null }),
      });
      onLinked(link);
    } catch (err: any) { setError(err.message ?? "Failed to link repo"); setSaving(false); }
  }

  const selectedAccount = accounts.find(a => a.id === accountId);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 32, maxWidth: 520, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>🔗 Link Repository to "{app.name}"</h3>
        <p style={{ color: "#8892a4", fontSize: 13, marginBottom: 24 }}>Connect a source repo or deployment so you can request updates with admin approval.</p>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Platform Account</label>
          <select className="input" value={accountId ?? ""} onChange={e => setAccountId(Number(e.target.value))}>
            {accounts.map(a => <option key={a.id} value={a.id}>{PLATFORMS.find(p => p.id === a.platform)?.icon} {PLATFORMS.find(p => p.id === a.platform)?.name} — @{a.username}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Repository / App {reposLoading && <span style={{ color: "#8892a4", fontWeight: 400 }}>Loading...</span>}</label>
          {repos.length > 0 ? (
            <select className="input" value={repoPath} onChange={e => { const r = repos.find(r => r.path === e.target.value); setRepoPath(e.target.value); if (r) setBranch(r.defaultBranch); }}>
              <option value="">— select —</option>
              {repos.map(r => <option key={r.path} value={r.path}>{r.name} ({r.path})</option>)}
            </select>
          ) : (
            <input className="input" value={repoPath} onChange={e => setRepoPath(e.target.value)} placeholder={`e.g. ${selectedAccount?.username ?? "owner"}/my-app`} />
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <div><label className="form-label">Branch</label><input className="input" value={branch} onChange={e => setBranch(e.target.value)} placeholder="main" /></div>
          <div><label className="form-label">Live URL (optional)</label><input className="input" type="url" value={deploymentUrl} onChange={e => setDeploymentUrl(e.target.value)} placeholder="https://..." /></div>
        </div>

        {error && <div style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff5252", fontSize: 13, marginBottom: 14 }}>❌ {error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} className="btn-outline" style={{ flex: 1 }}>Cancel</button>
          <button onClick={handleLink} disabled={saving || !repoPath} className="btn-green" style={{ flex: 2 }}>{saving ? "Linking..." : "Link Repository"}</button>
        </div>
      </motion.div>
    </div>
  );
}

// ── RequestUpdateModal ────────────────────────────────────────────────────────

function RequestUpdateModal({ app, link, onClose, onRequested }: { app: App; link: AppRepoLink; onClose: () => void; onRequested: () => void }) {
  const [form, setForm] = useState({ newVersion: "", newDownloadUrl: "", newDescription: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit() {
    setLoading(true); setError("");
    try {
      await apiFetch(`/apps/${app.id}/request-update`, {
        method: "POST",
        body: JSON.stringify({ newVersion: form.newVersion || null, newDownloadUrl: form.newDownloadUrl || null, newDescription: form.newDescription || null }),
      });
      onRequested();
    } catch (err: any) { setError(err.message ?? "Failed to request update"); setLoading(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 32, maxWidth: 480, width: "100%" }}>
        <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>🔄 Request Update for "{app.name}"</h3>
        <div style={{ background: "rgba(0,200,83,0.06)", border: "1px solid rgba(0,200,83,0.15)", borderRadius: 10, padding: "12px 14px", marginBottom: 20, fontSize: 13, color: "#c0c8d8" }}>
          📡 Will fetch latest commit from <strong style={{ color: "#00c853" }}>{link.repoPath}</strong> <span style={{ color: "#8892a4" }}>({link.branch})</span> for admin review.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
          <div><label className="form-label">New Version (optional)</label><input className="input" value={form.newVersion} onChange={e => set("newVersion", e.target.value)} placeholder={`e.g. ${app.currentVersion ? `${app.currentVersion.replace(/\.\d+$/, '')}.${parseInt(app.currentVersion.split('.').pop()??'0')+1}` : "1.1.0"}`} /></div>
          <div><label className="form-label">New Download URL (optional — leave blank to keep current)</label><input className="input" type="url" value={form.newDownloadUrl} onChange={e => set("newDownloadUrl", e.target.value)} placeholder="https://..." /></div>
          <div><label className="form-label">Updated Description (optional)</label><textarea className="input" value={form.newDescription} onChange={e => set("newDescription", e.target.value)} placeholder="What changed in this update?" style={{ minHeight: 72 }} /></div>
        </div>
        {error && <div style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff5252", fontSize: 13, marginBottom: 14 }}>❌ {error}</div>}
        <div style={{ fontSize: 12, color: "#8892a4", marginBottom: 14 }}>⚠️ The update will only go live after a super admin approves it.</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} className="btn-outline" style={{ flex: 1 }}>Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="btn-green" style={{ flex: 2 }}>{loading ? "Submitting..." : "Request Update →"}</button>
        </div>
      </motion.div>
    </div>
  );
}

// ── PlatformsTab ──────────────────────────────────────────────────────────────

function PlatformsTab({ dev }: { dev: Developer }) {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<PlatformDef | null>(null);
  const [disconnecting, setDisconnecting] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<LinkedAccount[]>("/linked-accounts").then(r => setAccounts(r ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleDisconnect(id: number) {
    if (!confirm("Disconnect this platform? Existing repo links will be removed.")) return;
    setDisconnecting(id);
    try { await apiFetch(`/linked-accounts/${id}`, { method: "DELETE" }); setAccounts(p => p.filter(a => a.id !== id)); }
    catch { alert("Failed to disconnect"); } finally { setDisconnecting(null); }
  }

  const connectedIds = new Set(accounts.map(a => a.platform));

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>🔗 Connected Platforms</h3>
        <p style={{ color: "#8892a4", fontSize: 13 }}>Link your source code hosts and deployment platforms. We use your PAT to read repos and fetch the latest commit info for update requests — we never push code.</p>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40 }}><div className="spinner" style={{ margin: "0 auto" }} /></div> : (
        <>
          {/* Connected accounts */}
          {accounts.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#8892a4", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Connected</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {accounts.map(acct => {
                  const pdef = PLATFORMS.find(p => p.id === acct.platform);
                  return (
                    <motion.div key={acct.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} style={{ ...card(), display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ fontSize: 28, flexShrink: 0 }}>{pdef?.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{pdef?.name}</div>
                        <div style={{ fontSize: 12, color: "#8892a4" }}>@{acct.username ?? acct.displayName} · {acct.instanceUrl ?? "cloud"}</div>
                      </div>
                      <span style={{ fontSize: 11, background: "rgba(0,200,83,0.1)", color: "#00c853", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>✓ Connected</span>
                      <button
                        onClick={() => handleDisconnect(acct.id)}
                        disabled={disconnecting === acct.id}
                        style={{ background: "rgba(255,82,82,0.1)", color: "#ff5252", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}
                      >{disconnecting === acct.id ? "..." : "Disconnect"}</button>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available platforms grid */}
          <div style={{ fontSize: 12, fontWeight: 700, color: "#8892a4", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Available Platforms</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {PLATFORMS.map(pdef => {
              const isConnected = connectedIds.has(pdef.id);
              return (
                <motion.div key={pdef.id} whileHover={{ scale: 1.03, y: -2 }} style={{ ...card({ cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }) }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 26 }}>{pdef.icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{pdef.name}</div>
                      {pdef.selfHosted && <div style={{ fontSize: 10, color: "#8892a4" }}>Self-hosted supported</div>}
                    </div>
                    {isConnected && <span style={{ marginLeft: "auto", fontSize: 11, color: "#00c853" }}>✓</span>}
                  </div>
                  <button
                    onClick={() => setConnecting(pdef)}
                    className={isConnected ? "btn-outline" : "btn-green"}
                    style={{ fontSize: 12, padding: "6px 14px", width: "100%" }}
                  >{isConnected ? "Reconnect" : "Connect"}</button>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      {/* Connect modal */}
      {connecting && (
        <ConnectModal
          platform={connecting}
          existing={accounts.find(a => a.platform === connecting.id)}
          onClose={() => setConnecting(null)}
          onSaved={acct => {
            setAccounts(p => { const updated = p.filter(a => a.platform !== acct.platform); return [acct, ...updated]; });
            setConnecting(null);
          }}
        />
      )}
    </div>
  );
}

// ── AppsTab (with repo link + request update) ─────────────────────────────────

function AppsTab({ apps, onPayApp, onRefresh }: { apps: App[]; onPayApp: (a: App) => void; onRefresh: () => void }) {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [repoLinks, setRepoLinks] = useState<Record<number, AppRepoLink | null>>({});
  const [linkingApp, setLinkingApp] = useState<App | null>(null);
  const [updatingApp, setUpdatingApp] = useState<{ app: App; link: AppRepoLink } | null>(null);

  useEffect(() => {
    apiFetch<LinkedAccount[]>("/linked-accounts").then(r => setAccounts(r ?? [])).catch(() => {});
    // Fetch repo links for each approved/review app
    apps.forEach(app => {
      apiFetch<AppRepoLink | null>(`/apps/${app.id}/repo-link`)
        .then(link => setRepoLinks(p => ({ ...p, [app.id]: link })))
        .catch(() => setRepoLinks(p => ({ ...p, [app.id]: null })));
    });
  }, [apps.map(a => a.id).join(",")]);

  if (!apps.length) return (
    <div style={{ textAlign: "center", padding: "60px 0" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
      <div style={{ color: "#8892a4", fontSize: 14, marginBottom: 20 }}>No apps yet.</div>
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {apps.map(app => {
          const s = STATUS_STYLE[app.status] ?? STATUS_STYLE.draft;
          const link = repoLinks[app.id];
          const pdef = link ? PLATFORMS.find(p => p.id === link.platform) : null;
          return (
            <motion.div key={app.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ ...card({ display: "flex", flexDirection: "column", gap: 12 }) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <img src={app.iconUrl} alt={app.name} style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", background: "#131920", flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).src = `https://placehold.co/48x48/0d1117/00c853?text=${app.name[0]}`; }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{app.name}</div>
                  <div style={{ fontSize: 12, color: "#8892a4" }}>{app.category} · {app.platform} {app.currentVersion && `· v${app.currentVersion}`}</div>
                  {app.rejectionReason && <div style={{ fontSize: 12, color: "#ff5252", marginTop: 2 }}>Reason: {app.rejectionReason}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ background: s.bg, color: s.color, padding: "4px 10px", borderRadius: 16, fontSize: 12, fontWeight: 600 }}>{s.label}</span>
                  {app.status === "pending_payment" && <button className="btn-green" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => onPayApp(app)}>Pay NGN 25K</button>}
                  {app.status === "approved" && <Link href={`/apps/${app.slug}`} style={{ color: "#00c853", fontSize: 12 }}>View →</Link>}
                </div>
              </div>

              {/* Repo link section */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {link ? (
                  <>
                    <span style={{ fontSize: 18 }}>{pdef?.icon ?? "🔗"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#e8eaf0" }}>{link.repoPath} <span style={{ color: "#8892a4", fontWeight: 400 }}>({link.branch})</span></div>
                      {link.lastCommitSha && <div style={{ fontSize: 11, color: "#8892a4", fontFamily: "monospace" }}>
                        Last: {link.lastCommitSha} · {link.lastCommitMessage?.slice(0, 60)}
                      </div>}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setUpdatingApp({ app, link })} className="btn-green" style={{ fontSize: 12, padding: "5px 14px" }}>🔄 Request Update</button>
                      <button onClick={() => setLinkingApp(app)} className="btn-outline" style={{ fontSize: 12, padding: "5px 12px" }}>Change</button>
                    </div>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 13, color: "#8892a4", flex: 1 }}>No repository linked</span>
                    <button
                      onClick={() => { if (!accounts.length) { alert("Connect a platform first (Platforms tab)"); return; } setLinkingApp(app); }}
                      className="btn-outline"
                      style={{ fontSize: 12, padding: "5px 14px" }}
                    >🔗 Link Repo</button>
                  </>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {linkingApp && accounts.length > 0 && (
        <LinkRepoModal
          app={linkingApp}
          accounts={accounts}
          onClose={() => setLinkingApp(null)}
          onLinked={link => { setRepoLinks(p => ({ ...p, [linkingApp.id]: link })); setLinkingApp(null); }}
        />
      )}
      {updatingApp && (
        <RequestUpdateModal
          app={updatingApp.app}
          link={updatingApp.link}
          onClose={() => setUpdatingApp(null)}
          onRequested={() => { setUpdatingApp(null); alert("Update request submitted! An admin will review it."); }}
        />
      )}
    </>
  );
}

// ── DeveloperDashboard ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  approved:        "#00c853",
  pending_review:  "#a78bfa",
  pending_payment: "#ffb300",
  rejected:        "#ff5252",
  draft:           "#556070",
};

function DeveloperDashboard({ apps, onPayApp, onSubmit }: {
  apps: App[];
  onPayApp: (a: App) => void;
  onSubmit: () => void;
}) {
  // Per-app download data for bar chart
  const downloadData = useMemo(
    () => apps.map(a => ({ name: a.name.length > 14 ? a.name.slice(0, 12) + "…" : a.name, downloads: a.totalDownloads }))
         .sort((a, b) => b.downloads - a.downloads).slice(0, 8),
    [apps]
  );

  // Status distribution
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    apps.forEach(a => { counts[a.status] = (counts[a.status] ?? 0) + 1; });
    return Object.entries(counts).map(([status, count]) => ({ status, count, label: STATUS_STYLE[status]?.label ?? status }));
  }, [apps]);

  // Rating distribution (1–5 stars)
  const ratingDist = useMemo(() => {
    const dist: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    apps.forEach(a => { if (a.ratingCount > 0) dist[Math.round(a.rating)] = (dist[Math.round(a.rating)] ?? 0) + a.ratingCount; });
    return [5, 4, 3, 2, 1].map(s => ({ stars: `${s}★`, count: dist[s] ?? 0 }));
  }, [apps]);

  const totalDownloads = apps.reduce((s, a) => s + a.totalDownloads, 0);
  const ratedApps = apps.filter(a => a.rating > 0);
  const avgRating = ratedApps.length ? (ratedApps.reduce((s, a) => s + a.rating, 0) / ratedApps.length) : null;

  const kpis = [
    { label: "Total Apps",      value: apps.length,                                              icon: "📱" },
    { label: "Live Apps",       value: apps.filter(a => a.status === "approved").length,          icon: "✅", color: "#00c853" },
    { label: "Total Downloads", value: totalDownloads.toLocaleString(),                          icon: "📥", color: "#7c4dff" },
    { label: "Avg Rating",      value: avgRating != null ? `${avgRating.toFixed(1)} ⭐` : "—",   icon: "⭐", color: "#ffb300" },
    { label: "Total Reviews",   value: apps.reduce((s, a) => s + (a.ratingCount ?? 0), 0),       icon: "💬" },
    { label: "Pending",         value: apps.filter(a => a.status === "pending_review").length,   icon: "🔍", color: "#a78bfa" },
  ];

  return (
    <div>
      {/* KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 32 }}>
        {kpis.map(s => (
          <div key={s.label} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color ?? "#e8eaf0" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#8892a4" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Pending payment banner */}
      {apps.filter(a => a.status === "pending_payment").length > 0 && (
        <div style={{ background: "rgba(255,179,0,0.05)", border: "1px solid rgba(255,179,0,0.15)", borderRadius: 14, padding: 20, marginBottom: 28 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, color: "#ffb300" }}>💳 Awaiting Payment</div>
          {apps.filter(a => a.status === "pending_payment").map(app => (
            <div key={app.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontSize: 14 }}>{app.name}</span>
              <button className="btn-green" style={{ fontSize: 13, padding: "6px 16px" }} onClick={() => onPayApp(app)}>Pay NGN 25,000</button>
            </div>
          ))}
        </div>
      )}

      {apps.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
          <div style={{ color: "#8892a4", fontSize: 14, marginBottom: 20 }}>Submit your first app for NGN 25,000.</div>
          <button className="btn-green" onClick={onSubmit}>Submit Your First App</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Downloads per app */}
          <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20, gridColumn: downloadData.length > 3 ? "1 / -1" : "auto" }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16, color: "#c0c8d8" }}>📥 Downloads by App</div>
            {downloadData.every(d => d.downloads === 0) ? (
              <div style={{ color: "#8892a4", fontSize: 13, textAlign: "center", padding: "24px 0" }}>No downloads recorded yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={downloadData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#8892a4" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#8892a4" }} />
                  <Tooltip
                    contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [v.toLocaleString(), "Downloads"]}
                  />
                  <Bar dataKey="downloads" radius={[4, 4, 0, 0]}>
                    {downloadData.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? "#00c853" : i === 1 ? "#7c4dff" : "#3d8bff"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Status distribution */}
          <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16, color: "#c0c8d8" }}>🗂 App Status</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {statusData.map(s => {
                const pct = Math.round((s.count / apps.length) * 100);
                return (
                  <div key={s.status}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: STATUS_COLORS[s.status] ?? "#8892a4" }}>{s.label}</span>
                      <span style={{ color: "#8892a4" }}>{s.count} · {pct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: STATUS_COLORS[s.status] ?? "#556070" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rating distribution */}
          <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16, color: "#c0c8d8" }}>⭐ Rating Distribution</div>
            {ratingDist.every(r => r.count === 0) ? (
              <div style={{ color: "#8892a4", fontSize: 13, textAlign: "center", padding: "24px 0" }}>No ratings yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {ratingDist.map(r => {
                  const total = ratingDist.reduce((s, x) => s + x.count, 0);
                  const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
                  return (
                    <div key={r.stars} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "#ffb300", width: 24, textAlign: "right" }}>{r.stars}</span>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 4, background: "#ffb300" }} />
                      </div>
                      <span style={{ fontSize: 11, color: "#8892a4", width: 24 }}>{r.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top performers table */}
          {totalDownloads > 0 && (
            <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16, color: "#c0c8d8" }}>🏆 Top Performers</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[...apps].sort((a, b) => b.totalDownloads - a.totalDownloads).slice(0, 5).map((app, i) => (
                  <div key={app.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? "#ffb300" : "#8892a4", width: 18 }}>#{i + 1}</span>
                    {app.iconUrl && <img src={app.iconUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.name}</div>
                      <div style={{ fontSize: 11, color: "#8892a4" }}>{app.totalDownloads.toLocaleString()} downloads · {app.rating > 0 ? `${app.rating.toFixed(1)}★` : "no rating"}</div>
                    </div>
                    <div style={{ fontSize: 11, ...STATUS_STYLE[app.status] ? { color: STATUS_COLORS[app.status] } : {} }}>{STATUS_STYLE[app.status]?.label ?? app.status}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main DeveloperPortal ──────────────────────────────────────────────────────

type View = "dashboard" | "apps" | "platforms" | "submit";

export default function DeveloperPortal() {
  const { isSignedIn } = useUser();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const [dev, setDev] = useState<Developer | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [paymentApp, setPaymentApp] = useState<App | null>(null);

  const searchParams = new URLSearchParams(searchString);
  const paymentGateway = searchParams.get("payment");
  const paymentRef = searchParams.get("ref");
  const paymentStatus = searchParams.get("status");
  const justRegistered = searchParams.get("registered") === "1";

  const loadData = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const [d, a] = await Promise.all([
        apiFetch<Developer & { totalApps: number; totalDownloads: number }>("/developers/me"),
        apiFetch<App[]>("/developers/me/apps"),
      ]);
      setDev(d); setApps(a ?? []);
    } catch {} finally { setLoading(false); }
  }, [isSignedIn]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (paymentGateway === "paystack" && paymentRef) {
      apiFetch("/payments/paystack/verify", { method: "POST", body: JSON.stringify({ reference: paymentRef }) }).then(() => loadData()).catch(() => {});
    } else if (paymentGateway === "interswitch" && paymentStatus === "success") { loadData(); }
  }, [paymentGateway, paymentRef, paymentStatus]);

  if (!isSignedIn) return (
    <div style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🌍</div>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Developer Portal</h2>
      <p style={{ color: "#8892a4", marginBottom: 28 }}>Sign in to manage your apps on Africa App Store.</p>
      <SignInButton mode="modal"><button className="btn-green" style={{ fontSize: 15, padding: "12px 32px" }}>Sign In</button></SignInButton>
    </div>
  );

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><div className="spinner" style={{ margin: "0 auto" }} /></div>;

  if (!dev) return (
    <div style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🚀</div>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Become a Developer</h2>
      <p style={{ color: "#8892a4", marginBottom: 28 }}>Join Africa App Store — free registration, then NGN 25,000 per app published.</p>
      <Link href="/developer/signup" className="btn-green" style={{ display: "inline-flex", fontSize: 15, padding: "12px 32px" }}>Create Developer Account →</Link>
    </div>
  );

  const TABS: { id: View; label: string }[] = [
    { id: "dashboard", label: "📊 Overview" },
    { id: "apps",      label: `📱 My Apps (${apps.length})` },
    { id: "platforms", label: "🔗 Platforms" },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px 80px" }}>
      {/* Banners */}
      {justRegistered && <div style={{ background: "rgba(0,200,83,0.08)", border: "1px solid rgba(0,200,83,0.2)", borderRadius: 12, padding: "14px 18px", marginBottom: 24, color: "#00c853", fontSize: 14 }}>🎉 Welcome! Your developer account is ready. Your dedicated NGN bank account will appear once provisioned by Paystack.</div>}
      {paymentGateway && paymentStatus === "success" && <div style={{ background: "rgba(0,200,83,0.08)", border: "1px solid rgba(0,200,83,0.2)", borderRadius: 12, padding: "14px 18px", marginBottom: 24, color: "#00c853", fontSize: 14 }}>✅ Payment confirmed! Your app is under review.</div>}
      {paymentGateway && paymentStatus === "failed" && <div style={{ background: "rgba(255,82,82,0.08)", border: "1px solid rgba(255,82,82,0.2)", borderRadius: 12, padding: "14px 18px", marginBottom: 24, color: "#ff5252", fontSize: 14 }}>❌ Payment not completed. Try again from your apps list.</div>}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg, #00c853, #7c4dff)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22, color: "#fff", flexShrink: 0 }}>{dev.displayName[0]}</div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }}>{dev.displayName}</h1>
          <div style={{ fontSize: 13, color: "#8892a4" }}>{dev.country} · {dev.company ?? "Independent Developer"}</div>
        </div>
        {view !== "submit" ? (
          <button className="btn-green" onClick={() => setView("submit")} style={{ fontSize: 14 }}>+ Submit App</button>
        ) : (
          <button className="btn-outline" onClick={() => setView("dashboard")} style={{ fontSize: 14 }}>← Dashboard</button>
        )}
      </div>

      <WalletCard dev={dev} />

      {/* Tabs */}
      {view !== "submit" && (
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 28 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setView(t.id)} style={{ padding: "10px 20px", background: "none", border: "none", borderBottom: view === t.id ? "2px solid #00c853" : "2px solid transparent", color: view === t.id ? "#00c853" : "#8892a4", fontWeight: view === t.id ? 700 : 400, fontSize: 14, cursor: "pointer" }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Submit */}
      {view === "submit" && (
        <div>
          <h2 style={{ fontWeight: 800, fontSize: 20, marginBottom: 24 }}>Submit New App</h2>
          <AppSubmitForm dev={dev} onCreated={app => { setApps(p => [app, ...p]); setPaymentApp(app); setView("apps"); }} />
        </div>
      )}

      {/* Dashboard */}
      {view === "dashboard" && (
        <DeveloperDashboard apps={apps} onPayApp={setPaymentApp} onSubmit={() => setView("submit")} />
      )}

      {/* Apps */}
      {view === "apps" && <AppsTab apps={apps} onPayApp={setPaymentApp} onRefresh={loadData} />}

      {/* Platforms */}
      {view === "platforms" && <PlatformsTab dev={dev} />}

      {/* Payment modal */}
      {paymentApp && <PaymentModal app={paymentApp} onClose={() => { setPaymentApp(null); loadData(); }} />}
    </div>
  );
}
