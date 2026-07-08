---
name: Reanimated entering/transform conflict
description: Applying entering= and useAnimatedStyle with transform on the same Animated.View causes a Reanimated web warning.
---

**Rule:** Never put both `entering={...}` prop and `useAnimatedStyle(() => ({ transform: [...] }))` on the same `Animated.View`. They fight for the transform property, causing a console warning: `"Property [transform] may be overwritten by a layout animation."`

**Why:** Reanimated's entering/exiting animations (FadeInDown, ZoomIn, etc.) drive transform internally. When `useAnimatedStyle` also sets `transform`, they overwrite each other on web.

**How to apply:**
- Separate into nested views: outer `Animated.View` gets the `entering=` prop; inner `Animated.View` gets the `useAnimatedStyle` with transform for interactive press effects.
- OR: drop the `useAnimatedStyle` transform entirely and rely solely on `entering=` for the initial animation (acceptable when press feedback isn't needed).
- The `AnimatedListItem` wrapper (entering) wrapping a `Card` (useAnimatedStyle for press scale) is fine because they are *different* components — no conflict.
