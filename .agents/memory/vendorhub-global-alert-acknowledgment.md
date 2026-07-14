---
name: Global (non-per-actor) alert acknowledgment
description: How to add an acknowledge/clear flow for a burst alert that is shared across the whole system rather than scoped to one admin/actor.
---

The export-burst acknowledge flow (`adminExportAcknowledgmentsTable`, keyed by `adminUserId`) is per-actor because each admin can independently be mid-burst. The Twilio signature-failure alert is different: it reflects one shared `TWILIO_AUTH_TOKEN`, so there is exactly one alert state for the whole system, not one per admin.

**How to apply:** when a new burst/threshold alert is *global* rather than per-actor:
- Use a singleton acknowledgment table (a single row, upserted by matching on `id`/existence rather than a unique per-actor key) instead of one row per actor.
- Still keep a separate append-only log table for compliance/history, mirroring the per-actor pattern.
- The core comparison stays identical to the per-actor case: compute `flaggedAt` as the timestamp of the Nth-most-recent event that crossed the threshold within the rolling window, and treat the burst as cleared only if `acknowledgedAt >= flaggedAt` — an ack that predates the crossing must not silently clear a fresh burst.
