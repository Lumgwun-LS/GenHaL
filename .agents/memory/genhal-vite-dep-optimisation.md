---
name: GenHaL Vite dep-optimisation crash
description: esbuild thread-limit and zipFS deadlock issues in genhal-web when dep cache is cold and all 18 workflows run simultaneously.
---

## Rule
When rebuilding the genhal-web Vite dep-optimization cache from scratch, stop or avoid starting other workflows first. The Replit container has a tight OS-thread limit (~25 total); esbuild's parallel dep-scan exhausts it and crashes.

**Why:** All 18 workflows running together leaves no room for esbuild goroutines. With fewer concurrent workflows (~1–2), the cache builds cleanly and is reused on all subsequent restarts.

**How to apply:**
- The `vite.config.ts` carries two defensive settings: `exclude: ['country-state-city']` (skips the 7.7 MB CJS package from pre-bundling) and `esbuildOptions: { ignoreAnnotations: true }` (prevents esbuild from following `//# sourceMappingURL` into pnpm's virtual zip store, which deadlocks under tight fd limits).
- If the cache is wiped and the crash recurs, shut down unneeded workflows, clear `node_modules/.vite`, and restart genhal-web alone so esbuild has thread headroom.
- Do NOT use `noDiscovery: true` — it breaks CJS→ESM conversion for packages like `use-sync-external-store/shim` (used by zustand), making the browser unable to find named ESM exports.
