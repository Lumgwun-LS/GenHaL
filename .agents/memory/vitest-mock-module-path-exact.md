---
name: vi.mock module path must match import path exactly
description: A vitest vi.mock only intercepts the exact module specifier string it's registered for; re-exports at another path bypass it silently.
---

A test using `vi.mock("@workspace/db", () => ({...}))` only intercepts code that imports from `"@workspace/db"`. If some other file under test imports the same table object from `"@workspace/db/schema"` instead (a different module specifier, even though `@workspace/db` re-exports `./schema`), vitest does not intercept that import — the code gets the real schema object, not the mock's table-identity stand-in.

**Why:** hit this refactoring shared webhook logic (subscription cancellation notification) into a new lib file; the new file imported `vendorNotificationsTable` from `@workspace/db/schema` while the existing test only mocked `@workspace/db`, so `table === vendorNotificationsTableRef` comparisons inside the mock's `insert()` silently failed and the write went to a no-op branch — test failed with an empty array instead of an import/type error.

**How to apply:** when moving code between files, check which module specifier existing tests mock for the tables/values you're importing, and import from that same specifier — don't "clean up" the import path without checking test mocks first.
