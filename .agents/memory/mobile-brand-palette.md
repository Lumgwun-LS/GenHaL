---
name: Mobile brand palette
description: VendorHub Mobile colour tokens and gradient usage; must not be reverted to old blue palette.
---

Primary colour: `#7F50FF` (electric violet) — used for primary buttons (via GradientButton), active tab indicators, section titles, icon backgrounds, stat values, and label text.

Accent colour: `#FF7F50` (coral) — used for monetary values, "Sign up" / "Sign in" links, inventory-out icons, and the gradient endpoint.

**Why:** User explicitly requested these two colours for all text and UI elements. The original palette used `#2563eb` (blue) which must not be restored.

**How to apply:**
- `colors.primary` → `#7F50FF` (light) / `#9B74FF` (dark, slightly lighter for contrast)
- `colors.accent` → `#FF7F50` in both light and dark themes
- `colors.gradientStart` → `#7F50FF`, `colors.gradientEnd` → `#FF7F50`
- `GradientButton` always uses `['#7F50FF', '#FF7F50']` left-to-right
- Hero/auth screens use `LinearGradient` with these two colours
- Monetary values (amounts) should use `colors.accent` (coral) for visual pop
- Section titles, labels, primary interactive elements use `colors.primary` (violet)
