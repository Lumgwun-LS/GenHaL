---
name: Vendor route auth gaps — DELETE and POST /vendors
description: Two unauthenticated vendor write routes found and fixed — DELETE /vendors/:id and POST /vendors.
---

## The Vulnerabilities (Both Fixed)

### 1. DELETE /vendors/:id (Critical)
Was: completely unauthenticated — any HTTP request could cascade-delete any vendor.
Fixed: admin-only guard using `getAuth(req)` + ADMIN_USER_IDS check.

**Why admin-only?** Vendor-initiated self-deletion goes through `account-deletion.ts` which runs balance checks, archives banned identifiers, and removes the Clerk user. The raw DELETE route bypasses all of that — it's only safe for trusted admin use (e.g., clearing test data).

### 2. POST /vendors (Severe)
Was: completely unauthenticated — anyone could create a vendor row with arbitrary fields including `clerkUserId`.
Fixed: admin-only guard. Proper vendor signup uses `POST /vendors/onboarding` (Clerk-gated, derives identity from session).

## How to apply

The pattern used in both fixes:
```typescript
const { userId } = getAuth(req);
if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!adminIds.includes(userId)) { res.status(403).json({ error: "Admin only" }); return; }
```

Both `getAuth` and `clerkClient` are already imported in `vendors.ts` — no new imports needed.

## Lesson
Always check every HTTP method on a resource for auth — not just GET. The existing auth sweep focused on read + list endpoints missing scoping. The write-path audit caught these two completely missing auth checks.
