---
name: Routes with no-auth full-table-scan pattern
description: Several vendor routes lacked auth and did full table scans with in-memory filter; fixed pattern documented here.
---

## The Vulnerability

`orders.ts`, `products.ts`, `inventory.ts` had routes (GET list, POST, PATCH, DELETE) with:
- No auth middleware (`requireAuth` NOT applied to these routers)
- Full table scan: `db.select().from(table).orderBy(...)` — no WHERE clause
- In-memory filter: `results.filter(r => r.vendorId === params.data.vendorId)` — trusted from query params

Any authenticated user could read/write any other vendor's data by passing a different vendorId.

## Fix Applied

Each file got a local `resolveAuthedVendor(req)` function (same pattern as posts.ts lines 39-46):
```typescript
async function resolveAuthedVendor(req) {
  const { userId } = getAuth(req);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}
```

All list routes now use:
```typescript
const dbVendorId = !authed.isAdmin ? authed.vendorId : (params.data.vendorId ?? null);
.where(dbVendorId !== null ? eq(table.vendorId, dbVendorId) : undefined)
```

## Routes CORRECTLY Scoped (no fix needed)

- `expenses.ts`, `sales.ts`, `investments.ts` — use `resolveOwnedVendorId()` pattern with DB-level filter
- `branches.ts`, `workers.ts` — same `resolveOwnedVendorId()` pattern
- `voice-campaigns.ts`, `ads.ts`, `social-accounts.ts` — DB-level vendor scope
- `notifications.ts` — URL param `:id` with clerkUserId ownership check

**Why:** `requireAuth` middleware gates the whole API router, BUT some route files were mounted differently or didn't use the auth context to scope queries. Always use `resolveAuthedVendor` + DB-level WHERE, never trust `vendorId` from query params as the sole scope guard.
