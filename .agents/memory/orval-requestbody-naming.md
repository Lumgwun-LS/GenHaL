---
name: Orval requestBody schema naming convention
description: How to name and structure requestBody schemas in openapi.yaml to avoid TS2308 duplicate-export errors in the api-zod and api-client-react generated packages.
---

# Orval requestBody schema naming convention

## The rule
For every `requestBody` in openapi.yaml, always use `$ref: "#/components/schemas/<Name>"` where `<Name>` follows the `<Entity>Input` / `<Entity>Update` pattern (NOT `Create<Entity>Body` / `Update<Entity>Body`).

## Why
Orval generates BOTH:
1. A TypeScript type file in `lib/api-zod/src/generated/types/<camelCaseName>.ts`
2. A Zod validator in `lib/api-zod/src/generated/api.ts` as `export const <Name> = zod.object(…)`

…for any schema whose name matches the auto-generated convention `Create<OperationId>Body` or `Update<OperationId>Body`. When the same name appears in both files and both are re-exported from `api-zod/src/index.ts` (`export * from './generated/api'` + `export * from './generated/types'`), TypeScript raises TS2308.

The same thing happens if you inline the requestBody instead of using `$ref`: Orval auto-names the inline schema `Create<OperationId>Body`, generating both a type file and a Zod export → same conflict.

## How to apply
- Request body schemas: put in `components/schemas`, use `<Entity>Input` / `<Entity>Update` suffix (e.g. `PurchaseOrderInput`, `PurchaseOrderUpdate`, `StockAlertSettingsUpdate`), reference via `$ref` in the path's `requestBody`.
- Response schemas: same `$ref` approach, any name is fine (they don't get dual-generated).
- NEVER inline requestBody schemas. NEVER name them `*Body`.
- Items sub-schemas (e.g. array item types in the input): name them `<Entity>InputItemsItem` and put them in components/schemas too — same rule applies.
- After adding schemas, run `pnpm --filter @workspace/api-spec run codegen` and confirm `pnpm -w run typecheck:libs` passes.

## Gotcha
Using `$ref` to a schema named `Create<OperationId>Body` still triggers the conflict — the name itself is what matters, not whether it's inline or referenced. Rename the schema.
