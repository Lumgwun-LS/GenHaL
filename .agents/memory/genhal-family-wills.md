---
name: GenHaL Family Wills system
description: AES-256-GCM encrypted wills; passphrase verified via scrypt; three-layer recovery system; admin escrow.
---

## Encryption schemes

### Legacy — `contentKeyScheme = 'passphrase'`
Content encrypted directly with PBKDF2(passphrase)-derived key. No separate content key.
Applies to all wills created before the recovery system was added.

### Split-key — `contentKeyScheme = 'split-key'`
Used when the will owner names at least one executor.

1. Generate a random 32-byte `contentKey`.
2. Encrypt content with `contentKey` (AES-256-GCM).
3. Seal `contentKey` in three independent envelopes stored in the DB:
   - **Owner envelope** (`owner_key_envelope`) — PBKDF2(passphrase) wraps the content key.
   - **Recovery envelope** (`recovery_key_envelope`) — PBKDF2(recoveryCode) wraps the content key. Recovery code is generated once, emailed to all executors, never stored.
   - **Platform envelope** (`platform_key_envelope`) — `WILL_PLATFORM_MASTER_KEY` (32-byte hex env var) wraps the content key. Last-resort admin path.

Passphrase verifier still uses scrypt for fast pre-check (not for key derivation in split-key).

## Access layers

1. **Owner passphrase** — `POST /wills/:id/access` — works for both schemes.
2. **Executor recovery code** — `POST /wills/:id/recovery-access` — split-key only; any logged-in family member can use it.
3. **Platform admin escrow** — two steps:
   - `POST /wills/:id/request-unlock` — submit death cert URL (best-effort).
   - `POST /admin/wills/:id/grant-escrow` — admin sets `adminEscrowGrantedAt` + `adminEscrowForClerk`.
   - `POST /wills/:id/escrow-access` — allowed only for the granted clerk user.

## Important constraints

- Recovery code: 24 random bytes as base64url (32 chars). Emailed to each executor on will creation. NEVER stored. If the API returns a `recoveryCode` field, it is shown once in the RecoveryCodeModal and not retained.
- `WILL_PLATFORM_MASTER_KEY`: must be exactly 64 hex chars (32 bytes). If not set, `platformKeyEnvelope` is null and the admin escrow path is unavailable for that will.
- Legacy wills remain fully functional on the old path — no migration of existing data.
- Executors are metadata only — they do not need a GenHaL account. Any logged-in family member can use the recovery code endpoint (the code is the secret, not the identity).

## DB columns added (migration 0130)
`content_key_scheme`, `executors` (JSON [{name,email}]), `owner_key_envelope`, `recovery_key_envelope`, `platform_key_envelope`, `death_cert_url`, `death_cert_submitted_at/by`, `admin_escrow_granted_at/by/for_clerk`.

## Frontend flow
- `AddWillDialog` is now 4 steps: Write Will → Set Passphrase → Name Executors → Persons & Accounts.
- After creation, if `recoveryCode` is in the response, `RecoveryCodeModal` blocks the UI until the user checks "I have saved the code".
- `AccessWillDialog` uses Tabs: Passphrase | Executor Code | Admin Unlock (tabs shown based on `hasRecovery` / `hasPlatformEscrow`).

**Why:** Ensures a will can always be accessed even if the owner dies without leaving the passphrase — as long as at least one executor survives. Platform escrow is the final fallback for the case where all executors are also dead.
