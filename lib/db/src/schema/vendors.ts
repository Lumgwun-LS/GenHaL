import { pgTable, text, serial, timestamp, integer, boolean, date, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vendorsTable = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  status: text("status").notNull().default("active"),
  email: text("email").notNull(),
  phone: text("phone"),
  website: text("website"),
  address: text("address"),
  logoUrl: text("logo_url"),
  description: text("description"),
  // Public storefront theme — a preset id from the brand-themes template list
  brandTheme: text("brand_theme").notNull().default("violet"),
  clerkUserId: text("clerk_user_id"),
  // Awajimaa bridge fields — populated when vendor is created via external handshake
  awajimaaUserId: text("awajimaa_user_id").unique(),
  awajimaaUserType: text("awajimaa_user_type"),  // state|hospital|emergency|business|individual
  externalSource: text("external_source").notNull().default("vendorhub"),
  // Payment gateway settings — admin-configurable per vendor
  stripeEnabled: boolean("stripe_enabled").notNull().default(false),
  paystackEnabled: boolean("paystack_enabled").notNull().default(false),
  remitaEnabled: boolean("remita_enabled").notNull().default(false),
  flutterwaveEnabled: boolean("flutterwave_enabled").notNull().default(false),
  nombaEnabled: boolean("nomba_enabled").notNull().default(false),
  paypalEnabled: boolean("paypal_enabled").notNull().default(false),
  squadEnabled: boolean("squad_enabled").notNull().default(false),
  interswitchEnabled: boolean("interswitch_enabled").notNull().default(false),
  defaultCurrency: text("default_currency").notNull().default("USD"),
  // Subscription & verification — controls which premium features are unlocked
  subscriptionTier: text("subscription_tier").notNull().default("free"),    // free|starter|pro|enterprise
  verificationLevel: text("verification_level").notNull().default("unverified"), // unverified|basic|verified|premium
  // Stripe customer — created on first subscription checkout, reused for portal sessions & cancellations
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  // Which gateway the vendor's *platform subscription billing* (not order payments) runs
  // through — set on first subscription checkout, null while on the free tier.
  subscriptionProvider: text("subscription_provider"), // stripe|paystack|null
  // Paystack customer/subscription — mirrors the Stripe fields above. emailToken is
  // Paystack's per-subscription secret required to call the subscription/disable endpoint.
  paystackCustomerCode: text("paystack_customer_code"),
  paystackSubscriptionCode: text("paystack_subscription_code"),
  paystackEmailToken: text("paystack_email_token"),
  // Birthday — used for automated birthday greetings
  dateOfBirth: date("date_of_birth"),
  // Voice — opt-out of birthday & campaign calls (default opted in)
  voiceCallOptOut: boolean("voice_call_opt_out").notNull().default(false),
  // Push notification categories — vendor-controlled, default on for everyone
  // so adding a new category never silently changes existing behavior.
  pushPaymentAlertsEnabled: boolean("push_payment_alerts_enabled").notNull().default(true),
  pushVoiceCampaignAlertsEnabled: boolean("push_voice_campaign_alerts_enabled").notNull().default(true),
  pushPostRemindersEnabled: boolean("push_post_reminders_enabled").notNull().default(true),
  pushAiMediaExpiryEnabled: boolean("push_ai_media_expiry_enabled").notNull().default(true),
  pushFacebookVideoAlertsEnabled: boolean("push_facebook_video_alerts_enabled").notNull().default(true),
  // Bulk admin announcement emails — vendor-controlled, default on (opt-out, not opt-in),
  // so existing behavior (everyone gets emailed) doesn't silently change for anyone.
  announcementEmailOptOut: boolean("announcement_email_opt_out").notNull().default(false),
  // How many minutes before a scheduled post the vendor wants their pre-publish reminder.
  // Supported values: 15, 30, 60, 240, 1440. Defaults to 30 (legacy fixed lead time).
  postReminderLeadMinutes: integer("post_reminder_lead_minutes").notNull().default(30),
  // Demographics — self-reported by the vendor, used for admin analytics
  gender: text("gender"), // male|female|other|prefer_not_to_say
  country: text("country"),
  state: text("state"),
  city: text("city"),
  // Free-trial timestamps & duration — set when an admin assigns a trial or when
  // the vendor starts a Stripe trial. trialEndsAt is cleared once the trial converts.
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
  // Which trial duration (days) was granted: 7 | 14 | 21 | 30
  trialDurationDays: integer("trial_duration_days"),
  // PayPal subscription ID for platform billing — mirrors stripeSubscriptionId/paystackSubscriptionCode.
  paypalSubscriptionId: text("paypal_subscription_id"),
  // Anchor for the vendor's current metered-usage billing period (see lib/usage.ts).
  // Defaults to signup time; reset to now() whenever the tier changes (upgrade,
  // downgrade, cancellation) via subscription-sync.ts so quotas roll over on the
  // vendor's actual subscription lifecycle events rather than a fixed calendar day.
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull().defaultNow(),
  // Billing enforcement — set true when a Stripe invoice payment fails (insufficient funds
  // or card declined). Blocks all metered-resource consumption until the next invoice is
  // successfully paid. Cleared automatically by the invoice.paid Stripe webhook.
  billingBlocked: boolean("billing_blocked").notNull().default(false),
  // Auto-deduction threshold escalation.
  // NULL → use the platform ladder[0] from the billing.deductionLadder site-content block.
  // After each successful threshold charge the scheduler advances this to the next rung.
  // Admins can reset it back to NULL via the billing-enforcement admin panel.
  currentDeductionThreshold: numeric("current_deduction_threshold"),
  // Admin-granted feature trial — bumps the vendor's effective tier for a fixed
  // window without a Stripe subscription. Respected by getEffectiveTier() and
  // the subscription-sync reconciler so it isn't stomped on scheduled sync.
  featureTrialTier: text("feature_trial_tier"),          // starter|pro|enterprise
  featureTrialExpiresAt: timestamp("feature_trial_expires_at", { withTimezone: true }),
  featureTrialGrantedBy: text("feature_trial_granted_by"), // admin email for audit
  featureTrialGrantedAt: timestamp("feature_trial_granted_at", { withTimezone: true }),
  featureTrialNote: text("feature_trial_note"),
  // Admin-only: suspend all of this vendor's blog posts from the global blog page
  blogSuspended: boolean("blog_suspended").notNull().default(false),
  // Vendor opt-out: hide their posts from the platform-wide Awajimaa Vendor Blog page
  blogFeaturedOnPlatform: boolean("blog_featured_on_platform").notNull().default(true),
  // Set when a vendor account is permanently deleted — used to prevent the same
  // email/phone from registering a new account on this platform.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVendorSchema = createInsertSchema(vendorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendorsTable.$inferSelect;
