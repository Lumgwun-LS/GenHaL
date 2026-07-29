import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useUser, SignInButton } from "@clerk/react";
import { apiFetch } from "../lib/api";
import type { Developer } from "../lib/types";

const AFRICAN_COUNTRIES = [
  "Algeria","Angola","Benin","Botswana","Burkina Faso","Burundi","Cabo Verde","Cameroon",
  "Central African Republic","Chad","Comoros","Congo (DRC)","Congo (Republic)","Côte d'Ivoire",
  "Djibouti","Egypt","Equatorial Guinea","Eritrea","Eswatini","Ethiopia","Gabon","Gambia","Ghana",
  "Guinea","Guinea-Bissau","Kenya","Lesotho","Liberia","Libya","Madagascar","Malawi","Mali",
  "Mauritania","Mauritius","Morocco","Mozambique","Namibia","Niger","Nigeria","Rwanda",
  "São Tomé & Príncipe","Senegal","Sierra Leone","Somalia","South Africa","South Sudan","Sudan",
  "Tanzania","Togo","Tunisia","Uganda","Zambia","Zimbabwe",
];

export default function DeveloperSignup() {
  const { isSignedIn } = useUser();
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ displayName: "", email: "", company: "", country: "Nigeria", website: "", bio: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(field: string, value: string) { setForm(prev => ({ ...prev, [field]: value })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.displayName.trim() || !form.email.trim()) { setError("Name and email are required."); return; }
    setLoading(true);
    try {
      await apiFetch<Developer>("/developers/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      navigate("/developer?registered=1");
    } catch (err: any) {
      setError(err.message ?? "Failed to register. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!isSignedIn) {
    return (
      <div style={{ maxWidth: 500, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🌍</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Sign in to register as a developer</h2>
        <p style={{ color: "#8892a4", marginBottom: 28 }}>Create an account to start publishing apps on Africa App Store.</p>
        <SignInButton mode="modal">
          <button className="btn-green" style={{ fontSize: 15, padding: "12px 32px" }}>Sign in to Continue</button>
        </SignInButton>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 580, margin: "0 auto", padding: "40px 20px 80px" }}>
      <Link href="/developer" style={{ color: "#8892a4", fontSize: 13, display: "inline-flex", gap: 4, marginBottom: 28, textDecoration: "none" }}>← Back</Link>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🌍</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Create Developer Account</h1>
        <p style={{ color: "#8892a4", fontSize: 14, lineHeight: 1.6 }}>
          Registration is <strong style={{ color: "#00c853" }}>free</strong>. A dedicated NGN bank account will be created for you automatically. Publishing each app costs <strong style={{ color: "#00c853" }}>NGN 50,000</strong>.
        </p>
      </div>

      {/* Benefits */}
      <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20, marginBottom: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: "#8892a4", textTransform: "uppercase", letterSpacing: 0.5 }}>What you get</div>
        {[
          ["🏦", "Dedicated NGN virtual bank account (auto-created)"],
          ["🤖", "AI-powered app review & categorization"],
          ["📊", "Real-time download analytics"],
          ["🌍", "Reach 1.4 billion people across 54 African countries"],
          ["✅", "Trusted, verified app badge"],
        ].map(([icon, text]) => (
          <div key={text as string} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
            <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{icon}</span>
            <span style={{ fontSize: 14, color: "#c0c8d8", lineHeight: 1.5 }}>{text as string}</span>
          </div>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <label className="form-label">Developer / Company Name *</label>
          <input className="input" value={form.displayName} onChange={e => set("displayName", e.target.value)} placeholder="e.g. Kola Labs" required />
        </div>
        <div>
          <label className="form-label">Email Address *</label>
          <input className="input" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="dev@example.com" required />
          <div style={{ fontSize: 12, color: "#8892a4", marginTop: 4 }}>Used for your Paystack dedicated account & payment notifications</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label className="form-label">Company (optional)</label>
            <input className="input" value={form.company} onChange={e => set("company", e.target.value)} placeholder="Your company" />
          </div>
          <div>
            <label className="form-label">Country *</label>
            <select className="input" value={form.country} onChange={e => set("country", e.target.value)}>
              {AFRICAN_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div>
          <label className="form-label">Website (optional)</label>
          <input className="input" type="url" value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://yoursite.com" />
        </div>
        <div>
          <label className="form-label">Bio (optional)</label>
          <textarea className="input" value={form.bio} onChange={e => set("bio", e.target.value)} placeholder="Tell us about yourself or your company..." style={{ minHeight: 80 }} />
        </div>

        {error && (
          <div style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff5252", fontSize: 14 }}>
            ❌ {error}
          </div>
        )}

        <button className="btn-green" type="submit" disabled={loading} style={{ fontSize: 15, padding: "12px", marginTop: 4 }}>
          {loading ? "Creating account..." : "🚀 Create Free Developer Account"}
        </button>

        <p style={{ fontSize: 12, color: "#8892a4", textAlign: "center" }}>
          By registering you agree to the Africa App Store developer terms. NGN 50,000 publishing fee applies per app.
        </p>
      </form>
    </div>
  );
}
