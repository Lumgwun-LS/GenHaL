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

export const GATEWAY_PROVIDERS = ["stripe", "paystack", "remita", "flutterwave", "nomba"] as const;
export type GatewayProvider = (typeof GATEWAY_PROVIDERS)[number];

export interface GatewayFieldDef {
  key: string;
  label: string;
  secret: boolean; // whether to mask this field when displaying status
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
    ],
    liveVerification: true,
    test: async (creds) => {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(creds.secretKey);
      await stripe.balance.retrieve();
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
  stripe: { secretKey: process.env.STRIPE_SECRET_KEY, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET },
  paystack: { secretKey: process.env.PAYSTACK_SECRET_KEY, webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET },
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

  const missing = def.fields.filter((f) => !creds[f.key]?.trim());
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
      .set({ credentialsEncrypted: encrypted, testPassed: true, updatedAt: new Date() })
      .where(eq(platformPaymentCredentialsTable.provider, provider));
  } else {
    await db.insert(platformPaymentCredentialsTable).values({ provider, credentialsEncrypted: encrypted, testPassed: true });
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
