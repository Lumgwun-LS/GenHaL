import { useEffect, useState } from "react";
import { useUser, SignInButton } from "@clerk/react";
import { Link, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "../lib/api";

interface AppRecord {
  id: number;
  name: string;
  slug: string;
  tagline: string | null;
  iconUrl: string | null;
  category: string | null;
  rating: number | null;
  platform: string | null;
  installedAt: string | null;
  developer?: { name: string } | null;
}

interface ReviewRecord {
  id: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  app: { id: number; name: string; slug: string; iconUrl: string | null } | null;
}

interface MeData {
  user: { displayName: string | null; email: string | null; createdAt: string } | null;
  installedApps: AppRecord[];
  reviews: ReviewRecord[];
}

const FADE_UP = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};
const STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

function StarRow({ rating }: { rating: number }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} style={{ fontSize: 12, color: n <= rating ? "#fbbf24" : "rgba(255,255,255,0.15)" }}>★</span>
      ))}
    </div>
  );
}

function AppCard({ app }: { app: AppRecord }) {
  return (
    <motion.div variants={FADE_UP}>
      <Link href={`/apps/${app.slug}`}>
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          padding: 16,
          display: "flex",
          gap: 14,
          alignItems: "center",
          cursor: "pointer",
          transition: "border-color 0.2s, background 0.2s",
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,200,83,0.3)"; (e.currentTarget as HTMLDivElement).style.background = "rgba(0,200,83,0.04)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"; }}
        >
          {app.iconUrl ? (
            <img src={app.iconUrl} alt={app.name} style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: 12, background: "rgba(0,200,83,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
              {app.name[0]}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: "#e8eaf0", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.name}</p>
            <p style={{ fontSize: 12, color: "rgba(232,234,240,0.5)", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.tagline ?? app.category ?? "App"}</p>
            {app.rating != null && <StarRow rating={Math.round(app.rating)} />}
          </div>
          <div style={{ fontSize: 10, color: "rgba(0,200,83,0.7)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", flexShrink: 0 }}>
            Installed
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function ReviewCard({ review }: { review: ReviewRecord }) {
  return (
    <motion.div variants={FADE_UP} style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      padding: "14px 16px",
      display: "flex",
      gap: 14,
      alignItems: "flex-start",
    }}>
      {review.app?.iconUrl ? (
        <img src={review.app.iconUrl} alt={review.app.name} style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
          {review.app?.name?.[0] ?? "?"}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: "#e8eaf0" }}>{review.app?.name ?? "Unknown App"}</span>
          <StarRow rating={review.rating} />
        </div>
        {review.comment && (
          <p style={{ fontSize: 13, color: "rgba(232,234,240,0.6)", lineHeight: 1.5, margin: 0 }}>{review.comment}</p>
        )}
        <p style={{ fontSize: 11, color: "rgba(232,234,240,0.3)", marginTop: 6 }}>
          {new Date(review.createdAt).toLocaleDateString()}
        </p>
      </div>
    </motion.div>
  );
}

export default function MyApps() {
  const { isSignedIn, user, isLoaded } = useUser();
  const search = useSearch();
  const fromBizSuite = search.includes("ref=vendor-hub");

  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    setLoading(true);
    apiFetch<MeData>("/users/me")
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [isSignedIn]);

  if (!isLoaded) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 36, height: 36, border: "3px solid rgba(0,200,83,0.2)", borderTopColor: "#00c853", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div style={{ minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "0 20px" }}>
        <div style={{ width: 72, height: 72, background: "rgba(0,200,83,0.12)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🔒</div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#e8eaf0", marginBottom: 8 }}>Sign in to see your apps</h2>
          <p style={{ color: "rgba(232,234,240,0.55)", fontSize: 15 }}>Your installed apps and reviews will appear here.</p>
        </div>
        <SignInButton mode="modal" forceRedirectUrl={`${window.location.pathname}${window.location.search}`}>
          <button className="btn-green" style={{ fontSize: 15, padding: "10px 28px" }}>Sign In</button>
        </SignInButton>
      </div>
    );
  }

  const displayName = user?.fullName ?? user?.firstName ?? data?.user?.displayName ?? "there";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px 80px" }}>
      {/* Welcome banner */}
      <motion.div initial="hidden" animate="show" variants={STAGGER}>
        {fromBizSuite && (
          <motion.div variants={FADE_UP} style={{
            background: "linear-gradient(135deg, rgba(124,58,237,0.18), rgba(168,85,247,0.08))",
            border: "1px solid rgba(124,58,237,0.3)",
            borderRadius: 14,
            padding: "12px 20px",
            marginBottom: 28,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 14,
            color: "#c4b5fd",
          }}>
            <span style={{ fontSize: 20 }}>🏢</span>
            <span>You're signed in from <strong>Awa Biz Suite</strong> — same account, no extra login needed.</span>
          </motion.div>
        )}

        <motion.div variants={FADE_UP} style={{ marginBottom: 36 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: "#e8eaf0", marginBottom: 6 }}>
            Welcome back, {displayName} 👋
          </h1>
          <p style={{ color: "rgba(232,234,240,0.5)", fontSize: 15 }}>
            Your apps, reviews, and activity in one place.
          </p>
        </motion.div>

        {/* Quick actions */}
        <motion.div variants={FADE_UP} style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 40 }}>
          {[
            { href: "/", label: "Browse Apps", emoji: "🛍️" },
            { href: "/developer", label: "Publish an App", emoji: "🚀" },
          ].map(({ href, label, emoji }) => (
            <Link key={href} href={href}>
              <div style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                padding: "9px 18px",
                fontSize: 14,
                color: "#c0c8d8",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "border-color 0.2s",
              }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,200,83,0.4)"}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.1)"}
              >
                <span>{emoji}</span> {label}
              </div>
            </Link>
          ))}
        </motion.div>

        {/* Installed Apps */}
        <motion.section variants={FADE_UP} style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#e8eaf0", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#00c853" }}>⬇</span> Installed Apps
            {data && (
              <span style={{ fontSize: 12, background: "rgba(0,200,83,0.15)", color: "#00c853", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                {data.installedApps.length}
              </span>
            )}
          </h2>

          {loading ? (
            <div style={{ display: "flex", gap: 12, padding: "20px 0" }}>
              {[1, 2, 3].map(n => (
                <div key={n} style={{ flex: 1, height: 84, background: "rgba(255,255,255,0.04)", borderRadius: 16, animation: "pulse 1.5s ease-in-out infinite" }} />
              ))}
              <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
            </div>
          ) : error ? (
            <p style={{ color: "rgba(232,234,240,0.4)", fontSize: 14 }}>Could not load apps right now.</p>
          ) : data?.installedApps.length === 0 ? (
            <div style={{ textAlign: "center", padding: "36px 0", color: "rgba(232,234,240,0.35)", fontSize: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
              <p>No apps installed yet. <Link href="/"><span style={{ color: "#00c853", cursor: "pointer" }}>Browse the store →</span></Link></p>
            </div>
          ) : (
            <AnimatePresence>
              <motion.div
                initial="hidden"
                animate="show"
                variants={STAGGER}
                style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}
              >
                {data!.installedApps.map(app => <AppCard key={app.id} app={app} />)}
              </motion.div>
            </AnimatePresence>
          )}
        </motion.section>

        {/* Reviews */}
        <motion.section variants={FADE_UP}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#e8eaf0", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#fbbf24" }}>★</span> My Reviews
            {data && data.reviews.length > 0 && (
              <span style={{ fontSize: 12, background: "rgba(251,191,36,0.12)", color: "#fbbf24", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                {data.reviews.length}
              </span>
            )}
          </h2>

          {loading ? (
            <div style={{ height: 80, background: "rgba(255,255,255,0.04)", borderRadius: 14, animation: "pulse 1.5s ease-in-out infinite" }} />
          ) : data?.reviews.length === 0 ? (
            <p style={{ color: "rgba(232,234,240,0.35)", fontSize: 14 }}>You haven't reviewed any apps yet.</p>
          ) : (
            <AnimatePresence>
              <motion.div initial="hidden" animate="show" variants={STAGGER} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data?.reviews.map(r => <ReviewCard key={r.id} review={r} />)}
              </motion.div>
            </AnimatePresence>
          )}
        </motion.section>
      </motion.div>
    </div>
  );
}
