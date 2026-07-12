import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Zap, Building2, Rocket, Loader2, ArrowUpCircle, RefreshCw } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const PLANS = [
  {
    tier: "starter",
    name: "Starter",
    price: 29,
    description: "Get started with direct payment routing",
    icon: Rocket,
    iconColor: "text-blue-400",
    borderColor: "border-blue-800/40",
    badgeClass: "bg-blue-700 text-blue-100",
    features: [
      "Connect your own Stripe or Paystack account",
      "Up to 100 orders / month",
      "Email support",
      "Basic analytics",
    ],
    highlight: false,
  },
  {
    tier: "pro",
    name: "Pro",
    price: 79,
    description: "Everything your growing business needs",
    icon: Zap,
    iconColor: "text-violet-400",
    borderColor: "border-violet-700/60",
    badgeClass: "bg-violet-700 text-violet-100",
    features: [
      "Everything in Starter",
      "Unlimited orders",
      "Priority support",
      "Advanced analytics",
      "Multi-currency payouts",
    ],
    highlight: true,
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    price: 199,
    description: "For high-volume vendors and large teams",
    icon: Building2,
    iconColor: "text-amber-400",
    borderColor: "border-amber-800/40",
    badgeClass: "bg-amber-600 text-amber-100",
    features: [
      "Everything in Pro",
      "Dedicated account manager",
      "Custom integrations",
      "SLA guarantees",
      "White-glove onboarding",
    ],
    highlight: false,
  },
] as const;

type PlanTier = (typeof PLANS)[number]["tier"];

const TIER_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3,
};

interface Props {
  vendorId: number;
  currentTier: string;
  /** Called after a successful redirect URL is obtained so the parent can re-fetch. */
  onUpgradeInitiated?: () => void;
}

export type SyncResult = { synced: boolean; reason?: string; currentTier: string };

/** Calls the sync endpoint that reconciles the vendor's tier directly against Stripe. */
export async function syncSubscriptionStatus(vendorId: number): Promise<SyncResult> {
  const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/subscription/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Could not refresh billing status.");
  }
  return data as SyncResult;
}

export function RefreshBillingStatusButton({
  vendorId,
  onSynced,
}: {
  vendorId: number;
  onSynced?: (result: SyncResult) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleRefresh() {
    setLoading(true);
    try {
      const result = await syncSubscriptionStatus(vendorId);
      onSynced?.(result);
      if (result.synced) {
        toast.success(`Billing status updated — you're now on the ${result.currentTier} plan.`);
      } else {
        toast.info(result.reason ?? "Your billing status is already up to date.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error — could not refresh billing status.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={loading} onClick={handleRefresh}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
      {loading ? null : "Refresh billing status"}
    </Button>
  );
}

export function ManageBillingButton({ vendorId, currentTier }: { vendorId: number; currentTier: string }) {
  const [loading, setLoading] = useState(false);

  // A vendor only has a Stripe customer once they've completed a checkout at
  // least once — free-tier vendors who never upgraded have nothing to manage.
  if (currentTier === "free") return null;

  async function handleManageBilling() {
    setLoading(true);
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}`;
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/subscription/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ returnUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not open the billing portal.");
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Network error — could not open the billing portal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={loading} onClick={handleManageBilling}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Manage Billing"}
    </Button>
  );
}

export default function UpgradePlanCard({ vendorId, currentTier, onUpgradeInitiated }: Props) {
  const [busy, setBusy] = useState<PlanTier | null>(null);

  const currentRank = TIER_RANK[currentTier] ?? 0;

  async function handleUpgrade(tier: PlanTier) {
    setBusy(tier);
    try {
      const successUrl = `${window.location.origin}${window.location.pathname}?upgrade=success&tier=${tier}`;
      const cancelUrl = `${window.location.origin}${window.location.pathname}?upgrade=cancelled`;

      const res = await fetch(
        `${BASE_URL}/api/vendors/${vendorId}/subscription/checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tier, successUrl, cancelUrl }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Could not start checkout. Please try again.");
        return;
      }

      if (!data.url) {
        toast.error("No checkout URL returned from server.");
        return;
      }

      onUpgradeInitiated?.();
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch {
      toast.error("Network error — could not start checkout.");
    } finally {
      setBusy(null);
    }
  }

  // If vendor is already on enterprise there's nothing to upgrade to — but
  // they may still want to manage billing (invoices, payment method, cancel).
  if (currentRank >= TIER_RANK["enterprise"]) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpCircle className="w-4 h-4 text-violet-400" />
              Your Plan
            </CardTitle>
            <CardDescription>
              You're on the Enterprise plan. Manage billing details, invoices, or cancel below.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <RefreshBillingStatusButton vendorId={vendorId} onSynced={() => onUpgradeInitiated?.()} />
            <ManageBillingButton vendorId={vendorId} currentTier={currentTier} />
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4 text-violet-400" />
            Upgrade Your Plan
          </CardTitle>
          <CardDescription>
            Unlock direct payment routing and more by upgrading your subscription.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <RefreshBillingStatusButton vendorId={vendorId} onSynced={() => onUpgradeInitiated?.()} />
          <ManageBillingButton vendorId={vendorId} currentTier={currentTier} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const targetRank = TIER_RANK[plan.tier];
            const isCurrent = plan.tier === currentTier;
            const isDowngrade = targetRank <= currentRank && !isCurrent;
            const isUnavailable = isCurrent || isDowngrade;
            const Icon = plan.icon;

            return (
              <div
                key={plan.tier}
                className={`relative rounded-xl border p-5 flex flex-col gap-4 transition-colors ${
                  plan.highlight
                    ? `${plan.borderColor} bg-violet-950/20`
                    : `${plan.borderColor} bg-zinc-900/40`
                } ${isUnavailable ? "opacity-50" : ""}`}
              >
                {plan.highlight && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-0.5 rounded-full">
                    Most Popular
                  </span>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${plan.iconColor}`} />
                    <span className="font-semibold text-sm">{plan.name}</span>
                  </div>
                  {isCurrent && (
                    <Badge className={`text-[10px] px-2 py-0 ${plan.badgeClass}`}>
                      Current
                    </Badge>
                  )}
                </div>

                <div>
                  <div className="text-2xl font-bold">
                    ${plan.price}
                    <span className="text-sm font-normal text-muted-foreground"> /mo</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                </div>

                <ul className="space-y-1.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-green-500" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  size="sm"
                  className="w-full"
                  variant={plan.highlight ? "default" : "outline"}
                  disabled={isUnavailable || busy !== null}
                  onClick={() => handleUpgrade(plan.tier)}
                >
                  {busy === plan.tier ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isCurrent ? (
                    "Current plan"
                  ) : isDowngrade ? (
                    "Included in current"
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Payments are processed securely by Stripe. Your plan activates immediately after checkout.
        </p>
      </CardContent>
    </Card>
  );
}
