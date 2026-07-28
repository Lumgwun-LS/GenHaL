---
name: VendorHub wallet & payout reliability pattern
description: Correctness rules for the vendor wallet/payout system — settlement, dispatch, compensation, and webhook patterns.
---

# VendorHub wallet & payout reliability pattern

## Rules

**Settlement (`completePayoutSettlement` in `routes/wallet.ts`)**
- Atomically claims payout `processing|failed → completed` inside the DB transaction.
- Uses `lockedUsdToNgnRate` stored on the payout row at request time — never re-fetches the live rate (admin rate changes must not affect in-flight payouts).
- Falls back to live rate only for legacy rows where `lockedUsdToNgnRate` is NULL.
- Throws on shortfall > 0.02 NGN so callers can retry rather than accepting under-deduction.
- Claiming `failed` in addition to `processing` is intentional: a dispatch timeout can leave the row as `failed` even after the provider accepted the transfer; when `transfer.success` later arrives, settlement still runs.

**Dispatch (`POST /admin/payouts/:id/approve`)**
- Stamps `providerReference = PAYOUT-<id>` (deterministic) BEFORE calling the provider so webhook lookup always works even if the post-call DB update crashes.
- Two phases: *pre-dispatch* errors → mark failed + release hold; *post-dispatch* errors → leave as `processing` (outcome ambiguous, webhook will finalize).
- If provider call throws after status is already `processing`, DO NOT mark failed — return 502 with a note that the payout is in `processing` and may need manual resolution.

**Manual resolution (`POST /admin/payouts/:id/reject`)**
- Accepts both `pending` and `processing` status (processing = ambiguous dispatch outcome).
- Guarded `WHERE status IN ('pending','processing')` inside the transaction so a concurrent `transfer.success` webhook that settles first wins; this path becomes a no-op in that case.
- Admin UI shows a "Resolve" button (styled differently from Approve/Reject) for `processing` payouts.

**Webhook failure/reversal (`transfer.failed` / `transfer.reversed`)**
- Dual-identifier lookup: `transfer_code` first, then `reference` (deterministic `PAYOUT-<id>`) as fallback.
- Status transition claimed atomically with `SELECT FOR UPDATE` inside the transaction so concurrent/duplicate events cannot both execute compensation.
- If `wasSettled = true` (payout was already completed), credit funds back; otherwise release `pendingNgnPayout`.

**Wallet crediting on payment webhook**
- `creditVendorWallet` is `await`-ed directly — no `.catch`. Failure throws so the webhook event is not acknowledged and the provider retries, preventing silent missed credits.

**Exchange rate endpoint**
- `GET /public/exchange-rate` mounted via `walletPublicRouter` BEFORE `requireAuth` in `routes/index.ts`.

**Why:**
Every rule above was identified via code review rejection during the original implementation. Violating any of them creates financial ledger inconsistencies that are hard to recover from in production.
