import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useUser, UserButton } from "@clerk/react";
import { apiFetch } from "../lib/api";
import { useAppThemeStore } from "../store/themeStore";
import { ThemePicker } from "./ThemePicker";

const PLATFORMS = [
  {
    name: "Awajimaa Schools",
    tagline: "School Management System",
    href: "https://awajimaaschools.com",
    icon: "🏫",
    color: "#22d3ee",
    bg: "rgba(34,211,238,0.09)",
    border: "rgba(34,211,238,0.22)",
  },
  {
    name: "Awajimaa Hosting",
    tagline: "Cloud & Web Hosting",
    href: "https://awajimaahosting.com",
    icon: "🌐",
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.09)",
    border: "rgba(96,165,250,0.22)",
  },
  {
    name: "Awajimaa AI",
    tagline: "AI Business Platform",
    href: "https://awajimaaai.com",
    icon: "🤖",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.09)",
    border: "rgba(167,139,250,0.22)",
  },
  {
    name: "Awajimaa App",
    tagline: "Emergency Response App",
    href: "https://awa.awajimaaapp.io",
    icon: "🚨",
    color: "#fb7185",
    bg: "rgba(251,113,133,0.09)",
    border: "rgba(251,113,133,0.22)",
  },
  {
    name: "Awa Biz Suite",
    tagline: "Vendor & Business Tools",
    href: "https://awajimaaai.com/?ref=app-store",
    icon: "🏢",
    color: "#c4b5fd",
    bg: "rgba(124,58,237,0.12)",
    border: "rgba(124,58,237,0.28)",
  },
];

function PlatformCard({
  p,
  onClick,
}: {
  p: (typeof PLATFORMS)[0];
  onClick?: () => void;
}) {
  return (
    <motion.a
      href={p.href}
      target={p.href.startsWith("http") ? "_blank" : undefined}
      rel={p.href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 24 }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 12,
        background: p.bg,
        border: `1px solid ${p.border}`,
        textDecoration: "none",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          background: "rgba(255,255,255,0.05)",
          flexShrink: 0,
        }}
      >
        {p.icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 13,
            color: p.color,
            whiteSpace: "nowrap",
          }}
        >
          {p.name}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#8892a4",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {p.tagline}
        </div>
      </div>
      <div style={{ marginLeft: "auto", color: "#556070", fontSize: 12, flexShrink: 0 }}>
        ↗
      </div>
    </motion.a>
  );
}

// ── Desktop platforms flyout dropdown ─────────────────────────────────────────
function PlatformsDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.04, y: -1 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 420, damping: 24 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: open
            ? "rgba(0,200,83,0.1)"
            : "rgba(255,255,255,0.04)",
          border: `1px solid ${open ? "rgba(0,200,83,0.35)" : "rgba(255,255,255,0.1)"}`,
          borderRadius: 20,
          padding: "5px 13px",
          color: open ? "#00c853" : "#c0c8d8",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: 14 }}>🌐</span>
        <span>Platforms</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ fontSize: 9, opacity: 0.7, lineHeight: 1 }}
        >
          ▼
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="platforms-flyout"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.7 }}
            style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              zIndex: 200,
              background: "#0d1117",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3)",
              padding: 12,
              minWidth: 280,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#556070",
                textTransform: "uppercase",
                letterSpacing: 1,
                padding: "2px 6px 8px",
              }}
            >
              Awajimaa Ecosystem
            </div>
            {PLATFORMS.map((p, i) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <PlatformCard p={p} onClick={() => setOpen(false)} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Mobile full-screen drawer ──────────────────────────────────────────────────
function MobileDrawer({
  open,
  onClose,
  isSignedIn,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  isSignedIn: boolean;
  isAdmin: boolean;
}) {
  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const navLinks = [
    { href: "/", label: "🏠 Browse Apps" },
    { href: "/developer", label: "🚀 Publish an App" },
    ...(isSignedIn ? [{ href: "/my-apps", label: "📦 My Apps" }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "⚙️ Admin Panel" }] : []),
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 300,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(4px)",
            }}
          />

          {/* Slide-up drawer */}
          <motion.div
            key="drawer-panel"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34, mass: 0.9 }}
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 400,
              background: "#0b0f17",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "20px 20px 0 0",
              maxHeight: "88vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Handle + header */}
            <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
              <div
                style={{
                  width: 36,
                  height: 4,
                  background: "rgba(255,255,255,0.14)",
                  borderRadius: 2,
                  margin: "0 auto 16px",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <img
                    src="/awajimaa-app-icon.jpg"
                    alt="Awajimaa App Store"
                    style={{ height: 26, width: 26, borderRadius: 6, objectFit: "cover" }}
                  />
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 15,
                      color: "#e8eaf0",
                      lineHeight: 1.1,
                    }}
                  >
                    Awajimaa <span style={{ color: "#00c853" }}>App Store</span>
                  </div>
                </div>
                <motion.button
                  onClick={onClose}
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "50%",
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#8892a4",
                    cursor: "pointer",
                    fontSize: 16,
                  }}
                >
                  ×
                </motion.button>
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{ overflowY: "auto", flex: 1, padding: "0 20px 32px" }}>
              {/* Nav links */}
              <div style={{ marginBottom: 24 }}>
                {navLinks.map(({ href, label }, i) => (
                  <motion.div
                    key={href}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Link
                      href={href}
                      onClick={onClose}
                      style={{
                        display: "block",
                        padding: "13px 0",
                        fontSize: 16,
                        fontWeight: 600,
                        color: "#c0c8d8",
                        textDecoration: "none",
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      {label}
                    </Link>
                  </motion.div>
                ))}
              </div>

              {/* Platforms section */}
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#556070",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 12,
                }}
              >
                🌐 Our Platforms
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {PLATFORMS.map((p, i) => (
                  <motion.div
                    key={p.name}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.06 }}
                  >
                    <PlatformCard p={p} onClick={onClose} />
                  </motion.div>
                ))}
              </div>

              {/* Auth at the bottom */}
              <div
                style={{
                  marginTop: 28,
                  paddingTop: 20,
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {isSignedIn ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <UserButton />
                    <span style={{ color: "#8892a4", fontSize: 13 }}>
                      Signed in
                    </span>
                  </div>
                ) : (
                  <>
                    <Link href="/sign-in" onClick={onClose}>
                      <button
                        style={{
                          width: "100%",
                          padding: "12px",
                          background: "transparent",
                          border: "1px solid rgba(255,255,255,0.18)",
                          borderRadius: 12,
                          color: "#c0c8d8",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Sign In
                      </button>
                    </Link>
                    <Link href="/sign-up" onClick={onClose}>
                      <button
                        className="btn-green"
                        style={{
                          width: "100%",
                          padding: "12px",
                          fontSize: 14,
                          borderRadius: 12,
                        }}
                      >
                        Create Account
                      </button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Main Nav ──────────────────────────────────────────────────────────────────
export default function Nav() {
  const { isSignedIn } = useUser();
  const [, navigate] = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [query, setQuery] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { config } = useAppThemeStore();

  useEffect(() => {
    if (!isSignedIn) {
      setIsAdmin(false);
      return;
    }
    apiFetch<{ isAdmin: boolean }>("/admin/me")
      .then((d) => setIsAdmin(d.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [isSignedIn]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <>
      <ThemePicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
      <motion.nav
        animate={{
          backgroundColor: scrolled ? "rgba(6,8,17,0.88)" : "#070a12",
          backdropFilter: scrolled
            ? "blur(22px) saturate(180%)"
            : "blur(0px)",
          boxShadow: scrolled
            ? "0 1px 0 rgba(0,200,83,0.12), 0 4px 24px rgba(0,0,0,0.4)"
            : "none",
        }}
        transition={{ duration: 0.35 }}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "0 20px",
            height: 62,
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          {/* Logo */}
          <motion.div
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            <Link
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
                textDecoration: "none",
              }}
            >
              <img
                src="/awajimaa-app-icon.jpg"
                alt="Awajimaa App Store"
                style={{
                  height: 34,
                  width: 34,
                  borderRadius: 8,
                  display: "block",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 13,
                    color: "#e8eaf0",
                    whiteSpace: "nowrap",
                    letterSpacing: "-0.2px",
                  }}
                >
                  Awajimaa
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 10,
                    color: "#00c853",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  App Store
                </div>
              </div>
            </Link>
          </motion.div>

          {/* Search */}
          <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 500 }}>
            <motion.div
              animate={{ scale: searchFocused ? 1.02 : 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              style={{ position: "relative" }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 13,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 14,
                  opacity: searchFocused ? 0.7 : 0.35,
                  transition: "opacity 0.2s",
                }}
              >
                🔍
              </span>
              <motion.input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={
                  isMobile ? "Search apps…" : "Search apps, categories, developers..."
                }
                animate={{
                  borderColor: searchFocused
                    ? "rgba(0,200,83,0.5)"
                    : "rgba(255,255,255,0.08)",
                  boxShadow: searchFocused
                    ? "0 0 0 3px rgba(0,200,83,0.08)"
                    : "none",
                }}
                transition={{ duration: 0.2 }}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 24,
                  padding: "8px 16px 8px 38px",
                  fontSize: 14,
                  color: "#e8eaf0",
                  outline: "none",
                }}
              />
            </motion.div>
          </form>

          {/* ── Desktop links (hidden on mobile) ─────────────────────────── */}
          {!isMobile && (
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              {[
                { href: "/", label: "Browse" },
                { href: "/developer", label: "Publish" },
                ...(isAdmin ? [{ href: "/admin", label: "⚙️ Admin" }] : []),
              ].map(({ href, label }) => (
                <motion.div
                  key={label}
                  whileHover={{ y: -1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                >
                  <Link
                    href={href}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#c0c8d8",
                      textDecoration: "none",
                      display: "block",
                    }}
                  >
                    {label}
                  </Link>
                </motion.div>
              ))}

              <div
                style={{
                  width: 1,
                  height: 22,
                  background: "rgba(255,255,255,0.1)",
                  margin: "0 8px",
                }}
              />

              {/* Platforms dropdown */}
              <PlatformsDropdown />

              <div
                style={{
                  width: 1,
                  height: 22,
                  background: "rgba(255,255,255,0.1)",
                  margin: "0 8px",
                }}
              />

              {/* Theme picker button */}
              <motion.button
                onClick={() => setPickerOpen(true)}
                whileHover={{ scale: 1.12, y: -1 }}
                whileTap={{ scale: 0.92 }}
                title="Change theme"
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: `${config.accent}18`,
                  border: `1px solid ${config.accent}35`,
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 16, flexShrink: 0,
                  transition: "background 0.3s ease, border-color 0.3s ease",
                } as React.CSSProperties}
              >
                🎨
              </motion.button>

              <div
                style={{
                  width: 1,
                  height: 22,
                  background: "rgba(255,255,255,0.1)",
                  margin: "0 4px 0 8px",
                }}
              />

              {isSignedIn ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <motion.div
                    whileHover={{ y: -1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  >
                    <Link
                      href="/my-apps"
                      style={{
                        padding: "6px 14px",
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 500,
                        color: "#c0c8d8",
                        textDecoration: "none",
                        display: "block",
                      }}
                    >
                      My Apps
                    </Link>
                  </motion.div>
                  <motion.div
                    whileHover={{ scale: 1.08 }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  >
                    <UserButton />
                  </motion.div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Link href="/sign-in">
                    <motion.button
                      style={{
                        fontSize: 13,
                        padding: "6px 16px",
                        background: "transparent",
                        border: "1px solid rgba(255,255,255,0.18)",
                        borderRadius: 20,
                        color: "#c0c8d8",
                        cursor: "pointer",
                        fontWeight: 500,
                      }}
                      whileHover={{
                        scale: 1.05,
                        borderColor: "rgba(255,255,255,0.4)",
                        color: "#fff",
                      }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 420, damping: 22 }}
                    >
                      Sign In
                    </motion.button>
                  </Link>
                  <Link href="/sign-up">
                    <motion.button
                      className="btn-green"
                      style={{ fontSize: 13, padding: "6px 18px" }}
                      whileHover={{ scale: 1.07, y: -1 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 420, damping: 22 }}
                    >
                      Create Account
                    </motion.button>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* ── Mobile: user button + hamburger ────────────────────────────── */}
          {isMobile && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
              {isSignedIn && (
                <motion.div
                  whileHover={{ scale: 1.08 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                >
                  <UserButton />
                </motion.div>
              )}
              <motion.button
                onClick={() => setMobileOpen(true)}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                aria-label="Open menu"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  width: 38,
                  height: 38,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                {/* 3×3 dot grid icon */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  {[0, 6, 12].map((y) =>
                    [0, 6, 12].map((x) => (
                      <circle key={`${x}-${y}`} cx={x + 2} cy={y + 2} r={1.5} fill="#c0c8d8" />
                    ))
                  )}
                </svg>
              </motion.button>
            </div>
          )}
        </div>
      </motion.nav>

      {/* Mobile drawer */}
      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        isSignedIn={!!isSignedIn}
        isAdmin={isAdmin}
      />
    </>
  );
}
