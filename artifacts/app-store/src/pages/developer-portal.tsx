import { useState, useEffect, useCallback } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { useUser, SignInButton } from "@clerk/react";
import { apiFetch } from "../lib/api";
import type { Developer, App, PaymentInitResult } from "../lib/types";

const AFRICA_CATEGORIES = [
  "Mobile Money & Fintech","Agriculture & Farming","Health & Telemedicine","Education & E-Learning",
  "Logistics & Delivery","Food & Restaurant","Entertainment & Music","Social & Community",
  "Business & Commerce","Government & E-Services","Transport & Ride-Hailing","Utilities & Infrastructure",
  "Fashion & Beauty","Real Estate",
];

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending_payment: { bg: "rgba(255,179,0,0.1)", color: "#ffb300", label: "💳 Awaiting Payment" },
  pending_review: { bg: "rgba(124,77,255,0.1)", color: "#a78bfa", label: "🔍 Under Review" },
  approved: { bg: "rgba(0,200,83,0.1)", color: "#00c853", label: "✅ Live" },
  rejected: { bg: "rgba(255,82,82,0.1)", color: "#ff5252", label: "❌ Rejected" },
  draft: { bg: "rgba(255,255,255,0.05)", color: "#8892a4", label: "📝 Draft" },
};

function WalletCard({ dev }: { dev: Developer }) {
  return (
    <div style={{ background: "linear-gradient(135deg, #0a1628 0%, #0d2010 100%)", border: "1px solid rgba(0,200,83,0.15)", borderRadius: 16, padding: 24, marginBottom: 28 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#8892a4", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 16 }}>💳 Your Dedicated Accounts</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* NGN Account */}
        <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#00c853", marginBottom: 8, textTransform: "uppercase" }}>🇳🇬 NGN Account</div>
          {dev.dedicatedNgnAccount ? (
            <>
              <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>{dev.dedicatedNgnAccount.accountNumber}</div>
              <div style={{ fontSize: 13, color: "#8892a4" }}>{dev.dedicatedNgnAccount.bankName}</div>
              <div style={{ fontSize: 12, color: "#8892a4", marginTop: 4 }}>{dev.displayName}</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#8892a4" }}>
              {dev.paystackCustomerCode ? "⏳ Account being provisioned..." : "Contact support to activate"}
            </div>
          )}
        </div>
        {/* USD Account */}
        <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#ffb300", marginBottom: 8, textTransform: "uppercase" }}>💵 USD Account</div>
          {dev.dedicatedUsdAccount ? (
            <>
              <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>{dev.dedicatedUsdAccount.accountNumber}</div>
              <div style={{ fontSize: 13, color: "#8892a4" }}>{dev.dedicatedUsdAccount.bankName}</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#8892a4" }}>Coming soon</div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#8892a4", marginTop: 14, lineHeight: 1.5 }}>
        ℹ️ Customers can pay into these accounts directly. Funds settle to your registered bank account automatically.
      </div>
    </div>
  );
}

function AppSubmitForm({ dev, onCreated }: { dev: Developer; onCreated: (app: App) => void }) {
  const [form, setForm] = useState({ name: "", tagline: "", description: "", category: AFRICA_CATEGORIES[0], platform: "android", iconUrl: "", downloadUrl: "", webUrl: "", currentVersion: "", screenshots: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: string) { setForm(prev => ({ ...prev, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name || !form.tagline || !form.description || !form.iconUrl || !form.downloadUrl) {
      setError("All fields marked * are required, including a download link.");
      return;
    }
    setLoading(true);
    try {
      const app = await apiFetch<App>("/developers/me/apps", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          screenshots: form.screenshots ? form.screenshots.split("\n").map(s => s.trim()).filter(Boolean) : [],
        }),
      });
      onCreated(app);
    } catch (err: any) {
      setError(err.message ?? "Failed to submit app.");
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label className="form-label">App Name *</label>
          <input className="input" value={form.name} onChange={e => set("name", e.target.value)} placeholder="My App" required />
        </div>
        <div>
          <label className="form-label">Platform *</label>
          <select className="input" value={form.platform} onChange={e => set("platform", e.target.value)}>
            <option value="android">🤖 Android (APK)</option>
            <option value="ios">🍎 iOS</option>
            <option value="web">🌐 Web App</option>
            <option value="all">📱 All Platforms</option>
          </select>
        </div>
      </div>
      <div>
        <label className="form-label">Tagline *</label>
        <input className="input" value={form.tagline} onChange={e => set("tagline", e.target.value)} placeholder="One sentence that describes your app" required />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label className="form-label">Category *</label>
          <select className="input" value={form.category} onChange={e => set("category", e.target.value)}>
            {AFRICA_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Version</label>
          <input className="input" value={form.currentVersion} onChange={e => set("currentVersion", e.target.value)} placeholder="1.0.0" />
        </div>
      </div>
      <div>
        <label className="form-label">Description *</label>
        <textarea className="input" value={form.description} onChange={e => set("description", e.target.value)} placeholder="Detailed description of your app, its features, and target audience..." style={{ minHeight: 120 }} required />
      </div>
      <div>
        <label className="form-label">Icon URL * <span style={{ color: "#8892a4", fontWeight: 400, fontSize: 11 }}>(direct image link, square, min 512×512)</span></label>
        <input className="input" type="url" value={form.iconUrl} onChange={e => set("iconUrl", e.target.value)} placeholder="https://..." required />
      </div>
      <div>
        <label className="form-label">Download / Install Link * <span style={{ color: "#8892a4", fontWeight: 400, fontSize: 11 }}>(APK link, App Store URL, Play Store URL, or web app URL)</span></label>
        <input className="input" type="url" value={form.downloadUrl} onChange={e => set("downloadUrl", e.target.value)} placeholder="https://..." required />
        <div style={{ fontSize: 11, color: "#8892a4", marginTop: 4 }}>⚠️ Every app must have a direct download or install link. This is shown to users.</div>
      </div>
      <div>
        <label className="form-label">Web App URL (optional)</label>
        <input className="input" type="url" value={form.webUrl} onChange={e => set("webUrl", e.target.value)} placeholder="https://..." />
      </div>
      <div>
        <label className="form-label">Screenshot URLs (optional, one per line)</label>
        <textarea className="input" value={form.screenshots} onChange={e => set("screenshots", e.target.value)} placeholder="https://screenshot1.png&#10;https://screenshot2.png" style={{ minHeight: 80 }} />
      </div>

      {error && <div style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff5252", fontSize: 14 }}>❌ {error}</div>}

      <div style={{ background: "rgba(255,179,0,0.08)", border: "1px solid rgba(255,179,0,0.2)", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#c0c8d8" }}>
        💳 After submission, you'll pay the <strong style={{ color: "#ffb300" }}>NGN 25,000 publishing fee</strong> via Paystack or Interswitch to send your app for review.
      </div>

      <button className="btn-green" type="submit" disabled={loading} style={{ fontSize: 15, padding: "12px", marginTop: 4 }}>
        {loading ? "Submitting..." : "Submit App →"}
      </button>
    </form>
  );
}

function PaymentModal({ app, onClose, onSuccess }: { app: App; onClose: () => void; onSuccess: () => void }) {
  const [gateway, setGateway] = useState<"paystack" | "interswitch">("paystack");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handlePay() {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<PaymentInitResult>("/payments/initiate", {
        method: "POST",
        body: JSON.stringify({ appId: app.id, gateway }),
      });
      if (result.gateway === "paystack") {
        window.location.href = result.authorizationUrl;
      } else if (result.gateway === "interswitch") {
        // Build and submit a form to Interswitch
        const form = document.createElement("form");
        form.method = "POST";
        form.action = result.paymentUrl;
        Object.entries(result.formData).forEach(([k, v]) => {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = k;
          input.value = v;
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
      }
    } catch (err: any) {
      setError(err.message ?? "Could not initiate payment.");
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 32, maxWidth: 440, width: "100%" }}>
        <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Pay Publishing Fee</h3>
        <p style={{ color: "#8892a4", fontSize: 14, marginBottom: 24 }}>
          Publishing <strong style={{ color: "#e8eaf0" }}>"{app.name}"</strong> requires a one-time fee of <strong style={{ color: "#00c853" }}>NGN 25,000</strong>.
        </p>

        <div style={{ fontWeight: 700, fontSize: 13, color: "#8892a4", marginBottom: 10, textTransform: "uppercase" }}>Choose Payment Method</div>

        {(["paystack","interswitch"] as const).map(g => (
          <button
            key={g}
            onClick={() => setGateway(g)}
            style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", background: gateway === g ? "rgba(0,200,83,0.08)" : "rgba(255,255,255,0.03)", border: `1.5px solid ${gateway === g ? "#00c853" : "rgba(255,255,255,0.08)"}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", marginBottom: 10, textAlign: "left" }}
          >
            <span style={{ fontSize: 24 }}>{g === "paystack" ? "💚" : "🔵"}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#e8eaf0" }}>{g === "paystack" ? "Paystack" : "Interswitch"}</div>
              <div style={{ fontSize: 12, color: "#8892a4" }}>{g === "paystack" ? "Card, bank transfer, USSD" : "Card, bank transfer (Verve, Mastercard, Visa)"}</div>
            </div>
            <span style={{ marginLeft: "auto", fontSize: 16, color: gateway === g ? "#00c853" : "#2a3040" }}>{gateway === g ? "●" : "○"}</span>
          </button>
        ))}

        {error && <div style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff5252", fontSize: 13, marginBottom: 14 }}>❌ {error}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} className="btn-outline" style={{ flex: 1 }}>Cancel</button>
          <button onClick={handlePay} disabled={loading} className="btn-green" style={{ flex: 2, fontSize: 14 }}>
            {loading ? "Redirecting..." : `Pay NGN 25,000 via ${gateway === "paystack" ? "Paystack" : "Interswitch"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DeveloperPortal() {
  const { isSignedIn } = useUser();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const [dev, setDev] = useState<Developer | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"dashboard"|"submit"|"apps">("dashboard");
  const [paymentApp, setPaymentApp] = useState<App | null>(null);

  // Payment return handling
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
      setDev(d);
      setApps(a ?? []);
    } catch {}
    finally { setLoading(false); }
  }, [isSignedIn]);

  useEffect(() => { loadData(); }, [loadData]);

  // Verify Paystack payment on return
  useEffect(() => {
    if (paymentGateway === "paystack" && paymentRef) {
      apiFetch("/payments/paystack/verify", { method: "POST", body: JSON.stringify({ reference: paymentRef }) })
        .then(() => loadData()).catch(() => {});
    } else if (paymentGateway === "interswitch" && paymentStatus === "success") {
      loadData();
    }
  }, [paymentGateway, paymentRef, paymentStatus]);

  if (!isSignedIn) {
    return (
      <div style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🌍</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Developer Portal</h2>
        <p style={{ color: "#8892a4", marginBottom: 28 }}>Sign in to manage your apps on Africa App Store.</p>
        <SignInButton mode="modal"><button className="btn-green" style={{ fontSize: 15, padding: "12px 32px" }}>Sign In</button></SignInButton>
      </div>
    );
  }

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><div className="spinner" style={{ margin: "0 auto" }} /></div>;

  if (!dev) {
    return (
      <div style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🚀</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Become a Developer</h2>
        <p style={{ color: "#8892a4", marginBottom: 8 }}>Join Africa App Store — free registration, then NGN 25,000 per app published.</p>
        <p style={{ color: "#8892a4", marginBottom: 28, fontSize: 14 }}>A dedicated NGN bank account is created for you automatically.</p>
        <Link href="/developer/signup" className="btn-green" style={{ display: "inline-flex", fontSize: 15, padding: "12px 32px", textDecoration: "none" }}>Create Developer Account →</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px 80px" }}>

      {/* Success banners */}
      {justRegistered && <div style={{ background: "rgba(0,200,83,0.08)", border: "1px solid rgba(0,200,83,0.2)", borderRadius: 12, padding: "14px 18px", marginBottom: 24, color: "#00c853", fontSize: 14 }}>🎉 Welcome to Africa App Store! Your developer account is ready. Your dedicated NGN bank account will appear below once provisioned by Paystack.</div>}
      {paymentGateway && paymentStatus === "success" && <div style={{ background: "rgba(0,200,83,0.08)", border: "1px solid rgba(0,200,83,0.2)", borderRadius: 12, padding: "14px 18px", marginBottom: 24, color: "#00c853", fontSize: 14 }}>✅ Payment confirmed! Your app has been submitted for review. Our team will review it within 2-3 business days.</div>}
      {paymentGateway && paymentStatus === "failed" && <div style={{ background: "rgba(255,82,82,0.08)", border: "1px solid rgba(255,82,82,0.2)", borderRadius: 12, padding: "14px 18px", marginBottom: 24, color: "#ff5252", fontSize: 14 }}>❌ Payment was not completed. Please try again from your apps list.</div>}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg, #00c853, #7c4dff)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22, color: "#fff", flexShrink: 0 }}>{dev.displayName[0]}</div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }}>{dev.displayName}</h1>
          <div style={{ fontSize: 13, color: "#8892a4" }}>{dev.country} · {dev.company ?? "Independent Developer"}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {view !== "submit" ? (
            <button className="btn-green" onClick={() => setView("submit")} style={{ fontSize: 14 }}>+ Submit App</button>
          ) : (
            <button className="btn-outline" onClick={() => setView("dashboard")} style={{ fontSize: 14 }}>← Dashboard</button>
          )}
        </div>
      </div>

      {/* Wallet Card */}
      <WalletCard dev={dev} />

      {/* Tabs */}
      {view !== "submit" && (
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 24 }}>
          {(["dashboard","apps"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: "10px 20px", background: "none", border: "none", borderBottom: view === v ? "2px solid #00c853" : "2px solid transparent", color: view === v ? "#00c853" : "#8892a4", fontWeight: view === v ? 700 : 400, fontSize: 14, cursor: "pointer", textTransform: "capitalize" }}>
              {v === "dashboard" ? "📊 Overview" : `📱 My Apps (${apps.length})`}
            </button>
          ))}
        </div>
      )}

      {view === "submit" && (
        <div>
          <h2 style={{ fontWeight: 800, fontSize: 20, marginBottom: 24 }}>Submit New App</h2>
          <AppSubmitForm dev={dev} onCreated={app => { setApps(prev => [app, ...prev]); setPaymentApp(app); setView("apps"); }} />
        </div>
      )}

      {view === "dashboard" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 32 }}>
            {[
              { label: "Total Apps", value: apps.length, icon: "📱" },
              { label: "Live Apps", value: apps.filter(a => a.status === "approved").length, icon: "✅", color: "#00c853" },
              { label: "Total Downloads", value: apps.reduce((s, a) => s + a.totalDownloads, 0).toLocaleString(), icon: "📥" },
              { label: "Avg Rating", value: apps.filter(a => a.rating > 0).length > 0 ? (apps.reduce((s,a) => s+a.rating, 0)/apps.filter(a=>a.rating>0).length).toFixed(1) : "—", icon: "⭐", color: "#ffb300" },
            ].map(s => (
              <div key={s.label} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color ?? "#e8eaf0" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#8892a4" }}>{s.label}</div>
              </div>
            ))}
          </div>
          {apps.filter(a => a.status === "pending_payment").length > 0 && (
            <div style={{ background: "rgba(255,179,0,0.05)", border: "1px solid rgba(255,179,0,0.15)", borderRadius: 14, padding: 20, marginBottom: 24 }}>
              <div style={{ fontWeight: 700, marginBottom: 10, color: "#ffb300" }}>💳 Awaiting Payment</div>
              {apps.filter(a => a.status === "pending_payment").map(app => (
                <div key={app.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontSize: 14 }}>{app.name}</span>
                  <button className="btn-green" style={{ fontSize: 13, padding: "6px 16px" }} onClick={() => setPaymentApp(app)}>Pay NGN 25,000</button>
                </div>
              ))}
            </div>
          )}
          {apps.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>No apps yet</div>
              <div style={{ color: "#8892a4", fontSize: 14, marginBottom: 20 }}>Submit your first app for NGN 25,000.</div>
              <button className="btn-green" onClick={() => setView("submit")}>Submit Your First App</button>
            </div>
          )}
        </div>
      )}

      {view === "apps" && (
        <div>
          {apps.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
              <div style={{ color: "#8892a4", fontSize: 14, marginBottom: 20 }}>No apps yet.</div>
              <button className="btn-green" onClick={() => setView("submit")}>Submit Your First App</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {apps.map(app => {
                const s = STATUS_STYLE[app.status] ?? STATUS_STYLE.draft;
                return (
                  <div key={app.id} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <img src={app.iconUrl} alt={app.name} style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", background: "#131920", flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).src = `https://placehold.co/48x48/0d1117/00c853?text=${app.name[0]}`; }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{app.name}</div>
                      <div style={{ fontSize: 12, color: "#8892a4" }}>{app.category} · {app.platform}</div>
                      {app.rejectionReason && <div style={{ fontSize: 12, color: "#ff5252", marginTop: 4 }}>Reason: {app.rejectionReason}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ background: s.bg, color: s.color, padding: "4px 10px", borderRadius: 16, fontSize: 12, fontWeight: 600 }}>{s.label}</span>
                      {app.status === "pending_payment" && (
                        <button className="btn-green" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => setPaymentApp(app)}>Pay NGN 25K</button>
                      )}
                      {app.status === "approved" && <Link href={`/apps/${app.slug}`} style={{ color: "#00c853", fontSize: 12, textDecoration: "none" }}>View →</Link>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Payment modal */}
      {paymentApp && (
        <PaymentModal
          app={paymentApp}
          onClose={() => setPaymentApp(null)}
          onSuccess={() => { setPaymentApp(null); loadData(); }}
        />
      )}
    </div>
  );
}
