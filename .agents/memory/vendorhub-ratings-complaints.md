---
name: VendorHub Ratings & Complaints
description: Schema, routes, and UI for customer star ratings and complaint submission — added post-order
---

## Tables
- `vendor_ratings` (migration 0091): vendorId, orderId, rating 1-5, review text, isVerifiedPurchase, isPublic, isFlagged
- `customer_complaints` (migration 0092): vendorId, orderId, customerEmail, subject, body, status (open|in_review|resolved|dismissed), adminNote

## API routes (all in routes/ratings.ts + routes/complaints.ts, mounted BEFORE requireAuth)
- `POST /api/ratings` — public submit (dedup by orderId)
- `GET  /api/ratings/:vendorId` — public, returns isPublic+!isFlagged only
- `GET  /api/ratings/summary/:vendorId` — public avg+count
- `GET  /api/admin/ratings` — admin only
- `PATCH /api/admin/ratings/:id` — flag/hide toggle
- `POST /api/complaints` — public submit
- `GET  /api/admin/complaints` + `?status=` filter — admin only
- `PATCH /api/admin/complaints/:id` — status+adminNote update

**Why:** routes are mounted twice in routes/index.ts — once before requireAuth (public reads/submits) and once after (admin endpoints that check ADMIN_USER_IDS internally).

## Frontend
- `pages/customer/order-detail.tsx` — rate (star form), submit complaint, request full or partial refund (paymentId required in order response)
- `components/site-renderer.tsx` — new `RatingsSection` type fetches `/api/ratings/summary` + `/api/ratings` and renders star cards; SiteData now has `vendorId` field
- `pages/admin/ratings-complaints.tsx` — super-admin tab with complaint status workflow + rating flag/hide
