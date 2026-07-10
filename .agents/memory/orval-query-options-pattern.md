---
name: Orval-generated hook query options need explicit queryKey
description: How to correctly pass `enabled`/other react-query options into an orval-generated useGetX hook in this codebase.
---

Generated hooks (`orval` + `@tanstack/react-query`) accept a second argument shaped like
`{ query?: UseQueryOptions<...>, request?: ... }`. Passing just `{ query: { enabled: someBool } }`
type-checks in isolation but fails when TypeScript infers a narrower `TQueryKey` — you'll see
"Property 'queryKey' is missing" even though `queryKey` looks optional on `UseQueryOptions`.

**Why:** Every existing call site in this codebase (`vendors/detail.tsx`, `orders/detail.tsx`,
`email-campaigns/detail.tsx`) that conditionally enables a generated query also passes `queryKey`
explicitly, built from the matching exported `getGetXQueryKey(params)` helper. That's the
established, working pattern — don't try to omit it.

**How to apply:** When conditionally enabling a generated `useGetX(...)` hook, always pass
`{ query: { enabled: <condition>, queryKey: getGetXQueryKey(<params>) } }`, importing the
`getGetXQueryKey` helper alongside the hook itself.
