---
name: Site-content settings audit history
description: How admin edits to any site-content block (e.g. alert thresholds) get a durable change history, not just a last-editor field.
---

`siteContentTable` rows only ever hold the current value + last `updatedBy`/`updatedAt` — every edit overwrites the previous one. For admin-sensitive blocks (security detector thresholds, etc.) that isn't enough to answer "who changed this and when" across history.

`setSiteContentBlock(key, value, updatedBy, updatedByDisplayName?)` in `artifacts/api-server/src/lib/site-content.ts` now also appends an immutable row to `site_content_audit_log` (old value, new value, admin id + resolved Clerk display name, timestamp) inside the same transaction as the upsert. `getSiteContentAuditLog(key)` reads it back. This is generic across every `SiteContentKey`, not just one setting.

**Why:** the export-burst alert threshold (a PII-exfiltration detector) needed this for a security review, and the same gap exists for every other admin-editable site-content block (e.g. `admin.voiceSignatureFailureAlertSettings`).

**How to apply:** when adding change history to a new admin-editable site-content key, you don't need new plumbing — just resolve the admin's Clerk display name (see the `PATCH /admin/site-content/:key` handler in `admin.ts` for the pattern) and add a `GET /admin/site-content/:key/history`-style UI consumer if the Admin Panel should surface it.
