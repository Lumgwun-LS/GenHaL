---
name: Orders product ownership validation
description: POST /orders now validates all productIds belong to the order's vendorId before inserting items.
---

## Rule
`POST /orders` in `routes/orders.ts` must verify that every `productId` in the items array belongs to `orderData.vendorId` before inserting `orderItemsTable` rows.

**Why:** Without this check, a caller could reference products from a different vendor in an order, corrupting cross-vendor data and bypassing access controls on product records. The placeholder name `Product #${id}` was also returned instead of the real product name.

**How to apply:**
- Uses `inArray(productsTable.id, productIds)` + `eq(productsTable.vendorId, orderData.vendorId)` to fetch owned products in one query
- Builds a `productNameMap` from the result — real name used in the order item row
- Returns 400 if any `productId` is not in the owned set
- When `productIds` array is empty (items with no productId), falls through to original insert path unchanged

**Imports added:** `inArray` from `drizzle-orm`, `productsTable` from `@workspace/db`
