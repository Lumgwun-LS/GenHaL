import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import {
  motion, useInView, AnimatePresence,
  useMotionValue, useTransform, useSpring,
} from "framer-motion";
import { useUser, SignUpButton } from "@clerk/react";
import AppCard from "../components/app-card";
import { apiFetch } from "../lib/api";
import type { AppSummary, Category } from "../lib/types";

/* ── easing ────────────────────────────────── */
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/* ── count-up hook ─────────────────────────── */
function useCountUp(target: number, duration: number, trigger: boolean) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setVal(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [trigger, target, duration]);
  return val;
}

/* ── animated hero background ──────────────── */
function HeroBg() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {/* Aurora blobs */}
      <div style={{
        position: "absolute", top: "0%", left: "5%",
        width: 700, height: 700, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,200,83,0.14) 0%, transparent 60%)",
        filter: "blur(60px)", animation: "aurora-1 16s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", top: "20%", right: "0%",
        width: 550, height: 550, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(124,77,255,0.13) 0%, transparent 60%)",
        filter: "blur(60px)", animation: "aurora-2 20s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", bottom: "-10%", left: "30%",
        width: 480, height: 480, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,179,0,0.1) 0%, transparent 60%)",
        filter: "blur(60px)", animation: "aurora-3 12s ease-in-out infinite",
      }} />
      {/* Dot grid */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />
      {/* Floating particles */}
      {[...Array(12)].map((_, i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${8 + i * 8}%`,
          bottom: `${10 + (i % 4) * 15}%`,
          width: 3 + (i % 3), height: 3 + (i % 3),
          borderRadius: "50%",
          background: i % 3 === 0 ? "#00c853" : i % 3 === 1 ? "#ffb300" : "#7c4dff",
          opacity: 0.5,
          animation: `particle-drift ${4 + i * 0.7}s ease-in-out ${i * 0.5}s infinite`,
        }} />
      ))}
    </div>
  );
}

/* ── flags ──────────────────────────────────── */
const FLAGS = ["🇳🇬","🇰🇪","🇬🇭","🇿🇦","🇪🇹","🇹🇿","🇪🇬","🇸🇳"];

/* ── section header with slide-in ───────────── */
function SectionHeader({ title, icon, href }: { title: string; icon: string; href?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -28 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}
    >
      <h2 style={{ fontWeight: 800, fontSize: 19, color: "#e8eaf0", display: "flex", alignItems: "center", gap: 8 }}>
        <span>{icon}</span> {title}
      </h2>
      {href && (
        <motion.span whileHover={{ x: 4 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
          <Link href={href} style={{ fontSize: 13, color: "#00c853", fontWeight: 600 }}>See all →</Link>
        </motion.span>
      )}
    </motion.div>
  );
}

/* ── hero ───────────────────────────────────── */
function HeroSection() {
  const [, navigate] = useLocation();
  const { isSignedIn } = useUser();
  const statsRef = useRef<HTMLDivElement>(null);
  const statsInView = useInView(statsRef, { once: true, margin: "-80px" });
  const cnt54  = useCountUp(54,  1300, statsInView);
  const cnt100 = useCountUp(100, 1600, statsInView);

  return (
    <div className="africa-hero" style={{ padding: "88px 20px 96px", position: "relative" }}>
      <HeroBg />
      <div style={{ maxWidth: 740, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>

        {/* Flags — staggered float-up */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
          style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 32 }}
        >
          {FLAGS.map((flag, i) => (
            <motion.span
              key={flag}
              variants={{
                hidden: { opacity: 0, y: 20, scale: 0.6 },
                visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 320, damping: 18 } },
              }}
              style={{
                fontSize: 22, display: "inline-block",
                animation: `flag-float ${2.2 + i * 0.25}s ease-in-out ${i * 0.18}s infinite`,
              }}
            >
              {flag}
            </motion.span>
          ))}
        </motion.div>

        {/* AI badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.65, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.52, type: "spring", stiffness: 260, damping: 20 }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "rgba(0,200,83,0.1)", border: "1px solid rgba(0,200,83,0.3)",
            borderRadius: 20, padding: "5px 18px", marginBottom: 30, cursor: "default",
          }}
        >
          <span style={{ fontSize: 14, display: "inline-block", animation: "robot-wiggle 3s ease-in-out 2s infinite" }}>🤖</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#00c853", letterSpacing: 0.4 }}>AI-Reviewed & Vetted Apps</span>
        </motion.div>

        {/* Headline — word by word */}
        <motion.h1
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
          style={{ fontSize: "clamp(36px, 5.5vw, 62px)", fontWeight: 900, lineHeight: 1.08, marginBottom: 24 }}
        >
          {["The","App","Store"].map((w, i) => (
            <motion.span
              key={w+i}
              variants={{
                hidden: { y: 64, opacity: 0 },
                visible: { y: 0, opacity: 1, transition: { duration: 0.65, delay: 0.56 + i * 0.07, ease: EASE_OUT_EXPO } },
              }}
              style={{ display: "inline-block", marginRight: "0.25em" }}
            >{w}</motion.span>
          ))}
          <br />
          {["Built","for","Africa"].map((w, i) => (
            <motion.span
              key={w+i+"b"}
              variants={{
                hidden: { y: 64, opacity: 0 },
                visible: { y: 0, opacity: 1, transition: { duration: 0.65, delay: 0.77 + i * 0.08, ease: EASE_OUT_EXPO } },
              }}
              style={{
                display: "inline-block", marginRight: "0.25em",
                ...(w !== "for" ? {
                  background: "linear-gradient(90deg, #00c853, #ffb300, #00c853)",
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  animation: "gradient-x 3.5s ease-in-out infinite",
                } : {}),
              }}
            >{w}</motion.span>
          ))}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.08, ease: EASE_OUT_EXPO }}
          style={{ fontSize: 18, color: "#8892a4", lineHeight: 1.65, marginBottom: 42, maxWidth: 520, margin: "0 auto 42px" }}
        >
          Discover, download, and publish apps built for African businesses and communities across the continent.
        </motion.p>

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.22, ease: EASE_OUT_EXPO }}
          style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 60 }}
        >
          {!isSignedIn && (
            <SignUpButton mode="modal">
              <motion.button
                className="btn-green btn-glow"
                style={{ fontSize: 16, padding: "14px 36px" }}
                whileHover={{ scale: 1.07, y: -3 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
              >
                ✨ Create Free Account
              </motion.button>
            </SignUpButton>
          )}
          <motion.button
            className={isSignedIn ? "btn-green btn-glow" : "btn-outline"}
            style={{ fontSize: 16, padding: "14px 36px" }}
            onClick={() => navigate("/search")}
            whileHover={{ scale: 1.06, y: -3, backgroundColor: isSignedIn ? undefined : "rgba(0,200,83,0.1)" }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
          >
            Browse All Apps
          </motion.button>
          <motion.button
            className="btn-outline"
            style={{ fontSize: 16, padding: "14px 36px" }}
            onClick={() => navigate("/developer")}
            whileHover={{ scale: 1.06, y: -3, backgroundColor: "rgba(0,200,83,0.1)" }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
          >
            🚀 Publish Your App
          </motion.button>
        </motion.div>

        {/* Stats — count up */}
        <motion.div
          ref={statsRef}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.38 }}
          style={{ display: "flex", justifyContent: "center", gap: 56 }}
        >
          {[
            { display: `${cnt54}`, label: "Countries Served" },
            { display: "₦25K",    label: "Publishing Fee" },
            { display: `${cnt100}%`, label: "AI-Reviewed" },
          ].map((s) => (
            <motion.div
              key={s.label}
              whileHover={{ scale: 1.12 }}
              transition={{ type: "spring", stiffness: 320, damping: 18 }}
              style={{ textAlign: "center", cursor: "default" }}
            >
              <div style={{ fontSize: 28, fontWeight: 900, color: "#00c853", letterSpacing: -1 }}>{s.display}</div>
              <div style={{ fontSize: 12, color: "#8892a4", marginTop: 5 }}>{s.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

/* ── animated category grid ─────────────────── */
function CategoryGrid({ categories }: { categories: Category[] }) {
  const [, navigate] = useLocation();
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}
    >
      {categories.map((cat) => (
        <motion.button
          key={cat.name}
          variants={{
            hidden: { opacity: 0, scale: 0.78, y: 16 },
            visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring" as const, stiffness: 290, damping: 22 } },
          }}
          whileHover={{ scale: 1.07, y: -5, boxShadow: "0 8px 28px rgba(0,200,83,0.18), 0 0 0 1px rgba(0,200,83,0.25)" }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate(`/search?category=${encodeURIComponent(cat.name)}`)}
          style={{
            background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14, padding: "16px 10px", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            position: "relative", overflow: "hidden",
          }}
        >
          <motion.span
            style={{ fontSize: 30, display: "block" }}
            whileHover={{ scale: 1.25, rotate: [0, -8, 8, 0] }}
            transition={{ duration: 0.35 }}
          >{cat.iconEmoji}</motion.span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#c0c8d8", textAlign: "center", lineHeight: 1.3 }}>{cat.name}</span>
          {cat.count > 0 && <span style={{ fontSize: 10, color: "#8892a4" }}>{cat.count} apps</span>}
        </motion.button>
      ))}
    </motion.div>
  );
}

/* ── staggered app grid ─────────────────────── */
function AppGrid({ apps, layout = "grid" }: { apps: AppSummary[]; layout?: "grid" | "row" }) {
  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 22, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
  };

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      variants={containerVariants}
      style={layout === "grid"
        ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }
        : { display: "flex", flexDirection: "column", gap: 8 }}
    >
      {apps.map((app, i) => (
        <motion.div key={app.id} variants={itemVariants}>
          {layout === "row" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <motion.span
                style={{ fontSize: 14, fontWeight: 700, color: i < 3 ? "#ffb300" : "#8892a4", width: 20, textAlign: "center", flexShrink: 0 }}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >{i + 1}</motion.span>
              <div style={{ flex: 1 }}><AppCard app={app} layout="row" /></div>
            </div>
          ) : (
            <AppCard app={app} />
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

/* ── promo video section ─────────────────────── */
function PromoVideoSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: EASE_OUT_EXPO }}
      style={{ width: "100%", position: "relative" }}
    >
      {/* Label */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.15, ease: EASE_OUT_EXPO }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 10, marginBottom: 20,
        }}
      >
        <div style={{ height: 1, width: 48, background: "linear-gradient(90deg, transparent, rgba(0,200,83,0.5))" }} />
        <span style={{
          fontSize: 12, fontWeight: 700, letterSpacing: "0.18em",
          color: "#00c853", textTransform: "uppercase",
        }}>
          ▶ Watch the Story
        </span>
        <div style={{ height: 1, width: 48, background: "linear-gradient(90deg, rgba(0,200,83,0.5), transparent)" }} />
      </motion.div>

      {/* iframe wrapper — full width, 16:9 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={inView ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.9, delay: 0.25, ease: EASE_OUT_EXPO }}
        style={{
          position: "relative",
          width: "100%",
          paddingTop: "56.25%", /* 16:9 */
          borderRadius: 0,
          overflow: "hidden",
          boxShadow: "0 0 80px rgba(0,200,83,0.08), 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      >
        <iframe
          src="/appstore-promo-video/"
          title="Awajimaa App Store — Promotional Video"
          allow="autoplay; fullscreen"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: "none",
            display: "block",
          }}
        />
      </motion.div>
    </motion.div>
  );
}

/* ── home page ──────────────────────────────── */
export default function Home() {
  const [featured, setFeatured]     = useState<AppSummary[]>([]);
  const [trending, setTrending]     = useState<AppSummary[]>([]);
  const [newArrivals, setNewArrivals] = useState<AppSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<AppSummary[]>("/apps/featured"),
      apiFetch<AppSummary[]>("/apps/trending"),
      apiFetch<AppSummary[]>("/apps/new-arrivals"),
      apiFetch<Category[]>("/apps/categories"),
    ]).then(([f, t, n, c]) => {
      setFeatured(f ?? []);
      setTrending(t ?? []);
      setNewArrivals(n ?? []);
      setCategories(c ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <HeroSection />

      <PromoVideoSection />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 20px 96px" }}>

        {/* Featured */}
        {featured.length > 0 && (
          <section style={{ marginBottom: 60 }}>
            <SectionHeader title="Featured Apps" icon="⭐" href="/search?sort=featured" />
            <AppGrid apps={featured.slice(0, 6)} />
          </section>
        )}

        {/* Categories */}
        <section style={{ marginBottom: 60 }}>
          <SectionHeader title="Browse by Category" icon="🗂️" />
          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 92, borderRadius: 14 }} />
              ))}
            </div>
          ) : (
            <CategoryGrid categories={categories} />
          )}
        </section>

        {/* Top Downloads */}
        {trending.length > 0 && (
          <section style={{ marginBottom: 60 }}>
            <SectionHeader title="Top Downloads" icon="🔥" href="/search?sort=downloads" />
            <AppGrid apps={trending.slice(0, 8)} layout="row" />
          </section>
        )}

        {/* New Arrivals */}
        {newArrivals.length > 0 && (
          <section style={{ marginBottom: 60 }}>
            <SectionHeader title="New Arrivals" icon="🆕" href="/search?sort=newest" />
            <AppGrid apps={newArrivals.slice(0, 8)} />
          </section>
        )}

        {/* Empty state */}
        {!loading && !featured.length && !trending.length && !newArrivals.length && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: "center", padding: "80px 20px" }}
          >
            <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }} style={{ fontSize: 64, marginBottom: 16 }}>🌍</motion.div>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Be the first to publish</h2>
            <p style={{ color: "#8892a4", marginBottom: 24 }}>Africa App Store is open. Publish your app for NGN 25,000.</p>
            <Link href="/developer" className="btn-green btn-glow" style={{ display: "inline-flex" }}>Publish Your App</Link>
          </motion.div>
        )}

        {/* CTA Banner */}
        <motion.div
          className="cta-glow"
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, type: "spring", stiffness: 180, damping: 24 }}
          style={{
            background: "linear-gradient(135deg, #0a1628 0%, #0d2010 60%, #0a1628 100%)",
            border: "1px solid rgba(0,200,83,0.2)",
            borderRadius: 24, padding: "48px 40px",
            display: "flex", gap: 32, alignItems: "center",
            justifyContent: "space-between", flexWrap: "wrap",
            position: "relative", overflow: "hidden",
          }}
        >
          {/* bg shimmer */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "linear-gradient(105deg, transparent 30%, rgba(0,200,83,0.04) 50%, transparent 70%)",
            backgroundSize: "200% 100%", animation: "card-shimmer 4s ease-in-out infinite",
          }} />
          <div style={{ position: "relative" }}>
            <motion.h3
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15 }}
              style={{ fontSize: 24, fontWeight: 900, marginBottom: 10 }}
            >
              Ready to publish for Africa?
            </motion.h3>
            <motion.p
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.25 }}
              style={{ color: "#8892a4", fontSize: 14, maxWidth: 460, lineHeight: 1.6 }}
            >
              Reach 1.4 billion people across 54 African countries. Flat publishing fee of{" "}
              <strong style={{ color: "#00c853" }}>NGN 25,000</strong> per app — no hidden charges. AI-reviewed for quality and security.
            </motion.p>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 22 }}
            style={{ position: "relative" }}
          >
            <Link
              href="/developer/signup"
              className="btn-green btn-glow"
              style={{ fontSize: 16, padding: "14px 30px", flexShrink: 0 }}
            >
              Create Developer Account →
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
