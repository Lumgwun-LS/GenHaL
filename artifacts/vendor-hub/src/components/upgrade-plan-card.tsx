import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { CheckCircle2, Zap, Building2, Rocket, Loader2, ArrowUpCircle, RefreshCw, ChevronDown } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type PlanTier = "starter" | "pro" | "enterprise";
type Gateway = "stripe" | "paystack";

interface PlanQuotas {
  aiImages: number;
  aiVideos: number;
  aiCaptions: number;
  voiceMinutes: number;
  sms: number;
  email: number;
}

interface Plan {
  tier: PlanTier;
  name: string;
  pricing: { usd: number; ngn: number };
  description: string;
  features: string[];
  highlight: boolean;
  quotas: PlanQuotas;
}

const TIER_ICON: Record<PlanTier, typeof Rocket> = { starter: Rocket, pro: Zap, enterprise: Building2 };
const TIER_ICON_COLOR: Record<PlanTier, string> = {
  starter: "text-blue-400",
  pro: "text-violet-400",
  enterprise: "text-amber-400",
};
const TIER_BORDER_COLOR: Record<PlanTier, string> = {
  starter: "border-blue-800/40",
  pro: "border-violet-700/60",
  enterprise: "border-amber-800/40",
};
const TIER_BADGE_CLASS: Record<PlanTier, string> = {
  starter: "bg-blue-700 text-blue-100",
  pro: "bg-violet-700 text-violet-100",
  enterprise: "bg-amber-600 text-amber-100",
};

const GATEWAY_LABEL: Record<Gateway, string> = { stripe: "Card (Stripe, USD)", paystack: "Paystack (NGN)" };

const TIER_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3,
};

interface Props {
  vendorId: number;
  currentTier: string;
  subscriptionProvider?: string | null;
  /** Called after a successful redirect URL is obtained so the parent can re-fetch. */
  onUpgradeInitiated?: () => void;
}

export type SyncResult = {
  synced: boolean;
  reason?: string;
  currentTier: string;
  /** True when the server served a cached/in-flight result instead of hitting the gateway again. */
  throttled?: boolean;
  /** Cooldown window (ms) the server enforces between real gateway round-trips for this vendor. */
  cooldownMs?: number;
};

const DEFAULT_COOLDOWN_MS = 20_000;

/** Calls the sync endpoint that reconciles the vendor's tier directly against Stripe or Paystack. */
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
  const [cooldownSecondsLeft, setCooldownSecondsLeft] = useState(0);

  function startCooldown(ms: number) {
    const seconds = Math.max(1, Math.ceil(ms / 1000));
    setCooldownSecondsLeft(seconds);
    const interval = setInterval(() => {
      setCooldownSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleRefresh() {
    setLoading(true);
    try {
      const result = await syncSubscriptionStatus(vendorId);
      onSynced?.(result);
      startCooldown(result.cooldownMs ?? DEFAULT_COOLDOWN_MS);
      if (result.throttled) {
        toast.info(result.reason ?? "Already checked recently — showing the latest known billing status.");
      } else if (result.synced) {
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

  const onCooldown = cooldownSecondsLeft > 0;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={loading || onCooldown}
      onClick={handleRefresh}
      title={onCooldown ? `You can refresh again in ${cooldownSecondsLeft}s` : undefined}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
      )}
      {loading ? null : onCooldown ? `Refresh available in ${cooldownSecondsLeft}s` : "Refresh billing status"}
    </Button>
  );
}

export function ManageBillingButton({
  vendorId,
  currentTier,
  subscriptionProvider,
  onChanged,
}: {
  vendorId: number;
  currentTier: string;
  subscriptionProvider?: string | null;
  onChanged?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  // A vendor only has billing to manage once they've checked out at least once.
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

  async function handleCancelPaystack() {
    if (!window.confirm("Cancel your subscription now? This takes effect immediately and you'll drop to the Free plan right away.")) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/subscription/paystack/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not cancel the subscription.");
        return;
      }
      toast.success("Subscription cancelled — you're back on the Free plan.");
      onChanged?.();
    } catch {
      toast.error("Network error — could not cancel the subscription.");
    } finally {
      setLoading(false);
    }
  }

  if (subscriptionProvider === "paystack") {
    return (
      <Button size="sm" variant="outline" disabled={loading} onClick={handleCancelPaystack}>
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Cancel Subscription"}
      </Button>
    );
  }

  return (
    <Button size="sm" variant="outline" disabled={loading} onClick={handleManageBilling}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Manage Billing"}
    </Button>
  );
}

interface PlansResponse {
  currentTier: string;
  plans: Plan[];
  enabledGateways: Record<Gateway, boolean>;
}

async function fetchPlans(vendorId: number): Promise<PlansResponse> {
  const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/subscription/plans`, { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not load plans.");
  return data as PlansResponse;
}

export default function UpgradePlanCard({ vendorId, currentTier, subscriptionProvider, onUpgradeInitiated }: Props) {
  const [busy, setBusy] = useState<PlanTier | null>(null);
  const [plansData, setPlansData] = useState<PlansResponse | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingPlans(true);
    fetchPlans(vendorId)
      .then((data) => { if (!cancelled) setPlansData(data); })
      .catch((err) => { if (!cancelled) toast.error(err instanceof Error ? err.message : "Could not load plans."); })
      .finally(() => { if (!cancelled) setLoadingPlans(false); });
    return () => { cancelled = true; };
  }, [vendorId]);

  const currentRank = TIER_RANK[currentTier] ?? 0;

  async function handleUpgrade(tier: PlanTier, provider: Gateway) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
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
          body: JSON.stringify({ tier, provider, successUrl, cancelUrl }),
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
      window.location.href = data.url;
    } catch {
      toast.error("Network error — could not start checkout.");
    } finally {
      setBusy(null);
      inFlightRef.current = false;
    }
  }

  if (loadingPlans || !plansData) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading plans…
        </CardContent>
      </Card>
    );
  }

  const { plans, enabledGateways } = plansData;
  const availableGateways = (Object.keys(enabledGateways) as Gateway[]).filter((g) => enabledGateways[g]);

  function priceLabel(plan: Plan): string {
    const parts: string[] = [];
    if (enabledGateways.stripe) parts.push(`$${plan.pricing.usd}`);
    if (enabledGateways.paystack) parts.push(`₦${plan.pricing.ngn.toLocaleString()}`);
    return parts.length > 0 ? parts.join(" / ") : `$${plan.pricing.usd}`;
  }

  function UpgradeButton({ plan, isUnavailable, isCurrent }: { plan: Plan; isUnavailable: boolean; isCurrent: boolean }) {
    if (isUnavailable) {
      return (
        <Button size="sm" className="w-full" variant="outline" disabled>
          {isCurrent ? "Current plan" : "Included in current"}
        </Button>
      );
    }

    if (busy === plan.tier) {
      return (
        <Button size="sm" className="w-full" variant={plan.highlight ? "default" : "outline"} disabled>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        </Button>
      );
    }

    // Only one gateway enabled — skip the picker, go straight to checkout.
    if (availableGateways.length <= 1) {
      const provider = availableGateways[0] ?? "stripe";
      return (
        <Button
          size="sm"
          className="w-full"
          variant={plan.highlight ? "default" : "outline"}
          disabled={busy !== null || availableGateways.length === 0}
          onClick={() => handleUpgrade(plan.tier, provider)}
        >
          {availableGateways.length === 0 ? "No gateway available" : `Upgrade to ${plan.name}`}
        </Button>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="w-full" variant={plan.highlight ? "default" : "outline"} disabled={busy !== null}>
            {`Upgrade to ${plan.name}`}
            <ChevronDown className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-full min-w-[220px]">
          {availableGateways.map((g) => (
            <DropdownMenuItem key={g} onClick={() => handleUpgrade(plan.tier, g)}>
              Pay with {GATEWAY_LABEL[g]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
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
            <ManageBillingButton
              vendorId={vendorId}
              currentTier={currentTier}
              subscriptionProvider={subscriptionProvider}
              onChanged={() => onUpgradeInitiated?.()}
            />
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
          <ManageBillingButton
            vendorId={vendorId}
            currentTier={currentTier}
            subscriptionProvider={subscriptionProvider}
            onChanged={() => onUpgradeInitiated?.()}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const targetRank = TIER_RANK[plan.tier];
            const isCurrent = plan.tier === currentTier;
            const isDowngrade = targetRank <= currentRank && !isCurrent;
            const isUnavailable = isCurrent || isDowngrade;
            const Icon = TIER_ICON[plan.tier];

            return (
              <div
                key={plan.tier}
                className={`relative rounded-xl border p-5 flex flex-col gap-4 transition-colors ${
                  plan.highlight
                    ? `${TIER_BORDER_COLOR[plan.tier]} bg-violet-950/20`
                    : `${TIER_BORDER_COLOR[plan.tier]} bg-zinc-900/40`
                } ${isUnavailable ? "opacity-50" : ""}`}
              >
                {plan.highlight && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-0.5 rounded-full">
                    Most Popular
                  </span>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${TIER_ICON_COLOR[plan.tier]}`} />
                    <span className="font-semibold text-sm">{plan.name}</span>
                  </div>
                  {isCurrent && (
                    <Badge className={`text-[10px] px-2 py-0 ${TIER_BADGE_CLASS[plan.tier]}`}>
                      Current
                    </Badge>
                  )}
                </div>

                <div>
                  <div className="text-xl font-bold">
                    {priceLabel(plan)}
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

                <UpgradeButton plan={plan} isUnavailable={isUnavailable} isCurrent={isCurrent} />
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          {availableGateways.length > 1
            ? "Choose Stripe (USD, card) or Paystack (NGN) at checkout. Your plan activates immediately after payment."
            : availableGateways[0] === "paystack"
              ? "Payments are processed securely by Paystack in NGN. Your plan activates immediately after payment."
              : "Payments are processed securely by Stripe. Your plan activates immediately after checkout."}
        </p>
      </CardContent>
    </Card>
  );
}
