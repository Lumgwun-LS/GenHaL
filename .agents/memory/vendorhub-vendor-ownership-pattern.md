---
name: VendorHub vendor-ownership enforcement pattern
description: How to bind a write to the caller's own vendor row instead of trusting a body-supplied vendorId.
---

Many VendorHub route files (e.g. posts, and originally vendors) accept a `vendorId` in
the request body/params for convenience, but several were never bound to the actual
signed-in identity — a caller could pass any vendorId and mutate/attach another
vendor's data (a real problem once child resources like products get attached to a
public, unauthenticated surface).

**Why:** `requireAuth` only confirms *a* Clerk session exists; it does not confirm the
caller owns the vendorId in their payload. Any route that writes vendor-scoped rows and
takes vendorId from the client needs an explicit ownership check.

**How to apply:** resolve identity server-side and compare, mirroring the pattern in
`vendors.ts`:
1. `const { userId } = getAuth(req)`
2. Look up `vendorsTable` where `clerkUserId = userId` to get the caller's own vendor id.
3. Also check an admin allowlist: `(process.env.ADMIN_USER_IDS ?? "").split(",")`.
4. Reject (403) if the target vendorId (from body, or from the existing row being
   updated) doesn't match the caller's vendor id and the caller isn't an admin.

When adding a new authenticated write route that takes/touches a vendorId, apply this
check rather than assuming `requireAuth` alone is sufficient isolation.
