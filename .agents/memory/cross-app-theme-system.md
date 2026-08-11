---
name: Cross-app theme system
description: The 4-variant animated theme system and how it's implemented across GenHaL, Awa Biz Suite, and App Store.
---

## Rule
All three apps share a common 4-variant animated theme/sidebar system, each with its own named themes, localStorage key, and flash-overlay animation on switch.

## Awa Biz Suite (vendor-hub)
- Store: `artifacts/vendor-hub/src/store/themeStore.ts` — key `awa-biz-theme`
- Themes: unyeada (electric), ekede (harvest), okoroete (glass), otuo (royal)
- ThemePicker, AnimatedCard, layout.tsx already fully implemented

## GenHaL (genhal-web)
- Store: `artifacts/genhal-web/src/store/themeStore.ts` — key `genhal-theme`
- Themes: nnenna (ember/amber), savanna (golden), kpokpo (grove/green), oba (royal/purple)
- ThemePicker: `src/components/ui/ThemePicker.tsx`
- AnimatedCard: `src/components/ui/AnimatedCard.tsx`
- Layout: `src/components/layout.tsx` — `ThemeFlashOverlay` + `NavItem` variant rendering
- CSS keyframes + per-variant hover transforms in `src/index.css`
- Theme pill button in sidebar footer opens picker; also accessible from user dropdown

## App Store (app-store)
- Store: `artifacts/app-store/src/store/themeStore.ts` — key `app-store-theme`
- Themes: midnight (green), amber, violet, crimson
- ThemePicker: `src/components/ThemePicker.tsx` (framer-motion modal)
- AnimatedCard: `src/components/AnimatedCard.tsx`
- `ThemeApplier` component in `App.tsx` writes CSS vars to `document.documentElement` so ALL existing components pick up the new accent/bg colors automatically
- `ThemeFlashOverlay` in `App.tsx` — radial ripple on switch
- 🎨 palette button in desktop nav (`nav.tsx`) between PlatformsDropdown and auth

## Key pattern notes
- zustand + persist middleware, one store per app (NOT shared) — different themes per app
- Theme switch animation: a fixed overlay div with `radial-gradient` + CSS keyframe `themeFlash` that fades out in ~750-800ms
- Sidebar (GenHaL) smooth transition: `transition: background 0.5s ease, border-color 0.4s ease` inline style
- App Store uses CSS custom property injection (`--color-bg`, `--color-green`, etc.) so existing inline-style components automatically re-theme
- `baseTheme` from `@clerk/themes` does NOT exist in the Clerk v6 type defs installed here — do not use it

**Why:** Schools platform (awajimaaschools.com) is external — themes can only be added to apps in this monorepo.
