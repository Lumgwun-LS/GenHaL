import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function Scene2({ currentScene }: { currentScene: number }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1500),
      setTimeout(() => setPhase(2), 3000),
      setTimeout(() => setPhase(3), 4500),
      setTimeout(() => setPhase(4), 6000),
      setTimeout(() => setPhase(5), 8000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const featureCards = [
    { icon: "🤖", title: "AI-Powered",        subtitle: "Upload a ZIP. AI generates the listing." },
    { icon: "✅", title: "Verified Network",   subtitle: "Trusted Developer Program built for scale." },
    { icon: "🚀", title: "One-Click Deploy",   subtitle: "Publish instantly across web and mobile." },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ padding: "32px 64px", gap: 16 }}
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "-50%", opacity: 0, filter: "blur(10px)" }}
      transition={{ duration: 1.5, ease: [0.76, 0, 0.24, 1] }}
    >
      {/* background */}
      <motion.div
        className="absolute inset-0 bg-cover bg-center opacity-20"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/bg-grid.jpg)` }}
        animate={{ scale: [1, 1.15] }}
        transition={{ duration: 20, ease: "linear" }}
      />

      {/* tag */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : -12 }}
        transition={{ duration: 0.7 }}
        style={{
          position: "relative", zIndex: 10,
          padding: "6px 24px",
          background: "rgba(220,38,38,0.15)",
          border: "1px solid rgba(220,38,38,0.4)",
          color: "#ef4444",
          fontWeight: 700,
          borderRadius: 999,
          letterSpacing: "0.15em",
          fontSize: 13,
        }}
      >
        FOR DEVELOPERS
      </motion.div>

      {/* headlines */}
      <div style={{ position: "relative", zIndex: 10, textAlign: "center", lineHeight: 1.15 }}>
        <motion.div
          style={{ fontSize: 40, fontWeight: 900, color: "#fff", fontFamily: "sans-serif" }}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 24 }}
          transition={{ duration: 0.9 }}
        >
          Zero Complexity.
        </motion.div>
        <motion.div
          style={{ fontSize: 40, fontWeight: 900, color: "#f59e0b", fontFamily: "sans-serif" }}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 24 }}
          transition={{ duration: 0.9 }}
        >
          Infinite Scale.
        </motion.div>
      </div>

      {/* description */}
      <motion.p
        style={{
          position: "relative", zIndex: 10,
          fontSize: 16, color: "#9ca3af",
          fontFamily: "serif", textAlign: "center",
          maxWidth: 560, lineHeight: 1.6, margin: 0,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 4 ? 1 : 0 }}
        transition={{ duration: 1.2 }}
      >
        The tools you need to reach millions, built exclusively for African innovators.
        No friction, just pure discovery.
      </motion.p>

      {/* cards — horizontal row */}
      <div style={{ position: "relative", zIndex: 10, display: "flex", gap: 16, width: "100%", maxWidth: 880 }}>
        {featureCards.map((card, i) => (
          <motion.div
            key={i}
            style={{
              flex: 1,
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              padding: "16px 20px",
              position: "relative",
              overflow: "hidden",
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: phase >= 5 ? 1 : 0, y: phase >= 5 ? 0 : 20 }}
            transition={{ duration: 0.7, delay: i * 0.12 }}
          >
            {/* top accent bar */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 3,
              background: "linear-gradient(90deg, #dc2626, #f59e0b)",
            }} />
            <div style={{ fontSize: 28, marginBottom: 8 }}>{card.icon}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 6, fontFamily: "sans-serif" }}>
              {card.title}
            </div>
            <div style={{ fontSize: 13, color: "#9ca3af", fontFamily: "serif", lineHeight: 1.5 }}>
              {card.subtitle}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
