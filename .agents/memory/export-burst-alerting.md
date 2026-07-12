---
name: Export-burst alerting pattern
description: How VendorHub detects/alerts on abnormal admin export volume (mass vendor-data download)
---

VendorHub's `admin_export_logs` table records every CSV export of vendor data.
Burst detection: count exports by the same `adminUserId` within a rolling
window (`EXPORT_ALERT_WINDOW_MINUTES`, default 15) each time a new export is
logged; fire a Slack alert exactly once, the moment the count first equals
the threshold (`EXPORT_ALERT_THRESHOLD`, default 5) — not on every export
after — so a long spree doesn't spam one message per download.

**Why:** thresholds/windows are env-var configurable rather than hardcoded so
operators can tune sensitivity without a deploy; firing only on the exact
crossing (not `>=` every time) avoids Slack spam while still catching new
bursts if the window resets and crosses again later.

**How to apply:** the same pattern (rolling-window count + fire-once-at-threshold)
generalizes to any "same actor doing X too often" alert. For visibility beyond
Slack, also expose a `GET .../alerts`-style endpoint that returns currently
flagged actors (group by + `HAVING count(*) >= threshold` over the window) so
a UI banner works even for admins who didn't trigger the original alert.
