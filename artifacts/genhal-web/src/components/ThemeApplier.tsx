/**
 * ThemeApplier — runs at the App root and stamps the active dashboard theme's
 * design tokens as CSS custom properties on <html>.  Every component in the
 * tree can then consume them via `var(--theme-*)` without needing to read the
 * Zustand store directly.
 *
 * Properties set:
 *   --theme-accent          raw hex accent colour
 *   --theme-card-radius     card corner radius (e.g. "12px", "20px")
 *   --theme-accent-gradient CSS gradient string for accent fills
 *   --theme-sidebar-border  sidebar border colour (reused on header)
 */
import { useEffect } from 'react';
import { useThemeStore } from '@/store/themeStore';

export function ThemeApplier() {
  const { config } = useThemeStore();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--theme-accent',          config.accentColor);
    root.style.setProperty('--theme-card-radius',     config.cardRadius);
    root.style.setProperty('--theme-accent-gradient', config.accentGradient);
    root.style.setProperty('--theme-sidebar-border',  config.sidebarBorderColor);
  }, [config]);

  return null;
}
