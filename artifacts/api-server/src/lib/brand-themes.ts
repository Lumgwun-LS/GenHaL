/**
 * Preset brand color themes vendors can pick for their public storefront page.
 * Curated (not free-form hex input) so every storefront stays legible and on-brand.
 */
export type BrandTheme = {
  id: string;
  label: string;
  /** Tailwind-friendly hex values used to theme the storefront page. */
  primary: string;
  accent: string;
  gradientFrom: string;
  gradientTo: string;
};

export const BRAND_THEMES: BrandTheme[] = [
  { id: "violet", label: "Violet Dusk", primary: "#7F50FF", accent: "#FF7F50", gradientFrom: "#7F50FF", gradientTo: "#2D1B69" },
  { id: "ocean", label: "Ocean Blue", primary: "#0EA5E9", accent: "#22D3EE", gradientFrom: "#0EA5E9", gradientTo: "#0C4A6E" },
  { id: "sunset", label: "Sunset Orange", primary: "#F97316", accent: "#FBBF24", gradientFrom: "#F97316", gradientTo: "#7C2D12" },
  { id: "forest", label: "Forest Green", primary: "#16A34A", accent: "#84CC16", gradientFrom: "#16A34A", gradientTo: "#14532D" },
  { id: "rose", label: "Rose Pink", primary: "#EC4899", accent: "#F472B6", gradientFrom: "#EC4899", gradientTo: "#831843" },
  { id: "slate", label: "Slate Mono", primary: "#475569", accent: "#94A3B8", gradientFrom: "#64748B", gradientTo: "#0F172A" },
];

export const BRAND_THEME_IDS = BRAND_THEMES.map((t) => t.id);

export function getBrandTheme(id: string): BrandTheme {
  return BRAND_THEMES.find((t) => t.id === id) ?? BRAND_THEMES[0];
}
