import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Gauge } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface UsageEntry {
  resource: string;
  label: string;
  used: number;
  quota: number;
  remaining: number;
}

interface UsageResponse {
  periodStart: string;
  periodEnd: string;
  tier: string;
  usage: UsageEntry[];
}

async function fetchUsage(vendorId: number): Promise<UsageResponse> {
  const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/usage`, { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not load usage.");
  return data as UsageResponse;
}

/** Vendor- and admin-facing view of metered resource usage vs. quota for the current billing period. */
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
          {format(new Date(data.periodStart), "MMM d")} – {format(new Date(data.periodEnd), "MMM d, yyyy")} · resets automatically each billing period
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.usage.map((entry) => {
          const pct = entry.quota > 0 ? Math.min((entry.used / entry.quota) * 100, 100) : 100;
          const exhausted = entry.quota > 0 ? entry.used >= entry.quota : entry.quota === 0;
          return (
            <div key={entry.resource} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground capitalize">{entry.label}</span>
                <span className={exhausted ? "text-red-400 font-medium" : "text-foreground"}>
                  {entry.used % 1 === 0 ? entry.used : entry.used.toFixed(1)} / {entry.quota}
                </span>
              </div>
              <Progress value={pct} className={exhausted ? "[&>div]:bg-red-500" : undefined} />
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground pt-1">
          Reaching a limit blocks that action until your next period starts or you upgrade your plan.
        </p>
      </CardContent>
    </Card>
  );
}
