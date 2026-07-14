---
name: Payment method availability vs. enabled
description: How VendorHub distinguishes a gateway a vendor "enabled" from one that will actually work at checkout, and where that surfaces.
---

Enabling a gateway (vendorsTable.<gateway>Enabled) is a vendor toggle, not a
guarantee it works — the platform-admin credentials behind it may be
unconfigured or currently failing (per the gateway-health recheck job), or a
vendor's own key may not be test-passed. `getPaymentMethodAvailability`
(artifacts/api-server/src/lib/vendor-keys.ts) is the single source of truth
for "will this actually succeed right now" — it mirrors the exact
credential-resolution order used at checkout time (own test-passed key →
platform DB credentials' `testPassed` → legacy env fallback for
stripe/paystack only). Never re-derive availability from the `*Enabled` flag
alone.

**Why:** without this, an admin's gateway going stale (key revoked, recheck
job flips `testPassed` to false) silently breaks checkout for every vendor
using it — they'd only find out from a generic 503 after "Continue to
payment," with no way to see it coming.

**How to apply:** any new UI/endpoint that lists a vendor's payment options
(shop-link checkout, vendor settings, admin tooling) should call
`getPaymentMethodAvailability` per enabled provider, not just filter by the
enabled flags. The shop-link checkout route also validates the chosen
provider's availability *before* creating the order, so a doomed choice
never leaves an orphaned order behind.
