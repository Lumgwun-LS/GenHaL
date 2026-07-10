---
name: DB migration file numbering
description: Avoid filename collisions when adding a new numbered migration to lib/db/migrations.
---

`lib/db/migrations/*.sql` uses sequential zero-padded numbers (0001, 0002, ...). Before naming a
new migration file, always `ls lib/db/migrations` first rather than assuming the highest number
you last saw — a duplicate number (two `0008_*.sql` files) has happened when the count wasn't
re-checked in a later session.

**Why:** Sessions get compacted/summarized and can lose track of the exact latest number; the
directory listing is the only reliable source of truth.

**How to apply:** Run the `ls` immediately before writing the new migration file, every time,
even if a prior summary states what the last number was.
