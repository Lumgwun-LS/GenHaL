import { motion } from "framer-motion";
import { FaFacebook, FaInstagram, FaLinkedin, FaTiktok, FaXTwitter } from "react-icons/fa6";

const OFFICES = [
  {
    label: "United States",
    lines: ["16501 Shady Grove Road, Suite 8885", "Gaithersburg, MD 20898, USA"],
    address: "16501 Shady Grove Road, Suite 8885, Gaithersburg, MD 20898, USA",
  },
  {
    label: "Nigeria HQ",
    lines: ["Pyale Workhub, 21 Bekwere Wosu Street", "D-Line, Diobu, Port Harcourt", "Rivers State, Nigeria"],
    address: "Pyale Workhub, 21 Bekwere Wosu Street, D-Line, Diobu, Port Harcourt, Rivers State, Nigeria",
  },
];

const SOCIAL = [
  { name: "Facebook",  href: "https://www.facebook.com/lumgwunsolutionsgroup", Icon: FaFacebook },
  { name: "Instagram", href: "https://www.instagram.com/lumgwunsolutionsgroup", Icon: FaInstagram },
  { name: "X",         href: "https://x.com/lumgwunsolutions",                 Icon: FaXTwitter  },
  { name: "LinkedIn",  href: "https://www.linkedin.com/company/lumgwun-solutions-group/", Icon: FaLinkedin },
  { name: "TikTok",    href: "https://tiktok.com/@lumgwun.solutions",           Icon: FaTiktok   },
];

const LINKS = [
  { label: "Browse Apps",     href: "/" },
  { label: "Publish an App",  href: "/developer" },
  { label: "Awa Biz Suite",   href: "https://awajimaaai.com/" },
  { label: "Awajimaa Schools", href: "https://www.awajimaaschools.com" },
  { label: "Awajimaa Hosting", href: "https://www.awajimaahosting.com" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer style={{ background: "#040610", borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: "auto" }}>

      {/* Main grid */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "56px 24px 40px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 40 }}>

        {/* Brand */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "#fff", borderRadius: 8, padding: "3px 8px", display: "flex", alignItems: "center" }}>
              <img src="/logo-color.jpg" alt="Awajimaa" style={{ height: 26, width: "auto", objectFit: "contain" }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#00c853", letterSpacing: 1, textTransform: "uppercase" }}>APP STORE</div>
              <div style={{ fontSize: 9, color: "#5a6478", letterSpacing: 0.5, marginTop: 1 }}>by Awajimaa</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: "#7a8499", lineHeight: 1.7, maxWidth: 260 }}>
            Discover and install powerful apps built for African businesses and beyond. One platform. Endless possibilities.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {SOCIAL.map(({ name, href, Icon }) => (
              <motion.a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={name}
                whileHover={{ scale: 1.15, color: "#00c853" }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                style={{ color: "#4a5568", fontSize: 16, display: "flex" }}
              >
                <Icon />
              </motion.a>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#4a5568", marginBottom: 4 }}>Quick Links</p>
          {LINKS.map(({ label, href }) => (
            <motion.a
              key={label}
              href={href}
              whileHover={{ x: 3, color: "#00c853" }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              style={{ fontSize: 13, color: "#7a8499", textDecoration: "none", display: "block" }}
            >
              {label}
            </motion.a>
          ))}
        </div>

        {/* Contact */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#4a5568", marginBottom: 4 }}>Contact</p>
          <div style={{ fontSize: 13, color: "#7a8499" }}>
            <p style={{ marginBottom: 2, fontWeight: 600, color: "#c0c8d8" }}>Support</p>
            <a href="mailto:admin@lumgwunsolutions.com" style={{ color: "#00c853", textDecoration: "none", display: "block", marginBottom: 2 }}>admin@lumgwunsolutions.com</a>
            <a href="mailto:awajimaaapps@gmail.com"     style={{ color: "#00c853", textDecoration: "none", display: "block" }}>awajimaaapps@gmail.com</a>
          </div>
          <div style={{ fontSize: 13, color: "#7a8499", marginTop: 8 }}>
            <p style={{ marginBottom: 6, fontWeight: 600, color: "#c0c8d8" }}>Phone</p>
            <a href="tel:+19178218640"   style={{ color: "#7a8499", textDecoration: "none", display: "block", marginBottom: 2 }}>+1 917 821 8640</a>
            <a href="tel:+2347038843102" style={{ color: "#7a8499", textDecoration: "none", display: "block" }}>+234 703 884 3102</a>
          </div>
        </div>

        {/* Company */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#4a5568", marginBottom: 4 }}>Company</p>
          <div style={{ fontSize: 13, color: "#7a8499" }}>
            <p style={{ fontWeight: 600, color: "#c0c8d8", marginBottom: 2 }}>Lumgwun Solutions</p>
            <a href="https://www.lumgwunsolutions.com" target="_blank" rel="noopener noreferrer" style={{ color: "#00c853", textDecoration: "none" }}>
              www.lumgwunsolutions.com
            </a>
          </div>
          <div style={{ fontSize: 13, color: "#7a8499", marginTop: 8 }}>
            <p style={{ fontWeight: 600, color: "#c0c8d8", marginBottom: 2 }}>Awajimaa Group</p>
            <p>Technology · Education · Infrastructure</p>
          </div>
        </div>
      </div>

      {/* Office Maps */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px 40px" }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#4a5568", marginBottom: 16 }}>Our Offices</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          {OFFICES.map((office) => (
            <div key={office.label} style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ background: "rgba(255,255,255,0.04)", padding: "8px 14px", display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 13, marginTop: 1 }}>📍</span>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#c0c8d8", marginBottom: 2 }}>{office.label}</p>
                  <p style={{ fontSize: 11, color: "#5a6478", lineHeight: 1.5 }}>{office.lines.join(" · ")}</p>
                </div>
              </div>
              <iframe
                title={`Map — ${office.label}`}
                src={`https://www.google.com/maps?q=${encodeURIComponent(office.address)}&output=embed`}
                width="100%"
                height="200"
                style={{ border: 0, display: "block" }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 24px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={{ fontSize: 12, color: "#3d4a5c" }}>
            © {year} Awajimaa App Store. All rights reserved.
          </p>
          <p style={{ fontSize: 12, color: "#3d4a5c" }}>
            Powered by{" "}
            <a href="https://www.lumgwunsolutions.com" target="_blank" rel="noopener noreferrer" style={{ color: "#5a6a7a", textDecoration: "none", fontWeight: 600 }}>
              Lumgwun Solutions
            </a>
            {" "}&amp;{" "}
            <span style={{ color: "#5a6a7a", fontWeight: 600 }}>Awajimaa Group</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
