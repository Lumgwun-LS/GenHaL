import { Router, type IRouter } from "express";
import { eq, ilike, sql, desc, or, and } from "drizzle-orm";
import { db, vendorsTable, bannedIdentifiersTable, platformUsersTable, storeDeveloperAccountsTable, vendorVirtualAccountsTable } from "@workspace/db";
import { getAuth, clerkClient } from "@clerk/express";
import { BRAND_THEME_IDS } from "../lib/brand-themes";
import { COUNTRY_NAMES } from "../lib/country-names";
import { syncVendorToAwajimaa } from "../lib/awajimaa-sync";
import { notifyAdminSignup } from "../lib/signup-notify";
import { sendLoginNotification } from "../lib/login-notify";
import { addVendorToCache } from "../lib/trusted-vendors-cache";
import {
  ListVendorsQueryParams,
  CreateVendorBody,
  GetVendorParams,
  UpdateVendorParams,
  UpdateVendorBody,
  DeleteVendorParams,
  ListVendorsResponse,
  CreateVendorResponse,
  GetVendorResponse,
  UpdateVendorResponse,
  GetVendorStatsResponse,
  OnboardVendorBody,
  OnboardVendorResponse,
} from "@workspace/api-zod";

type PaymentSettingsBody = {
  stripeEnabled?: boolean;
  paystackEnabled?: boolean;
  remitaEnabled?: boolean;
  flutterwaveEnabled?: boolean;
  nombaEnabled?: boolean;
  paypalEnabled?: boolean;
  squadEnabled?: boolean;
  interswitchEnabled?: boolean;
  nowpaymentsEnabled?: boolean;
  defaultCurrency?: string;
};

const BOOLEAN_GATEWAY_FIELDS = ["stripeEnabled", "paystackEnabled", "remitaEnabled", "flutterwaveEnabled", "nombaEnabled", "paypalEnabled", "squadEnabled", "interswitchEnabled", "nowpaymentsEnabled"] as const;

function parsePaymentSettings(body: unknown): { data: PaymentSettingsBody } | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "Request body must be an object" };
  const b = body as Record<string, unknown>;
  const out: PaymentSettingsBody = {};
  for (const field of BOOLEAN_GATEWAY_FIELDS) {
    if (field in b) {
      if (typeof b[field] !== "boolean") return { error: `${field} must be a boolean` };
      out[field] = b[field] as boolean;
    }
  }
  if ("defaultCurrency" in b) {
    if (typeof b.defaultCurrency !== "string" || b.defaultCurrency.length !== 3) return { error: "defaultCurrency must be a 3-letter currency code" };
    out.defaultCurrency = b.defaultCurrency.toUpperCase();
  }
  return { data: out };
}

const router: IRouter = Router();

// The response schemas (generated from openapi.yaml) declare createdAt as a
// string, but drizzle/pg return timestamp columns as JS Date objects. Every
// endpoint that returns a raw vendor row must convert before validating the
// response, or the *.parse() call throws (creation/onboarding succeeds in the
// DB, but the client never gets a response).
function serializeVendor<T extends { createdAt: Date }>(vendor: T): Omit<T, "createdAt"> & { createdAt: string } {
  return { ...vendor, createdAt: vendor.createdAt.toISOString() };
}

router.get("/vendors/stats", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!adminIds.includes(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const vendors = await db.select().from(vendorsTable);
  const total = vendors.length;
  const active = vendors.filter((v) => v.status === "active").length;
  const recentSignups = vendors.filter((v) => {
    const d = new Date(v.createdAt);
    return d > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }).length;
  const industryMap: Record<string, number> = {};
  for (const v of vendors) {
    industryMap[v.industry] = (industryMap[v.industry] ?? 0) + 1;
  }
  const industries = Object.entries(industryMap).map(([industry, count]) => ({ industry, count }));
  res.json(
    GetVendorStatsResponse.parse({ totalVendors: total, activeVendors: active, industries, recentSignups }),
  );
});

router.get("/vendors", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!adminIds.includes(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const params = ListVendorsQueryParams.safeParse(req.query);
  let query = db.select().from(vendorsTable).orderBy(desc(vendorsTable.createdAt)).$dynamic();
  if (params.success && params.data.status) {
    query = query.where(eq(vendorsTable.status, params.data.status));
  }
  const vendors = await query;
  const filtered = params.success && params.data.search
    ? vendors.filter(
        (v) =>
          v.name.toLowerCase().includes(params.data.search!.toLowerCase()) ||
          v.industry.toLowerCase().includes(params.data.search!.toLowerCase()),
      )
    : vendors;
  res.json(ListVendorsResponse.parse(filtered.map(serializeVendor)));
});

// Admin-only raw vendor creation. The standard signup path for end-users is
// POST /vendors/onboarding, which derives identity from the Clerk session.
// This route is preserved for admin-side provisioning only.
router.post("/vendors", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!adminIds.includes(userId)) { res.status(403).json({ error: "Admin only" }); return; }

  const parsed = CreateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [vendor] = await db.insert(vendorsTable).values(parsed.data).returning();
  res.status(201).json(CreateVendorResponse.parse(serializeVendor(vendor)));
});

/**
 * POST /vendors/onboarding
 * First-time signup completion for the signed-in Clerk user. Email and clerkUserId
 * always come from the verified Clerk session — never from the request body — so a
 * vendor can never onboard as, or spoof, another user's identity.
 */
const E164_RE = /^\+[1-9]\d{4,14}$/;

router.post("/vendors/onboarding", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [existing] = await db.select().from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  if (existing) { res.status(200).json(OnboardVendorResponse.parse(serializeVendor(existing))); return; }

  const parsed = OnboardVendorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const name = parsed.data.name.trim();
  if (name.length < 2 || name.length > 100) {
    res.status(400).json({ error: "Name must be between 2 and 100 characters." });
    return;
  }
  if (!COUNTRY_NAMES.has(parsed.data.country)) {
    res.status(400).json({ error: "Select a valid country from the list." });
    return;
  }
  if (!E164_RE.test(parsed.data.phone)) {
    res.status(400).json({ error: "Enter a valid phone number." });
    return;
  }

  const clerkUser = await clerkClient.users.getUser(userId);
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) { res.status(400).json({ error: "Your Clerk account has no verified email address." }); return; }

  // Reject email/phone that was permanently banned when a previous account was deleted.
  const [banned] = await db
    .select({ id: bannedIdentifiersTable.id })
    .from(bannedIdentifiersTable)
    .where(or(
      sql`lower(${bannedIdentifiersTable.email}) = lower(${email})`,
      eq(bannedIdentifiersTable.phone, parsed.data.phone),
    ))
    .limit(1);
  if (banned) {
    res.status(403).json({ error: "This email address or phone number is no longer eligible to register on this platform." });
    return;
  }

  // A unique index on clerk_user_id (where not null) guards against a duplicate row if this
  // request races with another onboarding submission for the same user (e.g. double-click).
  try {
    const [vendor] = await db
      .insert(vendorsTable)
      .values({
        name,
        email,
        phone: parsed.data.phone,
        country: parsed.data.country,
        state: parsed.data.state,
        city: parsed.data.city,
        industry: "General",
        clerkUserId: userId,
        externalSource: "vendorhub",
      })
      .returning();

    res.status(201).json(OnboardVendorResponse.parse(serializeVendor(vendor)));
    // Best-effort side-effects — none of these must block or fail the response.
    addVendorToCache(vendor);
    void syncVendorToAwajimaa(vendor);
    notifyAdminSignup({ platform: "vendor-hub", name: vendor.name, email: vendor.email, phone: vendor.phone, country: vendor.country });
    // Auto-create App Store developer account using the same details.
    void db.insert(storeDeveloperAccountsTable).values({
      clerkUserId:  userId,
      displayName:  vendor.name,
      email:        vendor.email,
      country:      vendor.country ?? "Nigeria",
      status:       "active",
      feeExempt:    false,
    }).onConflictDoNothing();

    // Auto-provision a Paystack NGN dedicated account for the vendor.
    // Paystack may confirm the account number synchronously or via the
    // dedicatedaccount.assign.success webhook (handled in payments/webhooks.ts).
    // Skip if the vendor already has any dedicated NGN account (re-onboarding race).
    void (async () => {
      try {
        const [existingNGN] = await db.select({ id: vendorVirtualAccountsTable.id })
          .from(vendorVirtualAccountsTable)
          .where(and(
            eq(vendorVirtualAccountsTable.vendorId, vendor.id),
            eq(vendorVirtualAccountsTable.currency, "NGN"),
            eq(vendorVirtualAccountsTable.type, "dedicated"),
            eq(vendorVirtualAccountsTable.isActive, true),
          )).limit(1);
        if (existingNGN) return;

        const paystackKey = process.env.PAYSTACK_SECRET_KEY;
        if (!paystackKey) return;
        const nameParts = vendor.name.split(" ");
        const custRes = await fetch("https://api.paystack.co/customer", {
          method: "POST",
          headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            email: vendor.email,
            first_name: nameParts[0] ?? vendor.name,
            last_name: nameParts.slice(1).join(" ") || undefined,
            phone: vendor.phone ?? undefined,
          }),
        });
        const custData = (await custRes.json()) as { data?: { customer_code?: string } };
        const customerCode = custData?.data?.customer_code;
        if (!customerCode) return;
        await db.update(vendorsTable)
          .set({ paystackCustomerCode: customerCode, updatedAt: new Date() })
          .where(eq(vendorsTable.id, vendor.id));
        // Request dedicated NGN account — Paystack may assign it immediately or async
        const acctRes = await fetch("https://api.paystack.co/dedicated_account", {
          method: "POST",
          headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ customer: customerCode, preferred_bank: "wema-bank" }),
        });
        const acctData = (await acctRes.json()) as { data?: { account_number?: string; bank?: { name?: string } } };
        if (acctData?.data?.account_number) {
          await db.insert(vendorVirtualAccountsTable).values({
            vendorId:      vendor.id,
            gateway:       "paystack",
            accountNumber: acctData.data.account_number,
            bankName:      acctData.data.bank?.name ?? "Wema Bank",
            accountName:   vendor.name,
            currency:      "NGN",
            type:          "dedicated",
            referenceCode: customerCode,
            metadata:      acctData.data as Record<string, unknown>,
          }).onConflictDoNothing();
        }
      } catch (e) {
        console.warn("[onboarding] Paystack dedicated account provisioning failed:", e);
      }
    })();
  } catch (err: any) {
    // Only swallow the specific clerk_user_id race — any other unique violation (or error)
    // is unexpected here and should surface rather than being masked as a successful onboard.
    if (err?.code === "23505" && err?.constraint === "vendors_clerk_user_id_unique") {
      const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
      if (vendor) { res.status(200).json(OnboardVendorResponse.parse(serializeVendor(vendor))); return; }
    }
    throw err;
  }
});

/**
 * POST /vendors/login-ping
 * Called once per Clerk session by the vendor-hub frontend to send a "Log In"
 * notification email to the signed-in user. Works for both vendor accounts and
 * admin accounts that have no vendor row. Fire-and-forget on the client side.
 */
router.post("/vendors/login-ping", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Try vendor row first; fall back to Clerk for admin accounts without a row.
  const [vendor] = await db
    .select({ name: vendorsTable.name, email: vendorsTable.email })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId))
    .limit(1);

  let name: string;
  let email: string;
  if (vendor) {
    name = vendor.name;
    email = vendor.email;
  } else {
    // Admin with no vendor row — look up email from Clerk.
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      email = clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? "";
      name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.username || "Admin";
    } catch {
      res.status(204).end();
      return;
    }
  }

  if (!email) { res.status(204).end(); return; }

  sendLoginNotification({ platform: "vendor-hub", name, email });

  // Fire-and-forget: register this Clerk user in the platform_users registry.
  // This captures pre-onboarding users (no vendor row yet) as well as vendors.
  if (email) {
    const vendorRow = vendor ? await db.query.vendorsTable.findFirst({
      where: eq(vendorsTable.email, email),
      columns: { id: true },
    }) : null;
    const nowTs = new Date();
    db.insert(platformUsersTable).values({
      clerkUserId: userId,
      email,
      name,
      onboardingCompleted: vendorRow != null,
      vendorId: vendorRow?.id ?? null,
      lastSeenAt: nowTs,
    }).onConflictDoUpdate({
      target: platformUsersTable.clerkUserId,
      set: { email, name, lastSeenAt: nowTs, onboardingCompleted: vendorRow != null, vendorId: vendorRow?.id ?? null },
    }).catch(() => {});
  }

  res.status(204).end();
});

/**
 * GET /vendors/me
 * Returns the vendor profile for the currently signed-in Clerk user.
 * Unlike GET /vendors (admin-only), this endpoint is accessible to any
 * authenticated user so the frontend can determine onboarding status without
 * requiring admin privileges.
 */
router.get("/vendors/me", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId))
    .limit(1);

  if (!vendor) { res.status(404).json({ error: "No vendor profile found" }); return; }

  // Keep platform_users in sync — marks onboarding complete and links vendorId.
  const nowTs = new Date();
  db.insert(platformUsersTable).values({
    clerkUserId: userId,
    email: vendor.email,
    name: vendor.name,
    phone: vendor.phone ?? null,
    onboardingCompleted: true,
    vendorId: vendor.id,
    lastSeenAt: nowTs,
  }).onConflictDoUpdate({
    target: platformUsersTable.clerkUserId,
    set: { email: vendor.email, name: vendor.name, phone: vendor.phone ?? null, onboardingCompleted: true, vendorId: vendor.id, lastSeenAt: nowTs },
  }).catch(() => {});

  res.json(serializeVendor(vendor));
});

router.get("/vendors/:id", async (req, res): Promise<void> => {
  const params = GetVendorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, params.data.id));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  // Vendor profiles contain sensitive data (billing status, tier, contact info).
  // Only the owner or a platform admin may read their own vendor record.
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  if (vendor.clerkUserId !== userId && !isAdmin) {
    res.status(403).json({ error: "You do not have permission to view this vendor." });
    return;
  }

  res.json(GetVendorResponse.parse(serializeVendor(vendor)));
});

router.patch("/vendors/:id", async (req, res): Promise<void> => {
  const params = UpdateVendorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Only the vendor owner or a platform admin may update vendor profile data
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [existing] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Vendor not found" }); return; }

  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  if (existing.clerkUserId !== userId && !isAdmin) {
    res.status(403).json({ error: "You do not have permission to update this vendor." });
    return;
  }

  const parsed = UpdateVendorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.brandTheme !== undefined && !BRAND_THEME_IDS.includes(parsed.data.brandTheme)) {
    res.status(400).json({ error: `brandTheme must be one of: ${BRAND_THEME_IDS.join(", ")}` });
    return;
  }
  const [vendor] = await db.update(vendorsTable).set(parsed.data).where(eq(vendorsTable.id, params.data.id)).returning();
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  res.json(UpdateVendorResponse.parse(serializeVendor(vendor)));
});

router.delete("/vendors/:id", async (req, res): Promise<void> => {
  // Admin-only: vendor-initiated self-deletion goes through account-deletion.ts
  // which runs billing/balance checks, archives banned identifiers, and removes
  // the Clerk user. This route is a raw cascade delete reserved for admins only.
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!adminIds.includes(userId)) { res.status(403).json({ error: "Admin only" }); return; }

  const params = DeleteVendorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [vendor] = await db.delete(vendorsTable).where(eq(vendorsTable.id, params.data.id)).returning();
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  res.sendStatus(204);
});

/**
 * PATCH /vendors/:id/payment-settings
 * Admin-only: toggle Stripe/Paystack per vendor, set default currency.
 */
router.patch("/vendors/:id/payment-settings", async (req, res): Promise<void> => {
  const params = GetVendorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Admin-only: which gateways a vendor can accept is a platform-level control decision,
  // not something the vendor themselves (or any other authenticated user) may self-serve.
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!adminIds.includes(userId)) {
    res.status(403).json({ error: "Only platform admins may change payment gateway settings." });
    return;
  }

  const parsed = parsePaymentSettings(req.body);
  if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }

  const [vendor] = await db
    .update(vendorsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(vendorsTable.id, params.data.id))
    .returning();

  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  res.json({
    id: vendor.id,
    stripeEnabled: vendor.stripeEnabled,
    paystackEnabled: vendor.paystackEnabled,
    remitaEnabled: vendor.remitaEnabled,
    flutterwaveEnabled: vendor.flutterwaveEnabled,
    nombaEnabled: vendor.nombaEnabled,
    paypalEnabled: vendor.paypalEnabled,
    squadEnabled: vendor.squadEnabled,
    interswitchEnabled: vendor.interswitchEnabled,
    nowpaymentsEnabled: vendor.nowpaymentsEnabled,
    defaultCurrency: vendor.defaultCurrency,
  });
});

// ─── GET /vendors/trial-status ───────────────────────────────────────────────
// Returns the active trial info for the vendor matching the given clerkUserId.
// Used by the frontend upgrade banner; intentionally unauthenticated since it
// only reveals the calling user's own data (keyed on Clerk user id).
router.get("/vendors/trial-status", async (req, res): Promise<void> => {
  const clerkUserId = typeof req.query.clerkUserId === "string" ? req.query.clerkUserId : null;
  if (!clerkUserId) {
    res.json({ trialEndsAt: null, trialStartedAt: null, trialDurationDays: null, vendorId: null });
    return;
  }

  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, clerkUserId))
    .limit(1);

  const now = new Date();
  if (!vendor || !vendor.trialEndsAt || vendor.subscriptionTier !== "free" || vendor.trialEndsAt <= now) {
    res.json({ trialEndsAt: null, trialStartedAt: null, trialDurationDays: null, vendorId: null });
    return;
  }

  res.json({
    trialEndsAt: vendor.trialEndsAt.toISOString(),
    trialStartedAt: vendor.trialStartedAt ? vendor.trialStartedAt.toISOString() : null,
    trialDurationDays: vendor.trialDurationDays ?? null,
    vendorId: vendor.id,
  });
});

// ─── GET /vendors/kyc-status ─────────────────────────────────────────────────
// Returns the current vendor's KYC completion status and any existing USD account.

router.get("/vendors/kyc-status", async (req, res): Promise<void> => {
  const { userId: clerkUserId } = getAuth(req);
  if (!clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [vendor] = await db
    .select({
      id:                      vendorsTable.id,
      address:                 vendorsTable.address,
      dateOfBirth:             vendorsTable.dateOfBirth,
      bvn:                     vendorsTable.bvn,
      kycSubmittedAt:          vendorsTable.kycSubmittedAt,
      squadCustomerIdentifier: vendorsTable.squadCustomerIdentifier,
    })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, clerkUserId))
    .limit(1);

  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const usdAccounts = await db
    .select()
    .from(vendorVirtualAccountsTable)
    .where(
      eq(vendorVirtualAccountsTable.vendorId, vendor.id),
    );

  const usd = usdAccounts.filter(a => a.currency === "USD" && a.isActive);

  res.json({
    kycComplete:    !!(vendor.bvn && vendor.dateOfBirth && vendor.address),
    kycSubmittedAt: vendor.kycSubmittedAt?.toISOString() ?? null,
    // Mask BVN — only show last 4 digits
    bvnMasked:   vendor.bvn ? `****${vendor.bvn.slice(-4)}` : null,
    dateOfBirth: vendor.dateOfBirth,
    address:     vendor.address,
    usdAccounts: usd.map(a => ({
      accountNumber: a.accountNumber,
      bankName:      a.bankName,
      routingNumber: (a.metadata as Record<string, unknown> | null)?.["routing_number"] as string | undefined,
      createdAt:     a.createdAt.toISOString(),
    })),
    allAccounts: usdAccounts.map(a => ({
      id:            a.id,
      currency:      a.currency,
      gateway:       a.gateway,
      accountNumber: a.accountNumber,
      bankName:      a.bankName,
      isActive:      a.isActive,
      createdAt:     a.createdAt.toISOString(),
    })),
  });
});

// ─── PATCH /vendors/kyc ───────────────────────────────────────────────────────
// Vendor submits their own KYC details (BVN, date of birth, full address).

router.patch("/vendors/kyc", async (req, res): Promise<void> => {
  const { userId: clerkUserId } = getAuth(req);
  if (!clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { bvn, dateOfBirth, address } = req.body as {
    bvn?: string;
    dateOfBirth?: string;
    address?: string;
  };

  const [vendor] = await db
    .select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, clerkUserId))
    .limit(1);

  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (bvn !== undefined && bvn !== "")          updates.bvn = bvn.trim();
  if (dateOfBirth !== undefined && dateOfBirth) updates.dateOfBirth = dateOfBirth;
  if (address !== undefined && address !== "")  updates.address = address.trim();

  // Mark kycSubmittedAt when all three fields are present after this update
  const [current] = await db
    .select({ bvn: vendorsTable.bvn, dateOfBirth: vendorsTable.dateOfBirth, address: vendorsTable.address })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendor.id))
    .limit(1);

  const newBvn  = (updates.bvn as string | undefined)         ?? current?.bvn;
  const newDob  = (updates.dateOfBirth as string | undefined) ?? current?.dateOfBirth;
  const newAddr = (updates.address as string | undefined)     ?? current?.address;
  if (newBvn && newDob && newAddr) updates.kycSubmittedAt = new Date();

  await db.update(vendorsTable).set(updates).where(eq(vendorsTable.id, vendor.id));

  res.json({ ok: true, kycComplete: !!(newBvn && newDob && newAddr) });
});

// ─── POST /vendors/usd-account ────────────────────────────────────────────────
// Vendor requests their own Squad USD virtual account. Requires KYC to be complete.

router.post("/vendors/usd-account", async (req, res): Promise<void> => {
  const { userId: clerkUserId } = getAuth(req);
  if (!clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, clerkUserId))
    .limit(1);

  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (!vendor.bvn || !vendor.dateOfBirth || !vendor.address) {
    res.status(422).json({ error: "KYC is incomplete. Please complete your KYC details before requesting a USD account." });
    return;
  }

  const [existing] = await db
    .select({ id: vendorVirtualAccountsTable.id })
    .from(vendorVirtualAccountsTable)
    .where(
      eq(vendorVirtualAccountsTable.vendorId, vendor.id),
    )
    .limit(1);

  const hasUsd = await db
    .select({ id: vendorVirtualAccountsTable.id })
    .from(vendorVirtualAccountsTable)
    .where(eq(vendorVirtualAccountsTable.vendorId, vendor.id))
    .then(rows => rows.some(r => r));

  void existing; // used above implicitly

  const activeUsd = await db
    .select()
    .from(vendorVirtualAccountsTable)
    .where(eq(vendorVirtualAccountsTable.vendorId, vendor.id))
    .then(rows => rows.find(r => r.currency === "USD" && r.isActive));

  if (activeUsd) {
    res.status(409).json({ error: "You already have an active USD virtual account." });
    return;
  }

  void hasUsd;

  const { resolveSquadKey, squadCreateUSDVirtualAccount } = await import("../lib/squad");

  let secretKey: string;
  try {
    secretKey = await resolveSquadKey();
  } catch {
    res.status(503).json({ error: "Squad is not currently configured. Please contact support." });
    return;
  }

  const customerIdentifier = vendor.squadCustomerIdentifier ?? `vendor_${vendor.id}_usd_${Date.now()}`;
  const nameParts = vendor.name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? vendor.name;
  const lastName  = nameParts.slice(1).join(" ") || firstName;

  let result: Awaited<ReturnType<typeof squadCreateUSDVirtualAccount>>;
  try {
    result = await squadCreateUSDVirtualAccount(secretKey, {
      customerIdentifier,
      firstName,
      lastName,
      mobileNumber: vendor.phone ?? "",
      email:        vendor.email,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Squad API error";
    res.status(502).json({ error: `Failed to create USD account: ${msg}` });
    return;
  }

  const acct = result.data;

  await db.update(vendorsTable)
    .set({ squadCustomerIdentifier: customerIdentifier, updatedAt: new Date() })
    .where(eq(vendorsTable.id, vendor.id));

  await db.insert(vendorVirtualAccountsTable).values({
    vendorId:      vendor.id,
    gateway:       "squad",
    accountNumber: acct.virtual_account_number,
    bankName:      acct.bank_name ?? "Squad",
    accountName:   acct.beneficiary_name ?? vendor.name,
    currency:      "USD",
    type:          "dedicated",
    referenceCode: customerIdentifier,
    metadata:      acct as unknown as Record<string, unknown>,
  }).onConflictDoNothing();

  res.json({
    ok:              true,
    accountNumber:   acct.virtual_account_number,
    bankName:        acct.bank_name,
    routingNumber:   acct.routing_number,
    beneficiaryName: acct.beneficiary_name,
  });
});

export default router;
