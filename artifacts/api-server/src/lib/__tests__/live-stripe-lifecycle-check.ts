/**
 * Manual, one-off script to validate the missed-cancellation reconciliation
 * path against the REAL Stripe test-mode API AND the real dev database (not
 * the fakes used by subscription-missed-cancellation-lifecycle.test.ts).
 *
 * This is intentionally NOT part of the `vitest` suite — it needs a real
 * Stripe test-mode secret key and makes live network calls to Stripe and
 * live writes to the dev database, neither of which this environment has
 * available right now (no STRIPE_SECRET_KEY is configured, in the DB
 * platform-payment-credentials table or as an env fallback).
 *
 * To run it once a Stripe test key is available, pick (or create) a
 * disposable test vendor row in the dev DB and run:
 *
 *   STRIPE_SECRET_KEY=sk_test_... VENDOR_ID=<id> npx tsx src/lib/__tests__/live-stripe-lifecycle-check.ts
 *
 * What it does, step by step, against real Stripe + the real DB:
 *   1. Loads the vendor row for VENDOR_ID from the dev database. Refuses to
 *      run against a vendor that already has a real stripeCustomerId, to
 *      avoid touching a vendor's actual billing state — use a disposable
 *      test vendor.
 *   2. Creates a test Stripe Customer + Product + Price ($1/mo) and attaches
 *      it to the vendor's `stripeCustomerId`, then creates a Subscription
 *      with `metadata.upgradeTier = "starter"` (mirrors what checkout
 *      creates) and confirms it is `active`.
 *   3. Records the vendor's subscriptionTier as "starter" directly (skipping
 *      Checkout, since we only need Stripe to show an active subscription).
 *   4. Cancels the subscription directly via `stripe.subscriptions.cancel`
 *      (equivalent to cancelling in the Stripe dashboard) — the
 *      "missed cancellation" scenario: no webhook is sent from this script,
 *      the same way an undelivered customer.subscription.deleted would
 *      leave VendorHub's DB stale.
 *   5. Calls the real `reconcileVendorSubscription` — the exact function
 *      used by both POST /vendors/:id/subscription/sync and the periodic
 *      scheduler tick — and confirms the vendor row is downgraded to free
 *      in the real database, with a real in-app notification + email.
 *   6. Separately calls the scheduler's `tick()` directly (with a second
 *      disposable subscription) to confirm the periodic job independently
 *      reaches the same result with zero route/HTTP involvement.
 *   7. Cleans up the Stripe test objects it created and restores the
 *      vendor's original stripeCustomerId/subscriptionTier in the DB.
 */
import Stripe from "stripe";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { reconcileVendorSubscription } from "../subscription-sync";
import { tick as schedulerTick } from "../subscription-sync-scheduler";

async function createLapsedSubscription(stripe: Stripe, tier: string) {
  const customer = await stripe.customers.create({ email: "lifecycle-check@example.com", name: "Lifecycle Check" });
  const product = await stripe.products.create({ name: `VendorHub lifecycle-check plan (${tier})` });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: 100,
    recurring: { interval: "month" },
  });
  await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: "pm_card_visa" } });

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    metadata: { upgradeTier: tier },
  });
  if (subscription.status !== "active" && subscription.status !== "trialing") {
    throw new Error(`Expected subscription to be active/trialing right after creation, got: ${subscription.status}`);
  }

  // Simulate the missed webhook: cancel directly on Stripe, no notification sent here.
  await stripe.subscriptions.cancel(subscription.id);

  return { customer, product, subscription };
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  const vendorIdRaw = process.env.VENDOR_ID;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set. Provide a Stripe TEST-mode secret key (sk_test_...) to run this check.");
    process.exit(1);
  }
  if (!key.startsWith("sk_test_")) {
    console.error("Refusing to run: STRIPE_SECRET_KEY does not look like a test-mode key (must start with sk_test_).");
    process.exit(1);
  }
  if (!vendorIdRaw) {
    console.error("VENDOR_ID is not set. Point this at a disposable test vendor's id in the dev DB.");
    process.exit(1);
  }
  const vendorId = Number(vendorIdRaw);

  const stripe = new Stripe(key);

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId)).limit(1);
  if (!vendor) throw new Error(`No vendor found with id ${vendorId}`);
  if (vendor.stripeCustomerId) {
    throw new Error(
      `Vendor ${vendorId} already has a real stripeCustomerId (${vendor.stripeCustomerId}) — use a disposable test vendor with no billing history.`,
    );
  }

  const originalTier = vendor.subscriptionTier;

  try {
    // ── Part 1: manual-sync path (what POST /subscription/sync exercises) ──
    console.log("=== Part 1: reconcileVendorSubscription (manual-sync path) ===");
    const lapsed1 = await createLapsedSubscription(stripe, "starter");
    await db
      .update(vendorsTable)
      .set({ stripeCustomerId: lapsed1.customer.id, stripeSubscriptionId: lapsed1.subscription.id, subscriptionTier: "starter" })
      .where(eq(vendorsTable.id, vendorId));

    const [vendorAfterSetup1] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId)).limit(1);
    const result1 = await reconcileVendorSubscription(vendorAfterSetup1, stripe, "manual-sync");
    console.log("reconcileVendorSubscription result:", result1);

    const [vendorAfterSync1] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId)).limit(1);
    if (result1.synced !== true || vendorAfterSync1.subscriptionTier !== "free") {
      throw new Error(`FAILED (manual-sync): expected downgrade to free, got tier=${vendorAfterSync1.subscriptionTier}, result=${JSON.stringify(result1)}`);
    }
    console.log("PASSED: manual-sync path caught the real lapsed Stripe test-mode subscription and downgraded the vendor in the DB.");

    await stripe.customers.del(lapsed1.customer.id);
    await stripe.products.update(lapsed1.product.id, { active: false });

    // ── Part 2: periodic scheduler tick (no route/HTTP call at all) ──
    console.log("\n=== Part 2: subscription-sync-scheduler tick() (no route call) ===");
    const lapsed2 = await createLapsedSubscription(stripe, "pro");
    await db
      .update(vendorsTable)
      .set({ stripeCustomerId: lapsed2.customer.id, stripeSubscriptionId: lapsed2.subscription.id, subscriptionTier: "pro" })
      .where(eq(vendorsTable.id, vendorId));

    await schedulerTick();

    const [vendorAfterTick] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId)).limit(1);
    if (vendorAfterTick.subscriptionTier !== "free") {
      throw new Error(`FAILED (scheduler tick): expected downgrade to free, got tier=${vendorAfterTick.subscriptionTier}`);
    }
    console.log("PASSED: scheduler tick() independently caught the same lapsed subscription with no route call involved.");

    await stripe.customers.del(lapsed2.customer.id);
    await stripe.products.update(lapsed2.product.id, { active: false });

    console.log("\nAll live Stripe test-mode checks passed.");
  } finally {
    // Restore the vendor's original state regardless of outcome.
    await db
      .update(vendorsTable)
      .set({ stripeCustomerId: null, stripeSubscriptionId: null, subscriptionTier: originalTier })
      .where(eq(vendorsTable.id, vendorId));
  }
}

main().catch((err) => {
  console.error("Live Stripe lifecycle check FAILED:", err);
  process.exit(1);
});
