---
name: Support Ticket System
description: Customer-facing support ticket system for Awa Biz Suite vendors — public shareable link, threaded messages, file attachments, vendor dashboard.
---

## Architecture

**DB tables:** `support_tickets` + `support_ticket_messages` (migration 0119_support_tickets.sql, applied to dev DB).
Exported from `lib/db/src/schema/support-tickets.ts`.

**Monthly quota limits** (plan-based, enforced in support-public.ts, NOT using the RESOURCE_KEYS overage system):
- free: 20/month, starter: 100, pro: 500, enterprise: unlimited (-1).
Count is checked via `gte(createdAt, getBillingPeriodStart(vendor))`.

**Public API routes** (mounted BEFORE requireAuth in routes/index.ts):
- `GET /api/public/support/:vendorId` — vendor info + active products for form
- `POST /api/public/support/:vendorId/tickets` — submit ticket
- `GET /api/public/support/ticket/:token` — customer views ticket thread
- `POST /api/public/support/ticket/:token/messages` — customer follow-up
- `POST /api/public/support/upload-url` — presigned upload for attachments (unauthenticated)

**Vendor API routes** (mounted AFTER requireAuth):
- `GET /api/support/tickets` — list with status/category/priority filters + unread counts
- `GET /api/support/tickets/stats` — counts by status
- `GET /api/support/tickets/:id` — detail + messages (marks as read)
- `PATCH /api/support/tickets/:id` — update status/priority
- `POST /api/support/tickets/:id/messages` — vendor reply (auto-advances status open→in_progress)
- `POST /api/support/upload-url` — presigned upload for reply attachments
- `GET /api/support/link` — returns `https://${host}/help/${vendorId}` as the shareable link

**Frontend routes** (vendor-hub):
- `/help/:vendorId` — public customer form (no auth, maps to `pages/help/index.tsx`)
- `/ticket/:token` — customer ticket tracking (no auth, maps to `pages/ticket-view/index.tsx`)
- `/support` — vendor dashboard ticket list (auth, maps to `pages/support/index.tsx`)
- `/support/:id` — vendor ticket detail + reply (auth, maps to `pages/support/ticket.tsx`)

**Sidebar:** `TicketCheck` icon under "Store" group in layout.tsx.

## Why attachment uploads use `/api/media/:id` URLs
Object storage presigned URLs pattern (same as media-library.ts):
1. `getObjectEntityUploadURL()` → presigned PUT URL
2. `normalizeObjectEntityPath(uploadUrl)` → `/objects/uploads/<uuid>`
3. `objectId = path.replace(/^\/objects\/uploads\//, "")`
4. `publicUrl = https://${PUBLIC_APP_DOMAIN || REPLIT_DEV_DOMAIN}/api/media/${objectId}`
5. `trySetObjectEntityAclPolicy(objectPath, { owner: "system:vendor-upload", visibility: "public" })`

## Vendor notification on new ticket
`vendorNotificationsTable` insert with `type: "support_ticket"` and `resourceId: ticketId`.
No push notification wired yet — future enhancement.
