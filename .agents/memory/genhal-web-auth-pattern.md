---
name: GenHaL Web auth pattern
description: GenHaL web has no Clerk client package — user identity is server-resolved only
---

GenHaL web (`artifacts/genhal-web`) does NOT have `@clerk/clerk-react` installed.
Auth is entirely server-side via the Express Clerk middleware.

**How to get the current user's Clerk ID on the frontend:**
- Include it in the API response (e.g. `currentUserClerkId` field on list endpoints).
- Derive "my item vs others" from that returned value, not from a Clerk hook.

**Author names:**
- `genhalFamilyMembersTable` has no `name` column — only `clerkUserId`, `role`, `relationship`, `customTitle`.
- Prompt the user to enter their name in the form (text field) and pass it as `authorName` in the request body.

**Why:**
GenHaL was built as a separate app from VendorHub and does not share the Clerk client setup.
Importing `@clerk/clerk-react` would add a large dep and require ClerkProvider wiring that isn't there.
