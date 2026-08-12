---
name: Clerk appearance variables and dark mode
description: Why Clerk's colorBackground/colorText appearance variables don't work for dark-mode adaptation, and the correct pattern.
---

## Rule
Do NOT pass `colorBackground` or `colorText` to Clerk's `appearance.variables` when the app supports dark mode. Only pass `colorPrimary` (hardcoded hex/HSL, not a CSS variable reference) and `borderRadius`.

**Why:** Clerk's appearance system stores variable strings literally and injects them via its own CSS-in-JS — it does NOT resolve CSS `var(--token)` references. So `colorBackground: "hsl(var(--card))"` correctly sets the card to a dark colour in dark mode, BUT Clerk's internal component styles (heading, subtitle, divider, labels, footer) are hardcoded in Clerk's own stylesheet and don't respect `colorText`. Result: dark text on dark card = invisible.

**How to apply:**
- Keep only `colorPrimary: "hsl(15 80% 41%)"` (terracotta) and `borderRadius: "0.75rem"`.
- The Clerk form stays white/light in both light and dark modes — standard auth-form UX (Google, GitHub do the same).
- If you ever DO want to theme Clerk's individual elements, use `appearance.elements` with specific CSS class overrides, NOT `appearance.variables` for text colour.
