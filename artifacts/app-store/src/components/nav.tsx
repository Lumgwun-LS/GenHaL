import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, useScroll, useTransform } from "framer-motion";
import { useUser, SignInButton, SignUpButton, UserButton } from "@clerk/react";

export default function Nav() {
  const { isSignedIn } = useUser();
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <motion.nav
      animate={{
        backgroundColor: scrolled ? "rgba(6,8,17,0.88)" : "#070a12",
        backdropFilter: scrolled ? "blur(22px) saturate(180%)" : "blur(0px)",
        boxShadow: scrolled ? "0 1px 0 rgba(0,200,83,0.12), 0 4px 24px rgba(0,0,0,0.4)" : "none",
      }}
      transition={{ duration: 0.35 }}
      style={{ position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 20px", height: 62, display: "flex", alignItems: "center", gap: 20 }}>

        {/* Logo */}
        <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} transition={{ type: "spring", stiffness: 400, damping: 22 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, textDecoration: "none" }}>
            <div style={{ background: "#fff", borderRadius: 8, padding: "3px 8px", display: "flex", alignItems: "center" }}>
              <img
                src="/app-store/logo-color.jpg"
                alt="Awajimaa"
                style={{ height: 28, width: "auto", display: "block", objectFit: "contain" }}
              />
            </div>
            <div style={{ fontWeight: 700, fontSize: 10, color: "#00c853", letterSpacing: 1, textTransform: "uppercase" }}>APP STORE</div>
          </Link>
        </motion.div>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 500 }}>
          <motion.div
            animate={{ scale: searchFocused ? 1.02 : 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            style={{ position: "relative" }}
          >
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 14, opacity: searchFocused ? 0.7 : 0.35, transition: "opacity 0.2s" }}>🔍</span>
            <motion.input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search apps, categories, developers..."
              animate={{
                borderColor: searchFocused ? "rgba(0,200,83,0.5)" : "rgba(255,255,255,0.08)",
                boxShadow: searchFocused ? "0 0 0 3px rgba(0,200,83,0.08)" : "none",
              }}
              transition={{ duration: 0.2 }}
              style={{
                width: "100%", background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 24, padding: "8px 16px 8px 38px",
                fontSize: 14, color: "#e8eaf0", outline: "none",
              }}
            />
          </motion.div>
        </form>

        {/* Desktop links */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {[
            { href: "/", label: "Browse" },
            { href: "/developer", label: "Publish" },
          ].map(({ href, label }) => (
            <motion.div key={label} whileHover={{ y: -1 }} transition={{ type: "spring", stiffness: 400, damping: 22 }}>
              <Link
                href={href}
                style={{ padding: "6px 12px", borderRadius: 8, fontSize: 14, fontWeight: 500, color: "#c0c8d8", textDecoration: "none", display: "block" }}
              >{label}</Link>
            </motion.div>
          ))}

          <div style={{ width: 1, height: 22, background: "rgba(255,255,255,0.1)", margin: "0 10px" }} />

          {/* Cross-app link to Awa Biz Suite */}
          <motion.a
            href="/vendor-hub/?ref=app-store"
            whileHover={{ scale: 1.05, y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 24 }}
            title="Switch to Awa Biz Suite"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "linear-gradient(135deg, rgba(124,58,237,0.18), rgba(168,85,247,0.1))",
              border: "1px solid rgba(124,58,237,0.35)",
              borderRadius: 20, padding: "5px 13px",
              color: "#c4b5fd", fontSize: 13, fontWeight: 600,
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: 14 }}>🏢</span>
            <span>Biz Suite</span>
            <motion.span
              animate={{ x: [0, 2, 0] }}
              transition={{ repeat: Infinity, repeatDelay: 3, duration: 0.4, ease: "easeInOut" }}
              style={{ fontSize: 10, opacity: 0.7 }}
            >↗</motion.span>
          </motion.a>

          <div style={{ width: 1, height: 22, background: "rgba(255,255,255,0.1)", margin: "0 10px" }} />

          {isSignedIn ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <motion.div whileHover={{ y: -1 }} transition={{ type: "spring", stiffness: 400, damping: 22 }}>
                <Link
                  href="/my-apps"
                  style={{ padding: "6px 14px", borderRadius: 8, fontSize: 14, fontWeight: 500, color: "#c0c8d8", textDecoration: "none", display: "block" }}
                >My Apps</Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.08 }} transition={{ type: "spring", stiffness: 400, damping: 22 }}>
                <UserButton />
              </motion.div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <SignInButton mode="modal">
                <motion.button
                  style={{
                    fontSize: 13, padding: "6px 16px",
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 20, color: "#c0c8d8",
                    cursor: "pointer", fontWeight: 500,
                  }}
                  whileHover={{ scale: 1.05, borderColor: "rgba(255,255,255,0.4)", color: "#fff" }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 420, damping: 22 }}
                >Sign In</motion.button>
              </SignInButton>
              <SignUpButton mode="modal">
                <motion.button
                  className="btn-green"
                  style={{ fontSize: 13, padding: "6px 18px" }}
                  whileHover={{ scale: 1.07, y: -1 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 420, damping: 22 }}
                >Create Account</motion.button>
              </SignUpButton>
            </div>
          )}
        </div>
      </div>
    </motion.nav>
  );
}
