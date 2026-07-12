---
name: Twilio Auth Token rotation detection
description: How VendorHub detects/alerts when TWILIO_AUTH_TOKEN drifts from the token active in Twilio's console
---

Signature-verified Twilio webhooks (e.g. voice status-callback) fail closed
and silently on token rotation — a 403 gives no signal to admins that real
traffic is being dropped. Fix: log every rejection (reason + callSid) to a
table, then reuse the export-burst pattern (rolling-window count, fire Slack
alert once at threshold crossing) plus an admin-panel banner endpoint so
staleness is visible even without checking Slack history.

**Why:** the failure mode is invisible by design (signature mismatch looks
identical whether it's an attacker or a stale secret), so detection has to be
inferred from rejection *rate*, not from a single failed request.

**How to apply:** generalizes to any webhook verified by a rotatable shared
secret (HMAC signatures, static API keys) — log rejections, alert on burst,
surface in the UI, and document in replit.md Gotchas that the secret must be
updated whenever the provider rotates it.
