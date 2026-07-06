---
name: Drizzle Numeric and Timestamp Type Coercions
description: Drizzle ORM requires specific types for numeric and timestamp columns — mismatches cause TypeScript errors.
---

## Rule
- **`numeric` columns** (e.g. `price`, `costPrice`, `totalAmount`): Drizzle expects `string`, not `number`. Always call `.toString()` before insert/update.
- **`timestamp` columns** (e.g. `scheduledAt`, `sentAt`): Drizzle expects `Date | null`, not ISO string. Always `new Date(isoString)` before insert/update.

## Why
Drizzle's pg-core maps `numeric` to `string` in TypeScript to avoid floating-point precision loss. Timestamps are mapped to `Date` objects, not strings.

## How to apply
In route handlers, destructure the raw Zod-parsed data and convert before passing to `.values()` or `.set()`:
```typescript
const { price, costPrice, scheduledAt, ...rest } = parsed.data;
await db.insert(table).values({
  ...rest,
  price: price.toString(),
  costPrice: costPrice?.toString(),
  scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
});
```
