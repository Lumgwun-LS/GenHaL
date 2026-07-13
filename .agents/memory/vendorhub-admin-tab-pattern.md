---
name: VendorHub admin tab pattern
description: Recipe for adding a new read-only admin history/log view to the Admin Panel.
---

New admin history/log views (audit log, message history, etc.) in
`artifacts/vendor-hub/src/pages/admin/index.tsx` follow one consistent recipe:

1. Backend: a `GET /admin/<thing>` route in `artifacts/api-server/src/routes/admin.ts`,
   gated by the shared `isAdmin(userId)` check, left-joining `vendorsTable` when the
   rows are vendor-scoped so the UI can show a vendor name without a second round trip.
2. Frontend: a typed `fetch<Thing>()` function + `useQuery({ queryKey, queryFn, enabled: isAdmin })`,
   a client-side filter via `useMemo`, and a `<TabsContent>` with a `<Table>` rendering
   sender/recipient/content/timestamp columns — copy the Audit Log tab as the template
   rather than inventing new structure.
3. Any mutation that creates rows the new view should show (e.g. sending a message) should
   invalidate the view's query key so the history updates without a manual refresh.

**Why:** keeps every admin log view visually and structurally consistent, and avoids
re-deriving the same loading/empty/filtered-empty states each time.
