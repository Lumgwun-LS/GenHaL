/**
 * Interswitch — full API client.
 *
 * Covers:
 *  • OAuth2 token (client_credentials)
 *  • Payment initiation (Webpay / Quickteller)
 *  • Transaction requery / status
 *  • Virtual accounts (wallet assignment)
 *  • Bank transfers (Quickteller Send Money)
 *  • Account verification (bank account name lookup)
 *  • BVN verification
 *  • Refund (Quickteller)
 *  • Dedicated account assignment
 *
 * Credentials from env vars:
 *  INTERSWITCH_CLIENT_ID, INTERSWITCH_SECRET_KEY, INTERSWITCH_ENV (sandbox|production)
 *  INTERSWITCH_MERCHANT_CODE, INTERSWITCH_PAY_ITEM_ID
 *
 * or from platform DB credentials (admin-configured).
 */
import crypto from "crypto";

const IS_ENV = process.env.INTERSWITCH_ENV ?? "sandbox";
const SANDBOX_BASE    = "https://sandbox.interswitchng.com";
const PRODUCTION_BASE = "https://api.interswitchng.com";

export function interswitchBase(env?: string): string {
  return (env ?? IS_ENV) === "production" ? PRODUCTION_BASE : SANDBOX_BASE;
}

export interface InterswitchCreds {
  clientId:     string;
  secretKey:    string;
  merchantCode: string;
  payItemId:    string;
  env?:         string;
}

/** Resolves Interswitch creds from env vars (or caller can supply them from DB). */
export function resolveInterswitchCreds(): InterswitchCreds {
  const clientId     = process.env.INTERSWITCH_CLIENT_ID;
  const secretKey    = process.env.INTERSWITCH_SECRET_KEY;
  const merchantCode = process.env.INTERSWITCH_MERCHANT_CODE;
  const payItemId    = process.env.INTERSWITCH_PAY_ITEM_ID;
  if (!clientId || !secretKey || !merchantCode || !payItemId) {
    throw Object.assign(
      new Error("Interswitch is not fully configured. Ensure INTERSWITCH_CLIENT_ID, INTERSWITCH_SECRET_KEY, INTERSWITCH_MERCHANT_CODE and INTERSWITCH_PAY_ITEM_ID are set."),
      { statusCode: 503 },
    );
  }
  return { clientId, secretKey, merchantCode, payItemId, env: IS_ENV };
}

// ── OAuth2 token ──────────────────────────────────────────────────────────────

/** In-memory token cache — avoids hammering the token endpoint. */
let _tokenCache: { token: string; expiresAt: number } | null = null;

export async function getInterswitchToken(creds: InterswitchCreds): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 30_000) {
    return _tokenCache.token;
  }
  const base = interswitchBase(creds.env);
  const res = await fetch(`${base}/passport/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.secretKey}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw Object.assign(new Error(`Interswitch auth failed (${res.status}): ${body}`), { statusCode: 502 });
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  _tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

async function isFetch<T = unknown>(path: string, token: string, creds: InterswitchCreds, options: RequestInit = {}): Promise<T> {
  const base = interswitchBase(creds.env);
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const msg = (data as { responseDescription?: string; message?: string }).responseDescription
      ?? (data as { message?: string }).message
      ?? `Interswitch API error (HTTP ${res.status})`;
    throw Object.assign(new Error(msg), { statusCode: res.status, isData: data });
  }
  return data;
}

// ── Payment initiation ────────────────────────────────────────────────────────

/**
 * Builds the payment initiation payload for Webpay/Quickteller redirect.
 * The frontend redirects the customer to the returned URL.
 */
export function buildInterswitchPaymentUrl(creds: InterswitchCreds, params: {
  transactionRef: string;
  amount:         number;   // in kobo
  customerId:     string;
  customerEmail?: string;
  callbackUrl:    string;
  currencyCode?:  string;   // default "566" (NGN), "840" (USD)
}) {
  const base = interswitchBase(creds.env);
  const {
    transactionRef, amount, customerId, customerEmail,
    callbackUrl, currencyCode = "566",
  } = params;

  // Interswitch WebPay uses a hash for request integrity.
  // Hash = SHA512(transactionRef + merchantCode + payItemId + amount + hashKey)
  const hash = crypto
    .createHash("sha512")
    .update(`${transactionRef}${creds.merchantCode}${creds.payItemId}${amount}${creds.secretKey}`)
    .digest("hex");

  const qs = new URLSearchParams({
    productid:    creds.payItemId,
    merchantcode: creds.merchantCode,
    pay_item_id:  creds.payItemId,
    amount:       String(amount),
    transactionreference: transactionRef,
    hash,
    redirect_url: callbackUrl,
    site_redirect_url: callbackUrl,
    currency:     currencyCode,
    customerid:   customerId,
    ...(customerEmail ? { customeremail: customerEmail } : {}),
  });

  return {
    url:    `${base}/collections/api/v1/gettransaction.json?${qs.toString()}`,
    checkoutUrl: `${base}/webpay/pay?${qs.toString()}`,
    hash,
    transactionRef,
  };
}

// ── Transaction requery ───────────────────────────────────────────────────────

export async function interswitchQueryTransaction(
  creds: InterswitchCreds,
  transactionRef: string,
) {
  const token = await getInterswitchToken(creds);
  return isFetch<{
    ResponseCode: string;
    ResponseDescription: string;
    TransactionRef: string;
    Amount: string;
    MerchantStoreId: string;
  }>(
    `/collections/api/v1/gettransaction.json?merchantcode=${creds.merchantCode}&transactionreference=${encodeURIComponent(transactionRef)}&amount=0`,
    token,
    creds,
    { method: "GET" },
  );
}

// ── Virtual accounts ──────────────────────────────────────────────────────────

/**
 * Creates / assigns a dedicated virtual account (wallet) via Quickteller.
 * Returns the account number and bank details.
 */
export async function interswitchCreateVirtualAccount(creds: InterswitchCreds, params: {
  phoneNumber:  string;
  lastName:     string;
  otherNames:   string;
  email?:       string;
  bvn?:         string;
}) {
  const token = await getInterswitchToken(creds);
  return isFetch<{
    responseCode: string;
    responseDescription: string;
    walletId: string;
    accountNumber: string;
    bankCode: string;
    bankName: string;
    accountName: string;
  }>(
    "/api/v1/quickteller/customers",
    token,
    creds,
    { method: "POST", body: JSON.stringify(params) },
  );
}

export async function interswitchGetWalletBalance(creds: InterswitchCreds, walletId: string) {
  const token = await getInterswitchToken(creds);
  return isFetch<{ balance: string; currency: string; walletId: string }>(
    `/api/v1/quickteller/wallets/${encodeURIComponent(walletId)}/balance`,
    token,
    creds,
  );
}

// ── Bank transfers (Send Money) ───────────────────────────────────────────────

export async function interswitchSendMoney(creds: InterswitchCreds, params: {
  terminalId?:         string;
  requestRef:          string;
  amount:              number;       // in kobo
  beneficiaryAccount:  string;
  beneficiaryBankCode: string;
  beneficiaryName:     string;
  senderName:          string;
  narration?:          string;
  currencyCode?:       string;       // default "566"
}) {
  const token = await getInterswitchToken(creds);
  return isFetch<{
    responseCode: string;
    responseDescription: string;
    transactionRef: string;
    amount: string;
  }>(
    "/api/v1/quickteller/payments/transfers",
    token,
    creds,
    {
      method: "POST",
      body: JSON.stringify({
        ...params,
        currencyCode: params.currencyCode ?? "566",
        terminalId:   params.terminalId ?? creds.merchantCode,
      }),
    },
  );
}

export async function interswitchQueryTransfer(creds: InterswitchCreds, requestRef: string) {
  const token = await getInterswitchToken(creds);
  return isFetch<{ responseCode: string; responseDescription: string; transactionRef: string }>(
    `/api/v1/quickteller/payments/transfers/${encodeURIComponent(requestRef)}`,
    token,
    creds,
  );
}

// ── Account verification ──────────────────────────────────────────────────────

export async function interswitchVerifyAccount(creds: InterswitchCreds, params: {
  bankCode:      string;
  accountNumber: string;
}) {
  const token = await getInterswitchToken(creds);
  return isFetch<{
    accountName:   string;
    accountNumber: string;
    bankCode:      string;
    responseCode:  string;
    responseDescription: string;
  }>(
    `/api/v1/quickteller/customers/beneficiaries?bankcode=${params.bankCode}&accountid=${params.accountNumber}`,
    token,
    creds,
  );
}

// ── BVN verification ──────────────────────────────────────────────────────────

export async function interswitchVerifyBVN(creds: InterswitchCreds, bvn: string) {
  const token = await getInterswitchToken(creds);
  return isFetch<{
    bvn: string; firstName: string; lastName: string;
    dateOfBirth: string; phoneNumber: string; gender: string;
    responseCode: string; responseDescription: string;
  }>(
    `/api/v1/identity/bvn/${encodeURIComponent(bvn)}`,
    token,
    creds,
  );
}

// ── Refunds ───────────────────────────────────────────────────────────────────

export async function interswitchRefund(creds: InterswitchCreds, params: {
  requestRef:      string;
  transactionRef:  string;
  amount:          number;  // kobo
  reason?:         string;
}) {
  const token = await getInterswitchToken(creds);
  return isFetch<{ responseCode: string; responseDescription: string; transactionRef: string }>(
    "/api/v1/quickteller/payments/refunds",
    token,
    creds,
    { method: "POST", body: JSON.stringify(params) },
  );
}

// ── Webhook signature verification ───────────────────────────────────────────

/**
 * Verifies Interswitch webhook / callback payload integrity.
 * Hash = SHA512(merchantCode + transactionRef + amount + secretKey)
 */
export function verifyInterswitchHash(
  creds: InterswitchCreds,
  transactionRef: string,
  amount: string | number,
  providedHash: string,
): boolean {
  const expected = crypto
    .createHash("sha512")
    .update(`${creds.merchantCode}${transactionRef}${amount}${creds.secretKey}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected.toLowerCase()),
      Buffer.from(providedHash.toLowerCase()),
    );
  } catch {
    return false;
  }
}
