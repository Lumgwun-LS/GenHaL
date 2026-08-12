---
name: GenHaL Web static serving & publish pattern
description: Why genhal.awajimaa.com kept serving stale JS bundles after every publish, and the fix.
---

## The Problem
`genhal.awajimaa.com` served `index-CSWaqU_L.js` (an old build) even after multiple publishes.

## Root Cause
The artifact.toml had a `build` command in `[services.production]`. Replit's publish pipeline:
1. Takes a workspace snapshot → creates the "hosting layer" (what `serve = "static"` reads from)
2. Runs the `build` command → produces new `dist/public/index.html` in the **runtime container**
3. The hosting layer reads from the **snapshot** (step 1), not the runtime build (step 2)

So the hosting layer always had the OLD `index.html` (from whenever the workspace was last in sync), while the new bundle only existed in the runtime. The `_redirects` `/* /index.html 200` rule caused index.html to be served from the hosting layer — the stale one.

## Fix
Removed the `build` key from `artifacts/genhal-web/.replit-artifact/artifact.toml` `[services.production]`. Now genhal-web works like `app-store`: no Replit-triggered build, just `serve = "static"` from workspace snapshot.

**Why:** For `serve = "static"` artifacts, Replit serves from the workspace snapshot at publish time. Removing the build command means the snapshot IS the serving source — no split between snapshot and runtime.

## Pre-publish requirement
Before every publish of genhal-web changes, run:
```
pnpm build:genhal
```
This rebuilds `dist/public/` with `BASE_PATH=/` (required for `genhal.awajimaa.com` custom domain). The resulting `dist/public/index.html` is what the hosting layer will serve.

## Why BASE_PATH matters
- Dev server: `BASE_PATH=/genhal/` (assets at `/genhal/assets/...`) — needed for Replit preview pane
- Production: `BASE_PATH=/` (assets at `/assets/...`) — needed for custom domain `genhal.awajimaa.com`
- The `build` script in package.json hardcodes `BASE_PATH=/` for production: `PORT=5000 BASE_PATH=/ vite build`

**How to apply:** Any time genhal-web source code changes and needs publishing, run `pnpm build:genhal` in the workspace root first, then publish.
