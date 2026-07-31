/**
 * NOWPayments API client — USDT (and other crypto) payments.
 * Docs: https://documenter.getpostman.com/view/7907941/2s93JusNJt
 *
 * We use the Invoice endpoint so customers land on a hosted payment page
 * (same UX pattern as Stripe Checkout / Squad), rather than showing a raw
 * wallet address in the UI.
 */

import { createHmac } from "node:crypto";

const BASE_URL = "https://api.nowpayments.io/v1";

function apiKey(): string {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) throw new Error("NOWPAYMENTS_API_KEY is not configured");
  return key;
}

function ipnSecret(): string {
  const s = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!s) throw new Error("NOWPAYMENTS_IPN_SECRET is not configured");
  return s;
}

async function nowFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      "x-api-key": apiKey(),
      "Content-Type": "application/json",
      ...(opts?.headers ?? {}),
    },
  });
  const data = await res.json() as T & { message?: string; code?: string };
  if (!res.ok) {
    throw new Error(`NOWPayments error ${res.status}: ${(data as { message?: string }).message ?? JSON.stringify(data)}`);
  }
  return data;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NowInvoiceParams {
  priceAmount:   number;          // in priceCurrency units
  priceCurrency: string;          // "usd" | "ngn" etc.
  payCurrency:   string;          // "usdttrc20" | "usdterc20" | "usdtbsc" etc.
  orderId:       string;          // your reference (e.g. "ORDER-42")
  orderDescription?: string;
  ipnCallbackUrl: string;
  successUrl?:   string;
  cancelUrl?:    string;
  customerEmail?: string;
}

export interface NowInvoiceResponse {
  id:          string;
  invoice_url: string;
  order_id:    string;
  status:      string;
}

export interface NowPaymentStatus {
  payment_id:     string;
  payment_status: string;   // "waiting" | "confirming" | "confirmed" | "finished" | "failed" | "expired"
  price_amount:   number;
  price_currency: string;
  pay_amount:     number;
  pay_currency:   string;
  order_id:       string;
  order_description?: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates a hosted invoice (payment page) for a USDT payment.
 * Returns the invoice URL to redirect the customer to.
 */
export async function createNowInvoice(params: NowInvoiceParams): Promise<NowInvoiceResponse> {
  return nowFetch<NowInvoiceResponse>("/invoice", {
    method: "POST",
    body: JSON.stringify({
      price_amount:       params.priceAmount,
      price_currency:     params.priceCurrency.toLowerCase(),
      pay_currency:       params.payCurrency.toLowerCase(),
      order_id:           params.orderId,
      order_description:  params.orderDescription,
      ipn_callback_url:   params.ipnCallbackUrl,
      success_url:        params.successUrl,
      cancel_url:         params.cancelUrl,
      is_fixed_rate:      false,
      is_fee_paid_by_user: false,
      customer_email:     params.customerEmail,
    }),
  });
}

/** Fetches the current status of a payment by payment_id. */
export async function getNowPaymentStatus(paymentId: string): Promise<NowPaymentStatus> {
  return nowFetch<NowPaymentStatus>(`/payment/${paymentId}`);
}

/**
 * Verifies the IPN webhook signature.
 * NOWPayments sorts the JSON body keys alphabetically, then HMAC-SHA512 signs it.
 * Returns true if the signature matches.
 */
export function verifyNowWebhookSignature(
  rawBody: Record<string, unknown>,
  signatureHeader: string,
): boolean {
  try {
    const secret = ipnSecret();
    // Sort keys alphabetically and re-stringify
    const sorted = JSON.stringify(
      Object.fromEntries(Object.entries(rawBody).sort(([a], [b]) => a.localeCompare(b))),
    );
    const expected = createHmac("sha512", secret).update(sorted).digest("hex");
    return expected === signatureHeader;
  } catch {
    return false;
  }
}

/** Maps NOWPayments payment_status to our internal status. */
export function mapNowStatus(nowStatus: string): "pending" | "paid" | "failed" | null {
  switch (nowStatus) {
    case "finished":
    case "confirmed":
      return "paid";
    case "failed":
    case "expired":
      return "failed";
    case "waiting":
    case "confirming":
    case "sending":
    case "partially_paid":
      return "pending";
    default:
      return null;
  }
}
