import { useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import type { AppSummary } from "../lib/types";

interface Props {
  app: AppSummary;
  layout?: "grid" | "row";
}

const PLATFORM_ICON: Record<string, string> = {
  android: "🤖", ios: "🍎", web: "🌐", all: "📱",
};

function Stars({ rating }: { rating: number }) {
  return (
    <div style={{ display: "flex", gap: 1 }}>
      {[1,2,3,4,5].map((i) => (
        <span key={i} style={{ fontSize: 10, color: i <= Math.round(rating) ? "#ffb300" : "#2a3040" }}>★</span>
      ))}
    </div>
  );
}

function formatDownloads(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/* ── 3-D tilt wrapper ── */
function TiltCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const rotateX = useTransform(my, [-0.5, 0.5], [7, -7]);
  const rotateY = useTransform(mx, [-0.5, 0.5], [-7, 7]);
  const glowX   = useTransform(mx, [-0.5, 0.5], ["0%", "100%"]);
  const glowY   = useTransform(my, [-0.5, 0.5], ["0%", "100%"]);

  const springCfg = { stiffness: 320, damping: 28 };
  const srX = useSpring(rotateX, springCfg);
  const srY = useSpring(rotateY, springCfg);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width  - 0.5);
    my.set((e.clientY - r.top)  / r.height - 0.5);
  }
  function onLeave() { mx.set(0); my.set(0); }

  return (
    <motion.div
      ref={ref}
      style={{ rotateX: srX, rotateY: srY, transformStyle: "preserve-3d", transformPerspective: "900px", position: "relative", ...style }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      whileHover={{ scale: 1.04 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
    >
      {/* dynamic highlight spot */}
      <motion.div
        style={{
          position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none",
          background: "radial-gradient(circle at var(--gx) var(--gy), rgba(255,255,255,0.07) 0%, transparent 55%)",
          zIndex: 2,
        } as React.CSSProperties}
      />
      {children}
    </motion.div>
  );
}

/* ── row layout ── */
function RowCard({ app }: { app: AppSummary }) {
  const [, navigate] = useLocation();
  return (
    <TiltCard style={{ borderRadius: 12 }}>
      <Link
        href={`/apps/${app.slug}`}
        style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "12px 16px", borderRadius: 12,
          background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)",
          textDecoration: "none", position: "relative", overflow: "hidden",
        }}
      >
        {/* shimmer streak */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.04) 50%, transparent 60%)",
          backgroundSize: "200% 100%", animation: "card-shimmer 3.5s ease-in-out infinite",
        }} />
        <img
          src={app.iconUrl} alt={app.name}
          style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", flexShrink: 0, background: "#1a2030" }}
          onError={(e) => { (e.target as HTMLImageElement).src = `https://placehold.co/52x52/0d1117/00c853?text=${encodeURIComponent(app.name[0])}`; }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#e8eaf0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.name}</div>
          <div style={{ fontSize: 12, color: "#8892a4", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.tagline}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Stars rating={app.rating} />
            <span style={{ fontSize: 11, color: "#8892a4" }}>{app.rating > 0 ? app.rating.toFixed(1) : "New"}</span>
            <span style={{ fontSize: 11, color: "#8892a4" }}>· {PLATFORM_ICON[app.platform] ?? "📱"}</span>
          </div>
        </div>
        <motion.button
          style={{ flexShrink: 0, background: "rgba(0,200,83,0.1)", color: "#00c853", border: "1px solid rgba(0,200,83,0.3)", borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          whileHover={{ scale: 1.12, background: "rgba(0,200,83,0.2)" }}
          whileTap={{ scale: 0.92 }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/apps/${app.slug}`); }}
        >GET</motion.button>
      </Link>
    </TiltCard>
  );
}

/* ── grid layout ── */
function GridCard({ app }: { app: AppSummary }) {
  return (
    <TiltCard style={{ borderRadius: 16 }}>
      <Link
        href={`/apps/${app.slug}`}
        style={{
          display: "flex", flexDirection: "column",
          background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 16, padding: 14, textDecoration: "none",
          position: "relative", overflow: "hidden",
        }}
      >
        {/* shimmer streak */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.04) 50%, transparent 60%)",
          backgroundSize: "200% 100%", animation: "card-shimmer 3s ease-in-out infinite",
        }} />
        <div style={{ position: "relative", marginBottom: 10 }}>
          <motion.img
            src={app.iconUrl} alt={app.name}
            style={{ width: "100%", aspectRatio: "1", borderRadius: 14, objectFit: "cover", background: "#1a2030", display: "block" }}
            onError={(e) => { (e.target as HTMLImageElement).src = `https://placehold.co/160x160/0d1117/00c853?text=${encodeURIComponent(app.name[0])}`; }}
            whileHover={{ scale: 1.06 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
          />
          {app.isFeatured && (
            <motion.span
              initial={{ scale: 0, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
              style={{ position: "absolute", top: 6, right: 6, background: "#ffb300", color: "#000", fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}
            >⭐ Pick</motion.span>
          )}
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#e8eaf0", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.name}</div>
        <div style={{ fontSize: 11, color: "#8892a4", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.category}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
          <div>
            <Stars rating={app.rating} />
            <div style={{ fontSize: 10, color: "#8892a4", marginTop: 2 }}>{formatDownloads(app.totalDownloads)} DL</div>
          </div>
          <motion.div
            style={{ background: "rgba(0,200,83,0.12)", color: "#00c853", border: "1px solid rgba(0,200,83,0.25)", borderRadius: 16, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}
            whileHover={{ scale: 1.15, background: "rgba(0,200,83,0.22)" }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >GET</motion.div>
        </div>
      </Link>
    </TiltCard>
  );
}

export default function AppCard({ app, layout = "grid" }: Props) {
  return layout === "row" ? <RowCard app={app} /> : <GridCard app={app} />;
}
