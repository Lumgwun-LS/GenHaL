---
name: App Store known production bugs
description: Three bugs that broke sign-in and payment on awajimaaappstore.com — all fixed.
---

# App Store Production Bugs (all fixed)

## Bug 1 — getBaseUrl always returned dev tunnel domain
`store.ts` `getBaseUrl()` checked `REPLIT_DEV_DOMAIN` first. That env var is ALWAYS set (even in production), so every Paystack/Interswitch callback URL pointed to `https://bd3fa640-...replit.dev/...` instead of `https://awajimaaappstore.com/...`. After payment, users landed on the wrong domain and verification never fired.

**Fix:** Removed the `REPLIT_DEV_DOMAIN` check entirely. Always derive from `x-forwarded-proto` + `req.get("host")`.

## Bug 2 — App-store ClerkProvider missing production-key and proxy setup
`App.tsx` used `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY` directly and had no `proxyUrl`. Vendor-hub uses `publishableKeyFromHost(hostname, key)` + `proxyUrl`. On custom domains, Clerk sign-in was unreliable because the key wasn't being selected correctly for the current host.

**Fix:** Added `publishableKeyFromHost` from `@clerk/react/internal` and `VITE_CLERK_PROXY_URL`, matching vendor-hub's setup exactly.

## Bug 3 — Paystack callback URL param mismatch
Developer portal read `searchParams.get("ref")` but Paystack appends `reference` (and `trxref`) to callback URLs — never `ref`. Payment verification silently got `null` every time and the app stayed in `pending_payment` forever.

**Fix:** `searchParams.get("reference") ?? searchParams.get("trxref") ?? searchParams.get("ref")`

**Why all three matter together:** Bug 1 sent users to the wrong domain after payment, Bug 3 meant verification never fired even when they made it back, Bug 2 prevented sign-in on the custom domain entirely.
