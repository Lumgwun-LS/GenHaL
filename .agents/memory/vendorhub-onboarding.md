---
name: VendorHub signup/onboarding
description: Where vendor rows get created for web vs mobile signups, and how identity is verified.
---

Web VendorHub sign-up previously only used Clerk's `<SignUp/>` widget (email+password) and had
**no** step that created a `vendors` row — every page that reads "my vendor" via
`vendors.find(v => v.clerkUserId === user.id)` silently got `undefined` for any web-only signup.
Mobile already had a working equivalent via the handshake endpoint.

A post-signup onboarding page (`/onboarding` in vendor-hub) now collects name/country/phone and
calls `POST /vendors/onboarding`, which:
- derives `clerkUserId` and `email` from the verified Clerk session server-side (`getAuth` +
  `clerkClient.users.getUser`) — never from the request body,
- validates name/country/phone server-side independently of client validation,
- is idempotent under retries/double-submits via a partial unique index on
  `vendors.clerk_user_id` (`WHERE clerk_user_id IS NOT NULL`) plus a `23505`-catch that returns
  the existing row instead of erroring.

**Why:** Client-side-only validation and read-then-insert-without-a-constraint are both easy to
bypass/race in exactly this kind of "create my own account" flow — an architect review caught
both before ship.

**How to apply:** Any new "first login creates my record" flow in this codebase should follow the
same shape: identity from the server-verified session, validation duplicated server-side, and a
DB-level uniqueness constraint (not just an application-level existence check) backing the
create-if-not-exists logic. Also: route guards that gate access on "has a vendor row" (like
`RequireVendorProfile`) must exempt or separately handle admins, since admin status is determined
by Clerk user id list, not by vendor ownership.
