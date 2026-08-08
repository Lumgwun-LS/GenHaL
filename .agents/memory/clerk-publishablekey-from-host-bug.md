---
name: publishableKeyFromHost breaks on non-canonical host
description: Using publishableKeyFromHost() in clerkMiddleware with a live key and wrong host silently generates a wrong publishable key, causing authorization_invalid on all OAuth logins.
---

## The Rule

Do NOT use `publishableKeyFromHost()` in the server-side `clerkMiddleware` for this project.
Use `process.env.CLERK_PUBLISHABLE_KEY` directly.

**Why:**
`publishableKeyFromHost(host, fallbackKey)` in @clerk/shared ≥v4 ignores the fallback for live (`pk_live_*`) keys.
It always derives a new key: `buildPublishableKey('clerk.' + host)`.
When requests arrive via `account.awajimaaai.com` (the Replit API server domain) instead of
`awajimaaai.com` (the CF Pages domain), the derived key becomes
`pk_live_...clerk.account.awajimaaai.com...` — a nonexistent Clerk instance.
Every JWT / OAuth state check then fails with `authorization_invalid` for ALL users simultaneously.

The bug was triggered by the commit "Switch API proxy to account.awajimaaai.com" which changed
the `x-forwarded-host` header seen by the API server.

**How to apply:**
Keep the `clerkMiddleware` call simple:
```ts
app.use(clerkMiddleware({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY }));
```
Do not call `publishableKeyFromHost` anywhere in app.ts. The `getClerkProxyHost` utility is still
used inside `clerkProxyMiddleware.ts` to set the `Clerk-Proxy-Url` request header — that is fine.
