import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { useUser, SignInButton } from "@clerk/react";
import { apiFetch } from "../lib/api";
import type { App, Review, AppVersion } from "../lib/types";

/** Session ID stored in sessionStorage so we don't repeat on tab reopen. */
function getSessionId(): string {
  const key = "awa_sid";
  let sid = sessionStorage.getItem(key);
  if (!sid) { sid = Math.random().toString(36).slice(2); sessionStorage.setItem(key, sid); }
  return sid;
}

/** Fire-and-forget event beacon. */
function fireEvent(slug: string, eventType: "view" | "uninstall") {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  navigator.sendBeacon
    ? navigator.sendBeacon(`${base}/api/store/apps/${slug}/event`, new Blob([JSON.stringify({ eventType, sessionId: getSessionId() })], { type: "application/json" }))
    : apiFetch(`/apps/${slug}/event`, { method: "POST", body: JSON.stringify({ eventType, sessionId: getSessionId() }) }).catch(() => {});
}

function Stars({ rating, interactive = false, onRate }: { rating: number; interactive?: boolean; onRate?: (r: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {[1,2,3,4,5].map(i => (
        <span
          key={i}
          onClick={() => interactive && onRate?.(i)}
          onMouseEnter={() => interactive && setHover(i)}
          onMouseLeave={() => interactive && setHover(0)}
          style={{ fontSize: interactive ? 22 : 14, color: i <= (hover || Math.round(rating)) ? "#ffb300" : "#2a3040", cursor: interactive ? "pointer" : "default" }}
        >★</span>
      ))}
    </div>
  );
}

const PLATFORM_LABEL: Record<string, string> = { android: "🤖 Android", ios: "🍎 iOS", web: "🌐 Web", all: "📱 All Platforms" };

/** Displays the canonical download link with a copy button. */
function CanonicalLinkBar({ url, version }: { url: string; version: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginTop: 12, background: "rgba(0,200,83,0.05)", border: "1px solid rgba(0,200,83,0.15)", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: "#00c853", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>🔗 Permanent Link</span>
      <span style={{ fontSize: 12, color: "#a78bfa", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{url}</span>
      {version && <span style={{ fontSize: 11, color: "#8892a4", flexShrink: 0 }}>v{version}</span>}
      <button
        onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        style={{ background: copied ? "rgba(0,200,83,0.2)" : "rgba(0,200,83,0.1)", color: "#00c853", border: "1px solid rgba(0,200,83,0.2)", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
      >
        {copied ? "✅ Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function AppDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { isSignedIn } = useUser();
  const [app, setApp] = useState<App | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [tab, setTab] = useState<"about"|"reviews"|"versions">("about");
  const [loading, setLoading] = useState(true);
  const [selectedShot, setSelectedShot] = useState(0);
  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  const [showSubscribe, setShowSubscribe] = useState<"idle"|"prompt"|"submitting"|"done"|"signed-in-done">("idle");
  const [subEmail, setSubEmail] = useState("");
  const [subError, setSubError] = useState("");

  const viewFired = useRef(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    Promise.all([
      apiFetch<App>(`/apps/${slug}`),
      apiFetch<Review[]>(`/apps/${slug}/reviews`),
      apiFetch<AppVersion[]>(`/apps/${slug}/versions`),
    ]).then(([a, r, v]) => {
      setApp(a);
      setReviews(r ?? []);
      setVersions(v ?? []);
      // Fire view event once per page load
      if (!viewFired.current) { viewFired.current = true; fireEvent(slug, "view"); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [slug]);

  async function handleDownload() {
    if (!app) return;
    try {
      const { downloadUrl, webUrl } = await apiFetch<{ downloadUrl: string; webUrl: string | null }>(`/apps/${slug}/download`, { method: "POST" });
      const target = downloadUrl || webUrl;
      if (target) window.open(target, "_blank");
      // Show update-notification opt-in after download
      if (isSignedIn) {
        // Signed-in: silently subscribe via their Clerk session email (handled server-side)
        apiFetch(`/apps/${slug}/subscribe-updates`, { method: "POST", body: JSON.stringify({ email: "__clerk__" }) }).catch(() => {});
        setShowSubscribe("signed-in-done");
      } else {
        setShowSubscribe("prompt");
      }
    } catch {}
  }

  async function handleSubscribeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!app || !subEmail) return;
    setSubError("");
    setShowSubscribe("submitting");
    try {
      await apiFetch(`/apps/${slug}/subscribe-updates`, { method: "POST", body: JSON.stringify({ email: subEmail }) });
      setShowSubscribe("done");
    } catch {
      setSubError("Something went wrong. Please try again.");
      setShowSubscribe("prompt");
    }
  }

  function handleUninstall() {
    if (!app || !confirm(`Report that you've uninstalled "${app.name}"? This helps developers track retention.`)) return;
    fireEvent(slug!, "uninstall");
  }

  async function submitReview() {
    if (!myRating || !app) return;
    setSubmitting(true);
    try {
      const review = await apiFetch<Review>(`/apps/${slug}/reviews`, {
        method: "POST",
        body: JSON.stringify({ rating: myRating, comment: myComment }),
      });
      setReviews(prev => [review, ...prev]);
      setReviewSuccess(true);
      setMyRating(0);
      setMyComment("");
    } catch {}
    finally { setSubmitting(false); }
  }

  if (loading) return (
    <div style={{ maxWidth: 980, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
      <div className="spinner" style={{ margin: "0 auto" }} />
    </div>
  );

  if (!app) return (
    <div style={{ maxWidth: 980, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
      <div style={{ fontSize: 48 }}>😕</div>
      <h2 style={{ marginTop: 16 }}>App not found</h2>
      <Link href="/" style={{ color: "#00c853", marginTop: 12, display: "inline-block" }}>← Back to store</Link>
    </div>
  );

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px 80px" }}>
      <Link href="/" style={{ color: "#8892a4", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 24, textDecoration: "none" }}>
        ← Africa App Store
      </Link>

      {/* App Header */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 32 }}>
        <img
          src={app.iconUrl}
          alt={app.name}
          style={{ width: 100, height: 100, borderRadius: 22, objectFit: "cover", flexShrink: 0, background: "#0d1117" }}
          onError={(e) => { (e.target as HTMLImageElement).src = `https://placehold.co/100x100/0d1117/00c853?text=${encodeURIComponent(app.name[0])}`; }}
        />
        <div style={{ flex: 1, minWidth: 220 }}>
          {app.isFeatured && <span style={{ background: "#ffb300", color: "#000", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 4, textTransform: "uppercase", display: "inline-block", marginBottom: 8 }}>⭐ Editor's Pick</span>}
          <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>{app.name}</h1>
          <div style={{ color: "#8892a4", fontSize: 14, marginBottom: 8 }}>
            {app.developerName} · {app.category} · {PLATFORM_LABEL[app.platform] ?? app.platform}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Stars rating={app.rating} />
              <span style={{ fontWeight: 700, fontSize: 15 }}>{app.rating > 0 ? app.rating.toFixed(1) : "—"}</span>
              <span style={{ color: "#8892a4", fontSize: 13 }}>({app.ratingCount} ratings)</span>
            </div>
            <span style={{ color: "#8892a4", fontSize: 13 }}>📥 {app.totalDownloads.toLocaleString()} downloads</span>
            {app.currentVersion && <span style={{ color: "#8892a4", fontSize: 13 }}>v{app.currentVersion}</span>}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn-green" style={{ fontSize: 15, padding: "10px 28px" }} onClick={handleDownload}>
              {app.platform === "web" ? "🌐 Open App" : "⬇️ Download"}
            </button>
            {app.webUrl && app.platform !== "web" && (
              <a href={app.webUrl} target="_blank" rel="noreferrer" className="btn-outline" style={{ fontSize: 14 }}>🌐 Open Web Version</a>
            )}
            <button onClick={handleUninstall} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 14px", color: "#8892a4", fontSize: 12, cursor: "pointer" }} title="Report that you uninstalled this app">
              🗑 Report Uninstall
            </button>
          </div>

          {/* ── Update notification opt-in ── */}
          {showSubscribe !== "idle" && (
            <div style={{
              marginTop: 14, padding: "14px 16px", borderRadius: 12,
              background: showSubscribe === "done" || showSubscribe === "signed-in-done"
                ? "rgba(0,200,83,0.08)" : "rgba(255,179,0,0.06)",
              border: `1px solid ${showSubscribe === "done" || showSubscribe === "signed-in-done"
                ? "rgba(0,200,83,0.2)" : "rgba(255,179,0,0.2)"}`,
            }}>
              {showSubscribe === "signed-in-done" && (
                <p style={{ margin: 0, fontSize: 13, color: "#00c853" }}>
                  🔔 You'll be notified when a new version is released.
                </p>
              )}
              {showSubscribe === "done" && (
                <p style={{ margin: 0, fontSize: 13, color: "#00c853" }}>
                  ✅ Done! We'll email you when a new version drops.
                </p>
              )}
              {(showSubscribe === "prompt" || showSubscribe === "submitting") && (
                <form onSubmit={handleSubscribeSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#ffb300" }}>
                    🔔 Get notified when a new version is released
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      type="email"
                      required
                      placeholder="your@email.com"
                      value={subEmail}
                      onChange={e => setSubEmail(e.target.value)}
                      style={{
                        flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 7,
                        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                        color: "#e8eaf0", fontSize: 13, outline: "none",
                      }}
                    />
                    <button
                      type="submit"
                      disabled={showSubscribe === "submitting"}
                      className="btn-green"
                      style={{ padding: "8px 18px", fontSize: 13, opacity: showSubscribe === "submitting" ? 0.6 : 1 }}
                    >
                      {showSubscribe === "submitting" ? "…" : "Notify me"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSubscribe("idle")}
                      style={{ background: "none", border: "none", color: "#8892a4", fontSize: 13, cursor: "pointer", padding: "8px 4px" }}
                    >
                      No thanks
                    </button>
                  </div>
                  {subError && <p style={{ margin: 0, fontSize: 12, color: "#f87171" }}>{subError}</p>}
                </form>
              )}
            </div>
          )}

          {/* Canonical download link */}
          {app.canonicalDownloadUrl && (
            <CanonicalLinkBar url={app.canonicalDownloadUrl} version={app.currentVersion} />
          )}
        </div>
      </div>

      {/* AI Summary */}
      {app.aiSummary && (
        <div style={{ background: "rgba(124,77,255,0.08)", border: "1px solid rgba(124,77,255,0.2)", borderRadius: 12, padding: "14px 18px", marginBottom: 28, display: "flex", gap: 10 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🤖</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", marginBottom: 4 }}>AI Review Summary</div>
            <div style={{ fontSize: 14, color: "#c0c8d8", lineHeight: 1.6 }}>{app.aiSummary}</div>
            {app.aiReviewScore !== null && (
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 12, background: app.aiReviewScore >= 70 ? "rgba(0,200,83,0.1)" : "rgba(255,179,0,0.1)", color: app.aiReviewScore >= 70 ? "#00c853" : "#ffb300", border: `1px solid ${app.aiReviewScore >= 70 ? "rgba(0,200,83,0.3)" : "rgba(255,179,0,0.3)"}`, borderRadius: 12, padding: "2px 10px", fontWeight: 700 }}>
                  Quality Score: {app.aiReviewScore}/100
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Screenshots */}
      {app.screenshots.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ overflowX: "auto", display: "flex", gap: 10, paddingBottom: 8 }}>
            {app.screenshots.map((shot, i) => (
              <img
                key={i}
                src={shot}
                alt={`Screenshot ${i + 1}`}
                onClick={() => setSelectedShot(i)}
                style={{ height: 220, borderRadius: 10, objectFit: "cover", cursor: "pointer", border: selectedShot === i ? "2px solid #00c853" : "2px solid transparent", flexShrink: 0 }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 28 }}>
        {(["about","reviews","versions"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ padding: "10px 20px", background: "none", border: "none", borderBottom: tab === t ? "2px solid #00c853" : "2px solid transparent", color: tab === t ? "#00c853" : "#8892a4", fontWeight: tab === t ? 700 : 400, fontSize: 14, cursor: "pointer", textTransform: "capitalize", transition: "color 0.15s" }}
          >
            {t === "about" ? "About" : t === "reviews" ? `Reviews (${reviews.length})` : `Versions (${versions.length})`}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "about" && (
        <div style={{ maxWidth: 640 }}>
          <p style={{ fontSize: 15, color: "#c0c8d8", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{app.description}</p>
          {app.developerWebsite && (
            <a href={app.developerWebsite} target="_blank" rel="noreferrer" style={{ color: "#00c853", fontSize: 13, display: "inline-block", marginTop: 16 }}>
              🔗 Developer Website
            </a>
          )}
        </div>
      )}

      {tab === "reviews" && (
        <div style={{ maxWidth: 640 }}>
          {/* Submit review */}
          {isSignedIn && !reviewSuccess && (
            <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Write a Review</div>
              <Stars rating={myRating} interactive onRate={setMyRating} />
              <textarea
                className="input"
                style={{ marginTop: 12, minHeight: 80 }}
                placeholder="Share your experience with this app..."
                value={myComment}
                onChange={(e) => setMyComment(e.target.value)}
              />
              <button className="btn-green" style={{ marginTop: 12 }} onClick={submitReview} disabled={!myRating || submitting}>
                {submitting ? "Submitting..." : "Submit Review"}
              </button>
            </div>
          )}
          {reviewSuccess && <div style={{ background: "rgba(0,200,83,0.08)", border: "1px solid rgba(0,200,83,0.2)", borderRadius: 10, padding: 14, marginBottom: 20, color: "#00c853", fontSize: 14 }}>✅ Review submitted! Thank you.</div>}
          {!isSignedIn && (
            <SignInButton mode="modal">
              <button className="btn-outline" style={{ marginBottom: 20, fontSize: 13 }}>Sign in to write a review</button>
            </SignInButton>
          )}

          {reviews.length === 0 ? (
            <div style={{ color: "#8892a4", fontSize: 14 }}>No reviews yet. Be the first!</div>
          ) : reviews.map(r => (
            <div key={r.id} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(0,200,83,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#00c853", fontSize: 13 }}>{r.reviewerName[0]}</div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{r.reviewerName}</span>
                </div>
                <Stars rating={r.rating} />
              </div>
              {r.comment && <p style={{ fontSize: 14, color: "#c0c8d8", lineHeight: 1.6 }}>{r.comment}</p>}
              <div style={{ fontSize: 11, color: "#8892a4", marginTop: 8 }}>{new Date(r.createdAt).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "versions" && (
        <div style={{ maxWidth: 640 }}>
          {versions.length === 0 ? (
            <div style={{ color: "#8892a4", fontSize: 14, padding: "24px 0" }}>No version history available yet.</div>
          ) : versions.map(v => {
            const isLive = v.status === "live";
            const versionUrl = app?.canonicalDownloadUrl
              ? app.canonicalDownloadUrl.replace(/\/dl\//, `/dl/`) + `/${v.version}`
              : null;
            const identifier = app?.packageName || app?.slug;
            const perVersionUrl = identifier ? `https://awajimaaappstore.com/dl/${encodeURIComponent(identifier)}/${v.version}` : null;
            return (
              <div key={v.id} style={{ background: "#0d1117", border: `1px solid ${isLive ? "rgba(0,200,83,0.3)" : "rgba(255,255,255,0.07)"}`, borderRadius: 12, padding: 16, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>v{v.version}</span>
                    {v.versionCode && <span style={{ fontSize: 11, color: "#8892a4" }}>build {v.versionCode}</span>}
                    {isLive && <span style={{ background: "rgba(0,200,83,0.15)", color: "#00c853", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" }}>● Live</span>}
                    {v.status === "deprecated" && <span style={{ background: "rgba(255,183,77,0.1)", color: "#ffb74d", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" }}>Archived</span>}
                  </div>
                  <span style={{ fontSize: 12, color: "#8892a4" }}>{new Date(v.createdAt).toLocaleDateString()}</span>
                </div>
                {v.minOsVersion && <div style={{ fontSize: 12, color: "#8892a4", marginBottom: 6 }}>Min OS: {v.minOsVersion}</div>}
                {v.releaseNotes && <p style={{ fontSize: 13, color: "#c0c8d8", lineHeight: 1.6, marginBottom: 8 }}>{v.releaseNotes}</p>}
                {v.fileSize && <div style={{ fontSize: 11, color: "#8892a4", marginBottom: 8 }}>Size: {(v.fileSize / 1024 / 1024).toFixed(1)} MB</div>}
                {perVersionUrl && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px", marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: "#8892a4", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{perVersionUrl}</span>
                    <a href={perVersionUrl} target="_blank" rel="noreferrer" style={{ color: "#00c853", fontSize: 11, flexShrink: 0, textDecoration: "none", fontWeight: 700 }}>⬇️ Download</a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
