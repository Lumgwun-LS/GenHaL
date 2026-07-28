/**
 * Squad by GTBank — full API client.
 *
 * Covers:
 *  • Payment initiation & verification
 *  • NGN virtual accounts (dynamic + dedicated business)
 *  • USD virtual accounts
 *  • Bank transfers (payout)
 *  • Refunds
 *  • Bank list & account lookup
 *  • BVN / identity verification
 *  • Wallet balance
 *  • Disputes
 *  • Webhook signature verification
 *
 * Credentials resolved from:
 *  1. Platform DB (admin-configured)
 *  2. SQUAD_SECRET_KEY env var (dev fallback)
 */
import crypto from "crypto";
import { resolveGatewayField } from "./platform-gateways";

const SQUAD_LIVE_BASE    = "https://api-d.squadco.com";
const SQUAD_SANDBOX_BASE = "https://sandbox-api-d.squadco.com";

export function squadBase(secretKey: string): string {
  // Squad sandbox keys start with "sandbox_sk_" or "test_"
  return secretKey.startsWith("sandbox") || secretKey.startsWith("test")
    ? SQUAD_SANDBOX_BASE
    : SQUAD_LIVE_BASE;
}

/** Resolves the Squad secret key: platform DB first, then env-var fallback. */
export async function resolveSquadKey(): Promise<string> {
  const dbKey = await resolveGatewayField("squad" as never, "secretKey").catch(() => undefined);
  const key = dbKey || process.env.SQUAD_SECRET_KEY;
  if (!key) throw Object.assign(new Error("Squad is not configured. Add a Squad secret key in Admin → Payment Gateways."), { statusCode: 503 });
  return key;
}

async function squadFetch<T = unknown>(
  path: string,
  secretKey: string,
  options: RequestInit = {},
): Promise<T> {
  const base = squadBase(secretKey);
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { success?: boolean; message?: string; status?: number | string };
  if (!res.ok) {
    const msg = (data as { message?: string }).message ?? `Squad API error (HTTP ${res.status})`;
    throw Object.assign(new Error(msg), { statusCode: res.status, squadData: data });
  }
  return data;
}

// ── Payment ──────────────────────────────────────────────────────────────────

export interface SquadInitiatePaymentParams {
  email:        string;
  amount:       number;   // in kobo (NGN) or cents (USD)
  currency?:    "NGN" | "USD";
  initiateType?: "inline" | "redirect";
  callbackUrl:  string;
  transactionRef?: string;
  customerName?: string;
  metadata?:    Record<string, unknown>;
}
export async function squadInitiatePayment(secretKey: string, params: SquadInitiatePaymentParams) {
  return squadFetch<{ data: { checkout_url: string; transaction_ref: string; merchant_amount: number } }>(
    "/transaction/initiate",
    secretKey,
    { method: "POST", body: JSON.stringify(params) },
  );
}

export async function squadVerifyTransaction(secretKey: string, transactionRef: string) {
  return squadFetch<{ data: { transaction_status: string; amount: number; currency: string; email: string; transaction_ref: string; gateway_ref: string } }>(
    `/transaction/verify/${encodeURIComponent(transactionRef)}`,
    secretKey,
  );
}

// ── NGN Virtual Accounts ─────────────────────────────────────────────────────

/** Creates a dynamic (single-use) virtual account tied to a transaction. */
export async function squadCreateDynamicVirtualAccount(secretKey: string, params: {
  customerIdentifier: string; // unique per customer, e.g. email or vendor slug
  amount?:            number;  // if set, locks the account to this amount
  expiredDate?:       string;  // ISO date
  callbackUrl?:       string;
  isSingleUse?:       boolean;
}) {
  return squadFetch<{ data: { virtual_account_number: string; bank_name: string; beneficiary_name: string; expiry_date?: string } }>(
    "/virtual-account",
    secretKey,
    { method: "POST", body: JSON.stringify(params) },
  );
}

/** Creates a dedicated static virtual account for a business / merchant. */
export async function squadCreateDedicatedVirtualAccount(secretKey: string, params: {
  customerIdentifier: string;
  firstName:          string;
  lastName:           string;
  mobileNumber:       string;
  email:              string;
  bvn:                string;
  dob:                string;   // YYYY-MM-DD
  address:            string;
  gender:             "1" | "2"; // 1=Male 2=Female
  beneficiaryAccount?: string;
}) {
  return squadFetch<{ data: { virtual_account_number: string; bank_name: string; beneficiary_name: string; customer_identifier: string } }>(
    "/virtual-account/business",
    secretKey,
    { method: "POST", body: JSON.stringify(params) },
  );
}

/** Retrieves a virtual account by account number. */
export async function squadGetVirtualAccount(secretKey: string, virtualAccountNumber: string) {
  return squadFetch<{ data: { virtual_account_number: string; bank_name: string; beneficiary_name: string; customer_identifier: string } }>(
    `/virtual-account/${encodeURIComponent(virtualAccountNumber)}`,
    secretKey,
  );
}

/** Simulates a payment to a virtual account (sandbox only). */
export async function squadSimulateVirtualAccountPayment(secretKey: string, params: {
  virtual_account_number: string;
  amount: number;
}) {
  return squadFetch("/virtual-account/simulate/payment", secretKey, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ── USD Virtual Accounts ─────────────────────────────────────────────────────

export async function squadCreateUSDVirtualAccount(secretKey: string, params: {
  customerIdentifier: string;
  firstName:          string;
  lastName:           string;
  mobileNumber:       string;
  email:              string;
}) {
  return squadFetch<{ data: { virtual_account_number: string; bank_name: string; routing_number?: string; beneficiary_name: string } }>(
    "/virtual-account",
    secretKey,
    { method: "POST", body: JSON.stringify({ ...params, currency: "USD" }) },
  );
}

// ── Payouts / Bank Transfers ─────────────────────────────────────────────────

export async function squadInitiateTransfer(secretKey: string, params: {
  transactionRef:    string;
  amount:            number;   // kobo
  bankCode:          string;
  accountNumber:     string;
  accountName:       string;
  currencyId?:       "NGN";
  remark?:           string;
}) {
  return squadFetch<{ data: { transaction_reference: string; amount: number; status: string } }>(
    "/payout/initiate",
    secretKey,
    { method: "POST", body: JSON.stringify(params) },
  );
}

export async function squadGetTransferStatus(secretKey: string, transactionRef: string) {
  return squadFetch<{ data: { status: string; amount: number; account_number: string } }>(
    `/payout/${encodeURIComponent(transactionRef)}`,
    secretKey,
  );
}

export async function squadGetWalletBalance(secretKey: string, currencyId: "NGN" | "USD" = "NGN") {
  return squadFetch<{ data: { balance: number; currency_id: string } }>(
    `/merchant/balance?currency_id=${currencyId}`,
    secretKey,
  );
}

// ── Refunds ───────────────────────────────────────────────────────────────────

export async function squadRefundTransaction(secretKey: string, params: {
  gatewayTransactionRef: string;
  transactionRef:        string;
  refundType:            "full" | "partial";
  reasonForRefund:       string;
  amount?:               number; // required for partial refunds, in kobo
}) {
  return squadFetch<{ data: { refund_id: string; status: string } }>(
    "/transaction/refund",
    secretKey,
    { method: "POST", body: JSON.stringify(params) },
  );
}

// ── Bank / Account Lookup ─────────────────────────────────────────────────────

export async function squadListBanks(secretKey: string) {
  return squadFetch<{ data: Array<{ bank_code: string; bank_name: string }> }>(
    "/bank/list",
    secretKey,
  );
}

export async function squadVerifyBankAccount(secretKey: string, params: {
  bank_code:      string;
  account_number: string;
}) {
  return squadFetch<{ data: { account_name: string; account_number: string; bank_code: string; bank_name?: string } }>(
    "/bank/account/lookup",
    secretKey,
    { method: "POST", body: JSON.stringify(params) },
  );
}

// ── BVN / Identity ────────────────────────────────────────────────────────────

export async function squadVerifyBVN(secretKey: string, params: {
  bvn:          string;
  firstName?:   string;
  lastName?:    string;
  dateOfBirth?: string; // DD-MM-YYYY
  mobileNumber?: string;
  gender?:      "Male" | "Female";
}) {
  return squadFetch<{ data: { bvn: string; first_name: string; last_name: string; date_of_birth: string; phone_number: string; gender: string } }>(
    "/identity/bvn/lookup",
    secretKey,
    { method: "POST", body: JSON.stringify(params) },
  );
}

// ── Disputes ──────────────────────────────────────────────────────────────────

export async function squadInitiateDispute(secretKey: string, params: {
  ticketId:        string;
  amount:          number;
  transactionRef:  string;
  emailAddress:    string;
  reasonForDispute: string;
}) {
  return squadFetch<{ data: { ticket_id: string; status: string } }>(
    "/dispute/transaction/initiate",
    secretKey,
    { method: "POST", body: JSON.stringify(params) },
  );
}

// ── Webhook verification ───────────────────────────────────────────────────────

/**
 * Verifies Squad webhook signature.
 * Squad signs with HMAC-SHA512: Authorization header = `${signature_hash}`.
 */
export function verifySquadWebhookSignature(
  secretKey: string,
  rawBody: string,
  signatureHeader: string,
): boolean {
  const expected = crypto
    .createHmac("sha512", secretKey)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected.toUpperCase()),
    Buffer.from(signatureHeader.toUpperCase()),
  );
}
