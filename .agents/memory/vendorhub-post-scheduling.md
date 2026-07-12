---
name: VendorHub post scheduling policy
description: How scheduling/cancel/reschedule interacts with the post review invariant, for future work touching Social Media Manager posts.
---

Scheduling a post only moves it from approved to scheduled, keeping it consistent with the platform's draft→pending_review→approved→published review invariant. Cancelling a schedule always reverts to draft (forces re-review), regardless of how the post got scheduled.

A separate, pre-existing shortcut lets vendors set a future date directly at creation time, skipping review entirely — this predates the scheduling feature and was intentionally left in place rather than removed, so there are two legitimate ways to reach "scheduled" (reviewed vs. not), both feeding the same background publisher.

The background publisher and the manual "publish now" action share one publish-execution function, so there is exactly one code path that can resolve a post out of an in-flight "publishing" state — this also means any exception in that path must revert the post to a stable state itself (nothing upstream will retry a stuck "publishing" row for it).

**Why:** avoids a new endpoint accidentally weakening the human-review guarantee, while not silently changing pre-existing bypass behavior out of scope.

**How to apply:** future post-status work should check both the direct-creation shortcut and the dedicated schedule endpoint before assuming there's a single gate on reaching "scheduled".
