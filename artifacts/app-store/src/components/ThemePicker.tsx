import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppStoreTheme, APP_THEMES, useAppThemeStore } from "../store/themeStore";

interface ThemePickerProps {
  open: boolean;
  onClose: () => void;
}

export function ThemePicker({ open, onClose }: ThemePickerProps) {
  const { theme, setTheme } = useAppThemeStore();

  return (
    <AnimatePresence>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 16 }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
          />

          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 560,
              borderRadius: 24,
              background: "#0d1117",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 22px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 14,
                  background: "linear-gradient(135deg,#00c853,#7c4dff)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                }}>🎨</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#e8eaf0" }}>App Store Themes</div>
                  <div style={{ fontSize: 11, color: "#8892a4", marginTop: 1 }}>4 colour modes — saved automatically</div>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{ background: "none", border: "none", color: "#8892a4", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "4px 6px", borderRadius: 8 }}
              >✕</button>
            </div>

            {/* Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 16 }}>
              {(Object.entries(APP_THEMES) as [AppStoreTheme, typeof APP_THEMES[AppStoreTheme]][]).map(([key, cfg]) => {
                const isActive = theme === key;
                return (
                  <motion.button
                    key={key}
                    onClick={() => { setTheme(key); onClose(); }}
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                    style={{
                      position: "relative", overflow: "hidden",
                      borderRadius: 16, border: "none", cursor: "pointer", textAlign: "left",
                      padding: 0,
                      background: cfg.surface,
                      boxShadow: isActive
                        ? `0 0 0 2px ${cfg.accent}, 0 8px 24px ${cfg.accent}30`
                        : "0 0 0 1px rgba(255,255,255,0.08)",
                    }}
                  >
                    {isActive && (
                      <div style={{
                        position: "absolute", top: 0, left: 0, right: 0, height: 2,
                        background: `linear-gradient(90deg, ${cfg.accent}, ${cfg.palette[1]})`,
                      }} />
                    )}

                    {/* Preview bar */}
                    <div style={{
                      padding: "14px 14px 10px",
                      background: cfg.bg,
                      display: "flex", gap: 8, alignItems: "center",
                    }}>
                      {/* Mini nav */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 28 }}>
                        {cfg.palette.slice(0, 4).map((c, i) => (
                          <div key={i} style={{
                            height: 5, borderRadius: 3,
                            background: i === 0 ? c : "rgba(255,255,255,0.08)",
                            width: i === 0 ? "100%" : "70%",
                          }} />
                        ))}
                      </div>
                      {/* Mini cards */}
                      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                        {cfg.palette.slice(0, 4).map((c, i) => (
                          <div key={i} style={{
                            height: 22, borderRadius: 6,
                            background: `${c}18`,
                            border: `1px solid ${c}30`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: c, opacity: 0.8 }} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Label */}
                    <div style={{ padding: "10px 14px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 16 }}>{cfg.emoji}</span>
                          <span style={{ fontWeight: 700, fontSize: 13, color: "#e8eaf0" }}>{cfg.name}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "#8892a4", marginTop: 2 }}>{cfg.tagline}</div>
                      </div>
                      {isActive ? (
                        <div style={{
                          width: 20, height: 20, borderRadius: "50%",
                          background: cfg.accent, display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, color: "#000", fontWeight: 900,
                        }}>✓</div>
                      ) : (
                        <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.15)" }} />
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <div style={{ textAlign: "center", padding: "0 16px 16px", fontSize: 11, color: "#8892a4" }}>
              🎨 Pick a colour mode — it updates the whole store instantly
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
