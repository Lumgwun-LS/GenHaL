/**
 * Subscription plan definitions — admin-editable via the Site Editor
 * ("billing.subscriptionPlans" content block), not vendor-editable. Vendors
 * only ever read plans through GET /vendors/:id/subscription/plans (or the
 * public GET /site-content endpoint).
 *
 * Pricing methodology (see DEFAULT_SITE_CONTENT in site-content.ts for the
 * live numbers): each plan's bundled monthly resource quota is sized so its
 * real cost to the platform — at the assumed unit costs below — stays at
 * roughly 1/5th of the plan price, after also reserving budget for payment
 * processing fees (~3% of price, matching Stripe/Paystack/PayPal) and a flat
 * per-vendor infra/support overhead. That keeps the gross margin on a fully
 * utilized plan at ~5x cost. These unit costs are estimates based on
 * published provider pricing (OpenAI image generation, ElevenLabs TTS,
 * Twilio voice/SMS) — re-derive the quotas in the admin panel if real
 * invoiced costs turn out meaningfully different.
 */
import { getSiteContentBlock } from "./site-content";

/** Assumed platform cost per unit of each metered resource, in USD. Reference only — not enforced or exposed to editing. */
export const PLAN_RESOURCE_UNIT_COSTS = {
  aiImages: 0.19, // OpenAI gpt-image-1, 1536x1024 "high" quality
  aiVideos: 0.3, // Multi-scene AI video (image gen + Gemini + ffmpeg compute)
  aiCaptions: 0.01, // Short OpenAI text completion
  voiceMinutes: 0.06, // Twilio per-minute + ElevenLabs TTS for that call's script
  sms: 0.01, // Twilio SMS segment
  email: 0.001, // SMTP send, effectively negligible
} as const;

export interface SubscriptionPlanQuotas {
  aiImages: number;
  aiVideos: number;
  aiCaptions: number;
  voiceMinutes: number;
  sms: number;
  email: number;
}

export interface SubscriptionPlanPricing {
  usd: number;
  ngn: number;
}

export interface SubscriptionPlan {
  tier: "basic" | "starter" | "pro" | "enterprise";
  name: string;
  pricing: SubscriptionPlanPricing;
  description: string;
  features: string[];
  highlight: boolean;
  quotas: SubscriptionPlanQuotas;
}

/** Which gateway bills which currency for platform subscriptions — fixed, not admin-editable. */
export const SUBSCRIPTION_GATEWAY_CURRENCY = { stripe: "usd", paystack: "ngn", paypal: "usd" } as const;
export type SubscriptionGateway = keyof typeof SUBSCRIPTION_GATEWAY_CURRENCY;

/** Returns the current admin-configured plan list (falls back to defaults if never edited). */
export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const block = (await getSiteContentBlock("billing.subscriptionPlans")) as { plans: SubscriptionPlan[] };
  return block.plans;
}

export async function getSubscriptionPlan(tier: string): Promise<SubscriptionPlan | undefined> {
  const plans = await getSubscriptionPlans();
  return plans.find((p) => p.tier === tier);
}

/** Which gateways admins have enabled for vendors to pay their platform subscription with. */
export async function getEnabledSubscriptionGateways(): Promise<Record<SubscriptionGateway, boolean>> {
  return (await getSiteContentBlock("billing.paymentGateways")) as Record<SubscriptionGateway, boolean>;
}
