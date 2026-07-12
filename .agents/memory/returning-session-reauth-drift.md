---
name: Returning-session authorization must re-derive from persisted record
description: Handshake/login/session-issuance endpoints for an existing account must not trust request-supplied authorization fields; use the stored value instead.
---

## The rule
Any endpoint that mints a session/JWT and can run against an *already-existing* account record must derive authorization-relevant fields (role, tier, account type — anything that gates feature access) from the persisted record, not from the current request's input. Request-supplied values should only be allowed to set that field on first creation.

## Why
In VendorHub's mobile handshake (`POST /external/auth/mobile-handshake`), the endpoint always trusted the request body's `userType` to build both the JWT and the `features` array, even for a vendor that already existed. A user who re-ran onboarding (e.g. after a cleared local session) and picked a different account type than the one they originally signed up with got a JWT baked with the new, more restrictive type — even though their vendor row in the database still said the original type. This produced a confusing, hard-to-diagnose bug: the account "looked like" one type in the database but behaved like another type in the app, and the mismatch only showed up on feature-gated screens (e.g. an analytics dashboard erroring with a 403 for an account that should have had analytics access).

## How to apply
- On any login/handshake/session-refresh code path: `if (existingRecord) { authField = existingRecord.persistedAuthField } else { authField = requestInput }`.
- If you want to let users deliberately change that field later, build a distinct, explicit endpoint for it (e.g. "change account type" in settings) that updates the persisted record and re-issues the session — never make it a silent side effect of re-running a general-purpose onboarding/login flow.
- When debugging a "JWT/features don't match what's in the database" symptom, check the *session-issuing* endpoint's field derivation before suspecting the feature-gating logic itself.
