import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import AppCard from "../components/app-card";
import { apiFetch } from "../lib/api";
import type { AppSummary, Category } from "../lib/types";

function SectionHeader({ title, icon, href }: { title: string; icon: string; href?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
      <h2 style={{ fontWeight: 800, fontSize: 18, color: "#e8eaf0", display: "flex", alignItems: "center", gap: 8 }}>
        <span>{icon}</span> {title}
      </h2>
      {href && <Link href={href} style={{ fontSize: 13, color: "#00c853", fontWeight: 600, textDecoration: "none" }}>See all →</Link>}
    </div>
  );
}

function HeroSection() {
  const [, navigate] = useLocation();
  return (
    <div className="africa-hero" style={{ padding: "72px 20px 80px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
        {/* Pan-African accent */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 24 }}>
          {["🇳🇬","🇰🇪","🇬🇭","🇿🇦","🇪🇹","🇹🇿","🇪🇬","🇸🇳"].map(f => (
            <span key={f} style={{ fontSize: 18 }}>{f}</span>
          ))}
        </div>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,200,83,0.1)", border: "1px solid rgba(0,200,83,0.25)", borderRadius: 20, padding: "4px 14px", marginBottom: 24 }}>
          <span style={{ fontSize: 12 }}>🤖</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#00c853" }}>AI-Reviewed & Vetted Apps</span>
        </div>

        <h1 style={{ fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 20 }}>
          The App Store{" "}
          <span style={{ background: "linear-gradient(90deg, #00c853, #ffb300)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Built for Africa
          </span>
        </h1>

        <p style={{ fontSize: 18, color: "#8892a4", lineHeight: 1.6, marginBottom: 36, maxWidth: 520, margin: "0 auto 36px" }}>
          Discover, download, and publish apps built for African businesses and communities across the continent.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn-green" style={{ fontSize: 16, padding: "12px 32px" }} onClick={() => navigate("/developer")}>
            🚀 Publish Your App
          </button>
          <button className="btn-outline" style={{ fontSize: 16, padding: "12px 32px" }} onClick={() => navigate("/search")}>
            Browse All Apps
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", justifyContent: "center", gap: 40, marginTop: 48 }}>
          {[
            { label: "Countries Served", value: "54" },
            { label: "Publishing Fee", value: "₦25K" },
            { label: "AI-Reviewed", value: "100%" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#00c853" }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#8892a4", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryGrid({ categories }: { categories: Category[] }) {
  const [, navigate] = useLocation();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
      {categories.map(cat => (
        <button
          key={cat.name}
          onClick={() => navigate(`/search?category=${encodeURIComponent(cat.name)}`)}
          style={{
            background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12, padding: "14px 10px", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            transition: "border-color 0.15s, background 0.15s",
          }}
        >
          <span style={{ fontSize: 28 }}>{cat.iconEmoji}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#c0c8d8", textAlign: "center", lineHeight: 1.3 }}>{cat.name}</span>
          {cat.count > 0 && <span style={{ fontSize: 10, color: "#8892a4" }}>{cat.count} apps</span>}
        </button>
      ))}
    </div>
  );
}

export default function Home() {
  const [featured, setFeatured] = useState<AppSummary[]>([]);
  const [trending, setTrending] = useState<AppSummary[]>([]);
  const [newArrivals, setNewArrivals] = useState<AppSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

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

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 20px 80px" }}>

        {/* Featured Banner */}
        {featured.length > 0 && (
          <section style={{ marginBottom: 56 }}>
            <SectionHeader title="Featured Apps" icon="⭐" href="/search?sort=featured" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              {featured.slice(0, 6).map(app => <AppCard key={app.id} app={app} />)}
            </div>
          </section>
        )}

        {/* Categories */}
        <section style={{ marginBottom: 56 }}>
          <SectionHeader title="Browse by Category" icon="🗂️" />
          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 88, borderRadius: 12 }} />
              ))}
            </div>
          ) : (
            <CategoryGrid categories={categories} />
          )}
        </section>

        {/* Top Downloads */}
        {trending.length > 0 && (
          <section style={{ marginBottom: 56 }}>
            <SectionHeader title="Top Downloads" icon="🔥" href="/search?sort=downloads" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {trending.slice(0, 8).map((app, i) => (
                <div key={app.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: i < 3 ? "#ffb300" : "#8892a4", width: 20, textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1 }}><AppCard app={app} layout="row" /></div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* New Arrivals */}
        {newArrivals.length > 0 && (
          <section style={{ marginBottom: 56 }}>
            <SectionHeader title="New Arrivals" icon="🆕" href="/search?sort=newest" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              {newArrivals.slice(0, 8).map(app => <AppCard key={app.id} app={app} />)}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!loading && featured.length === 0 && trending.length === 0 && newArrivals.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🌍</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Be the first to publish</h2>
            <p style={{ color: "#8892a4", marginBottom: 24 }}>Africa App Store is open for developers. Publish your app for NGN 25,000.</p>
            <Link href="/developer" className="btn-green" style={{ display: "inline-flex", textDecoration: "none" }}>Publish Your App</Link>
          </div>
        )}

        {/* CTA Banner */}
        <div style={{ background: "linear-gradient(135deg, #0a1628 0%, #0d2010 100%)", border: "1px solid rgba(0,200,83,0.15)", borderRadius: 20, padding: "40px 32px", display: "flex", gap: 24, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Ready to publish for Africa?</h3>
            <p style={{ color: "#8892a4", fontSize: 14, maxWidth: 440 }}>
              Reach 1.4 billion people across 54 African countries. Flat publishing fee of <strong style={{ color: "#00c853" }}>NGN 25,000</strong> per app — no hidden charges. AI-reviewed for quality and security.
            </p>
          </div>
          <Link href="/developer/signup" className="btn-green" style={{ fontSize: 16, padding: "12px 28px", flexShrink: 0, textDecoration: "none" }}>
            Create Developer Account →
          </Link>
        </div>
      </div>
    </div>
  );
}
