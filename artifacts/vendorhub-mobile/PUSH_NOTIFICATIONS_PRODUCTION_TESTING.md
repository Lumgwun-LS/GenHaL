# Testing push notifications in a real build

Expo Go (SDK 53+) cannot receive **remote** push notifications — this app's payment
alerts (`usePushNotifications.ts` + `api-server/src/lib/push.ts`) can only be verified
end-to-end with a real EAS development or production build installed on a physical
device.

## Status: build produced, device test still pending

- EAS project created: `@lumgwun-solutions/awajimaa-apps`
  (`extra.eas.projectId` = `d487516e-b621-4ca6-b15a-0a7b9106b0f4`, `app.json` slug
  aligned to `awajimaa-apps` to match).
- Added `expo-dev-client` (required for EAS dev-client builds) and
  `expo-build-properties` (needed to fix an Android manifest merge conflict between
  `okhttp3:logging-interceptor` and `jspecify` — added a `pickFirst` packaging rule
  for `META-INF/versions/9/OSGI-INF/MANIFEST.MF`).
- Android development build succeeded on EAS:
  **Install APK:** https://expo.dev/artifacts/eas/X78v_aVrqGQ1_wBrD-t_gpBn6ViPCx3zp4fq9Xl0CzA.apk
  (build id `29651241-ae03-445e-abc3-db5404692ba8`, SDK 54, fingerprint `ec1160c787de83afee9821292fa936b710685a48`)
- iOS build was not attempted (needs Apple Developer credentials / signing, which
  weren't provided).

## Remaining steps to finish verification

1. Download and install the APK above on a physical Android device (enable
   "install unknown apps" for the browser/Files app if prompted).
2. Open the installed dev-client app (not Expo Go) and connect it to the running
   Metro/dev server for this project, then sign in as a vendor.
3. Grant notification permission when prompted; confirm `usePushNotifications`
   registered a token — check the `vendor_push_tokens` table for a new row, or
   watch api-server logs for `registerExternalPushToken`.
4. Trigger a payment status change for that vendor (replay/send a test webhook that
   calls `notifyVendorPaymentStatus`, or complete a real test checkout).
5. Confirm the push notification banner appears on the device.
6. Tap the notification and confirm it opens the Payments tab
   (`router.push('/(tabs)/payments')`).

Once steps 1–6 are confirmed on a physical device, this task is fully verified.
