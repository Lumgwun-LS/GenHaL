---
name: VendorHub push notifications
description: How instant phone alerts for payment status changes are implemented (Expo push + api-server webhook hooks)
---

## Architecture
- Device tokens live in `vendor_push_tokens` (Drizzle table `vendorPushTokensTable` in `lib/db/src/schema/vendor-push-tokens.ts`), keyed by vendor id, unique on `expoPushToken`.
- Mobile app registers/unregisters via `/external/push/register` and `/external/push/unregister` (auth-gated by `requireExternalAuth`, same JWT as other `/external/*` routes).
- Sending goes through `sendPushToVendor` / `notifyVendorPaymentStatus` in `artifacts/api-server/src/lib/push.ts`, which POSTs to Expo's `https://exp.host/--/api/v2/push/send` (no API key needed — Expo brokers APNs/FCM).
- Wired into the three places a payment's status flips: Stripe `checkout.session.completed` (paid), Stripe `checkout.session.expired` (failed), Paystack `charge.success` (paid), and the admin manual refund route (refunded) in `artifacts/api-server/src/routes/payments/index.ts`.
- A `DeviceNotRegistered` error ticket from Expo auto-deletes that token row so stale devices stop being queried.

## Why
Vendors need instant awareness of payment outcomes without keeping the app open; reusing the existing webhook-driven status-update path (rather than a separate poller) keeps a single source of truth for "payment status changed."

## Gotcha
Expo Go (SDK 53+) does not support *remote* push notifications — only local ones. Real testing of end-to-end delivery requires an EAS development/production build with `extra.eas.projectId` set in `app.json` (not yet configured as of this writing).
