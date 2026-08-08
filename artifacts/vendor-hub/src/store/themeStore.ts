import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DashboardTheme = "unyeada" | "ekede" | "okoroete" | "otuo";
export type SidebarVariant = "electric" | "harvest" | "glass" | "royal";

export interface ThemeConfig {
  name: string;
  tagline: string;
  emoji: string;
  layoutLabel: string;
  layoutDescription: string;
  sidebarVariant: SidebarVariant;
  /** CSS class added to <aside> override block */
  sidebarClass: string;
  /** Inline-style gradient for sidebar (dark vendor palette) */
  sidebarGradient: string;
  sidebarBorderColor: string;
  accentColor: string;
  accentGradient: string;
  /** Card border-radius override */
  cardRadius: string;
  /** CSS keyframe name for card entrance animations */
  entryAnimation: string;
  palette: string[];
}

export const THEMES: Record<DashboardTheme, ThemeConfig> = {
  unyeada: {
    name: "Unyeada",
    tagline: "Bold & Powerful",
    emoji: "⚡",
    layoutLabel: "Electric",
    layoutDescription: "Neon borders · Glow effects · Sharp precision",
    sidebarVariant: "electric",
    sidebarClass: "theme-unyeada",
    sidebarGradient: "linear-gradient(170deg,#070B18 0%,#0D1128 55%,#131530 100%)",
    sidebarBorderColor: "rgba(99,102,241,0.18)",
    accentColor: "#818CF8",
    accentGradient: "linear-gradient(135deg,#818CF8 0%,#60A5FA 100%)",
    cardRadius: "12px",
    entryAnimation: "awaBounceInLeft",
    palette: ["#818CF8","#60A5FA","#34D399","#FBBF24","#F87171","#22D3EE"],
  },
  ekede: {
    name: "Ekede",
    tagline: "The Harvest Day",
    emoji: "🌅",
    layoutLabel: "Harvest",
    layoutDescription: "Warm fills · Generous spacing · Amber warmth",
    sidebarVariant: "harvest",
    sidebarClass: "theme-ekede",
    sidebarGradient: "linear-gradient(170deg,#1A0800 0%,#2D1000 55%,#3D1600 100%)",
    sidebarBorderColor: "rgba(249,115,22,0.22)",
    accentColor: "#F97316",
    accentGradient: "linear-gradient(135deg,#F97316 0%,#FBBF24 100%)",
    cardRadius: "20px",
    entryAnimation: "awaBounceIn",
    palette: ["#F97316","#FBBF24","#EF4444","#10B981","#60A5FA","#C084FC"],
  },
  okoroete: {
    name: "Okoroete",
    tagline: "The Gathering Place",
    emoji: "🌿",
    layoutLabel: "Glass",
    layoutDescription: "Frosted glass · Pill shapes · Soft nature glow",
    sidebarVariant: "glass",
    sidebarClass: "theme-okoroete",
    sidebarGradient: "linear-gradient(170deg,#011408 0%,#022510 55%,#033318 100%)",
    sidebarBorderColor: "rgba(16,185,129,0.22)",
    accentColor: "#10B981",
    accentGradient: "linear-gradient(135deg,#10B981 0%,#34D399 100%)",
    cardRadius: "16px",
    entryAnimation: "awaZoomIn",
    palette: ["#10B981","#34D399","#06B6D4","#FBBF24","#818CF8","#F97316"],
  },
  otuo: {
    name: "Otuo",
    tagline: "The Royal Title",
    emoji: "👑",
    layoutLabel: "Royal",
    layoutDescription: "Uppercase elegance · Gold accents · Luxury minimal",
    sidebarVariant: "royal",
    sidebarClass: "theme-otuo",
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
      theme: "unyeada",
      config: THEMES.unyeada,
      setTheme: (theme) => set({ theme, config: THEMES[theme] }),
    }),
    { name: "awa-biz-theme" },
  ),
);
