---
name: VendorHub voice call retry dual-table sync
description: Campaign voice calls are tracked in two tables; any status mutation (retry, etc.) must update both.
---

Campaign voice calls are recorded in **two** places:
- `voice_call_logs` (shared with birthday calls, `purpose = "campaign"`, `campaignId` set) — used by the admin-wide Voice Calls tab.
- `voice_campaign_calls` (one row per lead within a specific campaign) — used by the per-campaign detail view/stats, and carries `leadId`/`leadName` that `voice_call_logs` does not.

**Why:** the two tables were created independently (admin-wide log vs. per-campaign detail) and nothing keeps them in sync automatically — `runCampaignCalls` writes both when placing a call, so any later mutation of a campaign call's status (e.g. an admin-triggered retry) must also write both, matched by `campaignId` + `phone` (most recent), or the two views of "the same call" show different, stale statuses.

**How to apply:** when adding new campaign-call status logic (retry, cancel, manual override, etc.), look up the matching row in the other table before updating, and update both. Birthday calls only live in `voice_call_logs`, so this doesn't apply to `purpose = "birthday"` rows.
