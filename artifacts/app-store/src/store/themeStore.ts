import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppStoreTheme = "midnight" | "amber" | "violet" | "crimson";

export interface AppThemeConfig {
  name: string;
  tagline: string;
  emoji: string;
  accent: string;
  accentDark: string;
  accentGlow: string;
  bg: string;
  surface: string;
  surface2: string;
  entryAnimation: string;
  palette: string[];
}

export const APP_THEMES: Record<AppStoreTheme, AppThemeConfig> = {
  midnight: {
    name: "Midnight",
    tagline: "Dark & Sharp",
    emoji: "🌙",
    accent: "#00c853",
    accentDark: "#00a040",
    accentGlow: "rgba(0,200,83,0.12)",
    bg: "#060811",
    surface: "#0d1117",
    surface2: "#131920",
    entryAnimation: "awaBounceInLeft",
    palette: ["#00c853","#00e676","#00bcd4","#ffb300","#7c4dff","#ff5252"],
  },
  amber: {
    name: "Amber",
    tagline: "Marketplace Glow",
    emoji: "🌟",
    accent: "#f59e0b",
    accentDark: "#d97706",
    accentGlow: "rgba(245,158,11,0.12)",
    bg: "#0a0700",
    surface: "#130e00",
    surface2: "#1c1500",
    entryAnimation: "awaBounceIn",
    palette: ["#f59e0b","#fde68a","#f97316","#10b981","#60a5fa","#c084fc"],
  },
  violet: {
    name: "Violet",
    tagline: "Creative Space",
    emoji: "🔮",
    accent: "#7c4dff",
    accentDark: "#651fff",
    accentGlow: "rgba(124,77,255,0.12)",
    bg: "#07060f",
    surface: "#0d0b1a",
    surface2: "#130f22",
    entryAnimation: "awaZoomIn",
    palette: ["#7c4dff","#b388ff","#00e5ff","#ff4081","#69f0ae","#ffd740"],
  },
  crimson: {
    name: "Crimson",
    tagline: "Bold & Premium",
    emoji: "💎",
    accent: "#f43f5e",
    accentDark: "#e11d48",
    accentGlow: "rgba(244,63,94,0.12)",
    bg: "#0d0608",
    surface: "#180a0c",
    surface2: "#200d10",
    entryAnimation: "awaFlipInX",
    palette: ["#f43f5e","#fb7185","#f97316","#fbbf24","#34d399","#818cf8"],
  },
};

interface AppThemeStore {
  theme: AppStoreTheme;
  config: AppThemeConfig;
  setTheme: (t: AppStoreTheme) => void;
}

export const useAppThemeStore = create<AppThemeStore>()(
  persist(
    (set) => ({
      theme: "midnight",
      config: APP_THEMES.midnight,
      setTheme: (theme) => set({ theme, config: APP_THEMES[theme] }),
    }),
    { name: "app-store-theme" },
  ),
);
