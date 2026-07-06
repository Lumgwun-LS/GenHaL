---
name: Package Build Requirements
description: Several lib packages use project references and need a tsc rebuild after source changes or consumers get stale declarations.
---

## Rule — @workspace/db
After adding or changing files in `lib/db/src/schema/`, always run:
```bash
cd lib/db && pnpm exec tsc -p tsconfig.json
```
Regenerates `lib/db/dist/schema/index.d.ts`. If skipped, the file exports `{}` and all table imports in `api-server` routes fail typecheck.

## Rule — @workspace/api-client-react
After regenerating OpenAPI client code (i.e. running orval in `lib/api-spec/`), always run:
```bash
cd lib/api-client-react && pnpm exec tsc -p tsconfig.json
```
Regenerates `lib/api-client-react/dist/generated/api.schemas.d.ts`. If skipped, consumers (vendor-hub) see the old type shapes and get "Property X does not exist" errors even though the source was updated.

## Why
Both packages use TypeScript project references (`"composite": true`, `"emitDeclarationOnly": true`). Consumers resolve types from `dist/`, not `src/`. A stale `dist/` means stale types.

## How to apply
Run the relevant tsc build any time source changes, before running typecheck on any consumer package.
