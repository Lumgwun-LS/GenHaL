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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl bg-white dark:bg-gray-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md">
              <Palette className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Dashboard Themes</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pick your personal style — saved automatically</p>
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
            return (
              <button
                key={key}
                onClick={() => { setTheme(key); onClose(); }}
                className={cn(
                  "relative overflow-hidden rounded-2xl text-left transition-all duration-200",
                  "hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]",
                  isActive
                    ? "ring-[2.5px]"
                    : "ring-1 ring-gray-200 dark:ring-gray-700 hover:ring-gray-300",
                )}
                style={isActive ? { boxShadow: `0 8px 32px ${cfg.accentColor}30` } : {}}
              >
                {isActive && (
                  <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: cfg.accentGradient }} />
                )}

                {/* Mini dashboard preview */}
                <div className="flex h-32 overflow-hidden">
                  {/* Mini sidebar */}
                  <div
                    className="flex w-12 shrink-0 flex-col gap-1.5 px-1.5 pt-3"
                    style={{ background: cfg.sidebarGradient, borderRight: `1px solid ${cfg.sidebarBorderColor}` }}
                  >
                    <div className="mx-auto mb-1 h-4 w-4 rounded-md" style={{ background: cfg.accentColor, opacity: 0.9 }} />
                    {cfg.palette.slice(0, 5).map((c, i) => (
                      <div key={i} className="flex items-center gap-1 rounded-md px-1 py-0.5"
                        style={i === 0 ? { background: `${c}22`, borderLeft: `1.5px solid ${c}` } : {}}>
                        <div className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: i === 0 ? c : "rgba(255,255,255,0.15)" }} />
                      </div>
                    ))}
                  </div>
                  {/* Mini content */}
                  <div className="flex-1 space-y-1.5 bg-gray-50 dark:bg-gray-800 p-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      {cfg.palette.slice(0, 4).map((c, i) => (
                        <div key={i} className="flex items-center gap-1 bg-white dark:bg-gray-700 p-1.5 shadow-sm"
                          style={{ borderRadius: `calc(${cfg.cardRadius} / 1.5)` }}>
                          <div className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: `${c}30` }}>
                            <div className="h-2 w-2 m-0.5 rounded-sm" style={{ background: c }} />
                          </div>
                          <div className="h-1 flex-1 rounded-full" style={{ background: c, opacity: 0.5 }} />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-end gap-0.5 bg-white dark:bg-gray-700 shadow-sm"
                      style={{ borderRadius: `calc(${cfg.cardRadius} / 1.5)`, padding: "5px", height: 30 }}>
                      {[45, 75, 50, 90, 60, 80].map((h, i) => (
                        <div key={i} className="flex-1 rounded-sm"
                          style={{ height: `${h}%`, background: cfg.palette[i % cfg.palette.length], opacity: 0.7 }} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Label */}
                <div className="flex items-center gap-2.5 bg-white dark:bg-gray-900 px-3.5 py-3"
                  style={isActive ? { background: `${cfg.accentColor}0A` } : {}}>
                  <span className="text-xl leading-none">{cfg.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{cfg.name}</p>
                    <p className="truncate text-[11px] text-gray-500">{cfg.tagline}</p>
                  </div>
                  {isActive
                    ? <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: cfg.accentColor }}>
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    : <div className="h-5 w-5 shrink-0 rounded-full border-2 border-gray-200 dark:border-gray-600" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-5 pb-5 text-center text-xs text-gray-400">
          🎨 Changes apply instantly to your sidebar, cards, and entry animations
        </div>
      </div>
    </div>
  );
}
