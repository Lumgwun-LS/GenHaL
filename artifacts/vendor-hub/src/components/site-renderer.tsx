/**
 * SiteRenderer — renders a vendor's public site from sections JSON.
 * Used in both the live preview (editor) and the public /site/:slug page.
 * Features: scroll-triggered CSS animations, animated hero, mobile nav, responsive.
 */
import { useEffect, useRef, useState } from "react";
import { SiteSupportPortal } from "./site-support-portal";

export type SiteSectionType =
  | "hero" | "about" | "products" | "gallery"
  | "testimonials" | "contact" | "social" | "whatsapp_cta" | "shop" | "ratings";

export type SiteSection = {
  id: string;
  type: SiteSectionType;
  enabled: boolean;
  content: Record<string, unknown>;
};

export type SiteTemplatePalette = {
  primary: string;
  secondary: string;
  bg: string;
  text: string;
  accent: string;
};

export type SiteData = {
  pageTitle?: string | null;
  metaDescription?: string | null;
  logoUrl?: string | null;
  themeColor?: string;
  templateId?: string;
  sections: SiteSection[];
  template?: { palette: SiteTemplatePalette; primaryFont: string; name: string };
  vendor?: { name: string; email?: string | null; phone?: string | null; address?: string | null };
  vendorId?: number | null;
  // Shop section integration
  slug?: string | null;
  enabledGateways?: string[];
  currency?: string;
};

function str(v: unknown): string { return typeof v === "string" ? v : ""; }

function parseItems(v: unknown): Array<Record<string, string>> {
  if (Array.isArray(v)) return v;
  try { const p = JSON.parse(str(v)); return Array.isArray(p) ? p : []; } catch { return []; }
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return isNaN(r) ? "127,80,255" : `${r},${g},${b}`;
}

// Animation CSS injected once per page
const SITE_CSS = `
  @keyframes siteHeroText  { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:none} }
  @keyframes siteFloat     { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-18px) rotate(6deg)} }
  @keyframes siteFloatAlt  { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(14px) rotate(-4deg)} }
  @keyframes siteGradient  { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
  @keyframes sitePulseRing { 0%{transform:scale(0.9);opacity:1} 100%{transform:scale(1.9);opacity:0} }
  @keyframes siteSlideDown { from{opacity:0;transform:translateY(-16px)} to{opacity:1;transform:none} }
  @keyframes siteFadeIn    { from{opacity:0} to{opacity:1} }
  @keyframes siteShimmer   { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  @keyframes siteSlideLeft  { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:none} }
  @keyframes siteSlideRight { from{opacity:0;transform:translateX(-40px)} to{opacity:1;transform:none} }
  @keyframes siteStarPop    { 0%{transform:scale(0.5);opacity:0} 70%{transform:scale(1.25)} 100%{transform:scale(1);opacity:1} }
  @keyframes svCartBounce   { 0%{transform:scale(1)} 30%{transform:scale(.84)} 60%{transform:scale(1.16)} 100%{transform:scale(1)} }
  @keyframes svStockPulse   { 0%,100%{opacity:1} 50%{opacity:.52} }
  @keyframes svSlideUp      { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:none} }

  .sv-shop-slider{display:flex;gap:1.5rem;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:8px}
  .sv-shop-slider::-webkit-scrollbar{display:none}
  .sv-snap{scroll-snap-align:start;flex-shrink:0}
  .sv-list-card{transition:transform .22s,box-shadow .22s}
  .sv-list-card:hover{transform:translateX(5px)!important;box-shadow:0 8px 32px rgba(0,0,0,.13)!important}
  .sv-shop-btn{transition:background .25s,transform .18s,box-shadow .18s}
  .sv-shop-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.22)}
  .sv-shop-btn:active{transform:scale(.95)}
  .sv-slider-btn{transition:opacity .2s,transform .18s,box-shadow .18s}
  .sv-slider-btn:hover{box-shadow:0 4px 20px rgba(0,0,0,.18)!important;transform:translateY(-50%) scale(1.08)!important}

  .sv-obs{opacity:0;transform:translateY(36px);transition:opacity .75s cubic-bezier(.4,0,.2,1),transform .75s cubic-bezier(.4,0,.2,1)}
  .sv-obs.sv-vis{opacity:1;transform:none}
  .sv-obs-l{opacity:0;transform:translateX(-36px);transition:opacity .75s cubic-bezier(.4,0,.2,1),transform .75s cubic-bezier(.4,0,.2,1)}
  .sv-obs-l.sv-vis{opacity:1;transform:none}
  .sv-obs-r{opacity:0;transform:translateX(36px);transition:opacity .75s cubic-bezier(.4,0,.2,1),transform .75s cubic-bezier(.4,0,.2,1)}
  .sv-obs-r.sv-vis{opacity:1;transform:none}
  .sv-obs-s{opacity:0;transform:scale(.88);transition:opacity .65s cubic-bezier(.4,0,.2,1),transform .65s cubic-bezier(.4,0,.2,1)}
  .sv-obs-s.sv-vis{opacity:1;transform:scale(1)}

  .sv-card{transition:transform .22s,box-shadow .22s}
  .sv-card:hover{transform:translateY(-6px)!important;box-shadow:0 16px 40px rgba(0,0,0,.16)!important}
  .sv-cta{transition:transform .18s,box-shadow .18s,opacity .18s}
  .sv-cta:hover{transform:translateY(-3px)!important;box-shadow:0 10px 28px rgba(0,0,0,.28)!important}
  .sv-navlink{transition:color .18s,opacity .18s}
  .sv-navlink:hover{opacity:.75}
  .sv-img-zoom{transition:transform .35s ease}
  .sv-img-zoom:hover{transform:scale(1.05)}
  .sv-social-btn{transition:transform .18s,opacity .18s}
  .sv-social-btn:hover{transform:translateY(-2px);opacity:.85}

  @media(max-width:640px){
    .sv-desktop-nav{display:none!important}
    .sv-hamburger{display:flex!important}
    .sv-hero-inner{padding:6rem 1.25rem 3.5rem!important}
    .sv-section-pad{padding:3.5rem 1.25rem!important}
    .sv-about-wrap{flex-direction:column!important}
    .sv-about-img{width:100%!important;height:220px!important}
    .sv-header-inner{padding:0 1rem!important}
    .sv-grid-3{grid-template-columns:1fr!important}
    .sv-grid-2{grid-template-columns:1fr!important}
    .sv-footer-inner{flex-direction:column!important;gap:.5rem!important}
  }
  @media(min-width:641px){
    .sv-hamburger{display:none!important}
  }
`;

// ── Section components ─────────────────────────────────────────────────────────

function HeroSection({ content, palette, themeColor, logoUrl, vendorName }: {
  content: Record<string, unknown>;
  palette: SiteTemplatePalette;
  themeColor: string;
  logoUrl?: string | null;
  vendorName: string;
}) {
  const bg        = str(content.backgroundImage);
  const bgVideo   = str(content.backgroundVideo);
  const opacity   = Math.min(1, Math.max(0, parseFloat(str(content.overlayOpacity) || "0.5")));
  const hasImage  = !!bg;
  const hasVideo  = !!bgVideo;
  const hasMedia  = hasImage || hasVideo;

  return (
    <section style={{
      position: "relative",
      minHeight: 580,
      overflow: "hidden",
      background: hasMedia
        ? "#000"
        : `linear-gradient(135deg, ${themeColor}, ${themeColor}cc 40%, ${palette.secondary || "#FF7F50"})`,
      backgroundSize: hasImage ? "cover" : "200% 200%",
      animation: hasMedia ? undefined : "siteGradient 8s ease infinite",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* Video background */}
      {hasVideo && (
        <video autoPlay muted loop playsInline
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }}
          src={bgVideo}
        />
      )}
      {/* Image background */}
      {hasImage && !hasVideo && (
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center", zIndex: 0 }} />
      )}
      {/* Overlay */}
      {hasMedia && <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${opacity})`, zIndex: 1 }} />}
      {!hasMedia && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.08)", zIndex: 1 }} />}

      {/* Decorative floating shapes (no-media mode) */}
      {!hasMedia && (
        <>
          <div style={{
            position: "absolute", top: "8%", right: "12%",
            width: 220, height: 220, borderRadius: "50%",
            background: `rgba(255,255,255,0.12)`,
            animation: "siteFloat 8s ease-in-out infinite",
            backdropFilter: "blur(2px)",
          }} />
          <div style={{
            position: "absolute", bottom: "15%", left: "8%",
            width: 140, height: 140, borderRadius: "40%",
            background: `rgba(255,255,255,0.08)`,
            animation: "siteFloatAlt 11s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", top: "40%", left: "5%",
            width: 80, height: 80, borderRadius: "50%",
            background: `rgba(255,255,255,0.15)`,
            animation: "siteFloat 6s ease-in-out 1s infinite",
          }} />
          <div style={{
            position: "absolute", top: "20%", right: "30%",
            width: 50, height: 50, borderRadius: "12px",
            background: `rgba(255,255,255,0.1)`,
            animation: "siteFloatAlt 7s ease-in-out 2s infinite",
            transform: "rotate(15deg)",
          }} />
        </>
      )}

      {/* Content */}
      <div className="sv-hero-inner" style={{
        position: "relative", zIndex: 2, textAlign: "center",
        padding: "6rem 2rem 4rem", maxWidth: 760,
      }}>
        {/* Tagline badge */}
        {str(content.subheadline) && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 999, padding: "0.4rem 1.1rem",
            fontSize: "0.82rem", fontWeight: 600, letterSpacing: "0.06em",
            color: "#fff", marginBottom: "1.5rem", textTransform: "uppercase",
            animation: "siteHeroText 0.8s ease 0.1s both",
          }}>
            ✦ {str(content.subheadline)}
          </div>
        )}

        {/* Headline */}
        <h1 style={{
          fontSize: "clamp(2.2rem, 6vw, 4rem)", fontWeight: 900, lineHeight: 1.1,
          color: "#fff",
          marginBottom: "1.5rem",
          textShadow: "0 2px 24px rgba(0,0,0,0.18)",
          animation: "siteHeroText 0.9s ease 0.25s both",
        }}>
          {str(content.headline) || vendorName}
        </h1>

        {/* CTA */}
        {str(content.ctaText) && (
          <div style={{ position: "relative", display: "inline-block", animation: "siteHeroText 1s ease 0.45s both" }}>
            {/* Pulse ring */}
            <div style={{
              position: "absolute", inset: 0, borderRadius: 12,
              border: `2px solid rgba(255,255,255,0.5)`,
              animation: "sitePulseRing 2.4s ease-in-out 1s infinite",
              pointerEvents: "none",
            }} />
            <a href={str(content.ctaUrl) || "#contact"} className="sv-cta"
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.5rem",
                background: "#fff", color: themeColor,
                padding: "1rem 2.4rem", borderRadius: 12,
                fontWeight: 800, fontSize: "1.05rem", textDecoration: "none",
                boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
                letterSpacing: "0.01em",
              }}>
              {str(content.ctaText)} →
            </a>
          </div>
        )}
      </div>

      {/* Scroll indicator */}
      <div style={{
        position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
        color: "rgba(255,255,255,0.6)", fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.1em",
        animation: "siteHeroText 1s ease 1.2s both", zIndex: 2,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      }}>
        <div style={{
          width: 1, height: 40,
          background: "linear-gradient(to bottom, rgba(255,255,255,0.6), transparent)",
        }} />
      </div>
    </section>
  );
}

function AboutSection({ content, palette, themeColor }: { content: Record<string, unknown>; palette: SiteTemplatePalette; themeColor: string }) {
  const img = str(content.image);
  return (
    <section className="sv-section-pad" style={{ background: palette.accent, padding: "5.5rem 2rem" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div className="sv-about-wrap" style={{ display: "flex", gap: "3.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {img && (
            <div className="sv-obs-l sv-about-img" style={{ width: 300, height: 320, flexShrink: 0, borderRadius: 20, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,.12)" }}>
              <img src={img} alt="About" className="sv-img-zoom" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}
          <div className="sv-obs-r" style={{ flex: 1, minWidth: 260 }}>
            <div style={{
              display: "inline-block", background: themeColor + "20", color: themeColor,
              borderRadius: 999, padding: "0.3rem 0.9rem", fontSize: "0.78rem",
              fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              marginBottom: "1rem",
            }}>Our Story</div>
            <h2 style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.2rem)", fontWeight: 800, color: palette.text, marginBottom: "1rem", lineHeight: 1.2 }}>
              {str(content.title) || "About Us"}
            </h2>
            <p style={{ fontSize: "1.05rem", lineHeight: 1.85, color: palette.text + "b0", whiteSpace: "pre-wrap" }}>
              {str(content.body)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductsSection({ content, palette, themeColor }: { content: Record<string, unknown>; palette: SiteTemplatePalette; themeColor: string }) {
  const items = parseItems(content.items);
  return (
    <section className="sv-section-pad" style={{ background: palette.bg, padding: "5.5rem 2rem" }}>
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>
        <div className="sv-obs" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <div style={{
            display: "inline-block", background: themeColor + "18", color: themeColor,
            borderRadius: 999, padding: "0.3rem 0.9rem", fontSize: "0.78rem",
            fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
            marginBottom: "0.9rem",
          }}>What We Offer</div>
          <h2 style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.3rem)", fontWeight: 800, color: palette.text, marginBottom: ".6rem" }}>
            {str(content.title) || "Products & Services"}
          </h2>
          {str(content.subtitle) && (
            <p style={{ color: palette.text + "88", fontSize: "1.05rem", maxWidth: 560, margin: "0 auto" }}>{str(content.subtitle)}</p>
          )}
        </div>
        <div className="sv-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.75rem" }}>
          {items.map((item, i) => (
            <div key={i} className="sv-obs sv-card" style={{
              background: "#fff", borderRadius: 16, overflow: "hidden",
              boxShadow: "0 2px 12px rgba(0,0,0,.07)", border: `1px solid ${palette.text}0f`,
              transitionDelay: `${i * 80}ms`,
            }}>
              {item.image ? (
                <div style={{ height: 200, overflow: "hidden" }}>
                  <img src={item.image} alt={item.name} className="sv-img-zoom" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ) : (
                <div style={{ height: 160, background: `linear-gradient(135deg, ${themeColor}18, ${themeColor}08)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "2.8rem" }}>🛍️</span>
                </div>
              )}
              <div style={{ padding: "1.4rem" }}>
                <h3 style={{ fontWeight: 800, color: palette.text, marginBottom: ".5rem", fontSize: "1.05rem" }}>{item.name}</h3>
                {item.description && <p style={{ color: palette.text + "88", fontSize: ".9rem", marginBottom: ".8rem", lineHeight: 1.6 }}>{item.description}</p>}
                {item.price && (
                  <span style={{
                    display: "inline-block", fontWeight: 800, color: "#fff",
                    background: themeColor, padding: "0.35rem 0.9rem",
                    borderRadius: 999, fontSize: ".95rem",
                  }}>{item.price}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GallerySection({ content, palette, themeColor }: { content: Record<string, unknown>; palette: SiteTemplatePalette; themeColor: string }) {
  const images = parseItems(content.images);
  const [current, setCurrent] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  if (images.length === 0) return null;

  const COLS = 3;
  const total = images.length;
  const hasPrev = current > 0;
  const hasNext = current + COLS < total;

  const visible = images.slice(current, current + COLS);

  return (
    <section className="sv-section-pad" style={{ background: palette.accent, padding: "5.5rem 2rem", overflow: "hidden" }}>
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>
        <div className="sv-obs" style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{
            display: "inline-block", background: themeColor + "18", color: themeColor,
            borderRadius: 999, padding: "0.3rem 0.9rem", fontSize: "0.78rem",
            fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: ".9rem",
          }}>Gallery</div>
          <h2 style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.3rem)", fontWeight: 800, color: palette.text }}>
            {str(content.title) || "Our Gallery"}
          </h2>
        </div>

        {/* Slider */}
        <div style={{ position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "1rem" }}>
            {visible.map((img, i) => {
              const src = str((img as Record<string,unknown>).url ?? (img as unknown as string));
              return (
                <div key={current + i} className="sv-obs-s sv-card" onClick={() => setLightbox(current + i)}
                  style={{ borderRadius: 14, overflow: "hidden", aspectRatio: "1", boxShadow: "0 2px 12px rgba(0,0,0,.08)", cursor: "pointer", animation: "siteSlideLeft 0.38s ease both", animationDelay: `${i * 70}ms` }}>
                  <img src={src} alt={`Gallery ${current + i + 1}`} className="sv-img-zoom"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              );
            })}
          </div>

          {/* Nav buttons */}
          {total > COLS && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", marginTop: "2rem" }}>
              <button onClick={() => setCurrent(c => Math.max(0, c - COLS))} disabled={!hasPrev}
                style={{ width: 44, height: 44, borderRadius: "50%", background: hasPrev ? themeColor : themeColor + "30", color: "#fff", border: "none", cursor: hasPrev ? "pointer" : "default", fontSize: 18, fontWeight: 700, transition: "all .2s" }}>
                ‹
              </button>
              {/* Dots */}
              <div style={{ display: "flex", gap: 6 }}>
                {Array.from({ length: Math.ceil(total / COLS) }).map((_, di) => (
                  <button key={di} onClick={() => setCurrent(di * COLS)}
                    style={{ width: current === di * COLS ? 20 : 8, height: 8, borderRadius: 4, background: current === di * COLS ? themeColor : themeColor + "44", border: "none", cursor: "pointer", transition: "all .3s", padding: 0 }} />
                ))}
              </div>
              <button onClick={() => setCurrent(c => Math.min(total - COLS, c + COLS))} disabled={!hasNext}
                style={{ width: 44, height: 44, borderRadius: "50%", background: hasNext ? themeColor : themeColor + "30", color: "#fff", border: "none", cursor: hasNext ? "pointer" : "default", fontSize: 18, fontWeight: 700, transition: "all .2s" }}>
                ›
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <>
          <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 900, cursor: "pointer" }} />
          <div style={{ position: "fixed", inset: 0, zIndex: 901, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <img src={str((images[lightbox] as Record<string,unknown>)?.url ?? (images[lightbox] as unknown as string))} alt={`Gallery ${lightbox + 1}`}
              style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,.5)", animation: "siteFadeIn .2s ease" }} />
            <button onClick={() => setLightbox(null)} style={{ position: "fixed", top: 20, right: 24, background: "rgba(255,255,255,.15)", border: "none", color: "#fff", width: 40, height: 40, borderRadius: "50%", fontSize: 20, cursor: "pointer" }}>✕</button>
            {lightbox > 0 && <button onClick={() => setLightbox(l => l! - 1)} style={{ position: "fixed", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.15)", border: "none", color: "#fff", width: 48, height: 48, borderRadius: "50%", fontSize: 24, cursor: "pointer" }}>‹</button>}
            {lightbox < total - 1 && <button onClick={() => setLightbox(l => l! + 1)} style={{ position: "fixed", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.15)", border: "none", color: "#fff", width: 48, height: 48, borderRadius: "50%", fontSize: 24, cursor: "pointer" }}>›</button>}
          </div>
        </>
      )}
    </section>
  );
}

function TestimonialsSection({ content, palette, themeColor }: { content: Record<string, unknown>; palette: SiteTemplatePalette; themeColor: string }) {
  const items = parseItems(content.items);
  return (
    <section className="sv-section-pad" style={{ background: palette.bg, padding: "5.5rem 2rem" }}>
      <div style={{ maxWidth: 1060, margin: "0 auto" }}>
        <div className="sv-obs" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <div style={{
            display: "inline-block", background: themeColor + "18", color: themeColor,
            borderRadius: 999, padding: "0.3rem 0.9rem", fontSize: "0.78rem",
            fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: ".9rem",
          }}>Testimonials</div>
          <h2 style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.3rem)", fontWeight: 800, color: palette.text }}>
            {str(content.title) || "What Our Customers Say"}
          </h2>
        </div>
        <div className="sv-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "1.5rem" }}>
          {items.map((item, i) => (
            <div key={i} className="sv-obs sv-card" style={{
              background: palette.accent, borderRadius: 16, padding: "2rem",
              boxShadow: "0 2px 12px rgba(0,0,0,.06)",
              borderTop: `3px solid ${themeColor}`,
              transitionDelay: `${i * 80}ms`,
            }}>
              <div style={{ fontSize: "1.8rem", color: themeColor, marginBottom: "1rem", opacity: 0.6 }}>"</div>
              <p style={{ color: palette.text + "cc", fontStyle: "italic", lineHeight: 1.8, marginBottom: "1.4rem", fontSize: ".97rem" }}>
                {item.text}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                {item.avatar
                  ? <img src={item.avatar} alt={item.name} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: `2px solid ${themeColor}44` }} />
                  : <div style={{ width: 44, height: 44, borderRadius: "50%", background: themeColor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "1.1rem" }}>{item.name?.[0] ?? "?"}</div>
                }
                <div>
                  <div style={{ fontWeight: 700, color: palette.text, fontSize: ".95rem" }}>{item.name}</div>
                  {item.role && <div style={{ color: palette.text + "77", fontSize: ".82rem" }}>{item.role}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContactSection({ content, palette, themeColor }: { content: Record<string, unknown>; palette: SiteTemplatePalette; themeColor: string }) {
  return (
    <section id="contact" className="sv-section-pad" style={{ background: palette.accent, padding: "5.5rem 2rem" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
        <div className="sv-obs">
          <div style={{
            display: "inline-block", background: themeColor + "18", color: themeColor,
            borderRadius: 999, padding: "0.3rem 0.9rem", fontSize: "0.78rem",
            fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: ".9rem",
          }}>Get In Touch</div>
          <h2 style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.3rem)", fontWeight: 800, color: palette.text, marginBottom: "2.5rem" }}>
            {str(content.title) || "Contact Us"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", alignItems: "center" }}>
            {str(content.email) && (
              <a href={`mailto:${str(content.email)}`}
                style={{ display: "flex", alignItems: "center", gap: ".75rem", color: themeColor, fontSize: "1.05rem", textDecoration: "none", fontWeight: 600 }}>
                <span style={{ width: 40, height: 40, borderRadius: "50%", background: themeColor + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>📧</span>
                {str(content.email)}
              </a>
            )}
            {str(content.phone) && (
              <a href={`tel:${str(content.phone)}`}
                style={{ display: "flex", alignItems: "center", gap: ".75rem", color: palette.text, fontSize: "1.05rem", textDecoration: "none", fontWeight: 600 }}>
                <span style={{ width: 40, height: 40, borderRadius: "50%", background: themeColor + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>📞</span>
                {str(content.phone)}
              </a>
            )}
            {str(content.address) && (
              <p style={{ display: "flex", alignItems: "center", gap: ".75rem", color: palette.text + "99", fontSize: "1rem", fontWeight: 500, margin: 0 }}>
                <span style={{ width: 40, height: 40, borderRadius: "50%", background: themeColor + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>📍</span>
                {str(content.address)}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SocialSection({ content, palette, themeColor }: { content: Record<string, unknown>; palette: SiteTemplatePalette; themeColor: string }) {
  const SOCIAL = [
    { key: "facebook",  label: "Facebook",  icon: "📘", base: "https://facebook.com/" },
    { key: "instagram", label: "Instagram", icon: "📸", base: "https://instagram.com/" },
    { key: "twitter",   label: "X/Twitter", icon: "🐦", base: "https://x.com/" },
    { key: "linkedin",  label: "LinkedIn",  icon: "💼", base: "https://linkedin.com/in/" },
    { key: "tiktok",    label: "TikTok",    icon: "🎵", base: "https://tiktok.com/@" },
    { key: "youtube",   label: "YouTube",   icon: "▶️", base: "https://youtube.com/@" },
  ].filter(l => str(content[l.key]));

  if (SOCIAL.length === 0) return null;

  return (
    <section className="sv-section-pad" style={{ background: palette.bg, padding: "3.5rem 2rem" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
        {str(content.title) && (
          <h2 className="sv-obs" style={{ fontSize: "1.6rem", fontWeight: 800, color: palette.text, marginBottom: "1.75rem" }}>
            {str(content.title)}
          </h2>
        )}
        <div className="sv-obs" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.85rem" }}>
          {SOCIAL.map(l => (
            <a key={l.key} className="sv-social-btn"
              href={str(content[l.key]).startsWith("http") ? str(content[l.key]) : l.base + str(content[l.key])}
              target="_blank" rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: ".5rem",
                background: palette.accent, border: `1px solid ${themeColor}33`,
                color: palette.text, padding: ".75rem 1.5rem", borderRadius: 999,
                textDecoration: "none", fontSize: ".95rem", fontWeight: 600,
                boxShadow: "0 1px 6px rgba(0,0,0,.06)",
              }}>
              {l.icon} {l.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatsAppSection({ content }: { content: Record<string, unknown> }) {
  const number = str(content.number).replace(/\D/g, "");
  if (!number) return null;
  const msg = encodeURIComponent(str(content.message) || "Hi! I'd like to know more.");
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 100 }}>
      <a href={`https://wa.me/${number}?text=${msg}`} target="_blank" rel="noopener noreferrer"
        className="sv-cta"
        style={{
          display: "flex", alignItems: "center", gap: ".65rem",
          background: "#25D366", color: "#fff", padding: ".9rem 1.6rem",
          borderRadius: 999, textDecoration: "none", fontWeight: 700,
          fontSize: ".95rem", boxShadow: "0 6px 24px rgba(37,211,102,.45)",
        }}>
        <span style={{ fontSize: "1.3rem" }}>💬</span>
        {str(content.buttonText) || "Chat on WhatsApp"}
      </a>
    </div>
  );
}

// ── Ratings Section ───────────────────────────────────────────────────────────

const BASE_RATINGS = (typeof import.meta !== "undefined" ? (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL?.replace(/\/$/, "") : "") ?? "";

type PublicRating = {
  id: number; customerName?: string | null; rating: number; review?: string | null;
  isVerifiedPurchase: boolean; createdAt: string;
};

function StarDisplay({ rating, size = 16, color = "#f59e0b" }: { rating: number; size?: number; color?: string }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1,2,3,4,5].map(s => (
        <span key={s} style={{ fontSize: size, color: s <= Math.round(rating) ? color : "#e5e7eb" }}>★</span>
      ))}
    </span>
  );
}

function RatingsSection({ content, palette, themeColor, vendorId }: {
  content: Record<string, unknown>;
  palette: SiteTemplatePalette;
  themeColor: string;
  vendorId?: number | null;
}) {
  const [ratings, setRatings] = useState<PublicRating[]>([]);
  const [summary, setSummary] = useState<{ average: string | null; count: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vendorId) { setLoading(false); return; }
    Promise.all([
      fetch(`${BASE_RATINGS}/api/ratings/summary/${vendorId}`).then(r => r.json()),
      fetch(`${BASE_RATINGS}/api/ratings/${vendorId}`).then(r => r.json()),
    ]).then(([s, r]) => {
      setSummary(s);
      setRatings(r.ratings ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [vendorId]);

  const title = str(content.title) || "Customer Reviews";

  return (
    <section className="sv-section-pad" style={{ background: palette.bg, padding: "5.5rem 2rem" }}>
      <div style={{ maxWidth: 1060, margin: "0 auto" }}>
        <div className="sv-obs" style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{ display: "inline-block", background: themeColor + "18", color: themeColor, borderRadius: 999, padding: "0.3rem 0.9rem", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: ".9rem" }}>Reviews</div>
          <h2 style={{ fontSize: "clamp(1.6rem,3.5vw,2.3rem)", fontWeight: 800, color: palette.text }}>{title}</h2>
          {summary && summary.count > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", marginTop: "1rem" }}>
              <StarDisplay rating={parseFloat(summary.average ?? "0")} size={22} color={themeColor} />
              <span style={{ fontSize: "1.5rem", fontWeight: 900, color: palette.text }}>{summary.average}</span>
              <span style={{ fontSize: "0.95rem", color: palette.text + "88" }}>out of 5 · {summary.count} review{summary.count !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        {loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "1.5rem" }}>
            {[1,2,3].map(i => <div key={i} style={{ borderRadius: 16, height: 160, background: palette.accent, animation: "siteShimmer 1.5s infinite linear", backgroundImage: `linear-gradient(90deg,${palette.bg} 0%,${palette.accent} 50%,${palette.bg} 100%)`, backgroundSize: "200% 100%" }} />)}
          </div>
        )}

        {!loading && ratings.length === 0 && (
          <div style={{ textAlign: "center", padding: "3rem", background: palette.accent, borderRadius: 20, border: `2px dashed ${themeColor}30` }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>⭐</div>
            <p style={{ fontWeight: 700, color: palette.text }}>No reviews yet</p>
            <p style={{ fontSize: ".9rem", color: palette.text + "88", marginTop: "0.5rem" }}>Be the first to leave a review after your purchase.</p>
          </div>
        )}

        {!loading && ratings.length > 0 && (
          <div className="sv-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "1.5rem" }}>
            {ratings.map((r, i) => (
              <div key={r.id} className="sv-obs sv-card" style={{
                background: palette.accent, borderRadius: 16, padding: "1.75rem",
                boxShadow: "0 2px 12px rgba(0,0,0,.06)", borderTop: `3px solid ${themeColor}`,
                transitionDelay: `${i * 70}ms`,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <StarDisplay rating={r.rating} size={18} color={themeColor} />
                  {r.isVerifiedPurchase && (
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#10b981", background: "#10b98118", padding: "2px 8px", borderRadius: 999 }}>✓ Verified</span>
                  )}
                </div>
                {r.review && <p style={{ color: palette.text + "cc", fontStyle: "italic", lineHeight: 1.7, marginBottom: "1.1rem", fontSize: ".95rem" }}>"{r.review}"</p>}
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: themeColor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "1rem", flexShrink: 0 }}>
                    {(r.customerName || "A")?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: palette.text, fontSize: ".9rem" }}>{r.customerName || "Anonymous"}</div>
                    <div style={{ color: palette.text + "66", fontSize: ".78rem" }}>{new Date(r.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short" })}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Live Shop Section ─────────────────────────────────────────────────────────

const BASE_URL_SHOP = (typeof import.meta !== "undefined" ? (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL?.replace(/\/$/, "") : "") ?? "";

type ProductVariation = { name: string; options: string[] };
type ShopProduct = {
  id: number; name: string; description?: string; price: number;
  category?: string; imageUrl?: string | null; inStock: boolean;
  stockQuantity?: number | null; unit?: string | null; currency: string;
  variations?: ProductVariation[] | null;
};
type CartItem = {
  id: number; name: string; price: number; currency: string;
  imageUrl?: string | null; qty: number; selectedOptions?: string;
};

function ShopSection({ content, palette, themeColor, siteSlug, enabledGateways, currency: siteCurrency }: {
  content: Record<string, unknown>;
  palette: SiteTemplatePalette;
  themeColor: string;
  siteSlug?: string | null;
  enabledGateways?: string[];
  currency?: string;
}) {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading]   = useState(true);
  const [cart, setCart]         = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutView, setCheckoutView] = useState<"items"|"checkout"|"paying"|"success"|"failed">("items");
  const [cName, setCName]   = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cAddr, setCAddr]   = useState("");
  const [gateway, setGateway] = useState((enabledGateways ?? [])[0] ?? "");
  const [orderId, setOrderId] = useState<number|null>(null);
  const [paying, setPaying]  = useState(false);
  const [errMsg, setErrMsg]  = useState("");
  const [favs, setFavs]      = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("awa_site_fav") ?? "[]"); } catch { return []; }
  });
  // New: variation picker + add-to-cart animation + quick-view + slider
  const [pickerProduct, setPickerProduct] = useState<ShopProduct|null>(null);
  const [pickerSel, setPickerSel]         = useState<Record<string,string>>({});
  const [addedId, setAddedId]             = useState<number|null>(null);
  const [quickView, setQuickView]         = useState<ShopProduct|null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  // ── CRM capture state ─────────────────────────────────────────────────────
  const [visitorToken] = useState<string>(() => {
    try {
      let t = localStorage.getItem("awa_vis");
      if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("awa_vis", t); }
      return t;
    } catch { return Math.random().toString(36).slice(2); }
  });
  const [viewedIds, setViewedIds] = useState<Set<number>>(new Set());
  const [cartSaveOpen, setCartSaveOpen] = useState(false);
  const [cartSaveEmail, setCartSaveEmail] = useState("");
  const [cartSaved, setCartSaved] = useState(false);
  const cartSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slug     = siteSlug;
  const currency = siteCurrency ?? "USD";
  const title    = str(content.title) || "Shop Our Products";
  const subtitle = str(content.subtitle);
  const cta      = str(content.cta) || "Add to Cart";
  // layout: "slider" | "2" | "3" | "4" | "list"  (default "3")
  const layout   = str(content.layout) || "3";

  useEffect(() => {
    if (!slug) { setLoading(false); return; }
    fetch(`${BASE_URL_SHOP}/api/sites/${encodeURIComponent(slug)}/products?limit=24`)
      .then(r => r.json())
      .then(d => setProducts(d.products ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  // ── Visit beacon: fires once on mount, captures UTM params ───────────────
  useEffect(() => {
    if (!slug) return;
    try {
      const p = new URLSearchParams(window.location.search);
      void fetch(`${BASE_URL_SHOP}/api/public/crm/product-interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteSlug: slug, visitorToken, type: "page_visit",
          productId: null, productName: null,
          utmSource: p.get("utm_source"), utmMedium: p.get("utm_medium"),
          utmCampaign: p.get("utm_campaign"), utmContent: p.get("utm_content"),
          referrer: document.referrer || null,
          landingPage: window.location.pathname,
        }),
      });
    } catch { /* best-effort */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // ── Cart-save popup: appears 30 s after first item is added (once) ────────
  useEffect(() => {
    if (cart.length > 0 && !cartSaved && !cartSaveOpen && !cartSaveTimerRef.current) {
      cartSaveTimerRef.current = setTimeout(() => setCartSaveOpen(true), 30_000);
    }
    if (cart.length === 0 && cartSaveTimerRef.current) {
      clearTimeout(cartSaveTimerRef.current);
      cartSaveTimerRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.length]);

  function toggleFav(id: number) {
    setFavs(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try { localStorage.setItem("awa_site_fav", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  /** Open variation picker if the product has options; otherwise add straight to cart. */
  function handleAddToCart(p: ShopProduct) {
    if (!p.inStock) return;
    if ((p.variations?.length ?? 0) > 0) {
      setPickerProduct(p);
      setPickerSel({});
    } else {
      commitAdd(p);
    }
  }

  /** Actually push the product (with optional variation string) into the cart and animate. */
  function commitAdd(p: ShopProduct, opts?: string) {
    setAddedId(p.id);
    setTimeout(() => setAddedId(null), 900);
    setCart(prev => {
      const ex = prev.find(i => i.id === p.id && i.selectedOptions === opts);
      if (ex) return prev.map(i => (i.id === p.id && i.selectedOptions === opts) ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: p.id, name: p.name + (opts ? ` (${opts})` : ""), price: p.price, currency: p.currency, imageUrl: p.imageUrl, qty: 1, selectedOptions: opts }];
    });
    // CRM: fire add_to_cart beacon (best-effort)
    if (slug) {
      void fetch(`${BASE_URL_SHOP}/api/public/crm/product-interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteSlug: slug, visitorToken, type: "add_to_cart", productId: p.id, productName: p.name, productPrice: p.price }),
      }).catch(() => {});
    }
  }

  /** Open quick-view and fire a product_view CRM beacon (once per product per session). */
  function openQuickView(p: ShopProduct) {
    setQuickView(p);
    if (slug && !viewedIds.has(p.id)) {
      setViewedIds(prev => new Set([...prev, p.id]));
      void fetch(`${BASE_URL_SHOP}/api/public/crm/product-interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteSlug: slug, visitorToken, type: "product_view", productId: p.id, productName: p.name, productPrice: p.price }),
      }).catch(() => {});
    }
  }

  /** Submit the cart-save email and record it in CRM. */
  async function submitCartSave() {
    if (!cartSaveEmail.trim() || !slug) return;
    try {
      await fetch(`${BASE_URL_SHOP}/api/public/crm/product-interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteSlug: slug, visitorToken, type: "cart_save_email",
          productId: cart[0]?.id ?? null,
          productName: cart.map(i => i.name).join(", "),
          email: cartSaveEmail.trim(),
          name: cName || null,
        }),
      });
    } catch { /* best-effort */ }
    setCartSaved(true);
    setCartSaveOpen(false);
  }

  function updateQty(id: number, d: number, opts?: string) {
    setCart(prev => prev.map(i => (i.id === id && i.selectedOptions === opts) ? { ...i, qty: Math.max(0, i.qty + d) } : i).filter(i => i.qty > 0));
  }

  const cartCount    = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal    = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCurrency = cart[0]?.currency ?? currency;

  function fmtPrice(amount: number, cur: string) {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(amount); }
    catch { return `${cur} ${amount.toFixed(2)}`; }
  }

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!slug) return;
    if (!gateway) { setErrMsg("Please select a payment method."); return; }
    setErrMsg(""); setPaying(true);
    try {
      const res = await fetch(`${BASE_URL_SHOP}/api/sites/${encodeURIComponent(slug)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map(i => ({ productId: i.id, qty: i.qty })),
          customer: { name: cName, email: cEmail, phone: cPhone, address: cAddr },
          gateway,
        }),
      });
      const data = await res.json();
      if (data.error) { setErrMsg(data.error); setPaying(false); return; }
      setOrderId(data.orderId);
      if (gateway === "paystack" && data.accessCode) {
        setCheckoutView("paying");
        const loadPs = () => {
          if ((window as unknown as { PaystackPop?: { setup: (opts: unknown) => { openIframe: () => void } } }).PaystackPop) {
            const ps = (window as unknown as { PaystackPop: { setup: (opts: unknown) => { openIframe: () => void } } }).PaystackPop.setup({
              key: "", access_code: data.accessCode,
              onSuccess: () => { setCheckoutView("success"); setCart([]); },
              onCancel:  () => pollStatus(data.orderId),
            });
            ps.openIframe();
          }
        };
        if (!(window as unknown as { PaystackPop?: unknown }).PaystackPop) {
          const s = document.createElement("script"); s.src = "https://js.paystack.co/v2/inline.js"; s.onload = loadPs; document.head.appendChild(s);
        } else loadPs();
      } else if (data.paymentUrl) {
        setCheckoutView("paying");
        window.open(data.paymentUrl, "_blank", "width=520,height=700");
        pollStatus(data.orderId);
      }
    } catch { setErrMsg("Network error. Please try again."); setPaying(false); }
  }

  function pollStatus(oid: number) {
    if (!slug) return;
    let tries = 0;
    const t = setInterval(async () => {
      tries++;
      try {
        const r = await fetch(`${BASE_URL_SHOP}/api/sites/${encodeURIComponent(slug)}/order-status?orderId=${oid}`);
        const d = await r.json();
        if (d.paymentStatus === "paid")    { clearInterval(t); setCheckoutView("success"); setCart([]); }
        else if (d.paymentStatus === "failed") { clearInterval(t); setCheckoutView("failed"); }
      } catch {}
      if (tries >= 40) clearInterval(t);
    }, 3000);
  }

  // ── shared micro-helpers ──────────────────────────────────────────────────
  const stockBadge = (inStock: boolean): React.CSSProperties => ({
    fontSize: 9, fontWeight: 800, padding: "3px 9px", borderRadius: 20,
    backdropFilter: "blur(8px)",
    background: inStock ? "rgba(16,185,129,.18)" : "rgba(239,68,68,.18)",
    color: inStock ? "#10b981" : "#ef4444",
    border: `1px solid ${inStock ? "rgba(16,185,129,.3)" : "rgba(239,68,68,.3)"}`,
  });

  const addBtnStyle = (isAdded: boolean, compact = false): React.CSSProperties => ({
    display: "block", width: "100%", padding: compact ? 9 : 11, borderRadius: 12,
    border: "none", cursor: "pointer", fontWeight: 800, fontSize: compact ? 11 : 13,
    textAlign: "center", color: "#fff",
    background: isAdded
      ? "linear-gradient(135deg,#10b981,#059669)"
      : `linear-gradient(135deg,${themeColor},${themeColor}cc)`,
    animation: isAdded ? "svCartBounce .6s ease" : "none",
    transition: "background .3s",
  });

  // ── per-layout grid config ────────────────────────────────────────────────
  const gridCols = layout === "2" ? "repeat(auto-fill,minmax(320px,1fr))"
                 : layout === "4" ? "repeat(auto-fill,minmax(200px,1fr))"
                 :                  "repeat(auto-fill,minmax(260px,1fr))";
  const gridGap  = layout === "4" ? "1.25rem" : "1.75rem";
  const cardBg   = palette.accent;

  // ── renderCard (grid + slider) ────────────────────────────────────────────
  function renderCard(p: ShopProduct, i: number) {
    const isFav   = favs.includes(p.id);
    const isAdded = addedId === p.id;
    const lowStock = p.inStock && (p.stockQuantity ?? 99) > 0 && (p.stockQuantity ?? 99) <= 5;
    const hasVars  = (p.variations?.length ?? 0) > 0;
    const compact  = layout === "4";

    return (
      <div key={p.id} className="sv-obs sv-card" style={{
        borderRadius: 18, overflow: "hidden", background: "#fff",
        border: `1px solid ${palette.text}0f`,
        boxShadow: isAdded ? `0 4px 24px ${themeColor}44` : "0 2px 12px rgba(0,0,0,.07)",
        transitionDelay: `${i * 50}ms`, display: "flex", flexDirection: "column",
        transition: "box-shadow .3s",
      }}>
        {/* Image zone — click opens quick-view */}
        <div style={{ position: "relative", aspectRatio: compact ? "4/3" : "1", overflow: "hidden", cursor: "pointer" }}
             onClick={() => openQuickView(p)}>
          {p.imageUrl
            ? <img src={p.imageUrl} alt={p.name} className="sv-img-zoom"
                   style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
            : <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg,${themeColor}18,${themeColor}08)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: compact ? 36 : 48 }}>🛍️</div>
          }
          {/* In/Out badge */}
          <span style={{ position: "absolute", top: 10, left: 10, ...stockBadge(p.inStock) }}>
            {p.inStock ? "● In Stock" : "✕ Sold Out"}
          </span>
          {/* Favourite */}
          <button onClick={e => { e.stopPropagation(); toggleFav(p.id); }}
            style={{ position: "absolute", top: 8, right: 10, width: 30, height: 30, borderRadius: "50%", border: "none", background: isFav ? "rgba(239,68,68,.8)" : "rgba(0,0,0,.3)", backdropFilter: "blur(6px)", color: "#fff", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
            ♥
          </button>
          {/* Low-stock pulse */}
          {lowStock && (
            <span style={{ position: "absolute", bottom: 8, left: 8, fontSize: 9, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: "rgba(245,158,11,.9)", color: "#fff", animation: "svStockPulse 1.8s ease infinite" }}>
              🔥 Only {p.stockQuantity} left!
            </span>
          )}
          {/* Variation label */}
          {hasVars && (
            <span style={{ position: "absolute", bottom: lowStock ? 30 : 8, right: 8, fontSize: 9, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: `${themeColor}cc`, color: "#fff" }}>
              {p.variations!.map(v => v.name).join(" · ")}
            </span>
          )}
        </div>

        {/* Card body */}
        <div style={{ padding: compact ? "0.9rem" : "1.25rem", display: "flex", flexDirection: "column", flex: 1 }}>
          {p.category && <p style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: themeColor, margin: "0 0 4px" }}>{p.category}</p>}
          <h3 style={{ fontSize: compact ? 13 : 15, fontWeight: 800, margin: "0 0 4px", color: palette.text, lineHeight: 1.3 }}>{p.name}</h3>
          <p style={{ fontSize: compact ? 17 : 21, fontWeight: 900, color: themeColor, margin: "0 0 6px" }}>
            {fmtPrice(p.price, p.currency)}
            {p.unit && <span style={{ fontSize: 10, color: palette.text + "66", fontWeight: 500 }}> / {p.unit}</span>}
          </p>
          {!compact && p.description && (
            <p style={{ fontSize: 12, color: palette.text + "88", margin: "0 0 10px", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as React.CSSProperties}>
              {p.description}
            </p>
          )}
          <div style={{ marginTop: "auto" }}>
            {p.inStock
              ? <button className="sv-shop-btn" onClick={() => handleAddToCart(p)} style={addBtnStyle(isAdded, compact)}>
                  {hasVars ? "⚙ Select Options" : isAdded ? "✓ Added!" : cta}
                </button>
              : <span style={{ display: "block", width: "100%", padding: compact ? 9 : 11, borderRadius: 12, background: palette.accent, color: palette.text + "44", fontWeight: 800, fontSize: 12, textAlign: "center" }}>
                  Sold Out
                </span>
            }
          </div>
        </div>
      </div>
    );
  }

  // ── renderListCard ────────────────────────────────────────────────────────
  function renderListCard(p: ShopProduct, i: number) {
    const isFav   = favs.includes(p.id);
    const isAdded = addedId === p.id;
    const lowStock = p.inStock && (p.stockQuantity ?? 99) > 0 && (p.stockQuantity ?? 99) <= 5;
    const hasVars  = (p.variations?.length ?? 0) > 0;

    return (
      <div key={p.id} className="sv-obs sv-list-card" style={{
        display: "flex", borderRadius: 16, overflow: "hidden", background: "#fff",
        border: `1px solid ${palette.text}0f`, boxShadow: "0 2px 10px rgba(0,0,0,.06)",
        transitionDelay: `${i * 40}ms`,
      }}>
        {/* Thumbnail */}
        <div style={{ width: 140, minHeight: 120, flexShrink: 0, position: "relative", overflow: "hidden", cursor: "pointer" }}
             onClick={() => openQuickView(p)}>
          {p.imageUrl
            ? <img src={p.imageUrl} alt={p.name} className="sv-img-zoom"
                   style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: 120 }} loading="lazy" />
            : <div style={{ width: "100%", height: "100%", minHeight: 120, background: `linear-gradient(135deg,${themeColor}18,${themeColor}08)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🛍️</div>
          }
        </div>

        {/* Details */}
        <div style={{ flex: 1, padding: "1rem 1.25rem", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {p.category && <p style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: themeColor, margin: "0 0 3px" }}>{p.category}</p>}
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 2px", color: palette.text, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</h3>
            </div>
            <span style={{ fontSize: 9, fontWeight: 800, padding: "3px 9px", borderRadius: 20, flexShrink: 0,
              background: p.inStock ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.12)",
              color: p.inStock ? "#10b981" : "#ef4444" }}>
              {p.inStock ? (lowStock ? `🔥 ${p.stockQuantity} left` : "In Stock") : "Sold Out"}
            </span>
          </div>
          {p.description && (
            <p style={{ fontSize: 12, color: palette.text + "88", margin: "4px 0 8px", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" } as React.CSSProperties}>
              {p.description}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", gap: 12 }}>
            <p style={{ fontSize: 20, fontWeight: 900, color: themeColor, margin: 0 }}>
              {fmtPrice(p.price, p.currency)}
              {p.unit && <span style={{ fontSize: 10, color: palette.text + "66", fontWeight: 500 }}> / {p.unit}</span>}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => toggleFav(p.id)}
                style={{ width: 30, height: 30, borderRadius: "50%", border: `1px solid ${isFav ? "#ef4444" : "#e5e7eb"}`, background: isFav ? "#ef444412" : "none", color: isFav ? "#ef4444" : "#9ca3af", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
                ♥
              </button>
              {p.inStock
                ? <button className="sv-shop-btn" onClick={() => handleAddToCart(p)}
                    style={{ ...addBtnStyle(isAdded), width: "auto", display: "inline-block", padding: "8px 18px", fontSize: 12 }}>
                    {hasVars ? "⚙ Options" : isAdded ? "✓ Added" : cta}
                  </button>
                : <span style={{ padding: "8px 18px", borderRadius: 10, background: palette.accent, color: palette.text + "44", fontWeight: 800, fontSize: 12 }}>Sold Out</span>
              }
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading / editor placeholder ──────────────────────────────────────────
  if (!slug || loading) {
    return (
      <section className="sv-section-pad" style={{ background: palette.bg, padding: "5.5rem 2rem" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <div className="sv-obs" style={{ textAlign: "center", marginBottom: "3rem" }}>
            <div style={{ display: "inline-block", background: themeColor + "18", color: themeColor, borderRadius: 999, padding: "0.3rem 0.9rem", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: ".9rem" }}>Live Shop</div>
            <h2 style={{ fontSize: "clamp(1.6rem,3.5vw,2.3rem)", fontWeight: 800, color: palette.text, marginBottom: ".6rem" }}>{title}</h2>
            {subtitle && <p style={{ color: palette.text + "88", fontSize: "1.05rem" }}>{subtitle}</p>}
          </div>
          {!slug ? (
            <div style={{ textAlign: "center", padding: "3rem", background: cardBg, borderRadius: 20, border: `2px dashed ${themeColor}40` }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🛍️</div>
              <p style={{ fontWeight: 700, color: palette.text, marginBottom: ".5rem" }}>Live shop preview</p>
              <p style={{ fontSize: ".9rem", color: palette.text + "88" }}>Your published products will appear here with full cart &amp; checkout. Publish your site to see them live.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: gridGap }}>
              {Array.from({ length: layout === "4" ? 4 : 3 }).map((_, i) => (
                <div key={i} style={{ borderRadius: 16, overflow: "hidden", background: cardBg, animation: "siteShimmer 1.5s infinite linear", backgroundImage: `linear-gradient(90deg,${palette.bg} 0%,${palette.accent} 50%,${palette.bg} 100%)`, backgroundSize: "200% 100%", height: layout === "list" ? 100 : 280 }} />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <section id="shop" className="sv-section-pad" style={{ background: palette.bg, padding: "5.5rem 2rem", position: "relative" }}>

      {/* ── Cart FAB ────────────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button onClick={() => { setCartOpen(true); setCheckoutView("items"); }}
          style={{ position: "fixed", bottom: 24, right: 24, width: 56, height: 56, borderRadius: "50%", background: `linear-gradient(135deg,${themeColor},${themeColor}cc)`, color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 4px 24px ${themeColor}55`, zIndex: 200 }}>
          🛒
          <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: "2px solid #fff" }}>
            {cartCount > 9 ? "9+" : cartCount}
          </span>
        </button>
      )}

      {/* ── Cart Drawer ─────────────────────────────────────────────────── */}
      {cartOpen && (
        <>
          <div onClick={() => setCartOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 300 }} />
          <div style={{ position: "fixed", top: 0, right: 0, width: 400, maxWidth: "100vw", height: "100vh", background: "#fff", color: "#111827", display: "flex", flexDirection: "column", boxShadow: "-4px 0 40px rgba(0,0,0,.2)", zIndex: 400 }}>
            {/* Header */}
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#fff", zIndex: 10 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, margin: 0, color: themeColor }}>
                  {checkoutView === "items" ? `Cart (${cartCount})` : checkoutView === "checkout" ? "Checkout" : checkoutView === "paying" ? "Paying…" : checkoutView === "success" ? "Order Confirmed! 🎉" : "Payment Failed"}
                </p>
                <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>Powered by Awa Biz Suite</p>
              </div>
              {checkoutView === "checkout"
                ? <button onClick={() => setCheckoutView("items")} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>← Back</button>
                : <button onClick={() => setCartOpen(false)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 22 }}>✕</button>
              }
            </div>

            {/* Body */}
            <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
              {checkoutView === "items" && (
                cart.length === 0
                  ? <div style={{ textAlign: "center", paddingTop: 60 }}><div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div><p style={{ fontWeight: 700, marginBottom: 6 }}>Your cart is empty</p><p style={{ fontSize: 13, color: "#9ca3af" }}>Add products to get started.</p></div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {cart.map(item => (
                        <div key={`${item.id}-${item.selectedOptions ?? ""}`}
                          style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, background: "#f9f9ff", border: "1px solid #f0f0f0" }}>
                          {item.imageUrl
                            ? <img src={item.imageUrl} style={{ width: 50, height: 50, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                            : <div style={{ width: 50, height: 50, borderRadius: 8, background: themeColor + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🛍️</div>
                          }
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</p>
                            <p style={{ fontSize: 14, fontWeight: 800, color: themeColor, margin: 0 }}>{fmtPrice(item.price * item.qty, item.currency)}</p>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button onClick={() => updateQty(item.id, -1, item.selectedOptions)} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid #e5e7eb", background: "none", fontSize: 16, cursor: "pointer" }}>−</button>
                            <span style={{ minWidth: 20, textAlign: "center", fontWeight: 700, fontSize: 14 }}>{item.qty}</span>
                            <button onClick={() => updateQty(item.id, 1, item.selectedOptions)} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid #e5e7eb", background: "none", fontSize: 16, cursor: "pointer" }}>+</button>
                          </div>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 0", borderTop: "1px solid #f0f0f0", marginTop: 8 }}>
                        <span style={{ color: "#6b7280", fontSize: 13 }}>Subtotal</span>
                        <span style={{ fontSize: 20, fontWeight: 900, color: themeColor }}>{fmtPrice(cartTotal, cartCurrency)}</span>
                      </div>
                    </div>
              )}

              {checkoutView === "checkout" && (
                <form onSubmit={handleCheckout} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {([["Full Name *", cName, setCName, "text", true], ["Email *", cEmail, setCEmail, "email", true], ["Phone", cPhone, setCPhone, "tel", false], ["Delivery Address", cAddr, setCAddr, "text", false]] as const).map(([lbl, val, set, type, req]) => (
                    <div key={String(lbl)}>
                      <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#6b7280", display: "block", marginBottom: 5 }}>{lbl}</label>
                      <input value={val} onChange={e => (set as (v: string) => void)(e.target.value)} type={type} required={req}
                        style={{ width: "100%", padding: "11px 13px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f9f9ff", color: "#111827", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                  ))}
                  {(enabledGateways ?? []).length > 0 && (
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#6b7280", display: "block", marginBottom: 8 }}>Payment Method</label>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(enabledGateways ?? []).map(gw => (
                          <button key={gw} type="button" onClick={() => setGateway(gw)}
                            style={{ padding: "9px 16px", borderRadius: 10, border: `1.5px solid ${gateway === gw ? themeColor : "#e5e7eb"}`, background: gateway === gw ? themeColor + "12" : "none", color: gateway === gw ? themeColor : "#6b7280", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            {gw === "paystack" ? "🏦 Paystack · NGN" : gw === "stripe" ? "💳 Card · USD" : gw === "squad" ? "💳 Squad · NGN/USD" : gw === "nowpayments" ? "₮ USDT Crypto" : `💳 ${gw}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {errMsg && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{errMsg}</p>}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid #f0f0f0" }}>
                    <span style={{ color: "#6b7280", fontSize: 13 }}>Total</span>
                    <span style={{ fontSize: 20, fontWeight: 900, color: themeColor }}>{fmtPrice(cartTotal, cartCurrency)}</span>
                  </div>
                  <button type="submit" disabled={paying}
                    style={{ padding: 13, borderRadius: 12, background: `linear-gradient(135deg,${themeColor},${themeColor}cc)`, color: "#fff", fontWeight: 800, fontSize: 14, border: "none", cursor: paying ? "wait" : "pointer", opacity: paying ? 0.7 : 1 }}>
                    {paying ? "Processing…" : `Pay ${fmtPrice(cartTotal, cartCurrency)} →`}
                  </button>
                </form>
              )}

              {checkoutView === "paying" && (
                <div style={{ textAlign: "center", paddingTop: 60 }}>
                  <div style={{ fontSize: 52, marginBottom: 16 }}>💳</div>
                  <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Waiting for payment…</p>
                  <p style={{ fontSize: 13, color: "#9ca3af" }}>Complete payment in the window that opened. This page updates automatically.</p>
                </div>
              )}

              {checkoutView === "success" && (
                <div style={{ textAlign: "center", paddingTop: 48 }}>
                  <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#10b981,#059669)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "#fff", margin: "0 auto 16px" }}>✓</div>
                  <p style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Payment Successful!</p>
                  <p style={{ fontSize: 13, color: "#9ca3af" }}>Your order has been placed. The seller will be in touch shortly.</p>
                  {orderId && <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 12, padding: "6px 14px", borderRadius: 8, background: "#f3f4f6", display: "inline-block" }}>Order #{orderId}</p>}
                  <div style={{ marginTop: 24, padding: "16px", borderRadius: 16, background: `${themeColor}0d`, border: `1px solid ${themeColor}25` }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>📦 Want to track this order?</p>
                    <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 12, lineHeight: 1.5 }}>Create a free Awa Biz Suite account to view your order history, get updates, and access AI tools.</p>
                    <a href="/customer/profile" style={{ display: "inline-block", padding: "9px 20px", borderRadius: 10, background: `linear-gradient(135deg,${themeColor},${themeColor}cc)`, color: "#fff", fontSize: 12, fontWeight: 800, textDecoration: "none" }}>Create Free Account →</a>
                    <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 8 }}>Already have an account?{" "}
                      <a href="/customer/dashboard" style={{ color: themeColor, fontWeight: 700, textDecoration: "none" }}>Sign in</a></p>
                  </div>
                  <button onClick={() => setCartOpen(false)} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 50, border: "1px solid #e5e7eb", background: "none", color: "#374151", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Close</button>
                </div>
              )}

              {checkoutView === "failed" && (
                <div style={{ textAlign: "center", paddingTop: 60 }}>
                  <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(239,68,68,.12)", border: "2px solid rgba(239,68,68,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 16px" }}>✕</div>
                  <p style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: "#ef4444" }}>Payment Failed</p>
                  <p style={{ fontSize: 13, color: "#9ca3af" }}>No charge was made. Please try again.</p>
                  <button onClick={() => setCheckoutView("checkout")} style={{ marginTop: 20, padding: "11px 28px", borderRadius: 12, background: `linear-gradient(135deg,${themeColor},${themeColor}cc)`, color: "#fff", fontWeight: 800, border: "none", cursor: "pointer" }}>Try Again</button>
                </div>
              )}
            </div>

            {/* Footer */}
            {checkoutView === "items" && cart.length > 0 && (
              <div style={{ padding: "12px 20px", borderTop: "1px solid #f0f0f0", position: "sticky", bottom: 0, background: "#fff" }}>
                <button onClick={() => setCheckoutView("checkout")} style={{ width: "100%", padding: 13, borderRadius: 12, background: `linear-gradient(135deg,${themeColor},${themeColor}cc)`, color: "#fff", fontWeight: 800, fontSize: 14, border: "none", cursor: "pointer" }}>Proceed to Checkout →</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Variation Picker (bottom sheet) ─────────────────────────────── */}
      {pickerProduct && (
        <>
          <div onClick={() => setPickerProduct(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 500 }} />
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxHeight: "80vh", background: "#fff", borderRadius: "24px 24px 0 0", zIndex: 600, display: "flex", flexDirection: "column", boxShadow: "0 -8px 40px rgba(0,0,0,.22)", animation: "svSlideUp .28s ease" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontWeight: 800, fontSize: 16, margin: 0, color: "#111827" }}>{pickerProduct.name}</p>
                <p style={{ fontWeight: 900, fontSize: 18, margin: "2px 0 0", color: themeColor }}>{fmtPrice(pickerProduct.price, pickerProduct.currency)}</p>
              </div>
              <button onClick={() => setPickerProduct(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6b7280" }}>✕</button>
            </div>
            <div style={{ padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
              {pickerProduct.variations!.map(v => (
                <div key={v.name}>
                  <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "#374151" }}>{v.name}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {v.options.map(opt => (
                      <button key={opt} onClick={() => setPickerSel(prev => ({ ...prev, [v.name]: opt }))}
                        style={{ padding: "8px 18px", borderRadius: 10, border: `1.5px solid ${pickerSel[v.name] === opt ? themeColor : "#e5e7eb"}`, background: pickerSel[v.name] === opt ? themeColor + "12" : "#fff", color: pickerSel[v.name] === opt ? themeColor : "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "all .18s" }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {(() => {
                const allSelected = !pickerProduct.variations!.some(v => !pickerSel[v.name]);
                return (
                  <button
                    disabled={!allSelected}
                    onClick={() => {
                      const opts = pickerProduct.variations!.map(v => `${v.name}: ${pickerSel[v.name]}`).join(", ");
                      commitAdd(pickerProduct, opts);
                      setPickerProduct(null);
                    }}
                    style={{ padding: 13, borderRadius: 12, border: "none", cursor: allSelected ? "pointer" : "default", fontWeight: 800, fontSize: 14, color: allSelected ? "#fff" : "#9ca3af", background: allSelected ? `linear-gradient(135deg,${themeColor},${themeColor}cc)` : "#e5e7eb", transition: "all .2s" }}>
                    {allSelected ? "Add to Cart →" : "Select all options to continue"}
                  </button>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* ── Quick View Overlay ───────────────────────────────────────────── */}
      {quickView && (
        <>
          <div onClick={() => setQuickView(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 500 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(560px,95vw)", background: "#fff", borderRadius: 24, zIndex: 600, display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,.25)", overflow: "hidden", maxHeight: "90vh", animation: "svSlideUp .25s ease" }}>
            {quickView.imageUrl && (
              <div style={{ aspectRatio: "16/9", overflow: "hidden", position: "relative", flexShrink: 0 }}>
                <img src={quickView.imageUrl} alt={quickView.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <span style={{ position: "absolute", top: 14, left: 14, ...stockBadge(quickView.inStock) }}>
                  {quickView.inStock ? "● In Stock" : "✕ Sold Out"}
                </span>
              </div>
            )}
            <div style={{ padding: "1.5rem", overflowY: "auto" }}>
              {quickView.category && <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: themeColor, margin: "0 0 8px" }}>{quickView.category}</p>}
              <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 8px", color: "#111827" }}>{quickView.name}</h2>
              <p style={{ fontSize: 26, fontWeight: 900, color: themeColor, margin: "0 0 12px" }}>
                {fmtPrice(quickView.price, quickView.currency)}
                {quickView.unit && <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}> / {quickView.unit}</span>}
              </p>
              {quickView.description && <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, margin: "0 0 20px" }}>{quickView.description}</p>}
              {(quickView.variations?.length ?? 0) > 0 && (
                <div style={{ background: themeColor + "08", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
                  {quickView.variations!.map(v => (
                    <p key={v.name} style={{ margin: "0 0 4px", fontSize: 13, color: "#374151" }}>
                      <strong>{v.name}:</strong> {v.options.join(", ")}
                    </p>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                {quickView.inStock
                  ? <button className="sv-shop-btn"
                      onClick={() => { handleAddToCart(quickView); setQuickView(null); }}
                      style={{ ...addBtnStyle(false), flex: 1, display: "block" }}>
                      {(quickView.variations?.length ?? 0) > 0 ? "⚙ Select Options" : cta}
                    </button>
                  : <span style={{ flex: 1, display: "block", padding: 11, borderRadius: 12, background: "#f3f4f6", color: "#9ca3af", fontWeight: 800, fontSize: 13, textAlign: "center" }}>Sold Out</span>
                }
                <button onClick={() => setQuickView(null)}
                  style={{ padding: "11px 20px", borderRadius: 12, border: "1px solid #e5e7eb", background: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#374151" }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Product Display ──────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>
        {/* Section header */}
        <div className="sv-obs" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <div style={{ display: "inline-block", background: themeColor + "18", color: themeColor, borderRadius: 999, padding: "0.3rem 0.9rem", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: ".9rem" }}>Live Shop</div>
          <h2 style={{ fontSize: "clamp(1.6rem,3.5vw,2.3rem)", fontWeight: 800, color: palette.text, marginBottom: ".6rem" }}>{title}</h2>
          {subtitle && <p style={{ color: palette.text + "88", fontSize: "1.05rem", maxWidth: 560, margin: "0 auto" }}>{subtitle}</p>}
        </div>

        {products.length === 0 ? (
          <p style={{ textAlign: "center", color: palette.text + "55", fontSize: "1rem" }}>No products available yet.</p>
        ) : layout === "slider" ? (
          /* ── Horizontal slider ──────────────────────────────────────── */
          <div style={{ position: "relative", padding: "0 32px" }}>
            <button className="sv-slider-btn" onClick={() => sliderRef.current?.scrollBy({ left: -310, behavior: "smooth" })}
              style={{ position: "absolute", left: -4, top: "40%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%", background: "#fff", border: `1px solid ${palette.text}18`, boxShadow: "0 4px 16px rgba(0,0,0,.12)", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: themeColor, zIndex: 10 }}>
              ‹
            </button>
            <div ref={sliderRef} className="sv-shop-slider">
              {products.map((p, i) => (
                <div key={p.id} className="sv-snap" style={{ width: 280 }}>
                  {renderCard(p, i)}
                </div>
              ))}
            </div>
            <button className="sv-slider-btn" onClick={() => sliderRef.current?.scrollBy({ left: 310, behavior: "smooth" })}
              style={{ position: "absolute", right: -4, top: "40%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%", background: "#fff", border: `1px solid ${palette.text}18`, boxShadow: "0 4px 16px rgba(0,0,0,.12)", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: themeColor, zIndex: 10 }}>
              ›
            </button>
          </div>
        ) : layout === "list" ? (
          /* ── List layout ────────────────────────────────────────────── */
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {products.map((p, i) => renderListCard(p, i))}
          </div>
        ) : (
          /* ── Grid (2 / 3 / 4 col) ──────────────────────────────────── */
          <div className={layout === "3" ? "sv-grid-3" : ""} style={{ display: "grid", gridTemplateColumns: gridCols, gap: gridGap }}>
            {products.map((p, i) => renderCard(p, i))}
          </div>
        )}
      </div>

      {/* ── Cart-Save Popup ──────────────────────────────────────────────── */}
      {cartSaveOpen && !cartSaved && (
        <div style={{
          position: "fixed", bottom: 90, right: 24, zIndex: 500,
          background: "#fff", borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,.18)",
          border: "1px solid #f0f0f0", padding: "18px 20px", maxWidth: 320, width: "calc(100vw - 48px)",
          animation: "svSlideUp .35s cubic-bezier(.22,.68,0,1.2)",
        }}>
          <button onClick={() => setCartSaveOpen(false)}
            style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af", lineHeight: 1 }}>
            ✕
          </button>
          <p style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px", color: "#111827" }}>
            💌 Save your cart
          </p>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 14px", lineHeight: 1.5 }}>
            Enter your email and we'll send you a reminder with everything in your basket.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="email"
              value={cartSaveEmail}
              onChange={e => setCartSaveEmail(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void submitCartSave(); }}
              placeholder="you@example.com"
              style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none" }}
            />
            <button
              onClick={() => void submitCartSave()}
              disabled={!cartSaveEmail.trim()}
              style={{ padding: "9px 16px", borderRadius: 10, background: themeColor, color: "#fff", border: "none", fontWeight: 800, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", opacity: cartSaveEmail.trim() ? 1 : 0.5 }}>
              Save →
            </button>
          </div>
        </div>
      )}

      {cartSaved && (
        <div style={{
          position: "fixed", bottom: 90, right: 24, zIndex: 500,
          background: "#10b981", borderRadius: 14, boxShadow: "0 4px 20px rgba(16,185,129,.35)",
          padding: "12px 18px", color: "#fff", fontWeight: 700, fontSize: 14,
          animation: "svSlideUp .3s ease",
        }}>
          ✓ Saved! We'll remind you.
        </div>
      )}

    </section>
  );
}

// ── Main SiteRenderer ─────────────────────────────────────────────────────────

export function SiteRenderer({ data, className, immediateReveal }: {
  data: SiteData;
  className?: string;
  immediateReveal?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const palette: SiteTemplatePalette = data.template?.palette ?? {
    primary: data.themeColor ?? "#7F50FF",
    secondary: "#FF7F50",
    bg: "#FFFFFF",
    text: "#111827",
    accent: "#F5F3FF",
  };
  const themeColor = data.themeColor ?? palette.primary;
  const primaryFont = data.template?.primaryFont ?? "Inter, sans-serif";
  const vendorName = data.vendor?.name ?? data.pageTitle ?? "Business";

  const enabledSections = data.sections.filter(s => s.enabled);
  const navSections = enabledSections.filter(s =>
    ["about", "products", "gallery", "testimonials", "contact"].includes(s.type)
  );

  // Scroll-triggered animations
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // In preview mode reveal everything immediately
    if (immediateReveal) {
      root.querySelectorAll(".sv-obs, .sv-obs-l, .sv-obs-r, .sv-obs-s").forEach(el => {
        el.classList.add("sv-vis");
      });
      return;
    }

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("sv-vis");
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

    root.querySelectorAll(".sv-obs, .sv-obs-l, .sv-obs-r, .sv-obs-s").forEach(el => obs.observe(el));

    return () => obs.disconnect();
  }, [data.sections, immediateReveal]);

  // Close mobile menu on route changes / section clicks
  const closeMobile = () => setMobileMenuOpen(false);

  const heroSection = enabledSections.find(s => s.type === "hero");

  return (
    <div ref={containerRef} className={className}
      style={{ fontFamily: primaryFont, background: palette.bg, color: palette.text, minHeight: "100vh" }}>
      <style>{SITE_CSS}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(255,255,255,0.94)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        animation: "siteFadeIn .5s ease both",
      }}>
        <div className="sv-header-inner" style={{
          maxWidth: 1200, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: 66, padding: "0 2rem",
        }}>
          {/* Logo / Name */}
          <a href="#" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.6rem" }}>
            {data.logoUrl
              ? <img src={data.logoUrl} alt={vendorName} style={{ height: 38, objectFit: "contain" }} />
              : <span style={{ fontWeight: 900, fontSize: "1.2rem", color: themeColor, letterSpacing: "-0.01em" }}>
                  {vendorName}
                </span>
            }
          </a>

          {/* Desktop nav */}
          <nav className="sv-desktop-nav" style={{ display: "flex", gap: "1.75rem" }}>
            {navSections.map(s => (
              <a key={s.id} href={`#${s.id}`} className="sv-navlink"
                style={{ color: palette.text + "cc", textDecoration: "none", fontSize: ".9rem", fontWeight: 600 }}>
                {s.type === "products" ? str(s.content.title) || "Products" : s.type.charAt(0).toUpperCase() + s.type.slice(1)}
              </a>
            ))}
            {data.vendorId && (
              <a href="#site-support" className="sv-navlink"
                style={{ color: palette.text + "cc", textDecoration: "none", fontSize: ".9rem", fontWeight: 600 }}>
                Support
              </a>
            )}
          </nav>

          {/* Hamburger (mobile) */}
          <button className="sv-hamburger" onClick={() => setMobileMenuOpen(o => !o)}
            style={{
              display: "flex", flexDirection: "column", gap: 5, padding: 8,
              background: "none", border: "none", cursor: "pointer",
            }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                display: "block", width: 24, height: 2.5,
                background: palette.text, borderRadius: 2,
                transition: "transform 0.2s, opacity 0.2s",
                transform: mobileMenuOpen
                  ? i === 0 ? "rotate(45deg) translate(5px,5px)"
                  : i === 1 ? "scaleX(0)"
                  : "rotate(-45deg) translate(5px,-5px)"
                  : "none",
                opacity: mobileMenuOpen && i === 1 ? 0 : 1,
              }} />
            ))}
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div style={{
            background: "rgba(255,255,255,0.98)", backdropFilter: "blur(12px)",
            borderTop: "1px solid rgba(0,0,0,0.06)",
            padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.85rem",
            animation: "siteSlideDown 0.22s ease",
          }}>
            {navSections.map(s => (
              <a key={s.id} href={`#${s.id}`} onClick={closeMobile}
                style={{
                  color: palette.text, textDecoration: "none", fontSize: "1rem",
                  fontWeight: 600, padding: "0.5rem 0",
                  borderBottom: `1px solid ${palette.text}0f`,
                }}>
                {s.type === "products" ? str(s.content.title) || "Products" : s.type.charAt(0).toUpperCase() + s.type.slice(1)}
              </a>
            ))}
            {data.vendorId && (
              <a href="#site-support" onClick={closeMobile}
                style={{
                  color: palette.text, textDecoration: "none", fontSize: "1rem",
                  fontWeight: 600, padding: "0.5rem 0",
                }}>
                Support
              </a>
            )}
          </div>
        )}
      </header>

      {/* ── Sections ─────────────────────────────────────────────────────────── */}
      {enabledSections.map(s => {
        const props = { content: s.content, palette, themeColor };
        return (
          <div key={s.id} id={s.id}>
            {s.type === "hero" && <HeroSection {...props} logoUrl={data.logoUrl} vendorName={vendorName} />}
            {s.type === "about" && <AboutSection {...props} />}
            {s.type === "products" && <ProductsSection {...props} />}
            {s.type === "shop" && <ShopSection {...props} siteSlug={data.slug} enabledGateways={data.enabledGateways} currency={data.currency} />}
            {s.type === "gallery" && <GallerySection {...props} />}
            {s.type === "testimonials" && <TestimonialsSection {...props} />}
            {s.type === "contact" && <ContactSection {...props} />}
            {s.type === "social" && <SocialSection {...props} />}
            {s.type === "whatsapp_cta" && <WhatsAppSection content={s.content} />}
            {s.type === "ratings" && <RatingsSection {...props} vendorId={data.vendorId} />}
          </div>
        );
      })}

      {/* ── Support portal ───────────────────────────────────────────────────── */}
      {data.vendorId && (
        <div id="site-support">
          <SiteSupportPortal
            vendorId={data.vendorId}
            themeColor={themeColor}
            palette={palette}
            vendorName={vendorName}
          />
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="sv-obs" style={{ background: palette.text, color: "#fff", padding: "3.5rem 2rem 2rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="sv-footer-inner" style={{
            display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "2rem", marginBottom: "2rem",
          }}>
            {/* Brand column */}
            <div style={{ maxWidth: 300 }}>
              {data.logoUrl
                ? <img src={data.logoUrl} alt={vendorName} style={{ height: 36, objectFit: "contain", filter: "brightness(0) invert(1)", marginBottom: "0.75rem" }} />
                : <div style={{ fontWeight: 900, fontSize: "1.25rem", marginBottom: "0.75rem", color: themeColor }}>{vendorName}</div>
              }
              {data.vendor?.address && (
                <p style={{ opacity: 0.75, fontSize: ".87rem", margin: "0 0 6px", display: "flex", alignItems: "flex-start", gap: "0.5rem", lineHeight: 1.5 }}>
                  <span>📍</span>{data.vendor.address}
                </p>
              )}
              {data.vendor?.phone && (
                <p style={{ opacity: 0.7, fontSize: ".87rem", margin: "0 0 6px", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>📞</span>
                  <a href={`tel:${data.vendor.phone}`} style={{ color: "inherit", textDecoration: "none" }}>{data.vendor.phone}</a>
                </p>
              )}
              {data.vendor?.email && (
                <p style={{ opacity: 0.7, fontSize: ".87rem", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>✉️</span>
                  <a href={`mailto:${data.vendor.email}`} style={{ color: "inherit", textDecoration: "none" }}>{data.vendor.email}</a>
                </p>
              )}
            </div>

            {/* Quick links */}
            {navSections.length > 0 && (
              <div>
                <div style={{ fontWeight: 800, fontSize: ".85rem", letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.5, marginBottom: "0.85rem" }}>Navigation</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {navSections.map(s => (
                    <a key={s.id} href={`#${s.id}`} style={{ opacity: 0.65, fontSize: ".88rem", fontWeight: 600, textDecoration: "none", color: "#fff", transition: "opacity .18s" }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                      onMouseLeave={e => (e.currentTarget.style.opacity = "0.65")}>
                      {s.type === "products" ? str(s.content.title) || "Products" : s.type.charAt(0).toUpperCase() + s.type.slice(1)}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "1.5rem", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <p style={{ opacity: 0.3, fontSize: ".7rem", margin: 0 }}>© {new Date().getFullYear()} {vendorName}. All rights reserved.</p>
            <p style={{ opacity: 0.45, fontSize: ".75rem", margin: 0 }}>
              Powered by <span style={{ color: themeColor, fontWeight: 700 }}>Awa Biz Suite</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
