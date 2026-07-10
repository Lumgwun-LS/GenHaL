---
name: Mobile package.json / node_modules drift
description: vendorhub-mobile expo workflow fails with PluginError for a package listed in package.json/app.json config plugins
---

If the `artifacts/vendorhub-mobile: expo` workflow fails to start with `PluginError: Failed to resolve plugin for module "<pkg>"` (or similar "Cannot find module" for a dependency), the package is declared in `package.json`/`app.json` but wasn't actually installed into `node_modules` (e.g. added in a prior session without running install).

**Why:** happened after a push-notifications feature added `expo-notifications`/`expo-device` to `package.json` and `app.json` plugins, but node_modules never got the install, breaking the workflow for unrelated later changes.

**How to apply:** run `pnpm install --filter @workspace/vendorhub-mobile` from the workspace root, then restart the expo workflow. Don't assume a currently-broken workflow was caused by your own edit — check `git stash` + retry to confirm it's pre-existing before debugging your own code.
