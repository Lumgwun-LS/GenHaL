import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Gauge, Zap, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface UsageEntry {
  resource: string;
  label: string;
  used: number;
  quota: number;
  remaining: number;
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

async function fetchUsage(vendorId: number): Promise<UsageResponse> {
  const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/usage`, { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not load usage.");
  return data as UsageResponse;
}

/** Vendor- and admin-facing view of metered resource usage, quotas, and pay-as-you-go overage. */
export default function UsageSummaryCard({ vendorId }: { vendorId: number }) {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchUsage(vendorId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) toast.error(err instanceof Error ? err.message : "Could not load usage."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [vendorId]);

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
          const zeroQuota = entry.quota === 0;

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
                </span>
                <div className="flex items-center gap-2">
                  {hasOverage && (
                    <span className="text-amber-400 text-[10px]">
                      +{entry.overageUnits % 1 === 0 ? entry.overageUnits : entry.overageUnits.toFixed(1)} overage
                      (${entry.overageUsd.toFixed(2)})
                    </span>
                  )}
                  <span className={exhausted && !data.overageEnabled ? "text-red-400 font-medium" : exhausted ? "text-amber-400 font-medium" : "text-foreground"}>
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

              {/* Overage rate hint when near/at limit */}
              {data.overageEnabled && !hasOverage && exhausted && (
                <p className="text-[10px] text-muted-foreground">
                  Included credits used up — further usage is billed at ${entry.overageRate.toFixed(4)}/unit.
                </p>
              )}
            </div>
          );
        })}

        <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
          {data.overageEnabled
            ? "Paid plan: once included credits are used, extra usage is charged at pay-as-you-go rates and collected on your next invoice."
            : "Free plan: reaching a limit blocks that action until your next period starts or you upgrade."}
        </p>
      </CardContent>
    </Card>
  );
}
