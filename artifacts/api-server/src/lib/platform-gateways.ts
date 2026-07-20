/**
 * Platform-level (admin-managed) payment gateway credentials.
 *
 * Admins configure gateway credentials from the dashboard instead of (or in
 * addition to) environment secrets. Each provider defines which credential
 * fields it needs and how to validate them with a lightweight connectivity
 * check before they're saved.
 */
import { db } from "@workspace/db";
import { platformPaymentCredentialsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "./encryption";
import { sendSlackAlert } from "./slack";

export const GATEWAY_PROVIDERS = ["stripe", "paystack", "paypal", "remita", "flutterwave", "nomba"] as const;
export type GatewayProvider = (typeof GATEWAY_PROVIDERS)[number];

export interface GatewayFieldDef {
  key: string;
  label: string;
  secret: boolean; // whether to mask this field when displaying status
  optional?: boolean; // if true, the field may be omitted when saving credentials
}

export interface GatewayDef {
  label: string;
  fields: GatewayFieldDef[];
  /** Throws if the credentials are invalid. Should perform a real API call where feasible. */
  test: (creds: Record<string, string>) => Promise<void>;
  /** True if `test` performs a live network call vs. a format-only check. */
  liveVerification: boolean;
}

const PAYSTACK_BASE = "https://api.paystack.co";

export const GATEWAY_DEFS: Record<GatewayProvider, GatewayDef> = {
  stripe: {
    label: "Stripe",
    fields: [
      { key: "secretKey", label: "Secret key", secret: true },
      { key: "webhookSecret", label: "Webhook signing secret", secret: true },
      { key: "fallbackSecretKey", label: "Fallback secret key (optional — used if primary key is restricted)", secret: true, optional: true },
    ],
    liveVerification: true,
    test: async (creds) => {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(creds.secretKey);
      await stripe.balance.retrieve();
      // Also validate the fallback key if provided
      if (creds.fallbackSecretKey?.trim()) {
        const stripe2 = new Stripe(creds.fallbackSecretKey);
        await stripe2.balance.retrieve();
      }
    },
  },
  paystack: {
    label: "Paystack",
    fields: [
      { key: "secretKey", label: "Secret key", secret: true },
      { key: "webhookSecret", label: "Webhook secret", secret: true },
    ],
    liveVerification: true,
    test: async (creds) => {
      const res = await fetch(`${PAYSTACK_BASE}/bank?perPage=1`, {
        headers: { Authorization: `Bearer ${creds.secretKey}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Paystack rejected the key (HTTP ${res.status})`);
      }
    },
  },
  flutterwave: {
    label: "Flutterwave",
    fields: [
      { key: "publicKey", label: "Public key", secret: false },
      { key: "secretKey", label: "Secret key", secret: true },
      { key: "webhookSecretHash", label: "Webhook secret hash", secret: true },
    ],
    liveVerification: true,
    test: async (creds) => {
      const res = await fetch("https://api.flutterwave.com/v3/balances", {
        headers: { Authorization: `Bearer ${creds.secretKey}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Flutterwave rejected the key (HTTP ${res.status})`);
      }
    },
  },
  nomba: {
    label: "Nomba",
    fields: [
      { key: "accountId", label: "Account ID", secret: false },
      { key: "clientId", label: "Client ID", secret: false },
      { key: "clientSecret", label: "Client secret", secret: true },
    ],
    liveVerification: true,
    test: async (creds) => {
      const res = await fetch("https://api.nomba.com/v1/auth/token/issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accountId: creds.accountId,
        },
        body: JSON.stringify({ grant_type: "client_credentials", client_id: creds.clientId, client_secret: creds.clientSecret }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { description?: string; message?: string };
        throw new Error(body.description ?? body.message ?? `Nomba rejected the credentials (HTTP ${res.status})`);
      }
    },
  },
  paypal: {
    label: "PayPal",
    fields: [
      { key: "clientId", label: "Client ID", secret: false },
      { key: "clientSecret", label: "Client secret", secret: true },
      { key: "webhookId", label: "Webhook ID (for signature verification)", secret: false },
      { key: "mode", label: "Mode (sandbox or live)", secret: false },
    ],
    liveVerification: true,
    test: async (creds) => {
      const mode = creds.mode === "sandbox" ? "sandbox" : "live";
      const base = mode === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
      const res = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
        },
        body: "grant_type=client_credentials",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error_description?: string };
        throw new Error(body.error_description ?? `PayPal rejected the credentials (HTTP ${res.status})`);
      }
    },
  },
  remita: {
    label: "Remita",
    fields: [
      { key: "merchantId", label: "Merchant ID", secret: false },
      { key: "apiKey", label: "API key", secret: true },
      { key: "apiToken", label: "API token", secret: true },
      { key: "serviceTypeId", label: "Service type ID", secret: false },
    ],
    // Remita's real endpoints require a per-request SHA512 hash tied to a
    // specific transaction, so there's no generic "ping" call. We validate
    // that every required field is present and non-empty instead of faking
    // a live check — the UI is told this is format-only, not live-verified.
    liveVerification: false,
    test: async (creds) => {
      const missing = ["merchantId", "apiKey", "apiToken", "serviceTypeId"].filter((k) => !creds[k]?.trim());
      if (missing.length > 0) {
        throw new Error(`Missing required field(s): ${missing.join(", ")}`);
      }
    },
  },
};

/** Env-var fallbacks per provider/field, for backward compatibility in dev. */
const ENV_FALLBACK: Partial<Record<GatewayProvider, Record<string, string | undefined>>> = {
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    fallbackSecretKey: process.env.STRIPE_SECRET_KEY_2,
  },
  paystack: { secretKey: process.env.PAYSTACK_SECRET_KEY, webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET },
  paypal: { clientId: process.env.PAYPAL_CLIENT_ID, clientSecret: process.env.PAYPAL_CLIENT_SECRET },
};

/**
 * Resolves a single credential field for a platform gateway: admin-configured
 * DB value first, then the legacy env var fallback. Used by webhook handlers
 * and refund flows, which operate at the platform level (not per-vendor).
 */
export async function resolveGatewayField(provider: GatewayProvider, field: string): Promise<string | undefined> {
  const dbCreds = await getPlatformCredentials(provider);
  return dbCreds?.[field] || ENV_FALLBACK[provider]?.[field];
}

/**
 * Resolves the ordered list of Stripe secret keys to try (primary, then
 * optional fallback). Returns an empty array if Stripe is not configured at all.
 */
async function resolvePlatformStripeKeys(): Promise<string[]> {
  const dbCreds = await getPlatformCredentials("stripe");
  const primaryKey =
    dbCreds?.secretKey ||
    ENV_FALLBACK.stripe?.secretKey;
  const fallbackKey =
    dbCreds?.fallbackSecretKey ||
    ENV_FALLBACK.stripe?.fallbackSecretKey;

  return [primaryKey, fallbackKey].filter(Boolean) as string[];
}

/** True for Stripe errors that indicate the key is invalid or restricted. */
function isStripeKeyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { statusCode?: number }).statusCode;
  const type = (err as { type?: string }).type;
  return (
    code === 401 ||
    type === "StripeAuthenticationError" ||
    type === "StripePermissionError"
  );
}

/**
 * Runs `fn` with the primary platform Stripe client. If the primary key is
 * restricted or invalid, automatically retries once with the configured
 * fallback key (if one is set). Throws if Stripe is not configured at all.
 *
 * Use this for all platform-level Stripe API calls (subscriptions, portal,
 * refunds, sync) so the fallback key is transparently available everywhere.
 *
 * The callback receives both the Stripe instance and the resolved key string
 * (useful as a cache-key when the caller needs to pass it downstream, e.g. to
 * `ensureStripeCatalog` or `ensurePortalConfiguration`).
 *
 * @example
 *   const balance = await callWithPlatformStripe((stripe) => stripe.balance.retrieve());
 */
export async function callWithPlatformStripe<T>(
  fn: (stripe: import("stripe").default, key: string) => Promise<T>,
): Promise<T> {
  const keys = await resolvePlatformStripeKeys();
  if (keys.length === 0) {
    throw Object.assign(
      new Error("Stripe is not configured on this platform. Add a Stripe key in Admin → Payment Gateways."),
      { statusCode: 503 },
    );
  }

  const Stripe = (await import("stripe")).default;
  let lastErr: unknown;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    try {
      return await fn(new Stripe(key), key);
    } catch (err) {
      if (isStripeKeyError(err) && i < keys.length - 1) {
        // Primary key is restricted — silently try the fallback
        lastErr = err;
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

function assertProvider(provider: string): GatewayProvider {
  if (!GATEWAY_PROVIDERS.includes(provider as GatewayProvider)) {
    throw new Error(`Unknown gateway provider '${provider}'. Must be one of: ${GATEWAY_PROVIDERS.join(", ")}`);
  }
  return provider as GatewayProvider;
}

/** Returns the decrypted credentials object for a provider, or null if not configured. */
export async function getPlatformCredentials(provider: GatewayProvider): Promise<Record<string, string> | null> {
  const [row] = await db
    .select()
    .from(platformPaymentCredentialsTable)
    .where(eq(platformPaymentCredentialsTable.provider, provider))
    .limit(1);
  if (!row) return null;
  try {
    return JSON.parse(decrypt(row.credentialsEncrypted)) as Record<string, string>;
  } catch {
    return null;
  }
}

/** Returns true if the platform has test-passed credentials on file for a provider. */
export async function hasPlatformCredentials(provider: GatewayProvider): Promise<boolean> {
  const [row] = await db
    .select()
    .from(platformPaymentCredentialsTable)
    .where(eq(platformPaymentCredentialsTable.provider, provider))
    .limit(1);
  return Boolean(row?.testPassed);
}

/** Validates and saves a provider's credentials. Throws on validation failure. */
export async function savePlatformCredentials(
  providerRaw: string,
  creds: Record<string, string>,
): Promise<{ testPassed: boolean; liveVerification: boolean }> {
  const provider = assertProvider(providerRaw);
  const def = GATEWAY_DEFS[provider];

  const missing = def.fields.filter((f) => !f.optional && !creds[f.key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required field(s): ${missing.map((f) => f.label).join(", ")}`);
  }

  // Test before persisting — reject immediately if invalid.
  await def.test(creds);

  const encrypted = encrypt(JSON.stringify(creds));

  const [existing] = await db
    .select()
    .from(platformPaymentCredentialsTable)
    .where(eq(platformPaymentCredentialsTable.provider, provider))
    .limit(1);

  if (existing) {
    await db
      .update(platformPaymentCredentialsTable)
      .set({
        credentialsEncrypted: encrypted,
        testPassed: true,
        updatedAt: new Date(),
        lastCheckedAt: new Date(),
        lastFailureReason: null,
        failingSince: null,
      })
      .where(eq(platformPaymentCredentialsTable.provider, provider));
  } else {
    await db.insert(platformPaymentCredentialsTable).values({
      provider,
      credentialsEncrypted: encrypted,
      testPassed: true,
      lastCheckedAt: new Date(),
    });
  }

  return { testPassed: true, liveVerification: def.liveVerification };
}

/** Removes a provider's stored credentials entirely. */
export async function removePlatformCredentials(providerRaw: string): Promise<void> {
  const provider = assertProvider(providerRaw);
  await db.delete(platformPaymentCredentialsTable).where(eq(platformPaymentCredentialsTable.provider, provider));
}

/** Returns masked status for every provider, for the admin settings UI. */
export async function listPlatformGatewayStatus(): Promise<
  Array<{
    provider: GatewayProvider;
    label: string;
    fields: GatewayFieldDef[];
    liveVerification: boolean;
    configured: boolean;
    testPassed: boolean;
    maskedValues: Record<string, string | null>;
    updatedAt: string | null;
    lastCheckedAt: string | null;
    lastFailureReason: string | null;
    failingSince: string | null;
  }>
> {
  const rows = await db.select().from(platformPaymentCredentialsTable);
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  return GATEWAY_PROVIDERS.map((provider) => {
    const def = GATEWAY_DEFS[provider];
    const row = byProvider.get(provider);
    let creds: Record<string, string> | null = null;
    if (row) {
      try {
        creds = JSON.parse(decrypt(row.credentialsEncrypted)) as Record<string, string>;
      } catch {
        creds = null;
      }
    }
    const maskedValues: Record<string, string | null> = {};
    for (const f of def.fields) {
      const val = creds?.[f.key];
      if (!val) { maskedValues[f.key] = null; continue; }
      maskedValues[f.key] = f.secret ? `...${val.slice(-4)}` : val;
    }
    return {
      provider,
      label: def.label,
      fields: def.fields,
      liveVerification: def.liveVerification,
      configured: Boolean(row),
      testPassed: row?.testPassed ?? false,
      maskedValues,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
      lastFailureReason: row?.lastFailureReason ?? null,
      failingSince: row?.failingSince?.toISOString() ?? null,
    };
  });
}

/** Tests a set of credentials without persisting them. Throws on failure. */
export async function testPlatformCredentials(providerRaw: string, creds: Record<string, string>): Promise<{ liveVerification: boolean }> {
  const provider = assertProvider(providerRaw);
  const def = GATEWAY_DEFS[provider];
  await def.test(creds);
  return { liveVerification: def.liveVerification };
}

export interface RecheckResult {
  provider: GatewayProvider;
  checked: boolean; // false if nothing is configured for this provider
  testPassed: boolean;
  becameFailing: boolean; // true only on the pass -> fail transition
  recovered: boolean; // true only on the fail -> pass transition
  error?: string;
}

/**
 * Re-runs a configured provider's live `test()` against its stored
 * credentials and updates `testPassed`/failure bookkeeping accordingly.
 * Unlike `savePlatformCredentials`, this never throws on failure — it
 * records the outcome instead, since it's meant to run unattended.
 */
export async function recheckPlatformCredentials(provider: GatewayProvider): Promise<RecheckResult> {
  const def = GATEWAY_DEFS[provider];
  const [row] = await db
    .select()
    .from(platformPaymentCredentialsTable)
    .where(eq(platformPaymentCredentialsTable.provider, provider))
    .limit(1);

  if (!row) {
    return { provider, checked: false, testPassed: false, becameFailing: false, recovered: false };
  }

  let creds: Record<string, string>;
  try {
    creds = JSON.parse(decrypt(row.credentialsEncrypted)) as Record<string, string>;
  } catch {
    creds = {};
  }

  const wasPassing = row.testPassed;

  try {
    await def.test(creds);
    await db
      .update(platformPaymentCredentialsTable)
      .set({ testPassed: true, lastCheckedAt: new Date(), lastFailureReason: null, failingSince: null })
      .where(eq(platformPaymentCredentialsTable.provider, provider));

    const recovered = !wasPassing;
    if (recovered) {
      await sendSlackAlert(
        `:white_check_mark: *${def.label}* platform gateway credentials are working again after previously failing.`,
      );

      // Notify vendors whose only working gateway just recovered.
      // Dynamic import breaks the circular-module cycle (gateway-notifications
      // imports from this file for GATEWAY_DEFS / GatewayProvider types).
      try {
        const { notifyVendorsOfGatewayRecovery } = await import("./gateway-notifications");
        await notifyVendorsOfGatewayRecovery(provider);
      } catch (notifyErr) {
        console.error("[platform-gateways] vendor gateway-recovery notification threw:", notifyErr);
      }
    }
    return { provider, checked: true, testPassed: true, becameFailing: false, recovered };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const becameFailing = wasPassing;

    await db
      .update(platformPaymentCredentialsTable)
      .set({
        testPassed: false,
        lastCheckedAt: new Date(),
        lastFailureReason: message,
        failingSince: row.failingSince ?? new Date(),
      })
      .where(eq(platformPaymentCredentialsTable.provider, provider));

    if (becameFailing) {
      await sendSlackAlert(
        `:rotating_light: *${def.label}* platform gateway credentials just started failing: ${message}\n` +
          `This key previously worked — it may have been revoked, expired, or rotated on the provider's side. ` +
          `Update it from Admin \u2192 Payment Gateways.`,
      );

      // Notify vendors whose only working gateway just became this failing one.
      // Dynamic import breaks the circular-module cycle (gateway-notifications
      // imports from this file for GATEWAY_DEFS / GatewayProvider types).
      try {
        const { notifyVendorsOfGatewayFailure } = await import("./gateway-notifications");
        await notifyVendorsOfGatewayFailure(provider, message);
      } catch (notifyErr) {
        console.error("[platform-gateways] vendor gateway-failure notification threw:", notifyErr);
      }
    }

    return { provider, checked: true, testPassed: false, becameFailing, recovered: false, error: message };
  }
}

/** Rechecks every configured provider's credentials. Used by the health scheduler and the admin "re-test all" action. */
export async function recheckAllPlatformCredentials(): Promise<RecheckResult[]> {
  const results: RecheckResult[] = [];
  for (const provider of GATEWAY_PROVIDERS) {
    results.push(await recheckPlatformCredentials(provider));
  }
  return results;
}
