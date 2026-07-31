/**
 * Public Pricing Page
 *
 * Shows subscription plans + included monthly resource quotas,
 * then a pay-as-you-go overage rate card.
 * Fetches live data from /api/site-content so admin edits are reflected instantly.
 * No underlying tool names (Twilio, ElevenLabs, etc.) are mentioned.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Check, Minus, Zap, ImageIcon, Video, Phone, MessageSquare,
  Mail, FileText, ChevronDown, ChevronUp, ArrowRight, Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Plan {
  tier: string;
  name: string;
  pricing: { usd: number; ngn: number };
  description: string;
  features: string[];
  highlight: boolean;
  quotas: Record<string, number>;
}

interface SiteContent {
  "billing.subscriptionPlans"?: { plans: Plan[] };
  "billing.overageRates"?: Record<string, number>;
  "billing.trialSettings"?: { enabled: boolean; defaultDurationDays: number };
  "site.settings"?: { siteName: string; logoUrl?: string };
}

// ── Resource definitions ───────────────────────────────────────────────────────
const RESOURCES = [
  {
    key: "aiImages",
    label: "AI Images",
    description: "AI-generated product photos and marketing visuals",
    unit: "images / mo",
    overageUnit: "/ image",
    icon: ImageIcon,
    color: "text-violet-500",
    bg: "bg-violet-50 dark:bg-violet-950/30",
  },
  {
    key: "aiVideos",
    label: "AI Videos",
    description: "AI-generated promotional and product videos",
    unit: "videos / mo",
    overageUnit: "/ video",
    icon: Video,
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    key: "aiCaptions",
    label: "AI Content",
    description: "AI-written captions, product descriptions and social copy",
    unit: "pieces / mo",
    overageUnit: "/ piece",
    icon: FileText,
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  {
    key: "voiceMinutes",
    label: "Voice Calls",
    description: "Automated voice calls to customers and leads",
    unit: "minutes / mo",
    overageUnit: "/ min",
    icon: Phone,
    color: "text-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/30",
  },
  {
    key: "sms",
    label: "SMS Messages",
    description: "Text messages for campaigns and notifications",
    unit: "messages / mo",
    overageUnit: "/ SMS",
    icon: MessageSquare,
    color: "text-pink-500",
    bg: "bg-pink-50 dark:bg-pink-950/30",
  },
  {
    key: "email",
    label: "Emails",
    description: "Email campaigns, receipts, and customer notifications",
    unit: "emails / mo",
    overageUnit: "/ email",
    icon: Mail,
    color: "text-cyan-500",
    bg: "bg-cyan-50 dark:bg-cyan-950/30",
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtUsd(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 === 0 ? 0 : 2 })}`;
}
function fmtNgn(n: number) {
  return `₦${n.toLocaleString("en-NG")}`;
}
function fmtOverage(n: number) {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1)    return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

const TIER_ORDER = ["free", "basic", "starter", "pro", "enterprise"];

function tierColor(tier: string, highlight: boolean) {
  if (highlight) return "border-primary shadow-xl shadow-primary/10";
  return "border-border";
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: "What happens when I use up my monthly quota?",
    a: "On paid plans (Basic, Starter, Pro, Enterprise) you keep going — usage beyond your quota is billed at the pay-as-you-go rates shown below, and collected automatically. Free-tier accounts are paused until the next billing period.",
  },
  {
    q: "Can I switch plans at any time?",
    a: "Yes. Upgrades take effect immediately and you're billed the new rate from your next cycle. Downgrades take effect at the end of your current billing period.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes — paid plans include a 7-day free trial. Your card is stored but not charged until the trial ends, and you can cancel at any time during the trial at no cost.",
  },
  {
    q: "What currencies can I pay in?",
    a: "USD (card via Stripe) or NGN (card via Paystack). The NGN price is shown on each plan. Both currencies are billed monthly.",
  },
  {
    q: "Do unused quota credits roll over?",
    a: "No — monthly quotas reset at the start of each billing cycle. Add-on credit bundles purchased separately do carry over until used.",
  },
  {
    q: "What is the Enterprise plan for?",
    a: "Enterprise is designed for high-volume operations that need large quotas, a dedicated account manager, custom integrations, and SLA-backed uptime guarantees.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        className="w-full flex items-center justify-between gap-4 py-5 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="font-medium text-sm">{q}</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && <p className="pb-5 text-sm text-muted-foreground leading-relaxed">{a}</p>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PricingPage() {
  const [currency, setCurrency] = useState<"usd" | "ngn">("usd");

  const { data: content, isLoading } = useQuery<SiteContent>({
    queryKey: ["site-content-pricing"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/site-content`);
      if (!r.ok) throw new Error("Failed to load pricing");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const rawPlans = content?.["billing.subscriptionPlans"]?.plans ?? [];
  const overageRates = content?.["billing.overageRates"] ?? {
    aiImages: 0.50, aiVideos: 1.00, aiCaptions: 0.05,
    voiceMinutes: 0.15, sms: 0.05, email: 0.01,
  };
  const trial = content?.["billing.trialSettings"];
  const siteName = content?.["site.settings"]?.siteName ?? "Awa Biz Suite";

  // Sort plans by tier order, add free tier at front
  const freePlan: Plan = {
    tier: "free", name: "Free", pricing: { usd: 0, ngn: 0 },
    description: "Explore the platform with no commitment",
    features: ["1 vendor profile", "Up to 10 orders / month", "Community support"],
    highlight: false,
    quotas: { aiImages: 0, aiVideos: 0, aiCaptions: 0, voiceMinutes: 0, sms: 0, email: 0 },
  };
  const plans = [freePlan, ...rawPlans].sort(
    (a, b) => (TIER_ORDER.indexOf(a.tier) ?? 99) - (TIER_ORDER.indexOf(b.tier) ?? 99)
  );

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Navbar ──────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-primary" />
            <span className="font-extrabold text-lg tracking-tight">{siteName}</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">
                {trial?.enabled ? `Start ${trial.defaultDurationDays}-Day Free Trial` : "Get Started"}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-16">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="py-20 text-center px-6">
          <div className="container mx-auto max-w-3xl">
            {trial?.enabled && (
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-semibold px-4 py-1.5 rounded-full mb-6 border border-primary/20">
                <Zap className="w-3.5 h-3.5" />
                {trial.defaultDurationDays}-day free trial · no card charged until trial ends
              </div>
            )}
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
              Simple, transparent pricing
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Start free. Scale as you grow. Every plan includes a full set of tools —
              pick the resource quota that fits your business.
            </p>

            {/* Currency toggle */}
            <div className="inline-flex mt-8 bg-muted rounded-lg p-1 gap-1">
              <button
                onClick={() => setCurrency("usd")}
                className={cn(
                  "px-5 py-1.5 rounded-md text-sm font-semibold transition-all",
                  currency === "usd"
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                USD ($)
              </button>
              <button
                onClick={() => setCurrency("ngn")}
                className={cn(
                  "px-5 py-1.5 rounded-md text-sm font-semibold transition-all",
                  currency === "ngn"
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                NGN (₦)
              </button>
            </div>
          </div>
        </section>

        {/* ── Plan cards ───────────────────────────────────────────────────── */}
        <section className="pb-16 px-6">
          <div className="container mx-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
                <Zap className="w-4 h-4 animate-pulse" /> Loading plans…
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 items-start">
                {plans.map((plan) => (
                  <div
                    key={plan.tier}
                    className={cn(
                      "relative rounded-2xl border-2 bg-card p-6 flex flex-col gap-5 transition-shadow",
                      tierColor(plan.tier, plan.highlight),
                      plan.highlight && "ring-2 ring-primary/20"
                    )}
                  >
                    {plan.highlight && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full shadow">
                          Most Popular
                        </span>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                        {plan.name}
                      </p>
                      {plan.pricing.usd === 0 ? (
                        <div className="flex items-end gap-1 mb-1">
                          <span className="text-3xl font-black">Free</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-1 mb-0.5">
                            <span className="text-xs font-semibold text-muted-foreground/70 tracking-wide">from</span>
                            <span className="text-3xl font-black">
                              {currency === "usd"
                                ? fmtUsd(plan.pricing.usd)
                                : fmtNgn(plan.pricing.ngn)}
                            </span>
                            <span className="text-muted-foreground text-sm">/ mo</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground/60 mb-1">
                            extra usage billed as you go
                          </p>
                        </>
                      )}
                      <p className="text-xs text-muted-foreground leading-relaxed">{plan.description}</p>
                    </div>

                    <Link href={plan.tier === "free" ? "/sign-up" : "/sign-up"}>
                      <Button
                        className="w-full"
                        variant={plan.highlight ? "default" : "outline"}
                        size="sm"
                      >
                        {plan.tier === "free"
                          ? "Get started free"
                          : trial?.enabled
                            ? `Try free for ${trial.defaultDurationDays} days`
                            : "Choose plan"}
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </Link>

                    {/* Included quotas */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        Included monthly
                      </p>
                      <ul className="space-y-2">
                        {RESOURCES.map((r) => {
                          const qty = plan.quotas[r.key] ?? 0;
                          return (
                            <li key={r.key} className="flex items-center justify-between gap-2 text-xs">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <r.icon className={cn("w-3.5 h-3.5", r.color)} />
                                {r.label}
                              </span>
                              <span className={cn(
                                "font-semibold tabular-nums",
                                qty === 0 ? "text-muted-foreground/50" : "text-foreground"
                              )}>
                                {qty === 0 ? <Minus className="w-3 h-3" /> : qty.toLocaleString()}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {/* Plan features */}
                    {plan.features.length > 0 && (
                      <ul className="space-y-2 border-t border-border pt-4">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Resource quota comparison table ──────────────────────────────── */}
        <section className="py-16 px-6 bg-muted/30 border-y border-border">
          <div className="container mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold mb-2">Resource quota comparison</h2>
              <p className="text-muted-foreground text-sm">Everything included per month on each plan.</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide w-48">
                      Resource
                    </th>
                    {plans.map((p) => (
                      <th key={p.tier} className={cn(
                        "text-center px-4 py-3.5 font-semibold text-xs uppercase tracking-wide",
                        p.highlight ? "text-primary" : "text-muted-foreground"
                      )}>
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RESOURCES.map((r, i) => (
                    <tr key={r.key} className={cn("border-b border-border last:border-0", i % 2 === 1 && "bg-muted/20")}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", r.bg)}>
                            <r.icon className={cn("w-3.5 h-3.5", r.color)} />
                          </div>
                          <div>
                            <p className="font-medium text-xs">{r.label}</p>
                            <p className="text-[11px] text-muted-foreground">{r.description}</p>
                          </div>
                        </div>
                      </td>
                      {plans.map((p) => {
                        const qty = p.quotas[r.key] ?? 0;
                        return (
                          <td key={p.tier} className={cn(
                            "text-center px-4 py-4 tabular-nums font-medium",
                            p.highlight && "bg-primary/3",
                            qty === 0 ? "text-muted-foreground/40" : ""
                          )}>
                            {qty === 0
                              ? <Minus className="w-4 h-4 mx-auto text-muted-foreground/30" />
                              : <span>{qty.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">{r.unit}</span></span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Pay-as-you-go rates ───────────────────────────────────────────── */}
        <section className="py-16 px-6">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-10">
              <Badge variant="outline" className="mb-4 text-xs">Pay as you go</Badge>
              <h2 className="text-2xl font-bold mb-2">Need more? Only pay for what you use</h2>
              <p className="text-muted-foreground text-sm max-w-lg mx-auto">
                On paid plans, once your monthly quota is used up you can keep going.
                Usage beyond the quota is billed at these per-unit rates — no surprises,
                no hard cutoffs.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {RESOURCES.map((r) => {
                const rate = (overageRates as Record<string, number>)[r.key] ?? 0;
                return (
                  <div
                    key={r.key}
                    className="rounded-xl border border-border bg-card p-5 flex items-start gap-4 hover:border-primary/30 hover:shadow-sm transition-all"
                  >
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", r.bg)}>
                      <r.icon className={cn("w-5 h-5", r.color)} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{r.label}</p>
                      <p className="text-xs text-muted-foreground mb-2">{r.description}</p>
                      <p className="text-xl font-black">
                        {fmtOverage(rate)}
                        <span className="text-xs font-normal text-muted-foreground ml-1">{r.overageUnit}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Overage charges are settled automatically when your running balance reaches $60,
              or at the end of the billing cycle — whichever comes first.
              Free-tier accounts are paused rather than billed when quota is exhausted.
            </p>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section className="py-16 px-6 bg-muted/30 border-t border-border">
          <div className="container mx-auto max-w-2xl">
            <h2 className="text-2xl font-bold text-center mb-10">Frequently asked questions</h2>
            <div className="rounded-xl border border-border bg-card px-6">
              {FAQS.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section className="py-20 px-6 text-center">
          <div className="container mx-auto max-w-xl">
            <h2 className="text-3xl font-black mb-3">Ready to grow your business?</h2>
            <p className="text-muted-foreground mb-8">
              {trial?.enabled
                ? `Start your ${trial.defaultDurationDays}-day free trial. No credit card charged until the trial ends.`
                : "Get started today and scale your business with the right tools."}
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/sign-up">
                <Button size="lg" className="px-8 font-bold">
                  {trial?.enabled ? `Start Free Trial` : "Get Started"} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/sign-in">
                <Button size="lg" variant="outline" className="px-8">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className="border-t border-border py-8 px-6 text-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Lumgwun Solutions Group · {siteName} ·{" "}
            <Link href="/contact" className="hover:text-foreground transition-colors">Contact Us</Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
