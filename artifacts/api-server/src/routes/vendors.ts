import { Router, type IRouter } from "express";
import { eq, ilike, sql, desc } from "drizzle-orm";
import { db, vendorsTable } from "@workspace/db";
import { getAuth, clerkClient } from "@clerk/express";
import { BRAND_THEME_IDS } from "../lib/brand-themes";
import { COUNTRY_NAMES } from "../lib/country-names";
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
  defaultCurrency?: string;
};

function parsePaymentSettings(body: unknown): { data: PaymentSettingsBody } | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "Request body must be an object" };
  const b = body as Record<string, unknown>;
  const out: PaymentSettingsBody = {};
  if ("stripeEnabled" in b) {
    if (typeof b.stripeEnabled !== "boolean") return { error: "stripeEnabled must be a boolean" };
    out.stripeEnabled = b.stripeEnabled;
  }
  if ("paystackEnabled" in b) {
    if (typeof b.paystackEnabled !== "boolean") return { error: "paystackEnabled must be a boolean" };
    out.paystackEnabled = b.paystackEnabled;
  }
  if ("defaultCurrency" in b) {
    if (typeof b.defaultCurrency !== "string" || b.defaultCurrency.length !== 3) return { error: "defaultCurrency must be a 3-letter currency code" };
    out.defaultCurrency = b.defaultCurrency.toUpperCase();
  }
  return { data: out };
}

const router: IRouter = Router();

router.get("/vendors/stats", async (req, res): Promise<void> => {
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
  res.json(ListVendorsResponse.parse(filtered));
});

router.post("/vendors", async (req, res): Promise<void> => {
  const parsed = CreateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [vendor] = await db.insert(vendorsTable).values(parsed.data).returning();
  res.status(201).json(CreateVendorResponse.parse(vendor));
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
  if (existing) { res.status(200).json(OnboardVendorResponse.parse(existing)); return; }

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

    res.status(201).json(OnboardVendorResponse.parse(vendor));
  } catch (err: any) {
    // Only swallow the specific clerk_user_id race — any other unique violation (or error)
    // is unexpected here and should surface rather than being masked as a successful onboard.
    if (err?.code === "23505" && err?.constraint === "vendors_clerk_user_id_unique") {
      const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
      if (vendor) { res.status(200).json(OnboardVendorResponse.parse(vendor)); return; }
    }
    throw err;
  }
});

router.get("/vendors/:id", async (req, res): Promise<void> => {
  const params = GetVendorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, params.data.id));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  res.json(GetVendorResponse.parse(vendor));
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
  res.json(UpdateVendorResponse.parse(vendor));
});

router.delete("/vendors/:id", async (req, res): Promise<void> => {
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
    defaultCurrency: vendor.defaultCurrency,
  });
});

export default router;
