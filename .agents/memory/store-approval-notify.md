---
name: Store app approval/rejection developer notification
description: Admin approval/rejection of store apps now sends email to developer; store.ts imports mailer + email-branding.
---

## The Gap (Fixed)

`POST /store/admin/apps/:id/approve` and `POST /store/admin/apps/:id/reject` previously updated the DB but sent no notification to the developer.

## The Fix

Both routes now:
1. Fetch the app + developer using `db.query.storeAppsTable.findFirst({ with: { developer: true } })`
2. Send a best-effort email using `sendEmail` + `wrapVendorEmail` + `escapeHtml`
3. Wrap the send in `.catch(() => {})` — email failure never blocks the admin action

The `developer` relation is defined in `lib/db/src/schema/store-relations.ts` as `one(storeDeveloperAccountsTable, ...)` — `with: { developer: true }` works.

## How to apply

`store.ts` now imports:
```typescript
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../lib/email-branding";
```

For new admin actions that affect developers (version approval, removal, reinstatement), use the same pattern: fetch developer email via the `developer` relation and send best-effort.

**Why:** Developers have no in-app notification channel (they're external users, not VendorHub vendors). Email is the only way to notify them.
