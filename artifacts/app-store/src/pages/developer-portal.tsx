import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useUser, SignInButton } from "@clerk/react";
import { apiFetch, getClerkToken } from "../lib/api";
import type {
  Developer, App, PaymentInitResult, OfflinePayment,
  LinkedAccount, PlatformRepo, AppRepoLink, UpdateRequest, PlatformId,
  AiLaunchSession, AiLaunchGeneratedData,
} from "../lib/types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

const AFRICA_CATEGORIES = [
  "Mobile Money & Fintech","Agriculture & Farming","Health & Telemedicine","Education & E-Learning",
  "Logistics & Delivery","Food & Restaurant","Entertainment & Music","Social & Community",
  "Business & Commerce","Government & E-Services","Transport & Ride-Hailing","Utilities & Infrastructure",
  "Fashion & Beauty","Real Estate","Emergencies","Community Engagements",
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

/**
 * Upload a File via the same-origin streaming proxy endpoint.
 * The server pipes the raw bytes directly to GCS without buffering, so there
 * is no Replit proxy body-size cap and no CORS issue.
 * XHR is used so onprogress fires for real-time progress tracking.
 */
async function uploadFilePresigned(
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  // Get a fresh Clerk session token for the Authorization header
  const token = await (async () => {
    try {
      const clerk = (window as any).Clerk;
      if (!clerk?.session) return null;
      return await clerk.session.getToken();
    } catch { return null; }
  })();

  const { fileUrl } = await new Promise<{ fileUrl: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid response from upload endpoint"));
        }
      } else {
        // Surface the actual error body so debugging is easier
        const detail = xhr.responseText ? `: ${xhr.responseText.slice(0, 200)}` : "";
        reject(new Error(`Upload failed (HTTP ${xhr.status})${detail}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during file upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));

    // POST to same-origin streaming proxy — bypasses Replit proxy body cap
    xhr.open("POST", "/api/store/apps/stream-upload");
    xhr.timeout = 10 * 60 * 1000; // 10 min for large APKs
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    // Tell the server the file's MIME type without setting Content-Type
    // (setting Content-Type to multipart would break the raw stream)
    xhr.setRequestHeader("X-File-Type", file.type || "application/octet-stream");
    xhr.send(file);
  });

  return fileUrl;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

// ── CategoryPicker ────────────────────────────────────────────────────────────

function CategoryPicker({ selected, onChange, all, max = 5, label = "Categories *" }: {
  selected: string[];
  onChange: (v: string[]) => void;
  all: string[];
  max?: number;
  label?: string;
}) {
  function toggle(cat: string) {
    if (selected.includes(cat)) {
      onChange(selected.filter(c => c !== cat));
    } else if (selected.length < max) {
      onChange([...selected, cat]);
    }
  }
  const atMax = selected.length >= max;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <label className="form-label" style={{ marginBottom: 0 }}>{label} <span style={{ color: "#8892a4", fontWeight: 400 }}>— select up to {max}</span></label>
        <span style={{ fontSize: 12, fontWeight: 700, color: selected.length > 0 ? "#00c853" : "#8892a4" }}>
          {selected.length}/{max}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {all.map(cat => {
          const active = selected.includes(cat);
          const disabled = !active && atMax;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => toggle(cat)}
              disabled={disabled}
              style={{
                padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: active ? 700 : 500,
                cursor: disabled ? "not-allowed" : "pointer",
                border: `1.5px solid ${active ? "#00c853" : disabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.1)"}`,
                background: active ? "rgba(0,200,83,0.12)" : disabled ? "transparent" : "rgba(255,255,255,0.03)",
                color: active ? "#00c853" : disabled ? "#2e3848" : "#8892a4",
                transition: "all 0.15s",
              }}
            >{active ? `✓ ${cat}` : cat}</button>
          );
        })}
      </div>
      {selected.length === 0 && (
        <div style={{ fontSize: 11, color: "#ff5252", marginTop: 6 }}>Select at least one category</div>
      )}
      {selected.length > 0 && (
        <div style={{ fontSize: 11, color: "#5a6478", marginTop: 6 }}>
          Primary: <span style={{ color: "#00c853", fontWeight: 600 }}>{selected[0]}</span>
          {selected.length > 1 && ` + ${selected.length - 1} more`}
        </div>
      )}
    </div>
  );
}

// ── PublishOverlay ────────────────────────────────────────────────────────────

const PUBLISH_STAGES = [
  { icon: "🔍", label: "Validating app details",       ms: 700  },
  { icon: "📝", label: "Creating your store listing",  ms: 1100 },
  { icon: "🎨", label: "Building your app page",       ms: 900  },
  { icon: "🚀", label: "Preparing for launch",         ms: 700  },
];
const TOTAL_STAGE_MS = PUBLISH_STAGES.reduce((a, s) => a + s.ms, 0);

const CONFETTI_COLORS = ["#00c853","#a78bfa","#ffb300","#38bdf8","#f472b6","#34d399"];

function Confetti() {
  const pieces = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    angle: (i / 28) * 360,
    distance: 80 + Math.random() * 140,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 6 + Math.random() * 8,
    delay: Math.random() * 0.3,
    shape: i % 3 === 0 ? "circle" : i % 3 === 1 ? "rect" : "star",
  }));
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {pieces.map(p => {
        const rad = (p.angle * Math.PI) / 180;
        const tx = Math.cos(rad) * p.distance;
        const ty = Math.sin(rad) * p.distance;
        return (
          <motion.div
            key={p.id}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0, rotate: 0 }}
            animate={{ x: tx, y: ty, opacity: 0, scale: 1, rotate: 360 + Math.random() * 360 }}
            transition={{ duration: 1.1 + Math.random() * 0.6, delay: p.delay, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: "50%", left: "50%",
              width: p.size, height: p.size,
              background: p.color,
              borderRadius: p.shape === "circle" ? "50%" : p.shape === "rect" ? 2 : "50%",
              transform: "translate(-50%,-50%)",
            }}
          />
        );
      })}
    </div>
  );
}

function PublishOverlay({
  appName, iconUrl, downloadUrl, feeExempt, phase, stageIndex, progress, error,
  onPayFee, onViewApps, onRetry,
}: {
  appName: string; iconUrl: string; downloadUrl: string; feeExempt: boolean;
  phase: "publishing" | "success" | "error";
  stageIndex: number; progress: number; error: string;
  onPayFee: () => void; onViewApps: () => void; onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  function copyLink() {
    navigator.clipboard.writeText(downloadUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: "rgba(4,6,16,0.92)", backdropFilter: "blur(12px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <motion.div
        initial={{ scale: 0.88, y: 32, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 26 }}
        style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, padding: "40px 36px", maxWidth: 520, width: "100%", position: "relative", overflow: "hidden" }}
      >
        {/* Ambient glow */}
        <div style={{ position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)", width: 320, height: 320, background: phase === "success" ? "radial-gradient(circle,rgba(0,200,83,0.12),transparent 70%)" : "radial-gradient(circle,rgba(124,77,255,0.1),transparent 70%)", pointerEvents: "none" }} />

        <AnimatePresence mode="wait">

          {/* ── Publishing phase ── */}
          {phase === "publishing" && (
            <motion.div key="publishing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Animated icon */}
              <div style={{ textAlign: "center", marginBottom: 28 }}>
                <motion.div
                  animate={{ rotate: [0, -8, 8, -8, 8, 0], scale: [1, 1.08, 1] }}
                  transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
                  style={{ fontSize: 60, display: "inline-block", marginBottom: 16 }}
                >🚀</motion.div>
                <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 6 }}>Publishing your app…</h2>
                <p style={{ color: "#8892a4", fontSize: 14 }}>Hang tight — this only takes a few seconds.</p>
              </div>

              {/* Stages */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                {PUBLISH_STAGES.map((s, i) => {
                  const done = i < stageIndex;
                  const active = i === stageIndex;
                  return (
                    <motion.div
                      key={i}
                      initial={{ x: -16, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: i * 0.1 }}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12,
                        background: done ? "rgba(0,200,83,0.06)" : active ? "rgba(124,77,255,0.08)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${done ? "rgba(0,200,83,0.2)" : active ? "rgba(124,77,255,0.25)" : "rgba(255,255,255,0.04)"}`,
                        transition: "all 0.4s ease",
                      }}
                    >
                      <span style={{ fontSize: 20, width: 28, textAlign: "center" }}>
                        {done ? "✅" : active ? (
                          <motion.span
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                            style={{ display: "inline-block" }}
                          >⚙️</motion.span>
                        ) : s.icon}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: active ? 600 : 400, color: done ? "#00c853" : active ? "#c4b5fd" : "#5a6478" }}>
                        {s.label}
                      </span>
                      {active && (
                        <motion.div
                          style={{ marginLeft: "auto", display: "flex", gap: 3 }}
                        >
                          {[0,1,2].map(d => (
                            <motion.div key={d} animate={{ opacity: [0.3,1,0.3], scale: [0.8,1,0.8] }}
                              transition={{ repeat: Infinity, duration: 0.8, delay: d * 0.2 }}
                              style={{ width: 4, height: 4, borderRadius: "50%", background: "#a78bfa" }}
                            />
                          ))}
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 99, height: 6, overflow: "hidden" }}>
                <motion.div
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#7c4dff,#00c853)", boxShadow: "0 0 12px rgba(0,200,83,0.4)" }}
                />
              </div>
              <div style={{ textAlign: "center", marginTop: 10, fontSize: 12, color: "#4a5568" }}>{Math.round(progress)}%</div>
            </motion.div>
          )}

          {/* ── Success phase ── */}
          {phase === "success" && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 22 }} style={{ textAlign: "center" }}>
              <Confetti />

              {/* Trophy */}
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.1 }}
                style={{ fontSize: 72, marginBottom: 8, display: "inline-block" }}
              >🎉</motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                style={{ fontWeight: 800, fontSize: 26, marginBottom: 6, background: "linear-gradient(135deg,#00c853,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
              >App Submitted!</motion.h2>

              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                style={{ color: "#8892a4", fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
                {feeExempt
                  ? "Your app is in the review queue — you'll get a notification once it's live."
                  : "Complete the NGN 50,000 publishing fee to enter the review queue and go live."}
              </motion.p>

              {/* App card */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "16px 20px", marginBottom: 20, textAlign: "left" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                  {iconUrl ? (
                    <img src={iconUrl} alt={appName} style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", background: "#131920", flexShrink: 0 }}
                      onError={e => { (e.target as HTMLImageElement).src = `https://placehold.co/52x52/0d1117/00c853?text=${appName[0]}`; }} />
                  ) : (
                    <div style={{ width: 52, height: 52, borderRadius: 12, background: "linear-gradient(135deg,#7c4dff,#00c853)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
                      {appName[0]}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 3 }}>{appName}</div>
                    <span style={{ background: "rgba(255,179,0,0.1)", color: "#ffb300", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                      💳 Awaiting Payment
                    </span>
                  </div>
                </div>

                {/* Download link */}
                <div style={{ marginBottom: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#5a6478", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Download / Install Link</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "8px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ fontSize: 13, color: "#00c853", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                      {downloadUrl}
                    </span>
                    <button
                      onClick={copyLink}
                      style={{ background: copied ? "rgba(0,200,83,0.15)" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: copied ? "#00c853" : "#8892a4", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all 0.2s" }}
                    >{copied ? "✓ Copied!" : "Copy"}</button>
                    <a href={downloadUrl} target="_blank" rel="noopener noreferrer"
                      style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#8892a4", cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
                      Open ↗
                    </a>
                  </div>
                </div>
              </motion.div>

              {/* CTAs */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
                style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {!feeExempt && (
                  <button className="btn-green" onClick={onPayFee}
                    style={{ width: "100%", padding: "13px 0", fontSize: 15, fontWeight: 700, borderRadius: 12 }}>
                    💳 Pay NGN 50,000 Publishing Fee →
                  </button>
                )}
                <button onClick={onViewApps}
                  style={{ width: "100%", padding: "12px 0", fontSize: 14, fontWeight: 600, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#c0c8d8", cursor: "pointer" }}>
                  📱 View My Apps
                </button>
              </motion.div>
            </motion.div>
          )}

          {/* ── Error phase ── */}
          {phase === "error" && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 60, marginBottom: 16 }}>😬</div>
              <h2 style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Something went wrong</h2>
              <div style={{ background: "rgba(255,82,82,0.08)", border: "1px solid rgba(255,82,82,0.25)", borderRadius: 12, padding: "12px 16px", color: "#ff5252", fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
                {error}
              </div>
              <button className="btn-green" onClick={onRetry} style={{ width: "100%", padding: 12, fontSize: 14 }}>
                ← Go Back & Try Again
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ── AppSubmitForm ─────────────────────────────────────────────────────────────

function AppSubmitForm({ dev, onCreated }: { dev: Developer; onCreated: (app: App) => void }) {
  const [form, setForm] = useState({ name: "", tagline: "", description: "", platform: "android", iconUrl: "", downloadUrl: "", webUrl: "", currentVersion: "", screenshots: "", packageName: "" });
  const [categories, setCategories] = useState<string[]>([AFRICA_CATEGORIES[0]]);
  const [phase, setPhase] = useState<"idle" | "publishing" | "success" | "error">("idle");
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [submittedApp, setSubmittedApp] = useState<App | null>(null);
  const stageTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Direct file upload state
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [apkUploading, setApkUploading] = useState(false);
  const [apkProgress, setApkProgress] = useState(0);
  const [iconFileObj, setIconFileObj] = useState<File | null>(null);
  const [iconUploading, setIconUploading] = useState(false);
  const [iconProgress, setIconProgress] = useState(0);
  const [ssUrls, setSsUrls] = useState<string[]>([]);
  const [ssUploading, setSsUploading] = useState(false);
  const [ssProgress, setSsProgress] = useState(0);
  const [ssUploadingCount, setSsUploadingCount] = useState(0);
  const apkInputRef = useRef<HTMLInputElement>(null);
  const iconUploadRef = useRef<HTMLInputElement>(null);
  const ssUploadRef = useRef<HTMLInputElement>(null);

  async function uploadApk(file: File) {
    setApkFile(file); setApkUploading(true); setApkProgress(0);
    try {
      const url = await uploadFilePresigned(file, setApkProgress);
      set("downloadUrl", url);
    } catch (err: any) {
      setError(`APK upload failed: ${err.message ?? "Unknown error"}`);
    } finally {
      setApkUploading(false);
    }
  }

  async function uploadIcon(file: File) {
    setIconFileObj(file); setIconUploading(true); setIconProgress(0);
    try {
      const url = await uploadFilePresigned(file, setIconProgress);
      set("iconUrl", url);
    } catch (err: any) {
      setError(`Icon upload failed: ${err.message ?? "Unknown error"}`);
    } finally {
      setIconUploading(false);
    }
  }

  async function uploadScreenshots(files: File[]) {
    // Cap total at 8 across existing + new
    const remaining = 8 - ssUrls.length;
    if (remaining <= 0) { setError("Maximum 8 screenshots allowed. Remove some first."); return; }
    const toUpload = files.slice(0, remaining);
    setSsUploading(true); setSsProgress(0); setSsUploadingCount(toUpload.length);
    try {
      const totalBytes = toUpload.reduce((s, f) => s + f.size, 0) || 1;
      let doneBytes = 0;
      const newUrls: string[] = [];
      for (const f of toUpload) {
        const url = await uploadFilePresigned(f, (pct) =>
          setSsProgress(Math.round(((doneBytes + (f.size * pct) / 100) / totalBytes) * 100)));
        doneBytes += f.size;
        newUrls.push(url);
      }
      setSsProgress(100);
      setSsUrls(prev => [...prev, ...newUrls]);
      // Keep the green "done" bar visible for 1.5 s before hiding
      setTimeout(() => setSsProgress(0), 1500);
    } catch (err: any) {
      setSsProgress(0);
      setError(`Screenshot upload failed: ${err.message ?? "Unknown error"}`);
    } finally {
      setSsUploading(false);
      setSsUploadingCount(0);
    }
  }

  function removeSsUrl(index: number) {
    setSsUrls(prev => prev.filter((_, i) => i !== index));
  }

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  function clearTimers() { stageTimers.current.forEach(clearTimeout); stageTimers.current = []; }

  function startStageAnimation(onAllDone: () => void) {
    setStageIndex(0);
    setProgress(0);
    let elapsed = 0;
    let cumulative = 0;
    PUBLISH_STAGES.forEach((stage, i) => {
      const t1 = setTimeout(() => setStageIndex(i), elapsed);
      const p1 = setTimeout(() => setProgress(Math.round(((cumulative + stage.ms * 0.5) / TOTAL_STAGE_MS) * 88)), elapsed + stage.ms * 0.3);
      stageTimers.current.push(t1, p1);
      elapsed += stage.ms;
      cumulative += stage.ms;
    });
    const tDone = setTimeout(() => {
      setStageIndex(PUBLISH_STAGES.length);
      setProgress(90);
      onAllDone();
    }, elapsed);
    stageTimers.current.push(tDone);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name || !form.tagline || !form.description) {
      setError("App Name, Tagline, and Description are required."); return;
    }
    if (!form.iconUrl) {
      setError("Please upload an app icon before submitting."); return;
    }
    if (!form.downloadUrl) {
      setError("Please upload your app file (APK / IPA / AAB) before submitting."); return;
    }
    if (categories.length === 0) {
      setError("Select at least one category."); return;
    }
    if (form.packageName && !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(form.packageName)) {
      setError("Package name must follow reverse-domain format, e.g. com.example.myapp"); return;
    }

    setPhase("publishing");
    clearTimers();

    // Run the cosmetic stage animation AND the real API call in parallel.
    // Whichever finishes last determines when we transition to success/error.
    let animationDone = false;
    let apiResult: { ok: boolean; app?: App; err?: string } | null = null;

    function tryFinish() {
      if (!animationDone || !apiResult) return; // wait for both
      if (apiResult.ok && apiResult.app) {
        setProgress(100);
        setTimeout(() => { setSubmittedApp(apiResult!.app!); setPhase("success"); }, 300);
      } else {
        setError(apiResult.err ?? "Failed to submit. Please try again.");
        setPhase("error");
      }
    }

    startStageAnimation(() => { animationDone = true; tryFinish(); });

    try {
      const app = await apiFetch<App>("/developers/me/apps", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          categories,
          screenshots: ssUrls,
          packageName: form.packageName || undefined,
        }),
      });
      apiResult = { ok: true, app };
    } catch (err: any) {
      clearTimers();
      apiResult = { ok: false, err: err.message ?? "Failed to submit. Please try again." };
    }
    tryFinish();
  }

  function handleRetry() {
    // Only dismiss the error overlay — preserve every field the developer filled in
    clearTimers();
    setPhase("idle");
    setStageIndex(0);
    setProgress(0);
    setError("");
    // Do NOT reset form, categories, uploaded files, or ssUrls
  }

  function handlePayFee() {
    if (submittedApp) onCreated(submittedApp); // opens PaymentModal
  }

  function handleViewApps() {
    if (submittedApp) onCreated(submittedApp); // navigates to apps tab
  }

  return (
    <>
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
        <CategoryPicker selected={categories} onChange={setCategories} all={AFRICA_CATEGORIES} />
        <div><label className="form-label">Version</label><input className="input" value={form.currentVersion} onChange={e => set("currentVersion", e.target.value)} placeholder="1.0.0" /></div>
        <div><label className="form-label">Description *</label><textarea className="input" value={form.description} onChange={e => set("description", e.target.value)} placeholder="Detailed description..." style={{ minHeight: 100 }} required /></div>
        <div>
          <label className="form-label">Package / Bundle ID <span style={{ color: "#a78bfa" }}>(strongly recommended)</span></label>
          <input className="input" value={form.packageName} onChange={e => set("packageName", e.target.value)} placeholder="com.example.myapp" />
          <div style={{ fontSize: 11, color: "#8892a4", marginTop: 4 }}>
            Your app's unique identifier (e.g. <code>com.yourcompany.appname</code>). Once registered, this locks your app — only you can publish updates for it.
          </div>
        </div>
        {/* App Icon — upload only, hosted on platform */}
        <div>
          <label className="form-label">App Icon *</label>
          {iconFileObj && !iconUploading ? (
            /* Uploaded state — show preview card with replace button */
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(124,77,255,0.08)", border: "1px solid rgba(124,77,255,0.25)", borderRadius: 10 }}>
              <img src={form.iconUrl} alt="icon" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#a78bfa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{iconFileObj.name}</div>
                <div style={{ fontSize: 11, color: "#8892a4" }}>{formatBytes(iconFileObj.size)} · hosted on platform</div>
              </div>
              <button type="button" onClick={() => { setIconFileObj(null); set("iconUrl", ""); iconUploadRef.current?.click(); }}
                style={{ flexShrink: 0, padding: "6px 12px", background: "transparent", border: "1px solid rgba(124,77,255,0.3)", borderRadius: 7, color: "#a78bfa", fontSize: 12, cursor: "pointer" }}>
                Replace
              </button>
            </div>
          ) : (
            /* Empty / uploading state */
            <div
              onClick={() => !iconUploading && iconUploadRef.current?.click()}
              style={{ border: `2px dashed ${iconUploading ? "rgba(124,77,255,0.5)" : "rgba(124,77,255,0.25)"}`, borderRadius: 12, padding: "20px 16px", textAlign: "center", cursor: iconUploading ? "default" : "pointer", background: "rgba(124,77,255,0.03)" }}
            >
              {iconUploading ? (
                <>
                  <div style={{ fontSize: 13, color: "#a78bfa", marginBottom: 8 }}>Uploading icon… {iconProgress}%</div>
                  <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${iconProgress}%`, height: "100%", background: "linear-gradient(90deg,#7c4dff,#a78bfa)", transition: "width 0.3s" }} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                  <div style={{ fontSize: 13, color: "#a78bfa", fontWeight: 600 }}>Click to upload your app icon</div>
                  <div style={{ fontSize: 11, color: "#8892a4", marginTop: 4 }}>PNG or JPG · recommended 512×512 px</div>
                </>
              )}
            </div>
          )}
          <input ref={iconUploadRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadIcon(f); (e.target as HTMLInputElement).value = ""; }} />
        </div>

        {/* App File — upload only, hosted on platform */}
        <div>
          <label className="form-label">App File (APK / IPA / AAB) *</label>
          {apkFile && !apkUploading ? (
            /* Uploaded state */
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "rgba(0,200,83,0.07)", border: "1px solid rgba(0,200,83,0.25)", borderRadius: 10 }}>
              <div style={{ fontSize: 32, flexShrink: 0 }}>
                {/\.apk$/i.test(apkFile.name) ? "🤖" : /\.ipa$/i.test(apkFile.name) ? "🍎" : "📦"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#00c853", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{apkFile.name}</div>
                <div style={{ fontSize: 11, color: "#8892a4" }}>{formatBytes(apkFile.size)} · hosted on platform · download link set automatically</div>
              </div>
              <button type="button" onClick={() => { setApkFile(null); set("downloadUrl", ""); apkInputRef.current?.click(); }}
                style={{ flexShrink: 0, padding: "6px 12px", background: "transparent", border: "1px solid rgba(0,200,83,0.3)", borderRadius: 7, color: "#00c853", fontSize: 12, cursor: "pointer" }}>
                Replace
              </button>
            </div>
          ) : (
            /* Empty / uploading state */
            <div
              onClick={() => !apkUploading && apkInputRef.current?.click()}
              style={{ border: `2px dashed ${apkUploading ? "rgba(0,200,83,0.5)" : "rgba(0,200,83,0.2)"}`, borderRadius: 12, padding: "24px 16px", textAlign: "center", cursor: apkUploading ? "default" : "pointer", background: "rgba(0,200,83,0.03)" }}
            >
              {apkUploading ? (
                <>
                  <div style={{ fontSize: 13, color: "#00c853", marginBottom: 8 }}>
                    Uploading {apkFile?.name} ({formatBytes(apkFile?.size ?? 0)})… {apkProgress}%
                  </div>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${apkProgress}%`, height: "100%", background: "linear-gradient(90deg,#00c853,#69f0ae)", transition: "width 0.3s" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#8892a4", marginTop: 6 }}>Uploading directly to storage — no size limit</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                  <div style={{ fontSize: 14, color: "#00c853", fontWeight: 600 }}>Click to upload your app file</div>
                  <div style={{ fontSize: 12, color: "#8892a4", marginTop: 4 }}>APK · IPA · AAB · ZIP · up to 250 MB</div>
                  <div style={{ fontSize: 11, color: "#8892a4", marginTop: 2 }}>The download link is generated automatically and hosted on this platform</div>
                </>
              )}
            </div>
          )}
          <input ref={apkInputRef} type="file" accept=".apk,.ipa,.zip,.aab" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadApk(f); (e.target as HTMLInputElement).value = ""; }} />
        </div>

        <div><label className="form-label">Web App URL (optional)</label><input className="input" type="url" value={form.webUrl} onChange={e => set("webUrl", e.target.value)} placeholder="https://..." /></div>

        {/* Screenshots — thumbnail grid with remove buttons */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <label className="form-label" style={{ margin: 0 }}>
              Screenshots <span style={{ color: "#8892a4", fontWeight: 400 }}>({ssUrls.length}/8)</span>
            </label>
            {ssUrls.length < 8 && (
              <button type="button" onClick={() => ssUploadRef.current?.click()} disabled={ssUploading}
                style={{ padding: "6px 14px", background: "rgba(0,188,212,0.1)", border: "1px solid rgba(0,188,212,0.3)", borderRadius: 8, color: ssUploading ? "#8892a4" : "#00bcd4", fontSize: 12, cursor: ssUploading ? "not-allowed" : "pointer" }}>
                {ssUploading ? `Uploading ${ssUploadingCount} image${ssUploadingCount > 1 ? "s" : ""}… ${ssProgress}%` : "⬆ Add Screenshots"}
              </button>
            )}
          </div>

          {/* Upload progress bar — visible while uploading AND for 1.5 s after */}
          {(ssUploading || ssProgress > 0) && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#8892a4", marginBottom: 5 }}>
                <span>{ssUploading ? `Uploading ${ssUploadingCount} screenshot${ssUploadingCount > 1 ? "s" : ""}…` : "✅ Screenshots uploaded"}</span>
                <span style={{ fontWeight: 700, color: ssUploading ? "#00bcd4" : "#00c853" }}>{ssProgress}%</span>
              </div>
              <div style={{ height: 7, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  width: `${ssProgress}%`, height: "100%",
                  background: ssUploading ? "linear-gradient(90deg,#00bcd4,#80deea)" : "#00c853",
                  transition: "width 0.25s ease-out",
                }} />
              </div>
            </div>
          )}

          {/* Thumbnail grid */}
          {ssUrls.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 14 }}>
              {ssUrls.map((url, i) => (
                /* Wrapper — NO overflow:hidden here so the remove button isn't clipped */
                <div key={url + i} style={{ position: "relative", aspectRatio: "9/16" }}>
                  {/* Clipped image area */}
                  <div style={{
                    position: "absolute", inset: 0,
                    borderRadius: 10, overflow: "hidden",
                    background: "#0a0d13", border: "1px solid rgba(255,255,255,0.08)",
                  }}>
                    <img
                      src={url}
                      alt={`Screenshot ${i + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    {/* Index badge */}
                    <div style={{ position: "absolute", bottom: 5, left: 5, background: "rgba(0,0,0,0.6)", borderRadius: 4, fontSize: 10, color: "#ccc", padding: "2px 5px" }}>
                      {i + 1}
                    </div>
                  </div>
                  {/* Remove button — OUTSIDE the overflow:hidden div so iOS Safari doesn't block it */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeSsUrl(i); }}
                    title="Remove screenshot"
                    style={{
                      position: "absolute", top: -9, right: -9,
                      width: 26, height: 26, borderRadius: "50%",
                      background: "#ff5252", border: "2px solid #0b0f17",
                      color: "#fff", fontSize: 14, lineHeight: "22px",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 0, zIndex: 10,
                      fontWeight: 700,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            !ssUploading && (
              <div
                onClick={() => ssUploadRef.current?.click()}
                style={{ border: "2px dashed rgba(0,188,212,0.2)", borderRadius: 12, padding: "28px 20px", textAlign: "center", cursor: "pointer", color: "#8892a4", fontSize: 13 }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>📸</div>
                Click to upload screenshots (up to 8 images)
              </div>
            )
          )}

          <input ref={ssUploadRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length) { uploadScreenshots(files); (e.target as HTMLInputElement).value = ""; } }} />

          {ssUrls.length > 0 && (
            <div style={{ fontSize: 11, color: "#8892a4", marginTop: 8 }}>
              Click × on any image to remove it. Drag to reorder is not yet supported — remove and re-upload to change order.
            </div>
          )}
        </div>
        {error && <div style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff5252", fontSize: 14 }}>❌ {error}</div>}
        <div style={{ background: "rgba(255,179,0,0.08)", border: "1px solid rgba(255,179,0,0.2)", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#c0c8d8" }}>
          💳 After submission you'll pay the publishing fee (<strong style={{ color: "#ffb300" }}>NGN 50,000</strong> for African developers · <strong style={{ color: "#a78bfa" }}>$100 USD</strong> for international developers) via your preferred payment method.
        </div>
        <motion.button
          className="btn-green"
          type="submit"
          whileHover={{ scale: 1.02, boxShadow: "0 0 24px rgba(0,200,83,0.35)" }}
          whileTap={{ scale: 0.97 }}
          style={{ fontSize: 15, padding: 14, borderRadius: 12, fontWeight: 700, position: "relative", overflow: "hidden" }}
        >
          <span style={{ position: "relative", zIndex: 1 }}>🚀 Submit App →</span>
        </motion.button>
      </form>

      {/* Animated publish overlay */}
      <AnimatePresence>
        {(phase === "publishing" || phase === "success" || phase === "error") && (
          <PublishOverlay
            appName={form.name}
            iconUrl={form.iconUrl}
            downloadUrl={form.downloadUrl}
            feeExempt={dev.feeExempt ?? false}
            phase={phase}
            stageIndex={stageIndex}
            progress={progress}
            error={error}
            onPayFee={handlePayFee}
            onViewApps={handleViewApps}
            onRetry={handleRetry}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── OfflinePaymentModal ───────────────────────────────────────────────────────

function OfflinePaymentModal({ app, onClose }: { app: App; onClose: () => void }) {
  const [form, setForm] = useState({ proofUrl: "", proofNote: "", amountPaid: "NGN 50,000", bankReference: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!form.proofUrl) { setError("Please provide a URL to your proof of payment screenshot."); return; }
    setLoading(true);
    try {
      await apiFetch<OfflinePayment>("/payments/offline/submit", { method: "POST", body: JSON.stringify({ appId: app.id, ...form }) });
      setSuccess(true);
    } catch (err: any) { setError(err.message ?? "Could not submit proof."); } finally { setLoading(false); }
  }

  const ACCOUNT_DETAILS = [
    { label: "Bank", value: "Zenith Bank" },
    { label: "Account Name", value: "Awajimaa Ltd" },
    { label: "Account Number", value: "1234567890" },
    { label: "Amount", value: "NGN 50,000" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 32, maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        {success ? (
          <>
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>📤</div>
              <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Proof Submitted!</h3>
              <p style={{ color: "#8892a4", fontSize: 14, lineHeight: 1.6 }}>
                Your payment proof is under review. An admin will verify it, then a super admin will grant final approval. You'll be notified once approved.
              </p>
              <button onClick={onClose} className="btn-green" style={{ marginTop: 20, padding: "10px 28px" }}>Close</button>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Pay via Bank Transfer</h3>
            <p style={{ color: "#8892a4", fontSize: 13, marginBottom: 20 }}>Transfer <strong style={{ color: "#00c853" }}>NGN 50,000</strong> to the account below, then upload your proof of payment.</p>

            {/* Account details */}
            <div style={{ background: "rgba(0,200,83,0.06)", border: "1px solid rgba(0,200,83,0.15)", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#00c853", marginBottom: 10, textTransform: "uppercase" }}>🏦 Transfer To</div>
              {ACCOUNT_DETAILS.map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: "#8892a4" }}>{label}</span>
                  <strong style={{ color: "#e8eaf0", fontFamily: label === "Account Number" ? "monospace" : undefined, letterSpacing: label === "Account Number" ? 1 : undefined }}>{value}</strong>
                </div>
              ))}
            </div>

            {/* Proof upload form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="form-label">Proof of Payment URL *</label>
                <input className="input" type="url" value={form.proofUrl} onChange={e => set("proofUrl", e.target.value)} placeholder="https://drive.google.com/... or direct image URL" required />
                <div style={{ fontSize: 11, color: "#8892a4", marginTop: 4 }}>Upload your receipt/screenshot to Google Drive, Dropbox, or any image host and paste the link here.</div>
              </div>
              <div>
                <label className="form-label">Bank Reference / Teller Number</label>
                <input className="input" value={form.bankReference} onChange={e => set("bankReference", e.target.value)} placeholder="e.g. FBN202407120001" />
              </div>
              <div>
                <label className="form-label">Amount Paid</label>
                <input className="input" value={form.amountPaid} onChange={e => set("amountPaid", e.target.value)} placeholder="NGN 50,000" />
              </div>
              <div>
                <label className="form-label">Additional Note (optional)</label>
                <textarea className="input" value={form.proofNote} onChange={e => set("proofNote", e.target.value)} placeholder="Any additional information for the admin..." style={{ minHeight: 64 }} />
              </div>

              {error && <div style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff5252", fontSize: 13 }}>❌ {error}</div>}

              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="button" onClick={onClose} className="btn-outline" style={{ flex: 1 }}>Cancel</button>
                <button type="submit" disabled={loading} className="btn-green" style={{ flex: 2 }}>{loading ? "Submitting..." : "📤 Submit Proof"}</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ── African-country helper (mirrors server-side isAfricanCountry) ─────────────

const AFRICAN_NAMES = new Set([
  "Algeria","Angola","Benin","Botswana","Burkina Faso","Burundi",
  "Cabo Verde","Cape Verde","Cameroon","Central African Republic","Chad",
  "Comoros","Congo","Democratic Republic of the Congo","DR Congo","DRC",
  "Djibouti","Egypt","Equatorial Guinea","Eritrea","Eswatini","Swaziland",
  "Ethiopia","Gabon","Gambia","Ghana","Guinea","Guinea-Bissau",
  "Ivory Coast","Côte d'Ivoire","Cote d'Ivoire","Kenya","Lesotho","Liberia","Libya",
  "Madagascar","Malawi","Mali","Mauritania","Mauritius","Morocco",
  "Mozambique","Namibia","Niger","Nigeria","Rwanda",
  "São Tomé and Príncipe","Sao Tome and Principe","Senegal","Seychelles",
  "Sierra Leone","Somalia","South Africa","South Sudan","Sudan",
  "Tanzania","Togo","Tunisia","Uganda","Zambia","Zimbabwe",
]);
const AFRICAN_CODES = new Set([
  "DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CG","CD","DJ",
  "EG","GQ","ER","SZ","ET","GA","GM","GH","GN","GW","CI","KE","LS","LR",
  "LY","MG","MW","ML","MR","MU","MA","MZ","NA","NE","NG","RW","ST","SN",
  "SC","SL","SO","ZA","SS","SD","TZ","TG","TN","UG","ZM","ZW",
]);
function isAfricanCountry(country?: string | null): boolean {
  if (!country) return true;
  const t = country.trim();
  return AFRICAN_NAMES.has(t) || AFRICAN_CODES.has(t.toUpperCase());
}

// ── PaymentModal ──────────────────────────────────────────────────────────────

function PaymentModal({ app, devCountry, onClose }: { app: App; devCountry?: string; onClose: () => void }) {
  const african = isAfricanCountry(devCountry);

  type GwId = "paystack" | "interswitch" | "offline" | "squad" | "stripe";
  const [gateway, setGateway] = useState<GwId>(african ? "paystack" : "squad");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showOffline, setShowOffline] = useState(false);

  const feeLabel = african ? "NGN 50,000" : "$100 USD";
  const accentColor = african ? "#00c853" : "#7c4dff";

  async function handlePay() {
    if (gateway === "offline") { setShowOffline(true); return; }
    setLoading(true); setError("");
    try {
      const result = await apiFetch<PaymentInitResult>("/payments/initiate", {
        method: "POST",
        body: JSON.stringify({ appId: app.id, gateway }),
      });

      if (result.gateway === "paystack") {
        window.location.href = result.authorizationUrl;
      } else if (result.gateway === "interswitch") {
        const form = document.createElement("form"); form.method = "POST"; form.action = result.paymentUrl;
        Object.entries(result.formData).forEach(([k, v]) => {
          const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; form.appendChild(i);
        });
        document.body.appendChild(form); form.submit();
      } else if (result.gateway === "squad" || result.gateway === "stripe") {
        window.location.href = result.checkoutUrl;
      }
    } catch (err: any) {
      // Squad failed — surface a Stripe fallback prompt
      if (gateway === "squad") {
        setError("Squad checkout unavailable. Switch to Stripe (card) below.");
      } else {
        setError(err.message ?? "Could not initiate payment.");
      }
      setLoading(false);
    }
  }

  if (showOffline) return <OfflinePaymentModal app={app} onClose={onClose} />;

  const AFRICAN_GATEWAYS = [
    { id: "paystack"    as const, icon: "💚", name: "Paystack",              desc: "Card, bank transfer, USSD — NGN 50,000" },
    { id: "interswitch" as const, icon: "🔵", name: "Interswitch",           desc: "Card, bank transfer (Verve, Mastercard, Visa) — NGN 50,000" },
    { id: "offline"     as const, icon: "🏦", name: "Bank Transfer (Offline)",desc: "Transfer to our account and upload proof of payment" },
  ];
  const INTL_GATEWAYS = [
    { id: "squad"  as const, icon: "⚡", name: "Squad",  desc: "Card, bank transfer — $100 USD (recommended)" },
    { id: "stripe" as const, icon: "💳", name: "Stripe", desc: "Credit / debit card — $100 USD (fallback if Squad unavailable)" },
  ];
  const GATEWAYS = african ? AFRICAN_GATEWAYS : INTL_GATEWAYS;

  const payLabel = () => {
    if (loading) return "Redirecting…";
    if (gateway === "offline") return "Continue to Bank Transfer →";
    const gwName = GATEWAYS.find(g => g.id === gateway)?.name ?? gateway;
    return `Pay ${feeLabel} via ${gwName}`;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 32, maxWidth: 460, width: "100%" }}>
        <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Pay Publishing Fee</h3>
        <p style={{ color: "#8892a4", fontSize: 14, marginBottom: 4 }}>
          Publishing <strong style={{ color: "#e8eaf0" }}>"{app.name}"</strong> — one-time fee of{" "}
          <strong style={{ color: accentColor }}>{feeLabel}</strong>.
        </p>
        {!african && (
          <p style={{ fontSize: 12, color: "#8892a4", marginBottom: 20, lineHeight: 1.5 }}>
            💡 We detected you're outside Africa. Your fee is <strong style={{ color: "#a78bfa" }}>$100 USD</strong>. Pay via Squad first — if that fails, switch to Stripe.
          </p>
        )}
        {african && <div style={{ marginBottom: 20 }} />}

        <div style={{ fontWeight: 700, fontSize: 12, color: "#8892a4", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Choose Payment Method</div>
        {GATEWAYS.map(g => (
          <button key={g.id} onClick={() => setGateway(g.id)}
            style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", background: gateway===g.id?`rgba(${african?"0,200,83":"124,77,255"},0.08)`:"rgba(255,255,255,0.03)", border: `1.5px solid ${gateway===g.id?accentColor:"rgba(255,255,255,0.08)"}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", marginBottom: 10, textAlign: "left" }}>
            <span style={{ fontSize: 22 }}>{g.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#e8eaf0" }}>{g.name}</div>
              <div style={{ fontSize: 12, color: "#8892a4" }}>{g.desc}</div>
            </div>
            <span style={{ marginLeft: "auto", fontSize: 16, color: gateway===g.id?accentColor:"#2a3040" }}>{gateway===g.id?"●":"○"}</span>
          </button>
        ))}

        {error && (
          <div style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff5252", fontSize: 13, marginBottom: 14 }}>
            ❌ {error}
            {error.includes("Stripe") && gateway === "squad" && (
              <button onClick={() => { setGateway("stripe"); setError(""); }}
                style={{ display: "block", marginTop: 6, color: "#7c4dff", fontSize: 12, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                → Switch to Stripe
              </button>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} className="btn-outline" style={{ flex: 1 }}>Cancel</button>
          <button onClick={handlePay} disabled={loading} className="btn-green" style={{ flex: 2, fontSize: 14, background: african ? undefined : "linear-gradient(135deg,#7c4dff,#a78bfa)", borderColor: african ? undefined : "#7c4dff" }}>
            {payLabel()}
          </button>
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

function AppsTab({ apps, onPayApp, onRefresh, feeExempt, devCountry }: { apps: App[]; onPayApp: (a: App) => void; onRefresh: () => void; feeExempt?: boolean; devCountry?: string }) {
  const feeLabel = isAfricanCountry(devCountry) ? "NGN 50K" : "$100";
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
                  {app.status === "pending_payment" && !feeExempt && <button className="btn-green" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => onPayApp(app)}>Pay {feeLabel}</button>}
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

function DeveloperDashboard({ apps, onPayApp, onSubmit, feeExempt, devCountry }: {
  apps: App[];
  onPayApp: (a: App) => void;
  onSubmit: () => void;
  feeExempt?: boolean;
  devCountry?: string;
}) {
  const feeLabel = isAfricanCountry(devCountry) ? "NGN 50,000" : "$100 USD";
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

      {/* Pending payment banner — hidden for fee-exempt developers */}
      {!feeExempt && apps.filter(a => a.status === "pending_payment").length > 0 && (
        <div style={{ background: "rgba(255,179,0,0.05)", border: "1px solid rgba(255,179,0,0.15)", borderRadius: 14, padding: 20, marginBottom: 28 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, color: "#ffb300" }}>💳 Awaiting Payment</div>
          {apps.filter(a => a.status === "pending_payment").map(app => (
            <div key={app.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontSize: 14 }}>{app.name}</span>
              <button className="btn-green" style={{ fontSize: 13, padding: "6px 16px" }} onClick={() => onPayApp(app)}>Pay {feeLabel}</button>
            </div>
          ))}
        </div>
      )}

      {apps.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
          <div style={{ color: "#8892a4", fontSize: 14, marginBottom: 20 }}>Submit your first app for {feeLabel}.</div>
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

      {/* Per-app engagement stats */}
      {apps.filter(a => a.status === "approved").length > 0 && (
        <AppEngagementStats apps={apps.filter(a => a.status === "approved")} />
      )}
    </div>
  );
}

// ── AppEngagementStats ────────────────────────────────────────────────────────

interface AppStats {
  totalViews: number;
  totalInstalls: number;
  totalUninstalls: number;
  conversionRate: number;
  viewsByCountry: { country: string; count: number }[];
  installsByCountry: { country: string; count: number }[];
  daily: { date: string; views: number; installs: number; uninstalls: number }[];
}

const COUNTRY_FLAG: Record<string, string> = {
  NG:"🇳🇬",GH:"🇬🇭",KE:"🇰🇪",ZA:"🇿🇦",ET:"🇪🇹",TZ:"🇹🇿",
  UG:"🇺🇬",RW:"🇷🇼",SN:"🇸🇳",CM:"🇨🇲",US:"🇺🇸",GB:"🇬🇧",
};

function AppEngagementStats({ apps }: { apps: App[] }) {
  const [selected, setSelected] = useState(apps[0]?.slug ?? "");
  const [stats, setStats] = useState<AppStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    apiFetch<AppStats>(`/apps/${selected}/stats`)
      .then(setStats).catch(() => setStats(null)).finally(() => setLoading(false));
  }, [selected]);

  const app = apps.find(a => a.slug === selected);

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>📊 Engagement Analytics</div>

      {/* App selector */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {apps.map(a => (
          <button key={a.slug} onClick={() => setSelected(a.slug)}
            style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${selected === a.slug ? "#00c853" : "rgba(255,255,255,0.1)"}`,
              background: selected === a.slug ? "rgba(0,200,83,0.1)" : "transparent",
              color: selected === a.slug ? "#00c853" : "#8892a4" }}>
            {a.name}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40 }}><div className="spinner" style={{ margin: "0 auto" }} /></div>}

      {!loading && stats && (
        <div>
          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12, marginBottom: 24 }}>
            {[
              { icon: "👁️", label: "Views",       value: stats.totalViews.toLocaleString(),       color: "#a78bfa" },
              { icon: "📥", label: "Installs",    value: stats.totalInstalls.toLocaleString(),    color: "#00c853" },
              { icon: "🗑️", label: "Uninstalls",  value: stats.totalUninstalls.toLocaleString(),  color: "#ff5252" },
              { icon: "🔄", label: "Conversion",  value: `${stats.conversionRate}%`,               color: "#38bdf8" },
            ].map(k => (
              <div key={k.label} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{k.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 11, color: "#8892a4" }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* 30-day trend */}
          {stats.daily.length > 0 && (
            <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, color: "#c0c8d8" }}>📈 30-day Trend — {app?.name}</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.daily} margin={{ left: -20, right: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fill: "#8892a4", fontSize: 9 }} tickFormatter={d => d.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fill: "#8892a4", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#131920", border: "none", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#e8eaf0" }} />
                  <Bar dataKey="views"    name="Views"     stackId="a" fill="#a78bfa" radius={[0,0,0,0]} />
                  <Bar dataKey="installs" name="Installs"  stackId="b" fill="#00c853" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Countries */}
          {stats.viewsByCountry.length > 0 && (
            <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, color: "#c0c8d8" }}>🌍 Views by Country</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {stats.viewsByCountry.slice(0, 6).map(({ country, count }) => {
                  const max = stats.viewsByCountry[0]!.count;
                  return (
                    <div key={country}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                        <span>{COUNTRY_FLAG[country] ?? "🌍"} {country}</span>
                        <span style={{ color: "#8892a4" }}>{count}</span>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 5 }}>
                        <div style={{ background: "#a78bfa", borderRadius: 4, height: 5, width: `${(count / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && !stats && (
        <div style={{ color: "#8892a4", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
          No engagement data yet — it appears once users view or install your app.
        </div>
      )}
    </div>
  );
}

// ── AiLaunchTab ───────────────────────────────────────────────────────────────

const AFRICA_CATS = [
  "Mobile Money & Fintech","Agriculture & Farming","Health & Telemedicine","Education & E-Learning",
  "Logistics & Delivery","Food & Restaurant","Entertainment & Music","Social & Community",
  "Business & Commerce","Government & E-Services","Transport & Ride-Hailing","Utilities & Infrastructure",
  "Fashion & Beauty","Real Estate","Emergencies","Community Engagements",
];

type LaunchStep = "upload" | "processing" | "review" | "done";

function AiLaunchTab({ dev, onAppCreated }: { dev: Developer; onAppCreated: (app: App) => void }) {
  const [step, setStep] = useState<LaunchStep>("upload");
  const [session, setSession] = useState<AiLaunchSession | null>(null);
  const [form, setForm] = useState<AiLaunchGeneratedData>({});
  const [aiCategories, setAiCategories] = useState<string[]>([AFRICA_CATS[0]]);
  const [keywords, setKeywords] = useState("");
  const [features, setFeatures] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [bundleFile, setBundleFile] = useState<File | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  // Stop polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function populateForm(ai: AiLaunchGeneratedData) {
    setForm(ai);
    setKeywords((ai.keywords ?? []).join(", "));
    setFeatures((ai.features ?? []).join("\n"));
    if (ai.category) setAiCategories([ai.category]);
  }

  function startPolling(sid: number) {
    pollRef.current = setInterval(async () => {
      try {
        const s = await apiFetch<AiLaunchSession>(`/ai-launch/${sid}`);
        setSession(s);
        if (s.status === "ready") {
          clearInterval(pollRef.current!);
          populateForm(s.aiGenerated ?? {});
          setStep("review");
        } else if (s.status === "failed") {
          clearInterval(pollRef.current!);
          setError(s.errorMessage ?? "AI analysis failed. Please fill in the details manually.");
          populateForm(s.aiGenerated ?? {});
          setStep("review");
        }
      } catch { /* keep polling */ }
    }, 2500);
  }

  async function handleUpload() {
    if (!bundleFile && !iconFile && screenshotFiles.length === 0) {
      setError("Add a ZIP bundle, or at least an icon or screenshots.");
      return;
    }
    setError(""); setUploading(true); setUploadProgress(0);

    try {
      // Build a list of all files with their weights for aggregate progress
      type UploadItem = { file: File; label: string; key: string };
      const items: UploadItem[] = [
        ...(bundleFile ? [{ file: bundleFile, label: "bundle", key: "bundle" }] : []),
        ...(iconFile   ? [{ file: iconFile,   label: "icon",   key: "icon"   }] : []),
        ...screenshotFiles.map((f, i) => ({ file: f, label: `screenshot ${i + 1}`, key: "ss" })),
      ];
      const totalBytes = items.reduce((s, i) => s + i.file.size, 0) || 1;
      let doneBytes = 0;

      function weightedProgress(itemFile: File, pct: number) {
        const partial = (doneBytes + (itemFile.size * pct) / 100) / totalBytes;
        setUploadProgress(Math.round(partial * 92));
      }

      let bundleUrl: string | null = null;
      let uploadedIconUrl: string | null = null;
      const uploadedScreenshotUrls: string[] = [];

      for (const item of items) {
        setUploadStatus(`Uploading ${item.label} (${formatBytes(item.file.size)})…`);
        const url = await uploadFilePresigned(item.file, (pct) => weightedProgress(item.file, pct));
        doneBytes += item.file.size;
        if (item.key === "bundle") bundleUrl = url;
        else if (item.key === "icon") uploadedIconUrl = url;
        else uploadedScreenshotUrls.push(url);
      }

      setUploadStatus("Starting AI analysis…");
      setUploadProgress(96);

      const data = await apiFetch<AiLaunchSession>("/store/ai-launch/upload", {
        method: "POST",
        body: JSON.stringify({
          bundleUrl,
          iconUrl: uploadedIconUrl,
          screenshotUrls: uploadedScreenshotUrls,
        }),
      });

      setUploadProgress(100);
      setSession(data);
      setStep("processing");
      startPolling(data.sessionId);
    } catch (err: any) {
      setError(err.message ?? "Upload failed.");
    } finally {
      setUploading(false);
      setUploadStatus("");
    }
  }

  async function handleSubmit() {
    if (!session) return;
    if (!form.name || !form.tagline || !form.description || !form.iconUrl || !form.downloadUrl) {
      setError("App Name, Tagline, Description, Icon URL, and Download URL are required."); return;
    }
    setError(""); setSubmitting(true);
    try {
      const payload = {
        ...form,
        categories: aiCategories,
        keywords: keywords.split(",").map(k => k.trim()).filter(Boolean),
        features: features.split("\n").map(f => f.trim()).filter(Boolean),
        screenshots: form.screenshots ?? [],
      };
      const app = await apiFetch<any>(`/ai-launch/${session.sessionId}/submit`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onAppCreated(app);
      setStep("done");
    } catch (err: any) {
      setError(err.message ?? "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) {
      if (f.name.endsWith(".zip")) { setBundleFile(f); }
      else if (/icon/i.test(f.name) && /\.(png|jpg|jpeg|webp)$/i.test(f.name)) { setIconFile(f); }
      else if (/\.(png|jpg|jpeg|webp)$/i.test(f.name)) { setScreenshotFiles(p => [...p, f].slice(0, 8)); }
    }
  }

  function setF(k: keyof AiLaunchGeneratedData, v: string) {
    setForm(p => ({ ...p, [k]: v }));
  }

  // ── Step: Upload ─────────────────────────────────────────────────────────
  if (step === "upload") return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 6 }}>🤖 AI App Launcher</h2>
        <p style={{ color: "#8892a4", fontSize: 14, lineHeight: 1.6 }}>
          Upload your app assets — a ZIP bundle or individual files — and our AI will analyze your screenshots,
          generate a compelling store listing, and pre-fill every field. Review, edit, then launch with one click.
        </p>
      </div>

      {/* How it works */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { icon: "📦", title: "Upload Assets", desc: "Drop a ZIP with icon, screenshots, and an app.json — or upload files separately" },
          { icon: "🧠", title: "AI Analyzes", desc: "GPT-4o Vision reads your screenshots and writes the listing copy automatically" },
          { icon: "🚀", title: "One-Click Launch", desc: "Review, edit if needed, then submit — your app goes straight into the review queue" },
        ].map(s => (
          <div key={s.icon} style={{ background: "rgba(124,77,255,0.06)", border: "1px solid rgba(124,77,255,0.15)", borderRadius: 14, padding: "16px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 5, color: "#a78bfa" }}>{s.title}</div>
            <div style={{ fontSize: 12, color: "#8892a4", lineHeight: 1.5 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#a78bfa" : "rgba(124,77,255,0.3)"}`,
          borderRadius: 18, padding: "40px 24px", textAlign: "center", cursor: "pointer",
          background: dragOver ? "rgba(124,77,255,0.08)" : "rgba(124,77,255,0.03)",
          transition: "all 0.2s", marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 44, marginBottom: 10 }}>📂</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
          {bundleFile ? `✅ ${bundleFile.name}` : "Drop your ZIP bundle here"}
        </div>
        <div style={{ fontSize: 13, color: "#8892a4" }}>
          or click to browse · ZIP containing <code style={{ color: "#a78bfa" }}>app.json</code>, <code style={{ color: "#a78bfa" }}>icon.png</code>, screenshots
        </div>
        <input ref={fileInputRef} type="file" accept=".zip" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) setBundleFile(f); }} />
      </div>

      {/* Separator */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
        <span style={{ color: "#8892a4", fontSize: 12 }}>or upload individually</span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
      </div>

      {/* Individual file pickers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <div
          onClick={() => iconInputRef.current?.click()}
          style={{ border: `1px solid ${iconFile ? "rgba(0,200,83,0.4)" : "rgba(255,255,255,0.08)"}`, borderRadius: 12, padding: 16, cursor: "pointer", textAlign: "center" }}
        >
          <div style={{ fontSize: 24, marginBottom: 4 }}>{iconFile ? "✅" : "🖼️"}</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{iconFile ? iconFile.name : "App Icon"}</div>
          <div style={{ fontSize: 11, color: "#8892a4" }}>PNG / JPG</div>
          <input ref={iconInputRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) setIconFile(f); }} />
        </div>
        <div
          onClick={() => screenshotInputRef.current?.click()}
          style={{ border: `1px solid ${screenshotFiles.length ? "rgba(0,200,83,0.4)" : "rgba(255,255,255,0.08)"}`, borderRadius: 12, padding: 16, cursor: "pointer", textAlign: "center" }}
        >
          <div style={{ fontSize: 24, marginBottom: 4 }}>{screenshotFiles.length ? "✅" : "📸"}</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{screenshotFiles.length ? `${screenshotFiles.length} screenshot${screenshotFiles.length > 1 ? "s" : ""}` : "Screenshots"}</div>
          <div style={{ fontSize: 11, color: "#8892a4" }}>Up to 8 images</div>
          <input ref={screenshotInputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => setScreenshotFiles(Array.from(e.target.files ?? []).slice(0, 8))} />
        </div>
      </div>

      {/* app.json hint */}
      <details style={{ marginBottom: 24 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, color: "#a78bfa", fontWeight: 600 }}>📋 app.json format (optional — AI generates everything without it)</summary>
        <pre style={{ background: "#0a0d13", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 14, fontSize: 12, color: "#8892a4", marginTop: 10, overflowX: "auto" }}>{`{
  "name": "My App",
  "version": "1.0.0",
  "platform": "android",
  "downloadUrl": "https://play.google.com/...",
  "webUrl": "https://myapp.com",
  "packageName": "com.example.myapp"
}`}</pre>
      </details>

      {error && <div style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff5252", fontSize: 14, marginBottom: 16 }}>❌ {error}</div>}

      {/* Upload progress bar — shown while files are uploading */}
      {uploading && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#8892a4", marginBottom: 6 }}>
            <span>{uploadStatus || "Uploading…"}</span>
            <span>{uploadProgress}%</span>
          </div>
          <div style={{ height: 8, background: "rgba(255,255,255,0.07)", borderRadius: 8, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${uploadProgress}%` }}
              transition={{ ease: "linear", duration: 0.3 }}
              style={{ height: "100%", background: "linear-gradient(90deg, #7c4dff, #a78bfa)", borderRadius: 8 }}
            />
          </div>
          <div style={{ fontSize: 11, color: "#8892a4", marginTop: 6, textAlign: "center" }}>
            Files upload directly to storage — no size limit, no timeouts
          </div>
        </div>
      )}

      <button
        className="btn-green"
        onClick={handleUpload}
        disabled={uploading || (!bundleFile && !iconFile && screenshotFiles.length === 0)}
        style={{ width: "100%", padding: 14, fontSize: 16, fontWeight: 700 }}
      >
        {uploading ? `⏫ Uploading… ${uploadProgress}%` : "🤖 Analyze with AI →"}
      </button>
    </div>
  );

  // ── Step: Processing ─────────────────────────────────────────────────────
  if (step === "processing") return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        style={{ fontSize: 64, display: "inline-block", marginBottom: 24 }}
      >🧠</motion.div>
      <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 10 }}>AI is analyzing your app…</h2>
      <p style={{ color: "#8892a4", fontSize: 14, maxWidth: 400, margin: "0 auto 24px" }}>
        Our AI is examining your screenshots and writing a compelling store listing. This usually takes 10–20 seconds.
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {["📦 Extracting files","🖼️ Uploading images","🧠 Analyzing visuals","✍️ Writing copy"].map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 2, delay: i * 0.5 }}
            style={{ background: "rgba(124,77,255,0.1)", border: "1px solid rgba(124,77,255,0.2)", borderRadius: 20, padding: "6px 12px", fontSize: 12, color: "#a78bfa" }}
          >
            {s}
          </motion.div>
        ))}
      </div>
    </div>
  );

  // ── Step: Review ─────────────────────────────────────────────────────────
  if (step === "review") {
    const isFailed = session?.status === "failed";
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>
              {isFailed ? "⚠️ Fill in Details" : "✨ Review AI-Generated Listing"}
            </h2>
            <p style={{ color: "#8892a4", fontSize: 13 }}>
              {isFailed
                ? "AI analysis had an issue — please fill in the fields manually."
                : "AI pre-filled everything from your screenshots. Edit any field before launching."}
            </p>
          </div>
          {!isFailed && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(0,200,83,0.08)", border: "1px solid rgba(0,200,83,0.2)", borderRadius: 20, padding: "6px 14px", fontSize: 12, color: "#00c853" }}>
              🤖 AI generated
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Icon preview + URL */}
          {form.iconUrl && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
              <img src={form.iconUrl} alt="icon" style={{ width: 72, height: 72, borderRadius: 18, border: "1px solid rgba(255,255,255,0.1)", objectFit: "cover" }} />
              <div style={{ flex: 1 }}>
                <label className="form-label">Icon URL *</label>
                <input className="input" value={form.iconUrl ?? ""} onChange={e => setF("iconUrl", e.target.value)} placeholder="https://..." />
              </div>
            </div>
          )}
          {!form.iconUrl && (
            <div>
              <label className="form-label">Icon URL *</label>
              <input className="input" value={form.iconUrl ?? ""} onChange={e => setF("iconUrl", e.target.value)} placeholder="https://..." />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="form-label">App Name *</label>
              <input className="input" value={form.name ?? ""} onChange={e => setF("name", e.target.value)} placeholder="My App" />
            </div>
            <div>
              <label className="form-label">Platform *</label>
              <select className="input" value={form.platform ?? "android"} onChange={e => setF("platform", e.target.value)}>
                <option value="android">🤖 Android</option>
                <option value="ios">🍎 iOS</option>
                <option value="web">🌐 Web App</option>
                <option value="all">📱 All Platforms</option>
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Tagline * <span style={{ color: "#8892a4", fontWeight: 400 }}>— one punchy sentence</span></label>
            <input className="input" value={form.tagline ?? ""} onChange={e => setF("tagline", e.target.value)} placeholder="One powerful sentence about your app" />
          </div>

          <CategoryPicker
            selected={aiCategories}
            onChange={setAiCategories}
            all={AFRICA_CATS}
            label="Categories * ✨ AI-suggested"
          />
          <div>
            <label className="form-label">Version</label>
            <input className="input" value={form.currentVersion ?? ""} onChange={e => setF("currentVersion", e.target.value)} placeholder="1.0.0" />
          </div>

          <div>
            <label className="form-label">Description * <span style={{ color: "#a78bfa", fontWeight: 400 }}>✨ AI-written</span></label>
            <textarea className="input" value={form.description ?? ""} onChange={e => setF("description", e.target.value)} style={{ minHeight: 140 }} placeholder="Detailed description..." />
          </div>

          <div>
            <label className="form-label">Key Features <span style={{ color: "#a78bfa", fontWeight: 400 }}>✨ AI-written — one per line</span></label>
            <textarea className="input" value={features} onChange={e => setFeatures(e.target.value)} style={{ minHeight: 100 }} placeholder="🔐 Secure login&#10;📊 Real-time analytics&#10;📱 Works offline" />
          </div>

          <div>
            <label className="form-label">Search Keywords <span style={{ color: "#a78bfa", fontWeight: 400 }}>✨ AI-generated — comma separated</span></label>
            <input className="input" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="fintech, mobile money, payments..." />
          </div>

          <div>
            <label className="form-label">Download / Install Link *</label>
            <input className="input" type="url" value={form.downloadUrl ?? ""} onChange={e => setF("downloadUrl", e.target.value)} placeholder="https://play.google.com/..." />
          </div>

          <div>
            <label className="form-label">Web App URL (optional)</label>
            <input className="input" type="url" value={form.webUrl ?? ""} onChange={e => setF("webUrl", e.target.value)} placeholder="https://..." />
          </div>

          <div>
            <label className="form-label">Package / Bundle ID <span style={{ color: "#8892a4", fontWeight: 400 }}>(recommended)</span></label>
            <input className="input" value={form.packageName ?? ""} onChange={e => setF("packageName", e.target.value)} placeholder="com.example.myapp" />
          </div>

          {/* Screenshots preview */}
          {(form.screenshots ?? []).length > 0 && (
            <div>
              <label className="form-label">Screenshots ({(form.screenshots ?? []).length} uploaded by AI)</label>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {(form.screenshots ?? []).map((url, i) => (
                  <img key={i} src={url} alt={`Screenshot ${i + 1}`} style={{ height: 120, borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", flexShrink: 0, objectFit: "cover" }} />
                ))}
              </div>
            </div>
          )}

          {!dev.feeExempt && (
            <div style={{ background: "rgba(255,179,0,0.08)", border: "1px solid rgba(255,179,0,0.2)", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#c0c8d8" }}>
              💳 After launch you'll pay the publishing fee (<strong style={{ color: "#ffb300" }}>NGN 50,000</strong> · Africa · <strong style={{ color: "#a78bfa" }}>$100 USD</strong> · International) via your preferred payment method.
            </div>
          )}

          {error && <div style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff5252", fontSize: 14 }}>❌ {error}</div>}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-outline" onClick={() => { setStep("upload"); setSession(null); setForm({}); setError(""); }} style={{ flex: 1 }}>
              ← Start Over
            </button>
            <button className="btn-green" onClick={handleSubmit} disabled={submitting} style={{ flex: 2, padding: 14, fontSize: 15, fontWeight: 700 }}>
              {submitting ? "🚀 Launching..." : "🚀 Launch App →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: Done ───────────────────────────────────────────────────────────
  return (
    <div style={{ textAlign: "center", padding: "48px 20px" }}>
      <div style={{ fontSize: 72, marginBottom: 20 }}>🎉</div>
      <h2 style={{ fontWeight: 800, fontSize: 24, marginBottom: 10 }}>App Launched!</h2>
      <p style={{ color: "#8892a4", fontSize: 14, maxWidth: 420, margin: "0 auto 28px", lineHeight: 1.7 }}>
        {dev.feeExempt
          ? "Your app is now in the review queue. An admin will approve it shortly."
          : "Your app has been submitted. Complete the publishing fee from My Apps to go live."}
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <button className="btn-outline" onClick={() => { setStep("upload"); setSession(null); setForm({}); setError(""); }}>
          🤖 Launch Another App
        </button>
      </div>
    </div>
  );
}

// ── Main DeveloperPortal ──────────────────────────────────────────────────────

type View = "dashboard" | "apps" | "platforms" | "submit" | "ai-launch";

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
  // Paystack appends "reference" (and "trxref") to the callback URL.
  const paymentRef = searchParams.get("reference") ?? searchParams.get("trxref") ?? searchParams.get("ref");
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

  const paymentSessionId = searchParams.get("session_id");
  const paymentTxnRef    = searchParams.get("transaction_ref") ?? searchParams.get("txnRef");

  useEffect(() => {
    if (paymentGateway === "paystack" && paymentRef) {
      apiFetch("/payments/paystack/verify", { method: "POST", body: JSON.stringify({ reference: paymentRef }) })
        .then(() => loadData()).catch(() => {});
    } else if (paymentGateway === "interswitch" && paymentStatus === "success") {
      loadData();
    } else if (paymentGateway === "squad" && paymentStatus === "success" && paymentTxnRef) {
      // Squad redirected back — server already verified in the callback, just reload
      loadData();
    } else if (paymentGateway === "squad" && paymentTxnRef) {
      // Squad callback without status=success — try explicit verify
      apiFetch("/payments/squad/verify", { method: "POST", body: JSON.stringify({ transactionRef: paymentTxnRef }) })
        .then(() => loadData()).catch(() => {});
    } else if (paymentGateway === "stripe" && paymentSessionId) {
      // Stripe redirected back — verify the session
      apiFetch("/payments/stripe/verify-usd", { method: "POST", body: JSON.stringify({ sessionId: paymentSessionId }) })
        .then(() => loadData()).catch(() => {});
    }
  }, [paymentGateway, paymentRef, paymentStatus, paymentTxnRef, paymentSessionId]);

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
      <p style={{ color: "#8892a4", marginBottom: 28 }}>Join Africa App Store — free registration, then NGN 50,000 (African) / $100 USD (International) per app published.</p>
      <Link href="/developer/signup" className="btn-green" style={{ display: "inline-flex", fontSize: 15, padding: "12px 32px" }}>Create Developer Account →</Link>
    </div>
  );

  const TABS: { id: View; label: string }[] = [
    { id: "dashboard",  label: "📊 Overview" },
    { id: "apps",       label: `📱 My Apps (${apps.length})` },
    { id: "ai-launch",  label: "🤖 AI Launch" },
    { id: "platforms",  label: "🔗 Platforms" },
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
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 28, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setView(t.id)} style={{
              padding: "10px 18px", background: "none", border: "none", whiteSpace: "nowrap",
              borderBottom: view === t.id ? `2px solid ${t.id === "ai-launch" ? "#a78bfa" : "#00c853"}` : "2px solid transparent",
              color: view === t.id ? (t.id === "ai-launch" ? "#a78bfa" : "#00c853") : "#8892a4",
              fontWeight: view === t.id ? 700 : 400, fontSize: 14, cursor: "pointer",
            }}>
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
        <DeveloperDashboard apps={apps} onPayApp={setPaymentApp} onSubmit={() => setView("submit")} feeExempt={dev.feeExempt} devCountry={dev.country} />
      )}

      {/* Apps */}
      {view === "apps" && <AppsTab apps={apps} onPayApp={setPaymentApp} onRefresh={loadData} feeExempt={dev.feeExempt} devCountry={dev.country} />}

      {/* AI Launch */}
      {view === "ai-launch" && (
        <AiLaunchTab
          dev={dev}
          onAppCreated={app => {
            setApps(p => [app as unknown as App, ...p]);
            setView("apps");
          }}
        />
      )}

      {/* Platforms */}
      {view === "platforms" && <PlatformsTab dev={dev} />}

      {/* Payment modal */}
      {paymentApp && <PaymentModal app={paymentApp} devCountry={dev?.country} onClose={() => { setPaymentApp(null); loadData(); }} />}
    </div>
  );
}
