/**
 * Manual, one-off script to confirm that calling `checkout.sessions.expire`
 * on a real Stripe test-mode session makes it genuinely un-payable on Stripe's
 * side — not just cancelled in our local DB.
 *
 * This is intentionally NOT part of the `vitest` suite — it makes live network
 * calls to the real Stripe test-mode API and requires a real test-mode secret key.
 *
 * To run it once a Stripe test key is available:
 *
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx src/lib/__tests__/live-stripe-void-session-check.ts
 *
 * What it does, step by step, against real Stripe:
 *
 *   1. Creates a real Stripe test-mode checkout session (mode: "payment").
 *   2. Confirms the session's initial status is "open" (it should be, immediately
 *      after creation).
 *   3. Calls `checkout.sessions.expire` on it — exactly the path taken by
 *      `voidProviderSession` in routes/external/payments.ts.
 *   4. Confirms the returned session status is "expired" immediately after the
 *      expire call returns.
 *   5. Calls `checkout.sessions.retrieve` a second time (a fresh API round-trip)
 *      and confirms the status is still "expired" — proving the change is durable
 *      on Stripe's side, not just a local response quirk.
 *   6. Confirms the original session URL is the one that would have been handed to
 *      the customer and is now effectively dead (session no longer open).
 *
 * Mirrors the production flow in voidProviderSession:
 *   retrieve → check status === "open" → expire → done.
 */

import Stripe from "stripe";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    console.error(
      "STRIPE_SECRET_KEY is not set. Provide a Stripe TEST-mode secret key (sk_test_...) to run this check.",
    );
    process.exit(1);
  }
  if (!key.startsWith("sk_test_")) {
    console.error(
      "Refusing to run: STRIPE_SECRET_KEY does not look like a test-mode key (must start with sk_test_).",
    );
    process.exit(1);
  }

  const stripe = new Stripe(key);

  // ── Step 1: create a checkout session ────────────────────────────────────
  console.log("Step 1: Creating a real Stripe test-mode checkout session...");
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: 100, // $1.00
          product_data: { name: "VendorHub void-session live check" },
        },
      },
    ],
    success_url: "https://vendorhub.app/success",
    cancel_url: "https://vendorhub.app/cancel",
    metadata: {
      source: "live-void-session-check",
    },
  });

  console.log(`  Created session: ${session.id}`);
  console.log(`  Checkout URL:   ${session.url}`);

  // ── Step 2: confirm initial status is "open" ──────────────────────────────
  console.log("\nStep 2: Confirming initial status is 'open'...");
  if (session.status !== "open") {
    throw new Error(
      `FAILED (step 2): expected status='open' immediately after creation, got '${session.status}'.`,
    );
  }
  console.log(`  PASSED: status='${session.status}' as expected.`);

  // ── Step 3: expire the session (mirrors voidProviderSession) ─────────────
  console.log("\nStep 3: Calling checkout.sessions.expire (voidProviderSession path)...");
  const expired = await stripe.checkout.sessions.expire(session.id);
  console.log(`  expire() returned status='${expired.status}'.`);

  if (expired.status !== "expired") {
    throw new Error(
      `FAILED (step 3): expected status='expired' in the expire() response, got '${expired.status}'.`,
    );
  }
  console.log("  PASSED: expire() response carries status='expired'.");

  // ── Step 4: fresh retrieve confirms the change is durable on Stripe ───────
  console.log("\nStep 4: Re-retrieving the session to confirm status is durably 'expired' on Stripe's side...");
  const retrieved = await stripe.checkout.sessions.retrieve(session.id);
  console.log(`  retrieve() returned status='${retrieved.status}'.`);

  if (retrieved.status !== "expired") {
    throw new Error(
      `FAILED (step 4): expected status='expired' on re-retrieve, got '${retrieved.status}'. ` +
        "The session is NOT reliably un-payable from Stripe's perspective — investigate.",
    );
  }
  console.log("  PASSED: re-retrieve confirms status='expired'. The session URL is dead on Stripe's side.");

  // ── Step 5: confirm session id and URL match what was created ─────────────
  console.log("\nStep 5: Confirming session identity matches the one handed to the customer...");
  if (retrieved.id !== session.id) {
    throw new Error(`FAILED (step 5): session id mismatch: created=${session.id}, retrieved=${retrieved.id}`);
  }
  if (retrieved.url !== null && retrieved.url !== session.url) {
    // url may become null after expiry on some Stripe versions; either is acceptable
    throw new Error(`FAILED (step 5): session URL mismatch: created=${session.url}, retrieved=${retrieved.url}`);
  }
  console.log(`  PASSED: session id matches (${session.id}).`);
  console.log(
    `  URL field after expiry: ${retrieved.url ?? "(null — Stripe cleared it, which is also valid)"}`,
  );

  console.log(
    "\n✓ All live Stripe void-session checks passed.\n" +
      "  A real test-mode checkout session expired via checkout.sessions.expire is durably un-payable\n" +
      "  from Stripe's perspective, confirming voidProviderSession closes the link for the customer.\n",
  );
}

main().catch((err) => {
  console.error("\nLive Stripe void-session check FAILED:", err);
  process.exit(1);
});
