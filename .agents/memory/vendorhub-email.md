---
name: VendorHub email dispatch
description: How real email sending (birthday emails, etc.) is wired up in api-server
---

VendorHub sends real emails via SMTP (nodemailer), not a managed provider like Resend/SendGrid — the user chose to provide their own SMTP credentials instead of connecting a Replit integration.

Secrets: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Sender lives in `artifacts/api-server/src/lib/mailer.ts` (`sendEmail`, `isEmailConfigured`) — degrades to `{status:"skipped"}` if any are missing, never throws.

**Why:** keeps the birthday-email feature (and any future transactional email) working without forcing a specific provider; caller code should treat "skipped"/"failed" as non-fatal and log rather than block other side effects (e.g. in-app notifications).

**How to apply:** any new outbound email feature should reuse `sendEmail` from this file rather than adding a new provider integration, unless the user asks to switch providers.
