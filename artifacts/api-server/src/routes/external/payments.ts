/**
 * /external/payments — payment initiation bridge for Awajimaa app users.
 *
 * POST /external/payments/initialize
 *   Auto-selects Stripe or Paystack based on the currency field in the request.
 *   Currencies handled by Paystack: NGN, GHS, ZAR, KES.
 *   Everything else routes to Stripe.
 *
 *   Key resolution order:
 *     1. Vendor's own key (if tier-eligible and test-passed)
 *     2. Platform key from environment
 *     3. 503 if neither is available
 */

import { Router } from "express";
import { db, ordersTable, paymentsTable, vendorsTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireExternalAuth } from "../../middlewares/requireExternalAuth";
import Stripe from "stripe";
import crypto from "crypto";
import { resolveStripeKey, resolvePaystackKey } from "../../lib/vendor-keys";

/** Statuses from which a payment can still be cancelled or retried. */
const OPEN_STATUSES = new Set(["pending", "failed"]);

const router = Router();
router.use(requireExternalAuth);

const PAYSTACK_CURRENCIES = new Set(["NGN", "GHS", "ZAR", "KES"]);
const PAYSTACK_BASE = "https://api.paystack.co";

/**
 * GET /external/payments
 * Lists the authenticated vendor's payment history, most recent first.
 * Used by the mobile app for the Payments screen and dashboard summary —
 * clients should poll this (short interval) while any payment is "pending"
 * to reflect webhook-driven status changes in near-real-time.
 */
router.get("/payments", async (req, res) => {
  const { vendorId } = req.externalUser!;
  const payments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.vendorId, vendorId))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(100);
  res.json(payments);
});

function selectProvider(
  currency: string,
  vendor: { stripeEnabled: boolean; paystackEnabled: boolean },
): "stripe" | "paystack" | null {
  const wantsPaystack = PAYSTACK_CURRENCIES.has(currency.toUpperCase());
  if (wantsPaystack && vendor.paystackEnabled) return "paystack";
  if (vendor.stripeEnabled) return "stripe";
  if (vendor.paystackEnabled) return "paystack";
  return null;
}

type InitializeInput = {
  orderId?: number | null;
  amount: number;
  currency?: string;
  email?: string;
  callbackUrl?: string;
  successUrl?: string;
  cancelUrl?: string;
  description?: string;
};

type InitializeResult =
  | { ok: true; body: { provider: "stripe" | "paystack"; paymentId: number; url: string | null; reference: string } }
  | { ok: false; status: number; error: string };

/**
 * Shared checkout-initiation logic used by both a fresh checkout
 * (POST /payments/initialize) and a retry of an existing payment
 * (POST /payments/:id/retry).
 */
async function initializeCheckout(vendorId: number, input: InitializeInput): Promise<InitializeResult> {
  const { orderId, amount, currency: reqCurrency, email, callbackUrl, successUrl, cancelUrl, description } = input;

  if (!amount) return { ok: false, status: 400, error: "amount is required" };

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) return { ok: false, status: 404, error: "Vendor not found" };

  const currency = (reqCurrency ?? vendor.defaultCurrency ?? "USD").toUpperCase();
  const provider = selectProvider(currency, vendor);

  if (!provider) {
    return { ok: false, status: 503, error: "No payment gateway is enabled for this vendor. Contact the vendor admin." };
  }

  if (provider === "stripe") {
    let stripeKey: string;
    try {
      stripeKey = await resolveStripeKey(vendorId, vendor);
    } catch (err: unknown) {
      return { ok: false, status: 503, error: err instanceof Error ? err.message : String(err) };
    }

    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: Math.round(amount * 100),
          product_data: { name: description ?? `Order #${orderId ?? ""}` },
        },
      }],
      success_url: successUrl ?? callbackUrl ?? "https://vendorhub.app/success",
      cancel_url: cancelUrl ?? callbackUrl ?? "https://vendorhub.app/cancel",
      metadata: {
        orderId: orderId?.toString() ?? "",
        vendorId: vendorId.toString(),
        source: "awajimaa",
      },
    });

    const [payment] = await db.insert(paymentsTable).values({
      orderId: orderId ?? null,
      vendorId,
      provider: "stripe",
      providerReference: session.id,
      amount: amount.toString(),
      currency,
      status: "pending",
      metadata: { sessionId: session.id, sessionUrl: session.url, source: "awajimaa" },
    }).returning();

    return { ok: true, body: { provider: "stripe", paymentId: payment!.id, url: session.url, reference: session.id } };
  }

  // ── Paystack ──────────────────────────────────────────────────────────────
  if (!email) return { ok: false, status: 400, error: "email is required for Paystack payments" };

  let paystackKey: string;
  try {
    paystackKey = await resolvePaystackKey(vendorId, vendor);
  } catch (err: unknown) {
    return { ok: false, status: 503, error: err instanceof Error ? err.message : String(err) };
  }

  const paystackRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: Math.round(amount * 100),
      currency,
      callback_url: callbackUrl,
      metadata: {
        orderId: orderId?.toString() ?? "",
        vendorId: vendorId.toString(),
        source: "awajimaa",
        description: description ?? `Order #${orderId ?? ""}`,
      },
    }),
  });

  const paystackData = (await paystackRes.json()) as {
    status: boolean;
    message: string;
    data?: { authorization_url: string; access_code: string; reference: string };
  };

  if (!paystackData.status || !paystackData.data) {
    return { ok: false, status: 502, error: `Paystack error: ${paystackData.message}` };
  }

  const { authorization_url, reference } = paystackData.data;

  const [payment] = await db.insert(paymentsTable).values({
    orderId: orderId ?? null,
    vendorId,
    provider: "paystack",
    providerReference: reference,
    amount: amount.toString(),
    currency,
    status: "pending",
    metadata: { reference, authorization_url, source: "awajimaa" },
  }).returning();

  return { ok: true, body: { provider: "paystack", paymentId: payment!.id, url: authorization_url, reference } };
}

/**
 * Attempts to void/expire the provider's checkout session for a payment that
 * is being cancelled (or superseded by a retry). This is best-effort: if the
 * provider call fails, or the provider doesn't support voiding, we log it
 * for follow-up but still let the local cancellation proceed — a stale but
 * non-payable session is a much smaller problem than blocking the vendor
 * from cancelling at all.
 *
 * Provider support:
 *   - Stripe: checkout.sessions.expire — fully supported for open sessions.
 *   - Paystack: no API to void/expire an initialized transaction before the
 *     customer completes it; the authorization link simply becomes unusable
 *     once we stop honoring it locally, so this is a documented no-op.
 */
async function voidProviderSession(
  vendorId: number,
  payment: { id: number; provider: string; providerReference: string; metadata: unknown },
): Promise<void> {
  if (payment.provider !== "stripe") return; // Paystack: no void endpoint; nothing to do.

  try {
    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
    if (!vendor) return;

    const stripeKey = await resolveStripeKey(vendorId, vendor);
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(payment.providerReference);
    if (session.status === "open") {
      await stripe.checkout.sessions.expire(payment.providerReference);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[payments] failed to void stripe checkout session for payment=${payment.id} reference=${payment.providerReference}:`,
      message,
    );
    await db
      .update(paymentsTable)
      .set({
        metadata: {
          ...((payment.metadata ?? {}) as Record<string, unknown>),
          voidError: message,
          voidErrorAt: new Date().toISOString(),
        },
      })
      .where(eq(paymentsTable.id, payment.id));
  }
}

router.post("/payments/initialize", async (req, res): Promise<void> => {
  const { vendorId } = req.externalUser!;
  const result = await initializeCheckout(vendorId, req.body ?? {});
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.json(result.body);
});

/**
 * POST /external/payments/:id/cancel
 * Cancels a pending or failed payment the vendor started but no longer wants
 * (e.g. a stale checkout with no webhook confirmation after 24h). Also asks
 * the provider to void/expire the underlying checkout session (where
 * supported) so the customer's original checkout link stops being payable,
 * rather than just relying on it expiring on its own.
 */
router.post("/payments/:id/cancel", async (req, res): Promise<void> => {
  const { vendorId } = req.externalUser!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid payment id" }); return; }

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.id, id), eq(paymentsTable.vendorId, vendorId)));

  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  if (!OPEN_STATUSES.has(payment.status)) {
    res.status(409).json({ error: `Payment is ${payment.status} and can no longer be cancelled` });
    return;
  }

  await voidProviderSession(vendorId, payment);

  const [updated] = await db
    .update(paymentsTable)
    .set({ status: "cancelled" })
    .where(eq(paymentsTable.id, id))
    .returning();

  res.json(updated);
});

/**
 * POST /external/payments/:id/retry
 * Starts a brand-new checkout session for the same order/amount/currency as
 * an existing pending or failed payment, then marks the original as
 * cancelled (superseded) so it stops showing as an open payment — and voids
 * the original provider session (where supported) so it can't also be paid.
 */
router.post("/payments/:id/retry", async (req, res): Promise<void> => {
  const { vendorId } = req.externalUser!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid payment id" }); return; }

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.id, id), eq(paymentsTable.vendorId, vendorId)));

  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  if (!OPEN_STATUSES.has(payment.status)) {
    res.status(409).json({ error: `Payment is ${payment.status} and can no longer be retried` });
    return;
  }

  let email: string | undefined;
  let description: string | undefined;
  if (payment.orderId) {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, payment.orderId));
    if (order) {
      email = order.customerEmail;
      description = `Order #${order.id} — ${order.customerName}`;
    }
  }

  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  if (!email && typeof meta.email === "string") email = meta.email;

  const result = await initializeCheckout(vendorId, {
    orderId: payment.orderId,
    amount: Number(payment.amount),
    currency: payment.currency,
    email,
    description,
  });

  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }

  await voidProviderSession(vendorId, payment);
  await db.update(paymentsTable).set({ status: "cancelled" }).where(eq(paymentsTable.id, id));

  res.json(result.body);
});

export default router;
