---
name: Account deletion eligibility (OR not AND)
description: How to combine multiple "still owes the platform" signals when gating a destructive self-service action.
---

When a destructive vendor/user action (hard delete, data export+wipe, etc.) must be blocked while
any financial obligation exists, and eligibility is derived from two separate fields that are
supposed to represent the same real-world state (e.g. `subscriptionTier !== "free"` and
`stripeSubscriptionId` presence), treat the check as **OR**, not **AND**.

**Why:** These fields can drift out of sync — webhook lag, a failed downgrade, a stale tier after a
cancellation — so requiring *both* to indicate "active" before blocking lets a state where only one
of them still reflects a paid relationship slip through and wrongly allow the destructive action.
Blocking on *either* signal is the safe direction to be wrong in.

**How to apply:** Any time you gate a destructive action on "is there still an active
subscription/payment obligation" derived from more than one denormalized field, OR the blocking
conditions together rather than ANDing them, even if it makes the eligibility check stricter than
strictly necessary in the common case.
