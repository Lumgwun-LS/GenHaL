import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DashboardTheme = "nnenna" | "savanna" | "kpokpo" | "oba";
export type SidebarVariant = "ember" | "golden" | "grove" | "royal";

export interface ThemeConfig {
  name: string;
  tagline: string;
  emoji: string;
  layoutLabel: string;
  layoutDescription: string;
  sidebarVariant: SidebarVariant;
  sidebarClass: string;
  sidebarGradient: string;
  sidebarBorderColor: string;
  accentColor: string;
  accentGradient: string;
  cardRadius: string;
  entryAnimation: string;
  palette: string[];
}

export const THEMES: Record<DashboardTheme, ThemeConfig> = {
  nnenna: {
    name: "Nnenna",
    tagline: "Ancestral Fire",
    emoji: "🔥",
    layoutLabel: "Ember",
    layoutDescription: "Warm amber borders · Glow effects · Ancestral warmth",
    sidebarVariant: "ember",
    sidebarClass: "theme-nnenna",
    sidebarGradient: "linear-gradient(170deg,#140600 0%,#200A00 55%,#2C1000 100%)",
    sidebarBorderColor: "rgba(217,119,6,0.25)",
    accentColor: "#D97706",
    accentGradient: "linear-gradient(135deg,#D97706 0%,#F59E0B 100%)",
    cardRadius: "12px",
    entryAnimation: "awaBounceInLeft",
    palette: ["#D97706","#F59E0B","#EF4444","#10B981","#60A5FA","#C084FC"],
  },
  savanna: {
    name: "Savanna",
    tagline: "The Golden Plains",
    emoji: "🌅",
    layoutLabel: "Golden",
    layoutDescription: "Golden fills · Generous spacing · Sunrise warmth",
    sidebarVariant: "golden",
    sidebarClass: "theme-savanna",
    sidebarGradient: "linear-gradient(170deg,#1A1000 0%,#2D1E00 55%,#3D2900 100%)",
    sidebarBorderColor: "rgba(245,158,11,0.22)",
    accentColor: "#F59E0B",
    accentGradient: "linear-gradient(135deg,#F59E0B 0%,#FDE68A 100%)",
    cardRadius: "20px",
    entryAnimation: "awaBounceIn",
    palette: ["#F59E0B","#FDE68A","#D97706","#10B981","#60A5FA","#F87171"],
  },
  kpokpo: {
    name: "Kpokpo",
    tagline: "The Sacred Grove",
    emoji: "🌿",
    layoutLabel: "Grove",
    layoutDescription: "Frosted glass · Pill shapes · Forest spirit glow",
    sidebarVariant: "grove",
    sidebarClass: "theme-kpokpo",
    sidebarGradient: "linear-gradient(170deg,#011408 0%,#022510 55%,#033318 100%)",
    sidebarBorderColor: "rgba(16,185,129,0.22)",
    accentColor: "#10B981",
    accentGradient: "linear-gradient(135deg,#10B981 0%,#34D399 100%)",
    cardRadius: "16px",
    entryAnimation: "awaZoomIn",
    palette: ["#10B981","#34D399","#06B6D4","#FBBF24","#818CF8","#F97316"],
  },
  oba: {
    name: "Oba",
    tagline: "The Royal Court",
    emoji: "👑",
    layoutLabel: "Royal",
    layoutDescription: "Uppercase elegance · Gold crown · Ancestral luxury",
    sidebarVariant: "royal",
    sidebarClass: "theme-oba",
    sidebarGradient: "linear-gradient(170deg,#0E0720 0%,#1A0D38 55%,#220E48 100%)",
    sidebarBorderColor: "rgba(168,85,247,0.22)",
    accentColor: "#A855F7",
    accentGradient: "linear-gradient(135deg,#A855F7 0%,#FBBF24 100%)",
    cardRadius: "8px",
    entryAnimation: "awaFlipInX",
    palette: ["#A855F7","#FBBF24","#F87171","#60A5FA","#34D399","#FB923C"],
  },
};

interface ThemeStore {
  theme: DashboardTheme;
  config: ThemeConfig;
  setTheme: (t: DashboardTheme) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "nnenna",
      config: THEMES.nnenna,
      setTheme: (theme) => set({ theme, config: THEMES[theme] }),
    }),
    { name: "genhal-theme" },
  ),
);
