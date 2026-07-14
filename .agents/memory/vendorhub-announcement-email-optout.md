---
name: VendorHub announcement email opt-out
description: How vendors opt out of bulk admin announcement emails, distinct from voiceCallOptOut.
---

Bulk admin announcements (`POST /vendors/notifications/bulk`) always create the in-app
`vendorNotifications` row, but skip the email step for vendors with
`vendors.announcement_email_opt_out = true`. In-app notification creation and email
sending are deliberately decoupled: filter the emailable subset *after* inserting
notifications for everyone, so opting out of email never affects in-app visibility.

**Why:** Frequent bulk announcement emails were unwanted by some vendors, but muting
in-app visibility entirely would risk them missing time-sensitive info.

**How to apply:** When adding another vendor-controlled notification-channel toggle,
follow this same pattern — default value should preserve current behavior for existing
vendors (opt-out flags default `false`/off, not opt-in), and the toggle belongs in the
vendor's own settings page (`artifacts/vendor-hub/src/pages/vendors/detail.tsx`), not an
admin-only screen.
