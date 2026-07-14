---
name: Live-testing admin routes via minted Clerk sessions
description: How to exercise real admin-only HTTP endpoints end-to-end (not simulated SQL) when there's no dev auth bypass.
---

## The pattern
VendorHub gates admin routes with `isAdmin(userId)`, which just checks `process.env.ADMIN_USER_IDS` (comma-separated Clerk user IDs) — there's no dev-only bypass. In this dev environment `ADMIN_USER_IDS` was completely unset (not even present as an env var), so *no one* was an admin until explicitly configured.

To exercise a real admin flow end-to-end:
1. Create a throwaway Clerk user via Backend API (`POST /v1/users` with `skip_password_checks`/`skip_password_requirement`) using `CLERK_SECRET_KEY`.
2. `setEnvVars` to add that user's ID to `ADMIN_USER_IDS` (shared env), then restart the api-server workflow so it picks it up.
3. Mint a short-lived session JWT per request (`POST /v1/sessions` → `POST /v1/sessions/{id}/tokens`, ~60s expiry) and call the real HTTP routes with `Authorization: Bearer <jwt>` — this proves the full auth + business-logic path, not just internal function calls.
4. Clean up afterward: delete any test-created DB rows, `DELETE /v1/users/{id}` the Clerk test user, and `deleteEnvVars` to remove `ADMIN_USER_IDS` again so the environment returns to its prior (no-admin-configured) state.

## Gotcha: use ShellExec/curl, not the CodeExecution "use impure" sandbox, for this
Chaining multiple `fetch` calls inside a `"use impure"` function (mint session → mint token → call app route) repeatedly hit `Error replaying durable ptc: null does not match type Pattern` in the durable PTC runtime, even with fresh variable names across cells. Doing the same three-step curl chain in a bash script via ShellExec worked reliably instead — prefer that for this kind of external-API-chaining test flow.

## Confirms schema drift is often the real blocker
The first attempt failed with 500s, not auth errors — `admin_export_logs`/`admin_export_acknowledgments`/`admin_export_acknowledgment_log` tables didn't exist in the dev DB (migrations 0012/0023/0032 never applied), consistent with the general "dev DB drift runs deeper than schema.ts diffs" lesson. Applied the `CREATE TABLE IF NOT EXISTS` DDL directly before the live test could proceed.
