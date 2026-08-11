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

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white dark:bg-gray-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg">
              <Palette className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Dashboard Themes</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">4 complete layouts — saved automatically</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Theme grid */}
        <div className="grid grid-cols-2 gap-4 p-5">
          {(Object.entries(THEMES) as [DashboardTheme, (typeof THEMES)[DashboardTheme]][]).map(([key, cfg]) => {
            const isActive = theme === key;

            /* Mini sidebar preview — different per variant */
            const miniSidebarBg = cfg.sidebarVariant === "glass"
              ? "rgba(1,20,8,0.85)"
              : cfg.sidebarGradient;

            return (
              <button
                key={key}
                onClick={() => { setTheme(key); onClose(); }}
                className={cn(
                  "relative overflow-hidden text-left transition-all duration-200",
                  cfg.sidebarVariant === "glass" ? "rounded-3xl" :
                  cfg.sidebarVariant === "harvest" ? "rounded-3xl" :
                  cfg.sidebarVariant === "royal" ? "rounded-lg" : "rounded-2xl",
                  "hover:scale-[1.025] hover:shadow-2xl active:scale-[0.975]",
                  isActive ? "ring-[2.5px]" : "ring-1 ring-gray-200 dark:ring-gray-700",
                )}
                style={isActive ? {
                  ["--tw-ring-color" as string]: cfg.accentColor,
                  boxShadow: `0 8px 32px ${cfg.accentColor}35`,
                } : {}}
              >
                {isActive && (
                  <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: cfg.accentGradient }} />
                )}

                {/* Mini dashboard preview */}
                <div className="flex h-36 overflow-hidden">
                  {/* Mini sidebar */}
                  <div
                    className="flex w-14 shrink-0 flex-col gap-1.5 px-1.5 pt-3"
                    style={{
                      background: miniSidebarBg,
                      borderRight: `1px solid ${cfg.sidebarBorderColor}`,
                      backdropFilter: cfg.sidebarVariant === "glass" ? "blur(8px)" : undefined,
                    }}
                  >
                    {/* Logo area */}
                    <div className="flex items-center gap-1 mb-1.5 px-0.5">
                      <div className="w-4 h-4 rounded" style={{ background: cfg.accentColor, opacity: 0.9 }} />
                      {cfg.sidebarVariant !== "royal" && (
                        <div className="h-1.5 flex-1 rounded-full bg-white/15" />
                      )}
                    </div>

                    {/* Nav items preview */}
                    {cfg.palette.slice(0, 5).map((c, i) => {
                      const isActiveItem = i === 0;
                      if (cfg.sidebarVariant === "electric") {
                        return (
                          <div key={i} className="flex items-center gap-1 px-1 py-0.5"
                            style={isActiveItem ? {
                              borderLeft: `2px solid ${c}`,
                              background: `${c}12`,
                            } : { borderLeft: "2px solid transparent" }}>
                            <div className="h-1.5 w-1.5 rounded-full" style={{ background: isActiveItem ? c : "rgba(255,255,255,0.12)" }} />
                            <div className="h-1 flex-1 rounded-full" style={{ background: isActiveItem ? `${c}60` : "rgba(255,255,255,0.08)" }} />
                          </div>
                        );
                      }
                      if (cfg.sidebarVariant === "harvest") {
                        return (
                          <div key={i} className="flex items-center gap-1 rounded-lg px-1 py-0.5"
                            style={isActiveItem ? {
                              background: `${c}22`,
                              border: `1px solid ${c}30`,
                            } : {}}>
                            <div className="h-1.5 w-1.5 rounded-sm" style={{ background: isActiveItem ? c : "rgba(255,255,255,0.12)" }} />
                            <div className="h-1 flex-1 rounded" style={{ background: isActiveItem ? `${c}50` : "rgba(255,255,255,0.08)" }} />
                          </div>
                        );
                      }
                      if (cfg.sidebarVariant === "glass") {
                        return (
                          <div key={i} className="flex items-center gap-1 rounded-full px-1 py-0.5"
                            style={isActiveItem ? {
                              background: `${c}28`,
                              border: `1px solid ${c}40`,
                            } : {}}>
                            <div className="h-1.5 w-1.5 rounded-full" style={{ background: isActiveItem ? c : "rgba(255,255,255,0.12)" }} />
                            <div className="h-1 flex-1 rounded-full" style={{ background: isActiveItem ? `${c}50` : "rgba(255,255,255,0.08)" }} />
                          </div>
                        );
                      }
                      // royal
                      return (
                        <div key={i} className="flex items-center gap-1 px-1 py-0.5">
                          <div className="h-1.5 w-1.5" style={{ background: isActiveItem ? "#FBBF24" : "rgba(255,255,255,0.1)", borderRadius: 1 }} />
                          <div className="h-0.5 flex-1" style={{ background: isActiveItem ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.06)" }} />
                          {isActiveItem && <span style={{ fontSize: 4, color: "#FBBF24" }}>✦</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Mini content area */}
                  <div className="flex-1 space-y-1.5 bg-gray-50 dark:bg-gray-800 p-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      {cfg.palette.slice(0, 4).map((c, i) => (
                        <div key={i} className="flex items-center gap-1 bg-white dark:bg-gray-700 p-1.5 shadow-sm"
                          style={{ borderRadius: `calc(${cfg.cardRadius} / 1.5)` }}>
                          <div className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: `${c}25` }}>
                            <div className="h-2 w-2 m-0.5 rounded-sm" style={{ background: c }} />
                          </div>
                          <div className="h-1 flex-1 rounded-full" style={{ background: c, opacity: 0.45 }} />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-end gap-0.5 bg-white dark:bg-gray-700 shadow-sm"
                      style={{ borderRadius: `calc(${cfg.cardRadius} / 1.5)`, padding: "5px", height: 30 }}>
                      {[40, 70, 50, 90, 55, 80, 45].map((h, i) => (
                        <div key={i} className="flex-1 rounded-sm"
                          style={{ height: `${h}%`, background: cfg.palette[i % cfg.palette.length], opacity: 0.65 }} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Label & layout badge */}
                <div
                  className="flex items-center gap-2.5 px-3.5 py-3"
                  style={{
                    background: isActive
                      ? cfg.sidebarVariant === "royal"
                        ? "linear-gradient(135deg, rgba(168,85,247,0.08), rgba(251,191,36,0.05))"
                        : `${cfg.accentColor}08`
                      : "white",
                  }}
                >
                  <span className="text-xl leading-none">{cfg.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "truncate text-sm font-bold text-gray-900 dark:text-white",
                      cfg.sidebarVariant === "royal" && "uppercase tracking-wider text-xs"
                    )}>
                      {cfg.name}
                    </p>
                    <p className="truncate text-[10px] text-gray-500">{cfg.tagline}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {isActive ? (
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                        style={{ background: cfg.accentColor }}>
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    ) : (
                      <div className="h-5 w-5 shrink-0 rounded-full border-2 border-gray-200 dark:border-gray-600" />
                    )}
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide"
                      style={{
                        background: `${cfg.accentColor}18`,
                        color: cfg.accentColor,
                        border: `1px solid ${cfg.accentColor}30`,
                      }}
                    >
                      {cfg.layoutLabel}
                    </span>
                  </div>
                </div>

                {/* Layout description */}
                <div
                  className="px-3.5 pb-3 text-[10px] text-gray-400 dark:text-gray-500"
                  style={{ background: isActive ? `${cfg.accentColor}05` : "white" }}
                >
                  {cfg.layoutDescription}
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-5 pb-5 text-center text-xs text-gray-400 dark:text-gray-500">
          🎨 Every theme has a completely different layout, animations, and style — try them all
        </div>
      </div>
    </div>
  );
}
