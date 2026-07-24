import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Shown when the user arrives from Awa Biz Suite (?ref=vendor-hub).
 * A single dismissible bar at the very top of the page, animated with
 * a spring slide-in.  Dismissed state is kept in sessionStorage so it
 * does not re-appear on in-app navigation.
 */
export function CrossAppBanner() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    const dismissed = sessionStorage.getItem("as_cross_banner_dismissed") === "1";
    if (ref === "vendor-hub" && !dismissed) setVisible(true);
  }, []);

  function dismiss() {
    setLeaving(true);
    sessionStorage.setItem("as_cross_banner_dismissed", "1");
  }

  if (!visible) return null;

  return (
    <AnimatePresence onExitComplete={() => setVisible(false)}>
      {!leaving && (
        <motion.div
          key="cross-banner"
          initial={{ y: -56, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -56, opacity: 0 }}
          transition={{ type: "spring", stiffness: 360, damping: 28, mass: 0.8 }}
          style={{
            position: "sticky",
            top: 0,
            zIndex: 200,
            background: "linear-gradient(90deg, #4c1d95ee 0%, #6d28d9ee 50%, #7c3aeded 100%)",
            backdropFilter: "blur(18px) saturate(160%)",
            WebkitBackdropFilter: "blur(18px) saturate(160%)",
            borderBottom: "1px solid rgba(167,139,250,0.22)",
          }}
        >
          <div style={{
            maxWidth: 1280, margin: "0 auto",
            padding: "0 20px", height: 44,
            display: "flex", alignItems: "center", gap: 16,
          }}>

            {/* Back link */}
            <motion.a
              href="/vendor-hub/"
              whileHover={{ x: -4 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 420, damping: 24 }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                color: "#ede9fe", textDecoration: "none",
                fontSize: 13, fontWeight: 700, letterSpacing: 0.2,
                flexShrink: 0,
              }}
            >
              <motion.span
                animate={{ x: [0, -3, 0] }}
                transition={{ repeat: Infinity, repeatDelay: 2.5, duration: 0.5, ease: "easeInOut" }}
                style={{ fontSize: 16, lineHeight: 1 }}
              >←</motion.span>
              <span>Awa Biz Suite</span>
            </motion.a>

            <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.18)", flexShrink: 0 }} />

            <span style={{ color: "rgba(237,233,254,0.65)", fontSize: 12, fontWeight: 400 }}>
              You came from Awa Biz Suite — your session is active across both platforms
            </span>

            {/* Dismiss */}
            <motion.button
              onClick={dismiss}
              whileHover={{ scale: 1.15, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              style={{
                marginLeft: "auto",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "50%",
                width: 26, height: 26,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "rgba(255,255,255,0.6)",
                cursor: "pointer", fontSize: 14, lineHeight: 1,
                flexShrink: 0,
              }}
            >×</motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
