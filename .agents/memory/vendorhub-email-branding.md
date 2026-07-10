---
name: VendorHub shared email branding
description: All vendor-facing emails must go through wrapVendorEmail; it renders bodyHtml raw so callers must escape vendor-controlled data themselves.
---

`artifacts/api-server/src/lib/email-branding.ts` exports `wrapVendorEmail({ bodyHtml, action })` — a shared header/footer wrapper (social links + cross-service links) that every vendor email (birthday, account deletion, pending-item reminders) now uses instead of ad hoc inline HTML.

**Why:** before this, each `sendEmail` call site built its own full HTML string, so branding/footer links drifted and there was no single place enforcing them.

**How to apply:** `wrapVendorEmail` renders `bodyHtml` raw (it's meant to hold pre-built HTML including a CTA). Any vendor-controlled value interpolated into `bodyHtml` (vendor name, post caption, free-text fields) MUST be passed through the exported `escapeHtml()` first — the wrapper does not sanitize for you. New email features should reuse this wrapper rather than writing new inline HTML.
