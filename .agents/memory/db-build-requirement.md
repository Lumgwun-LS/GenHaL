---
name: DB Package Build Requirement
description: @workspace/db must be rebuilt after schema changes or downstream consumers get stale empty type declarations.
---

## Rule
After adding or changing files in `lib/db/src/schema/`, always run:
```bash
pnpm --filter @workspace/db exec tsc -p tsconfig.json
```
This regenerates `lib/db/dist/schema/index.d.ts`. If skipped, the file exports `{}` and all table imports in `api-server` routes fail typecheck with "has no exported member".

## Why
`@workspace/db` uses TypeScript project references (`"composite": true`, `"emitDeclarationOnly": true`). The `api-server` tsconfig references it via `"references"` and resolves types from `dist/`, not `src/`. A stale `dist/` means zero exports.

## How to apply
Run the tsc build on the DB package any time the schema changes, before running `typecheck` on any consumer package.
