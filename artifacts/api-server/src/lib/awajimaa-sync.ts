import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, vendorsTable, type Vendor } from "@workspace/db";
import { logger } from "./logger";

/**
 * Awajimaa identity bridge (dual-run phase).
 *
 * VendorHub still authenticates vendors through Clerk. This module ONLY
 * mirrors a matching account into the shared awajimaa-backend (Spring Boot)
 * user store, so a vendor who signs up on VendorHub already exists there —
 * paving the way for a future migration where awajimaa-backend becomes the
 * single login for every Awajimaa app. It must never block or fail
 * VendorHub's own signup: every awajimaa-backend call is best-effort and
 * failures are logged for admin follow-up, not surfaced to the vendor.
 *
 * IMPORTANT: awajimaa-backend's self-signup endpoint (POST /api/users/register)
 * also provisions a real Paystack customer + dedicated virtual bank account
 * for every new user — this is an intentional, confirmed side effect, not a
 * bug. See replit.md / memory for the decision record.
 *
 * The vendor's own password is never known to VendorHub (Clerk owns auth),
 * so a random password is generated purely to satisfy awajimaa-backend's
 * registration contract. It is not stored anywhere. A vendor who later
 * wants to log into another Awajimaa app with this identity will need to
 * go through that app's "forgot password" flow — full password-based
 * cross-login is out of scope for this dual-run phase.
 */

const AWAJIMAA_ENTITY_TYPE = "ORGANIZATION"; // vendors are classified as organizations on the awajimaa side
const AWAJIMAA_USER_TYPE = "business"; // VendorHub's own awajimaaUserType classification (matches external/auth.ts conventions)

function backendUrl(): string | null {
  const base = process.env.AWAJIMAA_BACKEND_URL;
  if (!base) {
    logger.warn("AWAJIMAA_BACKEND_URL is not set; skipping awajimaa-backend sync");
    return null;
  }
  return base.replace(/\/+$/, "");
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

interface AwajimaaUserDto {
  userID?: string;
  [key: string]: unknown;
}

async function fetchAwajimaaUserByEmail(base: string, email: string): Promise<AwajimaaUserDto | null> {
  const res = await fetch(`${base}/api/users/email/${encodeURIComponent(email)}`, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) {
    logger.warn({ status: res.status }, "awajimaa-backend GET /api/users/email failed");
    return null;
  }
  return (await res.json()) as AwajimaaUserDto;
}

/**
 * Best-effort: create (or find) the vendor's matching account on
 * awajimaa-backend and persist the linkage on the vendor row. Never throws —
 * any failure is logged and the caller's own flow continues unaffected.
 */
export async function syncVendorToAwajimaa(vendor: Vendor): Promise<void> {
  if (vendor.awajimaaUserId) return; // already linked

  const base = backendUrl();
  if (!base) return;

  try {
    const existing = await fetchAwajimaaUserByEmail(base, vendor.email);
    let awajimaaUserId = existing?.userID ?? null;

    if (!awajimaaUserId) {
      const { first, last } = splitName(vendor.name);
      const password = randomBytes(24).toString("base64url");

      const res = await fetch(`${base}/api/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userFirstName: first,
          userLastName: last,
          fullNames: vendor.name,
          userEmailAddress: vendor.email,
          userPhoneNO: vendor.phone ?? undefined,
          userCountry: vendor.country ?? undefined,
          userState: vendor.state ?? undefined,
          password,
        }),
      });

      if (!res.ok) {
        logger.warn(
          { status: res.status, vendorId: vendor.id },
          "awajimaa-backend registration failed during dual-run sync",
        );
        return;
      }

      const created = await fetchAwajimaaUserByEmail(base, vendor.email);
      awajimaaUserId = created?.userID ?? null;
    }

    if (!awajimaaUserId) {
      logger.warn({ vendorId: vendor.id }, "awajimaa-backend sync: could not resolve created userID");
      return;
    }

    await db
      .update(vendorsTable)
      .set({ awajimaaUserId, awajimaaUserType: vendor.awajimaaUserType ?? AWAJIMAA_USER_TYPE })
      .where(eq(vendorsTable.id, vendor.id));

    logger.info(
      { vendorId: vendor.id, awajimaaUserId, entityType: AWAJIMAA_ENTITY_TYPE },
      "Vendor synced to awajimaa-backend",
    );
  } catch (err) {
    logger.error({ err, vendorId: vendor.id }, "awajimaa-backend dual-run sync threw unexpectedly");
  }
}
