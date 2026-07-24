---
name: Auth Scoping Audit — VendorHub API Routes
description: Full-surface auth audit findings and fixes — which routes had full-table-scan + in-memory filter vulnerabilities, what pattern to use for new routes.
---

## The Vulnerability Pattern (FIXED)

A recurring pattern was: `db.select().from(TABLE)` (full scan) + in-memory `.filter(r => r.vendorId === vendorId)` with no auth check. Any authenticated vendor could see all vendors' data by omitting or spoofing the vendorId query param.

## Routes Fixed

| File | Issue | Fix Applied |
|------|-------|-------------|
| `orders.ts` | Full scan + in-memory filter, no auth | resolveAuthedVendor + DB-level WHERE vendorId |
| `inventory.ts` | Same | Same |
| `products.ts` | Same | Same |
| `posts.ts` | Full scan + in-memory filter (had auth but not scoped) | DB-level WHERE vendorId |
| `leads.ts` | No auth on ANY route + full scan | Complete rewrite: resolveAuthedVendor + DB scoping + ownership on single-resource routes |
| `email-campaigns.ts` | No auth on ANY route + full scan | Complete rewrite same as leads.ts |
| `sms-campaigns.ts` | No auth on ANY route + full scan | Complete rewrite same pattern |
| `analytics.ts` | GET /analytics/overview, /sales, /social had no auth | Added getAuth + resolveAuthedVendor + admin-aware scoping |
| `vendors.ts` | GET /vendors (list all) + GET /vendors/stats had no auth | Admin-only gating |
| `social-accounts.ts` | Had auth but full-scan + in-memory filter | Upgraded to DB-level WHERE for non-admins |
| `api-keys.ts` | No auth on platform API key management | Admin-only gating on all 3 routes |
| `payments/index.ts` | GET /payments/webhook-events accessible to any vendor | Admin-only gating |

## Routes Confirmed Secure (No Fix Needed)

- `branches.ts`, `workers.ts` — resolveOwnedVendorId pattern ✅
- `sales.ts`, `expenses.ts`, `investments.ts` — resolveOwnedVendorId ✅
- `voice-campaigns.ts` — ownerOrAdmin helper ✅
- `ads.ts` — resolveAuthedVendor + DB-level scoping ✅
- `social-accounts.ts` single-resource routes — ownership check ✅
- `posts.ts` single-resource routes — ownership check ✅
- `subscription-upgrade.ts` — canManageVendor ✅
- `account-deletion.ts` — loadOwnedVendor ✅
- `notifications.ts` — validateVendorOwnership ✅
- `analytics.ts` GET /analytics/vendor-performance + /finance-overview — getAuth + ownership ✅
- `vendor-addons.ts` — canManageVendor + DB-level scoping ✅
- All `admin-*.ts` files — individual isAdmin checks on every route ✅
- All `external/*.ts` (mobile) files — requireExternalAuth + JWT-derived vendorId ✅

## Public Routes (By Design)

- `GET /media/:objectId` — intentionally pre-auth; required for Instagram's Content Publishing API (needs publicly reachable URL). objectId UUID is unguessable.
- `GET /store/apps` — public app store browse (intentional)
- `POST /analytics/pageview` — fire-and-forget beacon (no sensitive data)
- `GET /site-content` — public marketing copy only (filtered to PUBLIC_SITE_CONTENT_KEYS)
- `GET /public/vendors/:id` — safe public profile fields only (name, brandTheme)
- Webhook/callback routes — protected by provider signature verification (not Clerk auth)

## Canonical Pattern for New Routes

```typescript
// In route file:
async function resolveAuthedVendor(req: Request): Promise<{ vendorId: number | null; isAdmin: boolean }> {
  const { userId } = getAuth(req);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

// In route handler:
const authed = await resolveAuthedVendor(req);
if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
const effectiveVendorId = authed.isAdmin ? (requestedVendorId ?? authed.vendorId) : authed.vendorId;
// Use effectiveVendorId in DB WHERE clause, never the request body/query param directly.
```

**Why:** The old pattern trusted the vendorId from query params, letting any vendor enumerate other vendors' private data.

**How to apply:** Every new route file that lists/mutates vendor-owned records must use this pattern. Single-resource routes additionally need a post-fetch ownership check before returning data.
