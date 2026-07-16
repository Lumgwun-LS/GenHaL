import { Router } from "express";
import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { getAuth, clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import {
  externalApiKeysTable,
  externalUserSessionsTable,
  vendorsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { FEATURE_ACCESS } from "../../middlewares/requireExternalAuth";
import { notifyAdminSignup } from "../../lib/signup-notify";

const router = Router();

const SESSION_TTL_DAYS = 7;

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

const VALID_USER_TYPES = ["state", "hospital", "emergency", "business", "individual"];

// Map Awajimaa user type to VendorHub industry
const INDUSTRY_MAP: Record<string, string> = {
  state:      "government",
  hospital:   "healthcare",
  emergency:  "emergency-services",
  business:   "e-commerce",
  individual: "individual",
};

interface HandshakeIdentity {
  userId: string;
  userType: string;
  name: string;
  email: string;
  phone?: string;
}

/**
 * Shared handshake logic: finds or auto-creates the vendor profile for an
 * Awajimaa identity and issues a signed session JWT for /external/* routes.
 */
async function performHandshake({ userId, userType, name, email, phone }: HandshakeIdentity) {
  let vendor = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.awajimaaUserId, userId))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!vendor) {
    const [created] = await db
      .insert(vendorsTable)
      .values({
        name,
        email,
        phone: phone ?? null,
        industry: INDUSTRY_MAP[userType],
        status: "active",
        awajimaaUserId: userId,
        awajimaaUserType: userType,
        externalSource: "awajimaa",
      })
      .returning();
    vendor = created;
  }

  // Issue JWT
  const secret = process.env.SESSION_SECRET!;
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const token = jwt.sign(
    {
      vendorId: vendor.id,
      awajimaaUserId: userId,
      awajimaaUserType: userType,
      source: "awajimaa",
      jti,
    },
    secret,
    { expiresIn: `${SESSION_TTL_DAYS}d` },
  );

  // Persist session for audit / revocation
  await db.insert(externalUserSessionsTable).values({
    vendorId: vendor.id,
    awajimaaUserId: userId,
    awajimaaUserType: userType,
    source: "awajimaa",
    jti,
    isRevoked: "false",
    expiresAt,
  });

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    vendorId: vendor.id,
    features: FEATURE_ACCESS[userType] ?? [],
    vendor: {
      id: vendor.id,
      name: vendor.name,
      email: vendor.email,
      industry: vendor.industry,
      status: vendor.status,
      awajimaaUserType: vendor.awajimaaUserType,
    },
  };
}

/**
 * Shared handshake logic for the first-party mobile app: finds or
 * auto-creates the vendor profile keyed by the caller's *verified* Clerk
 * user id (never a client-supplied identifier) and issues a signed
 * session JWT for /external/* routes. Unlike performHandshake (used by the
 * partner-gated /handshake route), the identity here is proven server-side
 * by Clerk, not self-declared by the request body.
 */
async function performMobileHandshake({
  clerkUserId,
  userType,
  name,
  email,
  phone,
}: {
  clerkUserId: string;
  userType: string;
  name: string;
  email: string;
  phone?: string;
}) {
  let vendor = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, clerkUserId))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!vendor) {
    const [created] = await db
      .insert(vendorsTable)
      .values({
        name,
        email,
        phone: phone ?? null,
        industry: INDUSTRY_MAP[userType],
        status: "active",
        clerkUserId,
        awajimaaUserType: userType,
        externalSource: "mobile-app",
      })
      .returning();
    vendor = created;
    notifyAdminSignup({ platform: "mobile-app", name: vendor.name, email: vendor.email, phone: vendor.phone ?? undefined, userType: vendor.awajimaaUserType ?? undefined });
  }

  // The account type (and the feature set it grants) is decided once, at
  // vendor creation, and is persisted on the vendor row from then on. A
  // returning vendor re-running onboarding (e.g. after a cleared session)
  // must NOT be able to silently change their own feature access just by
  // submitting a different `userType` in this request body — always issue
  // the session against the vendor's persisted type, never the request's.
  const effectiveUserType = vendor.awajimaaUserType ?? userType;

  const secret = process.env.SESSION_SECRET!;
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const token = jwt.sign(
    {
      vendorId: vendor.id,
      awajimaaUserId: clerkUserId,
      awajimaaUserType: effectiveUserType,
      source: "mobile-app",
      jti,
    },
    secret,
    { expiresIn: `${SESSION_TTL_DAYS}d` },
  );

  await db.insert(externalUserSessionsTable).values({
    vendorId: vendor.id,
    awajimaaUserId: clerkUserId,
    awajimaaUserType: effectiveUserType,
    source: "mobile-app",
    jti,
    isRevoked: "false",
    expiresAt,
  });

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    vendorId: vendor.id,
    features: FEATURE_ACCESS[effectiveUserType] ?? [],
    vendor: {
      id: vendor.id,
      name: vendor.name,
      email: vendor.email,
      industry: vendor.industry,
      status: vendor.status,
      awajimaaUserType: vendor.awajimaaUserType,
    },
  };
}

function validateIdentity(body: unknown): { identity?: HandshakeIdentity; error?: string } {
  const { userId, userType, name, email, phone } = (body ?? {}) as {
    userId?: string;
    userType?: string;
    name?: string;
    email?: string;
    phone?: string;
  };

  if (!userId || !userType || !name || !email) {
    return { error: "userId, userType, name, and email are required" };
  }
  if (!VALID_USER_TYPES.includes(userType)) {
    return { error: `userType must be one of: ${VALID_USER_TYPES.join(", ")}` };
  }
  return { identity: { userId, userType, name, email, phone } };
}

/**
 * POST /external/auth/handshake
 *
 * Called by the Awajimaa Spring Boot backend (a trusted third-party
 * partner) when an Awajimaa user wants to access VendorHub features. On
 * success, returns a signed JWT the Android client can use directly on
 * /external/* endpoints.
 *
 * Headers:
 *   x-api-key: <raw API key registered by admin>
 *
 * Body:
 *   { userId, userType, name, email, phone? }
 *
 * userType: "state" | "hospital" | "emergency" | "business" | "individual"
 */
router.post("/handshake", async (req, res) => {
  const rawKey = req.headers["x-api-key"];
  if (!rawKey || typeof rawKey !== "string") {
    return res.status(401).json({ error: "Missing x-api-key header" });
  }

  // Validate API key
  const hash = hashKey(rawKey);
  const [apiKey] = await db
    .select()
    .from(externalApiKeysTable)
    .where(eq(externalApiKeysTable.keyHash, hash))
    .limit(1);

  if (!apiKey || !apiKey.isActive) {
    return res.status(401).json({ error: "Invalid or revoked API key" });
  }

  const { identity, error } = validateIdentity(req.body);
  if (error || !identity) {
    return res.status(400).json({ error });
  }

  return res.status(200).json(await performHandshake(identity));
});

/**
 * POST /external/auth/mobile-handshake
 *
 * Called directly by the first-party VendorHub Mobile app (this Expo
 * client), not a third-party partner backend. No x-api-key is required
 * here since the caller is our own app, not an external integration —
 * the x-api-key layer exists specifically to gate genuine partner
 * backends (like a real Awajimaa Spring Boot service) that we don't
 * control.
 *
 * Unlike /handshake, identity here is NOT self-declared by the request
 * body — the caller must present a valid Clerk session token (the app
 * signs in with Clerk first), which `clerkMiddleware` verifies upstream.
 * We read the *verified* Clerk user id via `getAuth(req)` and fetch the
 * user's name/email straight from Clerk, so a caller can only ever mint
 * a token for their own authenticated identity, never someone else's.
 *
 * Body:
 *   { userType, phone? } — userType only selects which VendorHub modules
 *   are enabled for this vendor; it carries no elevated trust and cannot
 *   be used to access another vendor's data.
 */
router.post("/mobile-handshake", async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  if (!clerkUserId) {
    return res.status(401).json({ error: "Sign in required" });
  }

  const { userType, phone } = (req.body ?? {}) as { userType?: string; phone?: string };
  if (!userType || !VALID_USER_TYPES.includes(userType)) {
    return res.status(400).json({ error: `userType must be one of: ${VALID_USER_TYPES.join(", ")}` });
  }

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) {
    return res.status(400).json({ error: "Your account has no verified email address" });
  }
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || email;

  return res.status(200).json(
    await performMobileHandshake({ clerkUserId, userType, name, email, phone }),
  );
});

/**
 * POST /external/auth/revoke
 * Revokes an active external session token.
 * Body: { jti } — the JWT ID from the token payload.
 */
router.post("/revoke", async (req, res) => {
  const { jti } = req.body as { jti?: string };
  if (!jti) return res.status(400).json({ error: "jti is required" });

  await db
    .update(externalUserSessionsTable)
    .set({ isRevoked: "true" })
    .where(eq(externalUserSessionsTable.jti, jti));

  return res.status(200).json({ ok: true });
});

export default router;
