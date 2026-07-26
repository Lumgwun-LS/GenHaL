/**
 * SiteRenderer — renders a vendor's public site from sections JSON.
 * Used in both the live preview (editor) and the public /site/:slug page.
 * Features: scroll-triggered CSS animations, animated hero, mobile nav, responsive.
 */
import { useEffect, useRef, useState } from "react";

export type SiteSectionType =
  | "hero" | "about" | "products" | "gallery"
  | "testimonials" | "contact" | "social" | "whatsapp_cta";

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
  const bg = str(content.backgroundImage);
  const opacity = Math.min(1, Math.max(0, parseFloat(str(content.overlayOpacity) || "0.45")));
  const rgb = hexToRgb(themeColor);
  const hasImage = !!bg;

  return (
    <section style={{
      position: "relative",
      minHeight: 540,
      overflow: "hidden",
      background: hasImage
        ? `url(${bg}) center/cover no-repeat`
        : `linear-gradient(135deg, ${themeColor}, ${themeColor}cc 40%, ${palette.secondary || "#FF7F50"})`,
      backgroundSize: hasImage ? "cover" : "200% 200%",
      animation: hasImage ? undefined : "siteGradient 8s ease infinite",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* Overlay */}
      {hasImage && <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${opacity})` }} />}
      {!hasImage && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.08)" }} />}

      {/* Decorative floating shapes (no-image mode) */}
      {!hasImage && (
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
        position: "relative", zIndex: 1, textAlign: "center",
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
        animation: "siteHeroText 1s ease 1.2s both",
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
  if (images.length === 0) return null;
  return (
    <section className="sv-section-pad" style={{ background: palette.accent, padding: "5.5rem 2rem" }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "1rem" }}>
          {images.map((img, i) => (
            <div key={i} className="sv-obs sv-obs-s sv-card" style={{
              borderRadius: 14, overflow: "hidden", aspectRatio: "1",
              boxShadow: "0 2px 12px rgba(0,0,0,.08)",
              transitionDelay: `${i * 60}ms`,
            }}>
              <img src={str(img.url || img as unknown as string)} alt={`Gallery ${i + 1}`} className="sv-img-zoom"
                style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ))}
        </div>
      </div>
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
            {s.type === "gallery" && <GallerySection {...props} />}
            {s.type === "testimonials" && <TestimonialsSection {...props} />}
            {s.type === "contact" && <ContactSection {...props} />}
            {s.type === "social" && <SocialSection {...props} />}
            {s.type === "whatsapp_cta" && <WhatsAppSection content={s.content} />}
          </div>
        );
      })}

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="sv-obs" style={{ background: palette.text, color: "#fff", padding: "3rem 2rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="sv-footer-inner" style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            flexWrap: "wrap", gap: "1rem",
          }}>
            <div>
              {data.logoUrl
                ? <img src={data.logoUrl} alt={vendorName} style={{ height: 32, objectFit: "contain", filter: "brightness(0) invert(1)", marginBottom: "0.5rem" }} />
                : <div style={{ fontWeight: 900, fontSize: "1.15rem", marginBottom: "0.5rem" }}>{vendorName}</div>
              }
              {data.vendor?.email && <p style={{ opacity: 0.6, fontSize: ".85rem", margin: 0 }}>{data.vendor.email}</p>}
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ opacity: 0.45, fontSize: ".75rem", margin: 0 }}>
                Powered by{" "}
                <span style={{ color: themeColor, fontWeight: 700 }}>Awa Biz Suite</span>
              </p>
              <p style={{ opacity: 0.3, fontSize: ".7rem", marginTop: 4 }}>
                © {new Date().getFullYear()} {vendorName}. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
