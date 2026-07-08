---
name: Orval zod codegen duplicate export failure
description: How to fix TS2308 "already exported a member" errors after orval codegen (react-query + zod outputs) following an OpenAPI spec change.
---

Adding an OpenAPI path whose request/response body is an inline (unnamed) object schema, then regenerating with orval, can produce `TS2308: Module ... has already exported a member named 'X'` in the generated barrel files.

**Why:** Orval derives a type name for inline bodies from the operationId. When both the react-query client output and the zod/types output independently derive the same name for an inline schema, the barrel's `export *` re-exports collide — it's a codegen naming collision, not a real duplicate.

**How to apply:** Give every non-trivial request/response body its own named entry in `components.schemas` and `$ref` it from the path, instead of inlining the object shape. Re-run the api-spec codegen — the ambiguous-export error disappears once orval has an explicit schema name to use everywhere.
