---
name: Voice campaign finish notifications
description: How campaign completion/failure notifications are wired, for reuse by similar background-job-finished features.
---
`runCampaignCalls` (shared by manual /launch and the scheduler) calls `notifyCampaignFinished` in its `finally` block after updating campaign status. It inserts a `vendor_notifications` row (type `voice_campaign`) and sends an email via `sendEmail`/`wrapVendorEmail`, computing counts from `voiceCampaignCallsTable` rows for the campaign.

**Why:** vendors had no visibility into auto-launched (scheduled) campaigns finishing; the scheduler runs unattended in the background.

**How to apply:** for any other background job that runs to a terminal state, notify from the single choke point where status is finalized (not from every call site), and keep it best-effort (try/catch, log-only) so a notification failure never re-triggers or corrupts the job's own state.
