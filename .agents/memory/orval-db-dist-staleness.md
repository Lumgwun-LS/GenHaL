---
name: Orval + db dist staleness
description: When to rebuild lib/db and lib/api-zod, and rerun orval codegen, before trusting typecheck failures.
---

Both `lib/db` (Drizzle schema → `dist/`) and `lib/api-zod`/`lib/api-client-react` (openapi.yaml → orval-generated
`src/generated/*`) are built/generated artifacts. If another task or session changed `schema.ts` or
`openapi.yaml` without rebuilding, a fresh `tsc --noEmit` in an unrelated package (e.g. api-server, vendor-hub)
will show a pile of "property does not exist" / "no exported member" errors that look like your own change broke
something, when actually the generated output is just stale.

**Why:** these packages are only rebuilt on demand, not on every dev-server restart via watch mode, and multiple
tasks can touch the source (`schema.ts`, `openapi.yaml`) without any single one bumping the build.

**How to apply:** before assuming a typecheck error is caused by your edit, check whether the error mentions a
field name that *does* exist in the current source (schema/openapi) — if so, run:
1. `cd lib/db && npx tsc -b` (rebuilds Drizzle schema types)
2. `pnpm --filter @workspace/api-spec run codegen` (reruns orval + `typecheck:libs` for zod/client-react)
then re-run the failing typecheck. Only chase remaining errors after that.
