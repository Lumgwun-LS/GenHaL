/**
 * No-code "Site Editor" content store.
 *
 * Each block is a named JSON blob. `DEFAULT_SITE_CONTENT` is the fallback
 * shown when an admin has never edited that block — the site always renders
 * correctly even with an empty `site_content` table. Admin edits upsert a row
 * per key; `getSiteContent()` merges DB overrides on top of the defaults.
 */
import { db } from "@workspace/db";
import { siteContentTable, siteContentAuditLogTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

export const DEFAULT_SITE_CONTENT = {
  "landing.hero": {
    badge: "Command Center for Modern Operators",
    heading: "Run your entire business from one terminal.",
    subheading:
      "Awa Biz Suite replaces your fragmented tool stack. Manage multi-channel social media, inventory, sales, leads, and SMS campaigns in a single, high-density cockpit.",
    primaryCta: "Get Started",
    secondaryCta: "View Demo",
  },
  "landing.features": {
    heading: "Everything you need to scale",
    subheading: "We've collapsed a dozen different SaaS products into one cohesive, blazing-fast experience.",
    items: [
      { title: "Unified Social", description: "Draft, schedule, and publish to Instagram, Facebook, X, and LinkedIn — including video — from one composer." },
      { title: "AI Content & Video Studio", description: "Generate product imagery, captions, and fully animated multi-scene marketing videos with AI voiceover and music." },
      { title: "Sales & Leads CRM", description: "Track every lead from first touch to closed order. Visualize pipelines and revenue." },
      { title: "Finance Suite", description: "Sales, expenses, and investments in one ledger — filterable by branch, worker, and date range, exportable anytime." },
      { title: "Branches & Workers", description: "Model every physical location and staff member, and see exactly which branch or worker drove each sale." },
      { title: "Orders & Inventory", description: "Real-time stock tracking with low-stock alerts, full order fulfillment, and transaction histories." },
      { title: "Voice Campaigns", description: "Automated AI voice calls for birthdays, promotions, and re-engagement — no call center required." },
      { title: "Omnichannel Campaigns", description: "Broadcast targeted email and SMS campaigns to your leads and customers." },
      { title: "Multi-Vendor Management", description: "Run an agency? Manage dozens of separate brands and vendors from a single login." },
    ],
  },
  "landing.stats": {
    heading: "Built for operators who hate switching tabs",
    body:
      "Stop paying for a social scheduler, a CRM, an inventory tracker, a finance tracker, a call center, and an AI generation tool. Awa Biz Suite connects your data so an inventory update can automatically trigger a social post.",
    bullets: [
      "Zero latency interface",
      "Dark mode optimized for long sessions",
      "Keyboard shortcuts for power users",
      "Export any table to CSV instantly",
    ],
    stats: [
      { value: "40+", label: "Hours saved monthly" },
      { value: "100%", label: "Data synchronization" },
      { value: "9", label: "SaaS subscriptions replaced" },
      { value: "2.5x", label: "Faster response times" },
    ],
  },
  "landing.cta": {
    heading: "Ready to take command?",
    body: "Join thousands of operators running their empires on Awa Biz Suite.",
    buttonLabel: "Start Your Free Trial",
  },
  "site.settings": {
    siteName: "Awa Biz Suite",
    logoUrl: "/awajimaa-logo.jpg",
    supportEmail: "support@awajimaaapp.io",
    footerTagline:
      "The all-in-one business command centre for vendors, agencies, and multi-brand operators — built for the modern African and global market.",
  },
  "email.birthday": {
    subject: "🎂 Happy Birthday from Awa Biz Suite!",
    body: "Happy Birthday, {{name}}! Wishing you a wonderful day from the entire Awa Biz Suite team. We're so grateful to have you with us.",
  },
  "admin.exportAlertSettings": {
    threshold: Number(process.env.EXPORT_ALERT_THRESHOLD ?? 5),
    windowMinutes: Number(process.env.EXPORT_ALERT_WINDOW_MINUTES ?? 15),
  },
  "admin.voiceSignatureFailureAlertSettings": {
    threshold: Number(process.env.VOICE_SIGNATURE_FAILURE_ALERT_THRESHOLD ?? 3),
    windowMinutes: Number(process.env.VOICE_SIGNATURE_FAILURE_ALERT_WINDOW_MINUTES ?? 10),
  },
  "admin.voiceBackfillLastRun": {
    ranAt: null as string | null,
    triggeredBy: "system" as string,
    checked: 0,
    updated: 0,
    failed: 0,
  },
  "admin.voiceBackfillRecentFixes": [] as Array<{
    ranAt: string;
    callSid: string;
    fromStatus: string;
    toStatus: string;
  }>,
  // Subscription plan pricing/quotas — admin-editable, vendors only ever read this.
  // Quotas are monthly resource allowances (AI generations, voice minutes, SMS,
  // email) bundled into each tier. Pricing is set so the bundled resource cost
  // (at the unit costs documented in PLAN_RESOURCE_UNIT_COSTS, see
  // subscription-plans.ts) stays at roughly 1/5th of the plan price — i.e. a
  // ~5x margin over what the bundled resources actually cost the platform,
  // after accounting for payment-processing fees (~3%) and a flat monthly
  // infra/support overhead per vendor. Each plan now carries BOTH a USD price
  // (billed via Stripe) and an NGN price (billed via Paystack) — the NGN price
  // is the USD price converted at an assumed ~1,550 NGN/USD rate, so the same
  // ~5x margin holds in either currency; admins can edit either independently.
  "billing.subscriptionPlans": {
    plans: [
      {
        tier: "basic",
        name: "Basic",
        pricing: { usd: 20, ngn: 31000 },
        description: "A simple monthly subscription to get started",
        features: [
          "Recurring $20/month subscription",
          "Up to 50 orders / month",
          "Email support",
          "Basic analytics",
          "Pay-as-you-go resource billing",
        ],
        highlight: false,
        quotas: { aiImages: 3, aiVideos: 1, aiCaptions: 15, voiceMinutes: 5, sms: 10, email: 75 },
      },
      {
        tier: "starter",
        name: "Starter",
        pricing: { usd: 29, ngn: 45000 },
        description: "Get started with direct payment routing",
        features: [
          "Connect your own Stripe or Paystack account",
          "Up to 100 orders / month",
          "Email support",
          "Basic analytics",
        ],
        highlight: false,
        quotas: { aiImages: 5, aiVideos: 2, aiCaptions: 25, voiceMinutes: 10, sms: 25, email: 150 },
      },
      {
        tier: "pro",
        name: "Pro",
        pricing: { usd: 79, ngn: 122500 },
        description: "Everything your growing business needs",
        features: [
          "Everything in Starter",
          "Unlimited orders",
          "Priority support",
          "Advanced analytics",
          "Multi-currency payouts",
        ],
        highlight: true,
        quotas: { aiImages: 15, aiVideos: 7, aiCaptions: 100, voiceMinutes: 40, sms: 100, email: 500 },
      },
      {
        tier: "enterprise",
        name: "Enterprise",
        pricing: { usd: 199, ngn: 308500 },
        description: "For high-volume vendors and large teams",
        features: [
          "Everything in Pro",
          "Dedicated account manager",
          "Custom integrations",
          "SLA guarantees",
          "White-glove onboarding",
        ],
        highlight: false,
        quotas: { aiImages: 40, aiVideos: 20, aiCaptions: 300, voiceMinutes: 120, sms: 300, email: 1500 },
      },
      {
        tier: "connected",
        name: "Connected Business",
        pricing: { usd: 49, ngn: 76000 },
        description: "For platform and website owners who want an AI-generated API system",
        features: [
          "Connect GitHub, GitLab, or Bitbucket",
          "AI-generated API documentation from your codebase",
          "Custom base URL or use https://awajimaaai.com",
          "Shareable docs link for your website or social",
          "Unlimited doc regeneration on every update",
          "Listed in the Trusted By section on our homepage",
          "All Pro vendor features included",
        ],
        highlight: true,
        quotas: { aiImages: 15, aiVideos: 7, aiCaptions: 100, voiceMinutes: 40, sms: 100, email: 500 },
      },
    ],
  },
  // Which payment gateways vendors may use to pay for their PLATFORM
  // subscription (starter/pro/enterprise), independent of which gateways a
  // vendor has enabled for routing their own customers' order payments.
  // Admin-only toggle; a vendor sees only the currencies/gateways enabled here.
  "billing.paymentGateways": {
    stripe: true,
    paystack: true,
    paypal: false,
  },
  // Free-trial settings — admin-editable. When enabled, new vendors may start
  // a Stripe-backed trial: card is captured up front but not charged until the
  // trial ends. Stripe auto-converts to a paid subscription at trial end unless
  // the vendor cancels first. durationDays is passed directly to Stripe's
  // trial_period_days and to the UI so vendors know how long the trial runs.
  "billing.trialSettings": {
    enabled: true,
    defaultDurationDays: 7,
    availableDurations: [7, 14, 21, 30],
  },
  // Per-unit overage & add-on pricing (USD). Applied when a paid-tier vendor
  // exhausts their included monthly quota and continues using a resource
  // (pay-as-you-go overage), or when any vendor proactively buys a bundle of
  // extra capacity for a resource (add-on purchase). Priced at roughly
  // 2.5-3× the platform's real unit cost so overage is profitable but not
  // punitive. Admins can tune per-resource rates here; changes take effect
  // immediately for new usage events and new add-on purchases.
  "billing.overageRates": {
    aiImages:     0.50,   // platform cost ≈ $0.19
    aiVideos:     1.00,   // platform cost ≈ $0.30
    aiCaptions:   0.05,   // platform cost ≈ $0.01
    voiceMinutes: 0.15,   // platform cost ≈ $0.06
    sms:          0.05,   // platform cost ≈ $0.01
    email:        0.01,   // platform cost ≈ $0.001
  },
  // Admin-configurable monthly operating costs shown in the Revenue &
  // Pricing Intelligence panel. Replit hosting cost is the main entry;
  // admins can add other recurring costs separately.
  "admin.platformCosts": {
    replitMonthlyCostUsd: 25,
    otherMonthlyCostUsd: 0,
    notes: "",
  },
  // Social account health check settings. repeatOffenderThreshold controls
  // how many active → needs_reconnect transitions within a 30-day window
  // triggers the escalation Slack alert ("needs direct follow-up"). Defaults
  // to 3 — the alert fires at exactly the Nth break, not every subsequent one.
  "admin.socialHealthSettings": {
    repeatOffenderThreshold: 3,
  },
  // Auto-deduction escalation ladder (USD thresholds).
  // Vendors start at ladder[0]. After each successful threshold charge their
  // personal threshold advances to the next rung. Once at the top rung all
  // subsequent charges fire at that level. Admins can reset a vendor's rung
  // back to null (= ladder[0]) via the billing-enforcement panel.
  "billing.deductionLadder": [10, 50, 100, 200],
  // Wallet & payout settings
  "wallet.settings": {
    usdToNgnRate:    1650,
    platformFeeRate: 0.025,
  },
  // GenHaL explainer video hosted on Cloudflare R2.
  // Set to the full public R2 URL of the uploaded .mp4/.webm file.
  // Empty string means the section is hidden on the GenHaL homepage.
  "genhal.explainerVideoUrl": "",
} as const;

export type SiteContentKey = keyof typeof DEFAULT_SITE_CONTENT;
export const SITE_CONTENT_KEYS = Object.keys(DEFAULT_SITE_CONTENT) as SiteContentKey[];

/** Public-facing keys — everything except internal templates (e.g. email copy) and internal admin settings. */
export const PUBLIC_SITE_CONTENT_KEYS = SITE_CONTENT_KEYS.filter(
  (k) => !k.startsWith("email.") && !k.startsWith("admin."),
);

// ─── Per-key runtime validation ──────────────────────────────────────────────
// Every write is validated against its exact shape before being persisted, so
// a malformed admin edit can never reach the public landing page.

const heroSchema = z.object({
  badge: z.string().max(200),
  heading: z.string().max(300),
  subheading: z.string().max(1000),
  primaryCta: z.string().max(100),
  secondaryCta: z.string().max(100),
});

const featuresSchema = z.object({
  heading: z.string().max(300),
  subheading: z.string().max(1000),
  items: z.array(z.object({ title: z.string().max(200), description: z.string().max(500) })).max(24),
});

const statsSchema = z.object({
  heading: z.string().max(300),
  body: z.string().max(1500),
  bullets: z.array(z.string().max(300)).max(20),
  stats: z.array(z.object({ value: z.string().max(30), label: z.string().max(120) })).max(12),
});

const ctaSchema = z.object({
  heading: z.string().max(300),
  body: z.string().max(1000),
  buttonLabel: z.string().max(100),
});

const settingsSchema = z.object({
  siteName: z.string().max(150),
  logoUrl: z.string().max(2000),
  supportEmail: z.string().max(320),
  footerTagline: z.string().max(500),
});

const emailSchema = z.object({
  subject: z.string().max(300),
  body: z.string().max(2000),
});

const exportAlertSettingsSchema = z.object({
  threshold: z.number().int().min(1).max(1000),
  windowMinutes: z.number().int().min(1).max(1440),
});

const voiceSignatureFailureAlertSettingsSchema = z.object({
  threshold: z.number().int().min(1).max(1000),
  windowMinutes: z.number().int().min(1).max(1440),
});

const voiceBackfillLastRunSchema = z.object({
  ranAt: z.string().nullable(),
  triggeredBy: z.string().max(200),
  checked: z.number().int().min(0),
  updated: z.number().int().min(0),
  failed: z.number().int().min(0),
});

const voiceBackfillRecentFixesSchema = z.array(
  z.object({
    ranAt: z.string(),
    callSid: z.string().max(100),
    fromStatus: z.string().max(50),
    toStatus: z.string().max(50),
  }),
).max(200);

const subscriptionPlanQuotasSchema = z.object({
  aiImages: z.number().int().min(0).max(100000),
  aiVideos: z.number().int().min(0).max(100000),
  aiCaptions: z.number().int().min(0).max(100000),
  voiceMinutes: z.number().int().min(0).max(100000),
  sms: z.number().int().min(0).max(1000000),
  email: z.number().int().min(0).max(1000000),
});

const subscriptionPlanPricingSchema = z.object({
  usd: z.number().min(0).max(100000),
  ngn: z.number().min(0).max(100000000),
});

const planGatewaysSchema = z
  .object({ stripe: z.boolean(), paystack: z.boolean(), paypal: z.boolean() })
  .optional();

const subscriptionPlansSchema = z.object({
  plans: z.array(
    z.object({
      /**
       * Slug identifying the tier — used everywhere billing/checkout references a plan.
       * Must be lowercase letters, numbers, hyphens, or underscores.
       * Changing an existing tier slug after vendors have subscribed to it will break
       * tier lookups for those vendors — treat slugs as immutable once in production.
       */
      tier: z.string().min(1).max(50).regex(/^[a-z][a-z0-9_-]*$/, {
        message: "Tier slug must start with a lowercase letter and contain only lowercase letters, numbers, hyphens, or underscores.",
      }),
      name: z.string().min(1).max(100),
      pricing: subscriptionPlanPricingSchema,
      description: z.string().max(500),
      features: z.array(z.string().max(300)).max(30),
      highlight: z.boolean(),
      quotas: subscriptionPlanQuotasSchema,
      /**
       * Per-plan gateway availability. If omitted, all globally-enabled gateways apply.
       * If set, intersected with the global billing.paymentGateways setting — a gateway
       * disabled globally is never available even if enabled here.
       */
      gateways: planGatewaysSchema,
    }),
  ).min(1).max(20),
});

const paymentGatewaysSchema = z
  .object({
    stripe: z.boolean(),
    paystack: z.boolean(),
    paypal: z.boolean(),
  })
  .refine((v) => v.stripe || v.paystack || v.paypal, {
    message: "At least one payment gateway must stay enabled.",
  });

const trialSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Default duration offered during Stripe checkout trial signup. */
  defaultDurationDays: z.number().int().min(1).max(365),
  /** Durations available in the manual admin-assign-trial UI. */
  availableDurations: z.array(z.number().int().min(1).max(365)).min(1).max(20),
  /** Legacy field — kept for backwards compat with old site-content records. */
  durationDays: z.number().int().min(1).max(365).optional(),
});

const overageRateValue = z.number().min(0).max(10000);
const overageRatesSchema = z.object({
  aiImages:     overageRateValue,
  aiVideos:     overageRateValue,
  aiCaptions:   overageRateValue,
  voiceMinutes: overageRateValue,
  sms:          overageRateValue,
  email:        overageRateValue,
});

const platformCostsSchema = z.object({
  replitMonthlyCostUsd: z.number().min(0).max(100000),
  otherMonthlyCostUsd:  z.number().min(0).max(100000),
  notes: z.string().max(500),
});

const socialHealthSettingsSchema = z.object({
  repeatOffenderThreshold: z.number().int().min(2).max(100),
});

const deductionLadderSchema = z
  .array(z.number().min(0.01).max(100_000))
  .min(1)
  .max(20)
  .refine((arr) => {
    for (let i = 1; i < arr.length; i++) {
      if (arr[i]! <= arr[i - 1]!) return false;
    }
    return true;
  }, { message: "Ladder rungs must be in strictly ascending order." });

const SITE_CONTENT_SCHEMAS: Record<SiteContentKey, z.ZodType> = {
  "landing.hero": heroSchema,
  "landing.features": featuresSchema,
  "landing.stats": statsSchema,
  "landing.cta": ctaSchema,
  "site.settings": settingsSchema,
  "email.birthday": emailSchema,
  "admin.exportAlertSettings": exportAlertSettingsSchema,
  "admin.voiceSignatureFailureAlertSettings": voiceSignatureFailureAlertSettingsSchema,
  "admin.voiceBackfillLastRun": voiceBackfillLastRunSchema,
  "admin.voiceBackfillRecentFixes": voiceBackfillRecentFixesSchema,
  "billing.subscriptionPlans": subscriptionPlansSchema,
  "billing.paymentGateways": paymentGatewaysSchema,
  "billing.trialSettings": trialSettingsSchema,
  "billing.overageRates": overageRatesSchema,
  "admin.platformCosts": platformCostsSchema,
  "admin.socialHealthSettings": socialHealthSettingsSchema,
  "billing.deductionLadder": deductionLadderSchema,
  "wallet.settings": z.object({ usdToNgnRate: z.number().min(1), platformFeeRate: z.number().min(0).max(1) }),
  "genhal.explainerVideoUrl": z.string().max(2048),
};

/** Validates and normalizes a raw value for `key`. Throws a ZodError on failure. */
export function validateSiteContentBlock(key: SiteContentKey, value: unknown): unknown {
  return SITE_CONTENT_SCHEMAS[key].parse(value);
}

/** Returns all content blocks, merging DB overrides on top of defaults. */
export async function getSiteContent(): Promise<Record<string, unknown>> {
  const rows = await db.select().from(siteContentTable);
  const overrides = new Map(rows.map((r) => [r.key, r.value]));
  const merged: Record<string, unknown> = {};
  for (const key of SITE_CONTENT_KEYS) {
    merged[key] = overrides.has(key) ? overrides.get(key) : DEFAULT_SITE_CONTENT[key];
  }
  return merged;
}

/** Returns a single content block, falling back to its default. */
export async function getSiteContentBlock(key: SiteContentKey): Promise<unknown> {
  const [row] = await db.select().from(siteContentTable).where(eq(siteContentTable.key, key));
  return row ? row.value : DEFAULT_SITE_CONTENT[key];
}

/**
 * Upserts a content block, recording who changed it, and appends an
 * immutable audit row (old value, new value, admin identity, timestamp) to
 * `site_content_audit_log`. `siteContentTable` itself only tracks the most
 * recent editor — it gets overwritten on every edit — so admin-sensitive
 * blocks (like the export-burst alert threshold) rely on this history to
 * answer "who changed this and when" beyond the latest edit.
 *
 * Value must already be validated.
 */
export async function setSiteContentBlock(
  key: SiteContentKey,
  value: unknown,
  updatedBy: string,
  updatedByDisplayName: string | null = null,
): Promise<void> {
  const previousValue = await getSiteContentBlock(key);

  await db.transaction(async (tx) => {
    await tx
      .insert(siteContentTable)
      .values({ key, value: value as object, updatedBy })
      .onConflictDoUpdate({
        target: siteContentTable.key,
        set: { value: value as object, updatedBy, updatedAt: new Date() },
      });

    await tx.insert(siteContentAuditLogTable).values({
      contentKey: key,
      adminUserId: updatedBy,
      adminDisplayName: updatedByDisplayName,
      oldValue: JSON.stringify(previousValue),
      newValue: JSON.stringify(value),
    });
  });
}

/** Returns the most recent edits to `key`, newest first. */
export async function getSiteContentAuditLog(key: SiteContentKey, limit = 50) {
  return db
    .select()
    .from(siteContentAuditLogTable)
    .where(eq(siteContentAuditLogTable.contentKey, key))
    .orderBy(desc(siteContentAuditLogTable.changedAt))
    .limit(limit);
}
