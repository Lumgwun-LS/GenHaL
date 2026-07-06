import { Router } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import {
  externalApiKeysTable,
  externalUserSessionsTable,
  vendorsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { FEATURE_ACCESS } from "../../middlewares/requireExternalAuth";

const router = Router();

const SESSION_TTL_DAYS = 7;

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * POST /external/auth/handshake
 *
 * Called by the Awajimaa Spring Boot backend when an Awajimaa user
 * wants to access VendorHub features. On success, returns a signed
 * JWT the Android client can use directly on /external/* endpoints.
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

  const { userId, userType, name, email, phone } = req.body as {
    userId?: string;
    userType?: string;
    name?: string;
    email?: string;
    phone?: string;
  };

  if (!userId || !userType || !name || !email) {
    return res.status(400).json({ error: "userId, userType, name, and email are required" });
  }

  const validTypes = ["state", "hospital", "emergency", "business", "individual"];
  if (!validTypes.includes(userType)) {
    return res.status(400).json({ error: `userType must be one of: ${validTypes.join(", ")}` });
  }

  // Map Awajimaa user type to VendorHub industry
  const industryMap: Record<string, string> = {
    state:      "government",
    hospital:   "healthcare",
    emergency:  "emergency-services",
    business:   "e-commerce",
    individual: "individual",
  };

  // Find or auto-create vendor profile for this Awajimaa user
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
        industry: industryMap[userType],
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

  return res.status(200).json({
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
  });
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
