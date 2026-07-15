---
name: social-accounts.ts response serialization gap
description: GET /social-accounts routes 500'd because Drizzle Date columns weren't stringified before the Zod response schema parse.
---

`artifacts/api-server/src/routes/social-accounts.ts` selected rows straight from `socialAccountsTable` and passed them to `ListSocialAccountsResponse.parse(...)` / `CreateSocialAccountResponse.parse(...)` / `GetSocialAccountResponse.parse(...)`. The Zod schema declares `createdAt`/`tokenExpiresAt` as strings, but Drizzle returns real `Date` objects, so every call 500'd with a Zod `invalid_type` error (expected string, received date).

**Why:** This is the same class of bug already documented in `vendorhub-posts-serialize-createdat.md` for `posts.ts` — any route returning a raw DB row needs to stringify every Date-typed field, not just the ones the original author remembered.

**How to apply:** Added a `serializeAccount()` helper mirroring `posts.ts`'s `serializePost()` (`.toISOString()` on `createdAt` and nullable `tokenExpiresAt`), used in all three response sites. If you see a Zod "Expected string, received date" error on any other route that returns raw table rows, check for the same missing-serializer gap before assuming it's a schema/DB issue.
