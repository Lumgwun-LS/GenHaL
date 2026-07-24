import { useState, useEffect, useRef } from "react";
import { ArrowLeft, X } from "lucide-react";

/**
 * Shown when the user arrives from the Awajimaa App Store (?ref=app-store).
 * Slides in from the top using a CSS spring-like transition.
 * Dismissed state is kept in sessionStorage so it does not re-appear on
 * in-app navigation within the same session.
 */
export function CrossAppBanner() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    const dismissed = sessionStorage.getItem("vh_cross_banner_dismissed") === "1";
    if (ref === "app-store" && !dismissed) {
      setVisible(true);
      // Let the element render first, then trigger the transition
      raf.current = requestAnimationFrame(() => {
        raf.current = requestAnimationFrame(() => setMounted(true));
      });
    }
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  function dismiss() {
    setMounted(false);
    sessionStorage.setItem("vh_cross_banner_dismissed", "1");
    setTimeout(() => setVisible(false), 400);
  }

  if (!visible) return null;

  return (
    <div
      style={{
        overflow: "hidden",
        maxHeight: mounted ? 52 : 0,
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(-100%)",
        transition: [
          "max-height 0.45s cubic-bezier(0.34,1.46,0.64,1)",
          "opacity 0.3s ease",
          "transform 0.45s cubic-bezier(0.34,1.46,0.64,1)",
        ].join(", "),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 20px",
          height: 52,
          background: "linear-gradient(90deg, #4c1d95f5 0%, #6d28d9f5 55%, #7c3aedee 100%)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(167,139,250,0.2)",
          color: "#ede9fe",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {/* Animated arrow pulse */}
        <a
          href="/app-store/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            color: "#ede9fe",
            textDecoration: "none",
            fontWeight: 700,
            fontSize: 13,
            flexShrink: 0,
            transition: "opacity 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          <ArrowLeft
            style={{
              width: 16, height: 16,
              animation: "banner-arrow-pulse 2.5s ease-in-out infinite",
            }}
          />
          App Store
        </a>

        <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.2)", flexShrink: 0 }} />

        <span style={{ color: "rgba(237,233,254,0.6)", fontWeight: 400, fontSize: 12 }}>
          You came from the App Store — your session is active across both platforms
        </span>

        <button
          onClick={dismiss}
          style={{
            marginLeft: "auto",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: "50%",
            width: 26, height: 26,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.65)",
            cursor: "pointer",
            flexShrink: 0,
            transition: "background 0.2s, transform 0.2s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "rgba(255,255,255,0.16)";
            e.currentTarget.style.transform = "rotate(90deg) scale(1.1)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
            e.currentTarget.style.transform = "none";
          }}
        >
          <X style={{ width: 13, height: 13 }} />
        </button>
      </div>

      {/* Keyframe for the arrow pulse */}
      <style>{`
        @keyframes banner-arrow-pulse {
          0%, 100% { transform: translateX(0); }
          40%       { transform: translateX(-4px); }
          60%       { transform: translateX(-2px); }
        }
      `}</style>
    </div>
  );
}
