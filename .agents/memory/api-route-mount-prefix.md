---
name: API route mounting prefix
description: routes/index.ts is mounted at "/api" in app.ts — new route files must use paths relative to that.
---

`artifacts/api-server/src/app.ts` mounts the combined router as `app.use("/api", router)`.
Every router file under `artifacts/api-server/src/routes/` (including public/unauthenticated
ones like webhook or callback endpoints) must define its paths **without** a leading `/api`
segment, e.g. `router.post("/voice/status-callback", ...)`, not `router.post("/api/voice/status-callback", ...)`.

**Why:** a route file that includes `/api` in its own path ends up double-prefixed
(`/api/api/...`), so real requests to the intended URL fall through to Express's
default 404/401 handling instead of hitting the handler — easy to misdiagnose as an
auth or CORS problem instead of a routing typo.

**How to apply:** whenever adding a new router file, mirror the path convention of
existing routers (e.g. `payments/webhooks.ts`, `health.ts`) and curl the real
external path (e.g. `http://localhost:<port>/api/...`) to confirm it resolves before
assuming the logic itself is broken.
