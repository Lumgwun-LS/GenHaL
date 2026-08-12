import React from "react";
import { Check, X, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardTheme, THEMES, useThemeStore } from "@/store/themeStore";

interface ThemePickerProps {
  open: boolean;
  onClose: () => void;
}

export function ThemePicker({ open, onClose }: ThemePickerProps) {
  const { theme, setTheme } = useThemeStore();
  if (!open) return null;

  const entries = Object.entries(THEMES) as [DashboardTheme, (typeof THEMES)[DashboardTheme]][];

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl overflow-hidden shadow-2xl"
        style={{ borderRadius: 28, background: "hsl(222 47% 7%)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl shadow-lg"
              style={{ background: "linear-gradient(135deg,#D97706,#A855F7)" }}>
              <Palette className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Dashboard Themes</h2>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                5 heritage layouts — saved automatically
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 transition-colors"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Theme grid — first 4 in 2×2, 5th spans full width */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {entries.slice(0, 4).map(([key, cfg]) => (
              <ThemeCard
                key={key}
                themeKey={key}
                cfg={cfg}
                isActive={theme === key}
                onSelect={() => { setTheme(key); onClose(); }}
              />
            ))}
          </div>
          {entries.length > 4 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {entries.slice(4).map(([key, cfg]) => (
                <ThemeCard
                  key={key}
                  themeKey={key}
                  cfg={cfg}
                  isActive={theme === key}
                  onSelect={() => { setTheme(key); onClose(); }}
                  wide
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 text-center text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          🎨 Every theme has a completely different layout, animations &amp; style — try them all
        </div>
      </div>
    </div>
  );
}

// ─── Extracted card so both grids share the same markup ──────────────────────

function ThemeCard({
  themeKey, cfg, isActive, onSelect, wide = false,
}: {
  themeKey: DashboardTheme;
  cfg: (typeof THEMES)[DashboardTheme];
  isActive: boolean;
  onSelect: () => void;
  wide?: boolean;
}) {
  const miniSidebarBg = cfg.sidebarVariant === "glass"
    ? "rgba(1,20,8,0.85)"
    : cfg.sidebarGradient;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative overflow-hidden text-left transition-all duration-200",
        cfg.sidebarVariant === "glass"   ? "rounded-3xl" :
        cfg.sidebarVariant === "harvest" ? "rounded-3xl" :
        cfg.sidebarVariant === "royal"   ? "rounded-lg"  :
        cfg.sidebarVariant === "ember"   ? "rounded-2xl" : "rounded-2xl",
        "hover:scale-[1.025] hover:shadow-2xl active:scale-[0.975]",
        wide && "w-full",
      )}
      style={isActive ? {
        boxShadow: `0 0 0 2.5px ${cfg.accentColor}, 0 8px 32px ${cfg.accentColor}35`,
      } : {
        boxShadow: "0 0 0 1px rgba(255,255,255,0.1)",
      }}
    >
      {isActive && (
        <div className="absolute inset-x-0 top-0 h-[2px]"
          style={{ background: cfg.accentGradient }} />
      )}

      {/* Mini dashboard preview */}
      <div className={cn("flex overflow-hidden", wide ? "h-28" : "h-36")}>
        {/* Mini sidebar */}
        <div
          className="flex w-14 shrink-0 flex-col gap-1.5 px-1.5 pt-3"
          style={{
            background: miniSidebarBg,
            borderRight: `1px solid ${cfg.sidebarBorderColor}`,
            backdropFilter: cfg.sidebarVariant === "glass" ? "blur(8px)" : undefined,
          }}
        >
          <div className="flex items-center gap-1 mb-1.5 px-0.5">
            <div className="w-4 h-4 rounded" style={{ background: cfg.accentColor, opacity: 0.9 }} />
            {cfg.sidebarVariant !== "royal" && (
              <div className="h-1.5 flex-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
            )}
          </div>
          {cfg.palette.slice(0, 5).map((c, i) => {
            const isActiveItem = i === 0;
            if (cfg.sidebarVariant === "electric") return (
              <div key={i} className="flex items-center gap-1 px-1 py-0.5"
                style={isActiveItem ? { borderLeft: `2px solid ${c}`, background: `${c}12` }
                  : { borderLeft: "2px solid transparent" }}>
                <div className="h-1.5 w-1.5 rounded-full"
                  style={{ background: isActiveItem ? c : "rgba(255,255,255,0.12)" }} />
                <div className="h-1 flex-1 rounded-full"
                  style={{ background: isActiveItem ? `${c}60` : "rgba(255,255,255,0.08)" }} />
              </div>
            );
            if (cfg.sidebarVariant === "ember") return (
              <div key={i} className="flex items-center gap-1 px-1 py-0.5"
                style={isActiveItem
                  ? { borderLeft: `2px solid ${c}`, background: `${c}16` }
                  : { borderLeft: "2px solid transparent" }}>
                <div className="h-1.5 w-1.5 rounded-sm"
                  style={{ background: isActiveItem ? c : "rgba(255,255,255,0.12)" }} />
                <div className="h-1 flex-1 rounded"
                  style={{ background: isActiveItem ? `${c}55` : "rgba(255,255,255,0.08)" }} />
                {isActiveItem && (
                  <div className="h-1 w-1 rounded-full shrink-0"
                    style={{ background: cfg.palette[1], opacity: 0.8 }} />
                )}
              </div>
            );
            if (cfg.sidebarVariant === "harvest") return (
              <div key={i} className="flex items-center gap-1 rounded-lg px-1 py-0.5"
                style={isActiveItem ? { background: `${c}22`, border: `1px solid ${c}30` } : {}}>
                <div className="h-1.5 w-1.5 rounded-sm"
                  style={{ background: isActiveItem ? c : "rgba(255,255,255,0.12)" }} />
                <div className="h-1 flex-1 rounded"
                  style={{ background: isActiveItem ? `${c}50` : "rgba(255,255,255,0.08)" }} />
              </div>
            );
            if (cfg.sidebarVariant === "glass") return (
              <div key={i} className="flex items-center gap-1 rounded-full px-1 py-0.5"
                style={isActiveItem ? { background: `${c}28`, border: `1px solid ${c}40` } : {}}>
                <div className="h-1.5 w-1.5 rounded-full"
                  style={{ background: isActiveItem ? c : "rgba(255,255,255,0.12)" }} />
                <div className="h-1 flex-1 rounded-full"
                  style={{ background: isActiveItem ? `${c}50` : "rgba(255,255,255,0.08)" }} />
              </div>
            );
            // royal
            return (
              <div key={i} className="flex items-center gap-1 px-1 py-0.5">
                <div className="h-1.5 w-1.5"
                  style={{ background: isActiveItem ? "#FBBF24" : "rgba(255,255,255,0.1)", borderRadius: 1 }} />
                <div className="h-0.5 flex-1"
                  style={{ background: isActiveItem ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.06)" }} />
                {isActiveItem && <span style={{ fontSize: 4, color: "#FBBF24" }}>✦</span>}
              </div>
            );
          })}
        </div>

        {/* Mini content */}
        <div className="flex-1 space-y-1.5 p-2"
          style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className={cn("grid gap-1.5", wide ? "grid-cols-4" : "grid-cols-2")}>
            {cfg.palette.slice(0, wide ? 4 : 4).map((c, i) => (
              <div key={i} className="flex items-center gap-1 p-1.5 shadow-sm"
                style={{ borderRadius: `calc(${cfg.cardRadius} / 1.5)`, background: "rgba(255,255,255,0.06)" }}>
                <div className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: `${c}25` }}>
                  <div className="h-2 w-2 m-0.5 rounded-sm" style={{ background: c }} />
                </div>
                {!wide && <div className="h-1 flex-1 rounded-full" style={{ background: c, opacity: 0.45 }} />}
              </div>
            ))}
          </div>
          <div className="flex items-end gap-0.5 shadow-sm"
            style={{ borderRadius: `calc(${cfg.cardRadius} / 1.5)`, padding: "5px", height: 30, background: "rgba(255,255,255,0.06)" }}>
            {[40, 70, 50, 90, 55, 80, 45].map((h, i) => (
              <div key={i} className="flex-1 rounded-sm"
                style={{ height: `${h}%`, background: cfg.palette[i % cfg.palette.length], opacity: 0.65 }} />
            ))}
          </div>
        </div>
      </div>

      {/* Label row */}
      <div className="px-3.5 pt-3 pb-2"
        style={{ background: isActive ? `${cfg.accentColor}12` : "rgba(255,255,255,0.04)" }}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-base leading-none shrink-0">{cfg.emoji}</span>
            <p className={cn(
              "text-sm font-bold text-white leading-tight",
              cfg.sidebarVariant === "royal" && "uppercase tracking-wide text-xs"
            )}>
              {cfg.name}
            </p>
          </div>
          {isActive ? (
            <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
              style={{ background: cfg.accentColor }}>
              <Check className="h-2.5 w-2.5 text-white" />
            </div>
          ) : (
            <div className="h-4 w-4 shrink-0 rounded-full"
              style={{ border: "1.5px solid rgba(255,255,255,0.2)" }} />
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[9px] truncate" style={{ color: "rgba(255,255,255,0.38)" }}>
            {cfg.tagline}
          </p>
          <span className="shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
            style={{
              background: `${cfg.accentColor}18`,
              color: cfg.accentColor,
              border: `1px solid ${cfg.accentColor}30`,
            }}>
            {cfg.layoutLabel}
          </span>
        </div>
        <p className="mt-1.5 text-[9px] leading-relaxed"
          style={{ color: "rgba(255,255,255,0.3)" }}>
          {cfg.layoutDescription}
        </p>
      </div>
    </button>
  );
}
