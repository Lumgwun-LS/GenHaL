/**
 * SiteRenderer — renders a vendor's public site from sections JSON.
 * Used in both the live preview (editor) and the public /site/:slug page.
 */
import { useMemo } from "react";

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

// ── Section renderers ─────────────────────────────────────────────────────────
function HeroSection({ content, palette, themeColor }: { content: Record<string, unknown>; palette: SiteTemplatePalette; themeColor: string }) {
  const bg = str(content.backgroundImage);
  const opacity = parseFloat(str(content.overlayOpacity) || "0.4");
  return (
    <section style={{
      position: "relative",
      minHeight: 480,
      background: bg ? `url(${bg}) center/cover no-repeat` : `linear-gradient(135deg, ${themeColor}22 0%, ${palette.accent} 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      {bg && <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${opacity})` }} />}
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "4rem 2rem", maxWidth: 700 }}>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 800, lineHeight: 1.15, color: bg ? "#fff" : palette.text, marginBottom: "1rem" }}>
          {str(content.headline) || "Welcome"}
        </h1>
        {str(content.subheadline) && (
          <p style={{ fontSize: "clamp(1rem, 2.5vw, 1.35rem)", color: bg ? "rgba(255,255,255,0.9)" : palette.text + "cc", marginBottom: "2rem" }}>
            {str(content.subheadline)}
          </p>
        )}
        {str(content.ctaText) && (
          <a
            href={str(content.ctaUrl) || "#contact"}
            style={{
              display: "inline-block", background: themeColor, color: "#fff",
              padding: "0.9rem 2.2rem", borderRadius: 8, fontWeight: 700,
              fontSize: "1.05rem", textDecoration: "none", transition: "opacity .2s",
            }}
          >
            {str(content.ctaText)}
          </a>
        )}
      </div>
    </section>
  );
}

function AboutSection({ content, palette, themeColor }: { content: Record<string, unknown>; palette: SiteTemplatePalette; themeColor: string }) {
  const img = str(content.image);
  return (
    <section style={{ background: palette.accent, padding: "5rem 2rem" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", gap: "3rem", alignItems: "center", flexWrap: "wrap" }}>
        {img && (
          <img src={img} alt="About" style={{ width: 280, height: 280, objectFit: "cover", borderRadius: 16, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 260 }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 700, color: palette.text, marginBottom: "1rem" }}>
            {str(content.title) || "About Us"}
          </h2>
          <p style={{ fontSize: "1.05rem", lineHeight: 1.75, color: palette.text + "bb" }}>
            {str(content.body)}
          </p>
        </div>
      </div>
    </section>
  );
}

function ProductsSection({ content, palette, themeColor }: { content: Record<string, unknown>; palette: SiteTemplatePalette; themeColor: string }) {
  const items = parseItems(content.items);
  return (
    <section style={{ background: palette.bg, padding: "5rem 2rem" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 700, color: palette.text, marginBottom: ".5rem" }}>
            {str(content.title) || "Products & Services"}
          </h2>
          {str(content.subtitle) && (
            <p style={{ color: palette.text + "99", fontSize: "1.05rem" }}>{str(content.subtitle)}</p>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1.5rem" }}>
          {items.map((item, i) => (
            <div key={i} style={{
              background: "#fff", borderRadius: 12, overflow: "hidden",
              boxShadow: "0 1px 8px rgba(0,0,0,.08)", border: "1px solid #f0f0f0",
            }}>
              {item.image && (
                <img src={item.image} alt={item.name} style={{ width: "100%", height: 180, objectFit: "cover" }} />
              )}
              {!item.image && (
                <div style={{ height: 140, background: `${themeColor}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "2.5rem" }}>🛍️</span>
                </div>
              )}
              <div style={{ padding: "1.2rem" }}>
                <h3 style={{ fontWeight: 700, color: palette.text, marginBottom: ".4rem", fontSize: "1.05rem" }}>{item.name}</h3>
                {item.description && <p style={{ color: palette.text + "99", fontSize: ".9rem", marginBottom: ".6rem" }}>{item.description}</p>}
                {item.price && <span style={{ fontWeight: 700, color: themeColor, fontSize: "1.1rem" }}>{item.price}</span>}
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
    <section style={{ background: palette.accent, padding: "5rem 2rem" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontSize: "2rem", fontWeight: 700, color: palette.text, marginBottom: "2rem", textAlign: "center" }}>
          {str(content.title) || "Gallery"}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
          {images.map((img, i) => (
            <img key={i} src={str(img.url || img)} alt={`Gallery ${i + 1}`}
              style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10 }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection({ content, palette, themeColor }: { content: Record<string, unknown>; palette: SiteTemplatePalette; themeColor: string }) {
  const items = parseItems(content.items);
  return (
    <section style={{ background: palette.bg, padding: "5rem 2rem" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <h2 style={{ fontSize: "2rem", fontWeight: 700, color: palette.text, marginBottom: "2.5rem", textAlign: "center" }}>
          {str(content.title) || "Testimonials"}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.5rem" }}>
          {items.map((item, i) => (
            <div key={i} style={{ background: palette.accent, borderRadius: 12, padding: "1.8rem", boxShadow: "0 1px 6px rgba(0,0,0,.06)" }}>
              <p style={{ color: palette.text + "cc", fontStyle: "italic", lineHeight: 1.7, marginBottom: "1.2rem", fontSize: ".97rem" }}>
                "{item.text}"
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                {item.avatar
                  ? <img src={item.avatar} alt={item.name} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
                  : <div style={{ width: 40, height: 40, borderRadius: "50%", background: themeColor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>{item.name?.[0] ?? "?"}</div>
                }
                <div>
                  <div style={{ fontWeight: 700, color: palette.text, fontSize: ".95rem" }}>{item.name}</div>
                  {item.role && <div style={{ color: palette.text + "88", fontSize: ".82rem" }}>{item.role}</div>}
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
    <section id="contact" style={{ background: palette.accent, padding: "5rem 2rem" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontSize: "2rem", fontWeight: 700, color: palette.text, marginBottom: "2rem" }}>
          {str(content.title) || "Contact Us"}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center" }}>
          {str(content.email) && (
            <a href={`mailto:${str(content.email)}`} style={{ color: themeColor, fontSize: "1.05rem", textDecoration: "none", display: "flex", alignItems: "center", gap: ".5rem" }}>
              📧 {str(content.email)}
            </a>
          )}
          {str(content.phone) && (
            <a href={`tel:${str(content.phone)}`} style={{ color: palette.text, fontSize: "1.05rem", textDecoration: "none", display: "flex", alignItems: "center", gap: ".5rem" }}>
              📞 {str(content.phone)}
            </a>
          )}
          {str(content.address) && (
            <p style={{ color: palette.text + "99", fontSize: "1rem", display: "flex", alignItems: "center", gap: ".5rem" }}>
              📍 {str(content.address)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function SocialSection({ content, palette, themeColor }: { content: Record<string, unknown>; palette: SiteTemplatePalette; themeColor: string }) {
  const links: Array<{ key: string; label: string; icon: string; baseUrl: string }> = [
    { key: "facebook", label: "Facebook", icon: "📘", baseUrl: "https://facebook.com/" },
    { key: "instagram", label: "Instagram", icon: "📷", baseUrl: "https://instagram.com/" },
    { key: "twitter", label: "X/Twitter", icon: "🐦", baseUrl: "https://x.com/" },
    { key: "linkedin", label: "LinkedIn", icon: "💼", baseUrl: "https://linkedin.com/in/" },
    { key: "tiktok", label: "TikTok", icon: "🎵", baseUrl: "https://tiktok.com/@" },
    { key: "youtube", label: "YouTube", icon: "▶️", baseUrl: "https://youtube.com/@" },
  ].filter(l => str(content[l.key]));

  if (links.length === 0) return null;

  return (
    <section style={{ background: palette.bg, padding: "3rem 2rem" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        {str(content.title) && (
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: palette.text, marginBottom: "1.5rem" }}>
            {str(content.title)}
          </h2>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "1rem" }}>
          {links.map(l => (
            <a key={l.key} href={str(content[l.key]).startsWith("http") ? str(content[l.key]) : l.baseUrl + str(content[l.key])}
              target="_blank" rel="noopener noreferrer"
              style={{ background: palette.accent, border: `1px solid ${themeColor}33`, color: palette.text, padding: ".7rem 1.4rem", borderRadius: 999, textDecoration: "none", fontSize: ".95rem", display: "flex", alignItems: "center", gap: ".4rem" }}>
              <span>{l.icon}</span> {l.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatsAppSection({ content, palette, themeColor }: { content: Record<string, unknown>; palette: SiteTemplatePalette; themeColor: string }) {
  const number = str(content.number).replace(/\D/g, "");
  if (!number) return null;
  const msg = encodeURIComponent(str(content.message) || "Hi! I'd like to know more.");
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 100 }}>
      <a href={`https://wa.me/${number}?text=${msg}`} target="_blank" rel="noopener noreferrer"
        style={{
          display: "flex", alignItems: "center", gap: ".6rem",
          background: "#25D366", color: "#fff", padding: ".85rem 1.4rem",
          borderRadius: 999, textDecoration: "none", fontWeight: 700,
          fontSize: ".95rem", boxShadow: "0 4px 16px rgba(37,211,102,.4)",
        }}>
        <span style={{ fontSize: "1.3rem" }}>💬</span>
        {str(content.buttonText) || "Chat on WhatsApp"}
      </a>
    </div>
  );
}

// ── Main renderer ─────────────────────────────────────────────────────────────
export function SiteRenderer({ data, className }: { data: SiteData; className?: string }) {
  const palette: SiteTemplatePalette = data.template?.palette ?? {
    primary: data.themeColor ?? "#7F50FF",
    secondary: "#FF7F50",
    bg: "#FFFFFF",
    text: "#111827",
    accent: "#F3F0FF",
  };
  const themeColor = data.themeColor ?? palette.primary;
  const primaryFont = data.template?.primaryFont ?? "Inter, sans-serif";
  const vendorName = data.vendor?.name ?? data.pageTitle ?? "Business";

  const enabledSections = data.sections.filter(s => s.enabled);

  const renderSection = (section: SiteSection) => {
    const props = { content: section.content, palette, themeColor };
    switch (section.type) {
      case "hero": return <HeroSection key={section.id} {...props} />;
      case "about": return <AboutSection key={section.id} {...props} />;
      case "products": return <ProductsSection key={section.id} {...props} />;
      case "gallery": return <GallerySection key={section.id} {...props} />;
      case "testimonials": return <TestimonialsSection key={section.id} {...props} />;
      case "contact": return <ContactSection key={section.id} {...props} />;
      case "social": return <SocialSection key={section.id} {...props} />;
      case "whatsapp_cta": return <WhatsAppSection key={section.id} {...props} />;
      default: return null;
    }
  };

  return (
    <div className={className} style={{ fontFamily: primaryFont, background: palette.bg, color: palette.text, minHeight: "100vh" }}>
      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)",
        borderBottom: "1px solid #f0f0f0",
        padding: "0 2rem",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 64,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {data.logoUrl
            ? <img src={data.logoUrl} alt={vendorName} style={{ height: 36, objectFit: "contain" }} />
            : <span style={{ fontWeight: 800, fontSize: "1.25rem", color: themeColor }}>{vendorName}</span>
          }
        </div>
        <nav style={{ display: "flex", gap: "1.5rem" }}>
          {enabledSections.filter(s => ["about","products","gallery","testimonials","contact"].includes(s.type)).map(s => (
            <a key={s.id} href={`#${s.id}`} style={{ color: palette.text + "cc", textDecoration: "none", fontSize: ".9rem", fontWeight: 500 }}>
              {s.type === "products" ? str(s.content.title) || "Products" : s.type.charAt(0).toUpperCase() + s.type.slice(1)}
            </a>
          ))}
        </nav>
      </header>

      {/* Sections */}
      {enabledSections.map(s => (
        <div key={s.id} id={s.id}>{renderSection(s)}</div>
      ))}

      {/* Footer */}
      <footer style={{ background: palette.text, color: "#fff", padding: "2.5rem 2rem", textAlign: "center" }}>
        <p style={{ fontWeight: 700, marginBottom: ".3rem", fontSize: "1.05rem" }}>{vendorName}</p>
        {data.vendor?.email && <p style={{ opacity: .7, fontSize: ".88rem" }}>{data.vendor.email}</p>}
        <p style={{ opacity: .5, fontSize: ".78rem", marginTop: "1rem" }}>
          Powered by <span style={{ color: themeColor }}>Awa Biz Suite</span>
        </p>
      </footer>
    </div>
  );
}
