---
name: posts.ts serializePost dropped createdAt
description: Post response routes 500 unless serializePost stringifies createdAt too, not just scheduledAt/publishedAt.
---

`serializePost` in `artifacts/api-server/src/routes/posts.ts` converted `scheduledAt`/`publishedAt` Date objects to ISO strings before `GetPostResponse.parse(...)`, but not `createdAt` — which the zod schema requires as a `string`. Any route returning a fresh row from `db.update(...).returning()` (e.g. `/posts/:id/schedule`) threw a ZodError and 500'd on the response, even though the DB write itself had already succeeded and committed.

**Why:** drizzle-orm returns raw `Date` objects for timestamp columns; the generated zod response schemas expect ISO strings. Only two of the three timestamp fields were being converted — an easy field to miss when adding new logic ahead of an existing `res.json(GetPostResponse.parse(serializePost(post)))` line.

**How to apply:** when a Post-shaped response 500s with a Zod "expected string, received date" error, check `serializePost` covers every Date column (`createdAt`, `scheduledAt`, `publishedAt`), not just the ones the current feature touches. A failed response does not mean the underlying write failed — check DB state before assuming a mutation needs replaying.
