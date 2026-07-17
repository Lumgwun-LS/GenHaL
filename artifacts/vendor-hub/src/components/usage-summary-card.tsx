import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Gauge, Zap, TrendingUp, ShoppingCart, Package } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface UsageEntry {
  resource: string;
  label: string;
  used: number;
  quota: number;
  remaining: number;
  addonCredits: number;
  overageUnits: number;
  overageUsd: number;
  overageRate: number;
}

interface UsageResponse {
  periodStart: string;
  periodEnd: string;
  tier: string;
  overageEnabled: boolean;
  totalOverageUsd: number;
  usage: UsageEntry[];
}

interface AddonOptionsResponse {
  bundleSizes: Record<string, number[]>;
  overageRates: Record<string, number>;
  gateway: "stripe" | "paystack";
  resourceLabels: Record<string, string>;
}

async function fetchUsage(vendorId: number): Promise<UsageResponse> {
  const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/usage`, { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not load usage.");
  return data as UsageResponse;
}

async function fetchAddonOptions(vendorId: number): Promise<AddonOptionsResponse> {
  const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/addons/options`, { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not load add-on options.");
  return data as AddonOptionsResponse;
}

async function startAddonCheckout(vendorId: number, resource: string, quantity: number): Promise<{ url: string | null; addonCreditId: number }> {
  const successUrl = `${window.location.origin}${window.location.pathname}?addonSuccess=1`;
  const cancelUrl = `${window.location.origin}${window.location.pathname}?addonCancelled=1`;
  const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/addons/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ resource, quantity, successUrl, cancelUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not start add-on checkout.");
  return data as { url: string; addonCreditId: number };
}

/** Modal for buying add-on capacity for a single resource. */
function BuyAddonDialog({
  open,
  onClose,
  vendorId,
  entry,
  options,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  vendorId: number;
  entry: UsageEntry;
  options: AddonOptionsResponse | null;
  onSuccess: () => void;
}) {
  const [quantity, setQuantity] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const bundles = options?.bundleSizes?.[entry.resource] ?? [5, 10, 25, 50];
  const rate = options?.overageRates?.[entry.resource] ?? entry.overageRate;
  const gateway = options?.gateway ?? "stripe";
  const totalUsd = quantity > 0 ? quantity * rate : 0;

  async function handleCheckout() {
    if (quantity < 1) { toast.error("Pick a bundle size first."); return; }
    setLoading(true);
    try {
      const result = await startAddonCheckout(vendorId, entry.resource, quantity);
      if (result.url) {
        window.location.href = result.url;
      } else {
        toast.success("Add-on credits added!");
        onSuccess();
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start checkout.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-4 h-4 text-violet-400" />
            Buy extra {entry.label}
          </DialogTitle>
          <DialogDescription>
            Choose a bundle of additional {entry.label}. They're added to your balance immediately after payment and consumed before any pay-as-you-go overage kicks in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current status */}
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base quota used</span>
              <span>{entry.used} / {entry.quota}</span>
            </div>
            {entry.addonCredits > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Add-on credits remaining</span>
                <span className="text-violet-400">{entry.addonCredits}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unit price</span>
              <span>${rate.toFixed(4)} / unit</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Charged via</span>
              <span>{gateway === "paystack" ? "Paystack (NGN)" : "Stripe (USD)"}</span>
            </div>
          </div>

          {/* Bundle size picker */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Select a bundle</p>
            <div className="grid grid-cols-2 gap-2">
              {bundles.map((size) => (
                <button
                  key={size}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    quantity === size
                      ? "border-violet-500 bg-violet-500/10 text-violet-300"
                      : "border-border hover:border-muted-foreground/50 text-foreground"
                  }`}
                  onClick={() => setQuantity(size)}
                >
                  <p className="text-sm font-semibold">{size} units</p>
                  <p className="text-xs text-muted-foreground">${(size * rate).toFixed(2)}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Cost summary */}
          {quantity > 0 && (
            <div className="rounded-md border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm flex justify-between items-center">
              <span className="text-muted-foreground">{quantity} units × ${rate.toFixed(4)}</span>
              <span className="font-semibold text-violet-300">${totalUsd.toFixed(2)} USD</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button disabled={loading || quantity < 1} onClick={handleCheckout}>
            {loading ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Starting checkout…</>
            ) : (
              <><ShoppingCart className="w-3.5 h-3.5 mr-1.5" />Buy {quantity > 0 ? `${quantity} units` : "…"}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Vendor- and admin-facing view of metered resource usage, quotas, and pay-as-you-go overage. */
export default function UsageSummaryCard({ vendorId, showBuyButtons = true }: { vendorId: number; showBuyButtons?: boolean }) {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [options, setOptions] = useState<AddonOptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyingFor, setBuyingFor] = useState<UsageEntry | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchUsage(vendorId),
      fetchAddonOptions(vendorId).catch(() => null), // options are non-critical
    ])
      .then(([usageData, addonOpts]) => {
        setData(usageData);
        if (addonOpts) setOptions(addonOpts);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load usage."))
      .finally(() => setLoading(false));
  }, [vendorId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Handle returning from addon checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("addonSuccess") === "1") {
      toast.success("Add-on credits purchased! Your extra capacity is now active.");
      // Remove query param without reload
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("addonSuccess");
      window.history.replaceState({}, "", newUrl.toString());
      reload();
    } else if (params.get("addonCancelled") === "1") {
      toast.info("Add-on purchase cancelled.");
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("addonCancelled");
      window.history.replaceState({}, "", newUrl.toString());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !data) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading usage…
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-violet-400" />
            Usage This Period
          </CardTitle>
          <CardDescription>
            {format(new Date(data.periodStart), "MMM d")} – {format(new Date(data.periodEnd), "MMM d, yyyy")}
            {" · "}credits reset each billing period
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Overage summary banner */}
          {data.overageEnabled && data.totalOverageUsd > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <TrendingUp className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs">
                <p className="font-medium text-amber-300">Pay-as-you-go active this period</p>
                <p className="text-muted-foreground mt-0.5">
                  ${data.totalOverageUsd.toFixed(2)} in overage charges accrued — will appear on your next invoice.
                </p>
              </div>
            </div>
          )}

          {/* Per-resource rows */}
          {data.usage.map((entry) => {
            const pct = entry.quota > 0 ? Math.min((entry.used / entry.quota) * 100, 100) : 100;
            const exhausted = entry.quota > 0 ? entry.used >= entry.quota : entry.quota === 0;
            const hasOverage = entry.overageUnits > 0;
            const hasAddon = entry.addonCredits > 0;
            const zeroQuota = entry.quota === 0;
            const nearLimit = !exhausted && entry.quota > 0 && entry.remaining <= Math.ceil(entry.quota * 0.15);

            return (
              <div key={entry.resource} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground capitalize">
                    {entry.label}
                    {hasOverage && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px] border-amber-500/50 text-amber-400">
                        <Zap className="w-2.5 h-2.5 mr-0.5" />
                        pay-as-you-go
                      </Badge>
                    )}
                    {hasAddon && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px] border-violet-500/50 text-violet-400">
                        <Package className="w-2.5 h-2.5 mr-0.5" />
                        +{entry.addonCredits} add-on
                      </Badge>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {hasOverage && (
                      <span className="text-amber-400 text-[10px]">
                        +{entry.overageUnits % 1 === 0 ? entry.overageUnits : entry.overageUnits.toFixed(1)} overage
                        (${entry.overageUsd.toFixed(2)})
                      </span>
                    )}
                    <span className={exhausted && !data.overageEnabled && !hasAddon ? "text-red-400 font-medium" : exhausted || hasOverage ? "text-amber-400 font-medium" : "text-foreground"}>
                      {entry.used % 1 === 0 ? entry.used : entry.used.toFixed(1)} / {entry.quota}
                    </span>
                  </div>
                </div>

                {zeroQuota ? (
                  <div className="h-1.5 rounded-full bg-muted text-[10px] text-muted-foreground text-center leading-none pt-0.5">
                    {data.overageEnabled ? `$${entry.overageRate.toFixed(2)}/unit` : "not available on this plan"}
                  </div>
                ) : (
                  <Progress
                    value={pct}
                    className={
                      hasOverage ? "[&>div]:bg-amber-500" :
                      exhausted && !data.overageEnabled ? "[&>div]:bg-red-500" :
                      exhausted ? "[&>div]:bg-amber-500" : undefined
                    }
                  />
                )}

                {/* Contextual hints + buy button */}
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] text-muted-foreground flex-1">
                    {data.overageEnabled && !hasOverage && exhausted && (
                      <span>Included credits used up — further usage billed at ${entry.overageRate.toFixed(4)}/unit.</span>
                    )}
                    {nearLimit && !exhausted && (
                      <span>Almost at your limit — consider buying extra capacity.</span>
                    )}
                    {hasAddon && !exhausted && (
                      <span className="text-violet-400">{entry.addonCredits} add-on units in reserve.</span>
                    )}
                  </div>

                  {showBuyButtons && (exhausted || nearLimit || hasOverage) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2 shrink-0 border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
                      onClick={() => setBuyingFor(entry)}
                    >
                      <Package className="w-2.5 h-2.5 mr-1" />
                      Buy more
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
            {data.overageEnabled
              ? "Paid plan: once included credits are used, add-on credits are consumed first; then usage is billed at pay-as-you-go rates and collected on your next invoice."
              : "Free plan: reaching a limit blocks that action until your next period starts, you upgrade, or you purchase add-on credits."}
          </p>
        </CardContent>
      </Card>

      {buyingFor && (
        <BuyAddonDialog
          open={!!buyingFor}
          onClose={() => setBuyingFor(null)}
          vendorId={vendorId}
          entry={buyingFor}
          options={options}
          onSuccess={reload}
        />
      )}
    </>
  );
}
