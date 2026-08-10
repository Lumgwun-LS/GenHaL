---
name: GenHaL Family Wills system
description: AES-256-GCM encrypted family will & testament system — schema, API, UI
---

**Table:** `genhal_family_wills` — migration 0127.

**Encryption:** AES-256-GCM via Node.js `crypto` (no extra deps).
- Key derivation: `crypto.pbkdf2Sync(passphrase, salt, 100_000, 32, 'sha256')` per-will unique salt.
- Passphrase verification: separate `crypto.scryptSync(passphrase, verSalt, 64)` hash stored in `passphraseVerifier`/`passphraseSalt` — timing-safe comparison prevents leaking.
- Passphrase is never stored. If lost, content is unrecoverable.

**Access model:**
- Any authenticated family member can see will *metadata* (title, author, condition, authorized persons list).
- Decrypting content requires the passphrase (POST `/genhal/families/:id/wills/:willId/access`).
- Only the author can create/update/revoke their own will.
- One active will per author per family (409 if they try to add a second).

**Frontend pattern (WillsTab):**
- `currentUserClerkId` comes from the list API response (not Clerk hooks — genhal-web has no Clerk client).
- Author name is a form field (not auto-resolved from Clerk).
- 3-step Add dialog: (1) write content + name, (2) set passphrase, (3) authorized persons + condition.
- Passphrase strength meter included.
- Print function opens a blank window with the decrypted content formatted in serif for offline preservation.

**Linked secret accounts:**
- `linked_account_ids` TEXT (JSON number[]) column on `genhal_family_wills` — stores IDs only, not sensitive.
- Metadata view returns `linkedAccountCount` (count) + `linkedAccountIds` (array) — IDs alone are not sensitive.
- Account details (account number, bank name, currency) are fetched from `genhalSecretAccountsTable` and returned ONLY inside the `/access` response, after passphrase verification succeeds.
- Frontend `AccountSelector` component fetches `GET /genhal/accounts/family/:id` and renders checkboxes for the author to pick which accounts to link.
- Frontend `LinkedAccountCard` shows each account with reveal/hide toggle for the full account number.

**Route file:** `artifacts/api-server/src/routes/genhal-wills.ts`
**Component:** `artifacts/genhal-web/src/pages/wills/index.tsx` (WillsTab)
**Tab:** added to `families/detail.tsx` as `📜 Wills` alongside `🤝 Succession`.
