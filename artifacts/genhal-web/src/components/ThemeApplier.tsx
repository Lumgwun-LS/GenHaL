/**
 * ThemeApplier — stamps the active dashboard theme onto the document.
 *
 * Two mechanisms work together:
 *
 * 1. CSS class  → adds `theme-{name}` to <html> so index.css selectors can
 *    override --primary, --ring, --primary-foreground per theme (both light
 *    and dark variants).
 *
 * 2. CSS vars   → sets --theme-accent, --theme-card-radius,
 *    --theme-accent-gradient, --theme-sidebar-border as inline custom
 *    properties for components that need the raw values (sidebar, header,
 *    main-area tint, explicit card radius style props).
 */
import { useEffect } from 'react';
import { THEMES, useThemeStore } from '@/store/themeStore';

const ALL_THEME_CLASSES = Object.keys(THEMES).map(k => `theme-${k}`);

export function ThemeApplier() {
  const { theme, config } = useThemeStore();

  useEffect(() => {
    const root = document.documentElement;

    // 1. Swap theme class (drives index.css --primary / --ring overrides)
    root.classList.remove(...ALL_THEME_CLASSES);
    root.classList.add(`theme-${theme}`);

    // 2. Raw CSS vars (consumed by sidebar, header, main tint, card radius)
    root.style.setProperty('--theme-accent',          config.accentColor);
    root.style.setProperty('--theme-card-radius',     config.cardRadius);
    root.style.setProperty('--theme-accent-gradient', config.accentGradient);
    root.style.setProperty('--theme-sidebar-border',  config.sidebarBorderColor);
  }, [theme, config]);

  return null;
}
