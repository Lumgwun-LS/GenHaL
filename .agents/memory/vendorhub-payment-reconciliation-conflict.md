---
name: VendorHub payment reconciliation conflicts
description: How webhooks.ts guards a vendor-cancelled payment from being resurrected by a late provider webhook.
---

Every provider webhook handler in `artifacts/api-server/src/routes/payments/webhooks.ts` (Stripe, Paystack, Flutterwave, Nomba, Remita) matches purely by `providerReference` and used to unconditionally overwrite `paymentsTable.status`. This let a late-arriving webhook silently flip a vendor-cancelled payment back to "paid"/"failed", because `/external/payments/:id/cancel` and `/:id/retry` only update the local row — they never void the provider's checkout session.

Fix: a shared `applyPaymentStatusTransition(reference, newStatus, provider)` helper selects the row first; if its current status is `"cancelled"`, it refuses to overwrite, instead recording `metadata.reconciliationConflict` (attemptedStatus/provider/detectedAt) and firing a Slack alert, and returns an `"conflict"` outcome the caller treats as `matched: true` (handled, not an error to retry).

**Why:** cancellation and retry are vendor-initiated business decisions; a stale provider-side session completing after that must never contradict them, especially since a retry may already have a separate successful payment for the same order.

**How to apply:** any new payment-status write path (new gateway, admin manual override, reconciliation job) must route through this same guard rather than writing `paymentsTable.status` directly from a bare provider match.
