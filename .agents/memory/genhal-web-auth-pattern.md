---
name: GenHaL Web auth pattern
description: How authentication works in genhal-web — now uses Clerk (same tenant as vendor-hub / app-store), enabling shared single sign-on.
---

## Rule
genhal-web now uses **Clerk** (same `VITE_CLERK_PUBLISHABLE_KEY` + `VITE_CLERK_PROXY_URL` as vendor-hub and app-store), giving users one login that works across all three apps.

## How to apply
- `ClerkProvider` wraps the whole app in `App.tsx`.
- Auth-gated routes use `ProtectedPage(Component)` — a HOC that calls `useAuth()` and redirects to `/sign-in` when `!isSignedIn`.
- Public routes (homepage, kingdoms, language-orgs, sign-in, sign-up, verify) do not require auth.
- Layout sidebar shows user avatar + dropdown (sign out, manage account) when signed in; plain "Sign In" button otherwise. Auth-gated nav items show a lock icon and redirect to `/sign-in` when clicked while signed out.
- Clerk `appearance` variables: `colorPrimary: '#b45309'`, `colorBackground: 'hsl(222 47% 7%)'`, `borderRadius: '0.75rem'`. Do **not** add `baseTheme`, `colorText`, or `colorInputBackground` — those properties don't exist in the installed Clerk v6 type defs.
- `@clerk/react@^6.11.4` and `@clerk/themes@^2.4.57` are installed in genhal-web. `SignedIn`/`SignedOut`/`RedirectToSignIn` are **not** exported from this version — use `useAuth()` + conditional rendering instead.
- `userId` for API calls comes from the Clerk session token (same `requireAuth()` middleware already used on every genhal-* server route), not from API response body.

**Why:** genhal-web previously had no Clerk integration at all, so every API call to auth-gated genhal-* routes returned 401. Adding ClerkProvider with the shared tenant key means the browser sends the same session cookie/token as vendor-hub, making single sign-on automatic.
