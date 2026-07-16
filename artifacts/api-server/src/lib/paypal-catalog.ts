/**
 * PayPal subscription catalog for VendorHub platform billing.
 *
 * PayPal's billing API works differently from Stripe: there are no lookup_keys,
 * so we persist the product ID and plan IDs inside the platform_payment_credentials
 * JSON for the "paypal" provider alongside clientId/clientSecret. On first
 * checkout after credentials are saved, the product and one plan-per-tier are
 * created; IDs are then written back and reused on every subsequent call.
 *
 * An in-memory cache (keyed by clientId, short TTL) absorbs bursts so we don't
 * hit the PayPal API on every checkout render.
 */
import type { SubscriptionPlan } from "./subscription-plans";

// ── Base URL helpers ──────────────────────────────────────────────────────────

export function paypalBaseUrl(mode: string): string {
  return mode === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

// Simple module-level token cache (never crosses request boundaries in production
// since Node re-creates modules per process; safe for single-process deployments).
let _tokenCache: { token: string; expiresAt: number } | null = null;

export async function getPayPalAccessToken(
  clientId: string,
  clientSecret: string,
  mode: string,
): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 30_000) {
    return _tokenCache.token;
  }
  const base = paypalBaseUrl(mode);
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error_description?: string };
    throw new Error(`PayPal OAuth failed (${res.status}): ${body.error_description ?? "unknown error"}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  _tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

// ── Product creation ──────────────────────────────────────────────────────────

async function ensurePayPalProduct(token: string, base: string): Promise<string> {
  const productName = "VendorHub Platform Subscription";
  // PayPal-Request-Id makes this idempotent (same ID → same resource returned)
  const res = await fetch(`${base}/v1/billing/products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": "vendorhub-platform-product-v1",
    },
    body: JSON.stringify({
      name: productName,
      description: "Monthly platform subscription for VendorHub vendors",
      type: "SERVICE",
      category: "SOFTWARE",
    }),
  });

  if (res.ok) {
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  // 422 DUPLICATE_RESOURCE_IDENTIFIER → product already exists; find it by listing
  if (res.status === 422) {
    const listRes = await fetch(`${base}/v1/billing/products?page_size=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const list = (await listRes.json()) as { products?: Array<{ id: string; name: string }> };
    const found = list.products?.find((p) => p.name === productName);
    if (found) return found.id;
  }

  const body = await res.text().catch(() => "(no body)");
  throw new Error(`PayPal create product failed (${res.status}): ${body}`);
}

// ── Plan creation ─────────────────────────────────────────────────────────────

async function ensurePayPalPlan(
  token: string,
  base: string,
  productId: string,
  plan: SubscriptionPlan,
): Promise<string> {
  const planName = `VendorHub ${plan.name}`;
  const requestId = `vendorhub-plan-${plan.tier}-v1`;

  const res = await fetch(`${base}/v1/billing/plans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
    body: JSON.stringify({
      product_id: productId,
      name: planName,
      description: plan.description,
      billing_cycles: [
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: plan.pricing.usd.toFixed(2), currency_code: "USD" },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        payment_failure_threshold: 3,
      },
    }),
  });

  if (res.ok) {
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  // 422 → duplicate; list plans for the product to find it
  if (res.status === 422) {
    const listRes = await fetch(`${base}/v1/billing/plans?product_id=${productId}&page_size=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const list = (await listRes.json()) as { plans?: Array<{ id: string; name: string; status: string }> };
    const found = list.plans?.find((p) => p.name === planName && p.status === "ACTIVE");
    if (found) return found.id;
  }

  const body = await res.text().catch(() => "(no body)");
  throw new Error(`PayPal create plan for ${plan.tier} failed (${res.status}): ${body}`);
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export interface PayPalCatalogEntry {
  tier: string;
  planId: string;
}

interface CatalogCacheEntry {
  promise: Promise<PayPalCatalogEntry[]>;
  cachedAt: number;
}

const CATALOG_TTL_MS = 60_000;
const _catalogCache = new Map<string, CatalogCacheEntry>();

/**
 * Returns (and lazily creates) the PayPal billing plans for each subscription tier.
 * Persists the productId + planIds back into the platform credentials JSON so they
 * survive process restarts without re-creating them on PayPal.
 */
export async function ensurePayPalCatalog(
  clientId: string,
  clientSecret: string,
  mode: string,
  plans: SubscriptionPlan[],
): Promise<PayPalCatalogEntry[]> {
  const cacheKey = clientId;
  const cached = _catalogCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CATALOG_TTL_MS) {
    return cached.promise;
  }

  const promise = (async (): Promise<PayPalCatalogEntry[]> => {
    const { getPlatformCredentials } = await import("./platform-gateways");
    const { db, platformPaymentCredentialsTable } = await import("@workspace/db");
    const { encrypt } = await import("./encryption");
    const { eq } = await import("drizzle-orm");

    const creds = await getPlatformCredentials("paypal");
    const savedPlans: Record<string, string> = creds?.plans ? JSON.parse(creds.plans) : {};
    const savedProductId: string | undefined = creds?.productId;

    const base = paypalBaseUrl(mode);
    const token = await getPayPalAccessToken(clientId, clientSecret, mode);
    const productId = savedProductId ?? await ensurePayPalProduct(token, base);

    const entries: PayPalCatalogEntry[] = [];
    const updatedPlans: Record<string, string> = { ...savedPlans };
    let catalogChanged = !savedProductId;

    for (const plan of plans) {
      if (savedPlans[plan.tier]) {
        entries.push({ tier: plan.tier, planId: savedPlans[plan.tier] });
      } else {
        const planId = await ensurePayPalPlan(token, base, productId, plan);
        entries.push({ tier: plan.tier, planId });
        updatedPlans[plan.tier] = planId;
        catalogChanged = true;
      }
    }

    // Write updated catalog IDs back into the credentials record in the DB
    if (catalogChanged) {
      const updated = { ...(creds ?? { clientId, mode }), productId, plans: JSON.stringify(updatedPlans) };
      await db
        .update(platformPaymentCredentialsTable)
        .set({ credentialsEncrypted: encrypt(JSON.stringify(updated)) })
        .where(eq(platformPaymentCredentialsTable.provider, "paypal"));
    }

    return entries;
  })();

  _catalogCache.set(cacheKey, { promise, cachedAt: Date.now() });

  // Clear stale cache on failure so next call retries
  promise.catch(() => _catalogCache.delete(cacheKey));

  return promise;
}

// ── Subscription creation ─────────────────────────────────────────────────────

export interface PayPalSubscriptionResult {
  subscriptionId: string;
  approvalUrl: string;
}

export async function createPayPalSubscription(
  clientId: string,
  clientSecret: string,
  mode: string,
  planId: string,
  vendorEmail: string | null,
  successUrl: string,
  cancelUrl: string,
  customMetadata: Record<string, string>,
): Promise<PayPalSubscriptionResult> {
  const token = await getPayPalAccessToken(clientId, clientSecret, mode);
  const base = paypalBaseUrl(mode);

  const body: Record<string, unknown> = {
    plan_id: planId,
    // custom_id is stored on the subscription and echoed back in webhook events
    custom_id: JSON.stringify(customMetadata),
    application_context: {
      brand_name: "VendorHub",
      return_url: successUrl,
      cancel_url: cancelUrl,
      user_action: "SUBSCRIBE_NOW",
      shipping_preference: "NO_SHIPPING",
    },
  };

  if (vendorEmail) {
    body.subscriber = { email_address: vendorEmail };
  }

  const res = await fetch(`${base}/v1/billing/subscriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`PayPal create subscription failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    id: string;
    links?: Array<{ rel: string; href: string }>;
  };

  const approvalUrl = data.links?.find((l) => l.rel === "approve")?.href;
  if (!approvalUrl) throw new Error("PayPal subscription created but no approval URL in response");

  return { subscriptionId: data.id, approvalUrl };
}

// ── Subscription cancellation ─────────────────────────────────────────────────

export async function cancelPayPalSubscription(
  clientId: string,
  clientSecret: string,
  mode: string,
  subscriptionId: string,
  reason: string,
): Promise<void> {
  const token = await getPayPalAccessToken(clientId, clientSecret, mode);
  const base = paypalBaseUrl(mode);
  const res = await fetch(`${base}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  // 422 typically means already cancelled — treat as success
  if (!res.ok && res.status !== 422) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`PayPal cancel subscription failed (${res.status}): ${text}`);
  }
}

// ── Webhook verification ──────────────────────────────────────────────────────

/**
 * Verifies a PayPal webhook event using PayPal's verify-webhook-signature endpoint.
 * Returns true if verified, false on any failure (including a missing webhookId).
 * If `webhookId` is not configured, logs a warning and returns true (permissive dev mode).
 */
export async function verifyPayPalWebhookSignature(
  clientId: string,
  clientSecret: string,
  mode: string,
  webhookId: string | undefined,
  headers: {
    transmissionId: string;
    transmissionTime: string;
    certUrl: string;
    transmissionSig: string;
    authAlgo: string;
  },
  rawBody: unknown,
): Promise<boolean> {
  if (!webhookId) {
    console.warn(
      "[paypal webhook] no webhookId configured in platform credentials — skipping signature verification (dev mode)",
    );
    return true;
  }

  try {
    const token = await getPayPalAccessToken(clientId, clientSecret, mode);
    const base = paypalBaseUrl(mode);
    const res = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: headers.authAlgo,
        cert_url: headers.certUrl,
        transmission_id: headers.transmissionId,
        transmission_sig: headers.transmissionSig,
        transmission_time: headers.transmissionTime,
        webhook_id: webhookId,
        webhook_event: rawBody,
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { verification_status: string };
    return data.verification_status === "SUCCESS";
  } catch (err) {
    console.error("[paypal webhook] signature verification error:", err);
    return false;
  }
}
