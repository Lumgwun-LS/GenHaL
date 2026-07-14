/**
 * No-code "Site Editor" content store.
 *
 * Each block is a named JSON blob. `DEFAULT_SITE_CONTENT` is the fallback
 * shown when an admin has never edited that block — the site always renders
 * correctly even with an empty `site_content` table. Admin edits upsert a row
 * per key; `getSiteContent()` merges DB overrides on top of the defaults.
 */
import { db } from "@workspace/db";
import { siteContentTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
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

/** Upserts a content block, recording who changed it. Value must already be validated. */
export async function setSiteContentBlock(key: SiteContentKey, value: unknown, updatedBy: string): Promise<void> {
  await db
    .insert(siteContentTable)
    .values({ key, value: value as object, updatedBy })
    .onConflictDoUpdate({
      target: siteContentTable.key,
      set: { value: value as object, updatedBy, updatedAt: new Date() },
    });
}
