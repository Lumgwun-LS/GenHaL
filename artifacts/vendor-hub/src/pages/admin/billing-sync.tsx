import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type BillingSyncStatus = {
  jobName: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastCheckedCount: number | null;
  lastAffectedCount: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  isFailing: boolean;
};

async function fetchStatus(): Promise<BillingSyncStatus> {
  const res = await fetch(`${BASE_URL}/api/admin/billing-sync-status`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load billing sync status");
  return (await res.json()) as BillingSyncStatus;
}

async function runNow(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/billing-sync-status/run`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to run the job");
  }
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

export default function BillingSyncPanel() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const { data: status, isLoading, error } = useQuery({
    queryKey: ["admin-billing-sync-status"],
    queryFn: fetchStatus,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin-billing-sync-status"] });
  }

  async function handleRunNow() {
    setRunning(true);
    try {
      await runNow();
      toast.success("Billing sync job ran");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading billing sync status…</div>;
  }
  if (error || !status) {
    return <div className="p-8 text-center text-destructive">Failed to load billing sync status.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Every 30 minutes, this job reconciles every vendor with a Stripe customer on file against
          their real subscription status — catching upgrades or cancellations that were missed
          because a webhook was dropped or the server was briefly down.
        </p>
        <Button size="sm" variant="outline" onClick={handleRunNow} disabled={running} className="shrink-0 gap-1.5">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Run now
        </Button>
      </div>

      {status.isFailing && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          The last {status.consecutiveFailures} runs in a row have failed
          {status.lastError ? `: ${status.lastError}` : "."} Vendors' subscription tiers may be out
          of date until this is fixed — check the Stripe key under Payment Gateways.
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4 text-primary" /> Subscription Sync Job
            </CardTitle>
            <CardDescription className="mt-1">Automatic billing catch-up, runs every 30 minutes.</CardDescription>
          </div>
          <div className="shrink-0">
            {!status.lastRunAt ? (
              <Badge variant="secondary">Never run</Badge>
            ) : status.isFailing ? (
              <Badge className="gap-1 bg-red-500/15 text-red-600 hover:bg-red-500/15">
                <AlertTriangle className="w-3.5 h-3.5" /> Failing
              </Badge>
            ) : (
              <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
                <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Last run</div>
            <div className="text-sm font-medium">{formatTimestamp(status.lastRunAt)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Last successful run</div>
            <div className="text-sm font-medium">{formatTimestamp(status.lastSuccessAt)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" /> Vendors checked (last successful run)
            </div>
            <div className="text-sm font-medium">{status.lastCheckedCount ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Vendors reconciled (last successful run)</div>
            <div className="text-sm font-medium">{status.lastAffectedCount ?? "—"}</div>
          </div>
          {status.lastError && (
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground">Most recent error</div>
              <div className="text-sm font-medium text-red-600">{status.lastError}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
