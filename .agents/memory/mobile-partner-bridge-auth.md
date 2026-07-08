---
name: First-party client authenticating against a partner-only bridge endpoint
description: Pattern for when a first-party client (mobile/web app you own) needs to reach an endpoint designed for a trusted third-party backend, without a real third party integrated yet.
---

When an API exposes a bridge/handshake endpoint meant for a trusted third-party backend (e.g. gated by a partner API key), a first-party client you also own should never be given that partner credential — client bundles (including Expo `EXPO_PUBLIC_*` vars) are inspectable, so embedding it would leak a credential meant to gate genuine third parties.

**Why:** The credential's purpose is to prove "this caller is the trusted partner backend." A first-party client is a different trust category and needs its own proof of identity — self-declaring identity fields in the request body (name/email/userId with no verification) is not a substitute and lets any caller impersonate any user.

**How to apply:** Add a parallel first-party route (sharing the underlying handshake logic) that authenticates the caller through a real verifiable identity provider already used elsewhere in the app (e.g. a Clerk/session token verified server-side), never through self-asserted request fields. Only let the client supply account preferences that don't carry cross-account trust (e.g. a feature-tier selection), and derive identity (id/name/email) from the verified session, not the request body. Keep the original partner-credential route untouched for genuine third-party integrations.
