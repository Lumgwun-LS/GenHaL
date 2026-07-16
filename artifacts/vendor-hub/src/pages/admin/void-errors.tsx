import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type VoidError = {
  id: number;
  vendorId: number;
  vendorName: string | null;
  orderId: number | null;
  provider: string;
  providerReference: string;
  amount: string;
  currency: string;
  status: string;
  voidError: string;
  voidErrorAt: string | null;
  voidErrorAlertedAt: string | null;
  voidErrorAcknowledgedAt: string | null;
  voidErrorAcknowledgedBy: string | null;
  updatedAt: string | null;
};

async function fetchVoidErrors(showAcknowledged: boolean): Promise<VoidError[]> {
  const url = `${BASE_URL}/api/admin/void-errors${showAcknowledged ? "?showAcknowledged=true" : ""}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load void errors");
  return (await res.json()) as VoidError[];
}

async function acknowledgeVoidError(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/void-errors/${id}/acknowledge`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to acknowledge void error");
  }
}

function formatCurrency(amount: string, currency: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? `${currency} ${n.toFixed(2)}` : `${currency} ${amount}`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function VoidErrorsPanel() {
  const qc = useQueryClient();
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [active, setActive] = useState<VoidError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: errors, isLoading, error } = useQuery({
    queryKey: ["admin-void-errors", showAcknowledged],
    queryFn: () => fetchVoidErrors(showAcknowledged),
    refetchInterval: 30_000,
  });

  async function confirmAcknowledge() {
    if (!active) return;
    setSubmitting(true);
    try {
      await acknowledgeVoidError(active.id);
      toast.success(`Payment #${active.id} void error acknowledged.`);
      qc.invalidateQueries({ queryKey: ["admin-void-errors"] });
      setActive(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to acknowledge void error");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading void errors…</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-destructive">Failed to load void errors.</div>;
  }

  const hasErrors = (errors?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        When a vendor cancels or retries a payment, the platform attempts to expire the provider&apos;s
        checkout session so the customer&apos;s original link is no longer payable. If that void call fails
        (e.g. missing or misconfigured Stripe credentials), the failure is recorded here and a Slack
        alert is sent. Review each entry and confirm via the Stripe dashboard that the session has
        expired or is otherwise safe, then acknowledge it to clear it from this list.
      </p>

      {hasErrors && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {errors!.length} payment{errors!.length === 1 ? "" : "s"} with an unacknowledged void error —
          the provider checkout session may still be live and payable.
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="w-4 h-4 text-primary" /> Checkout Session Void Errors
            </CardTitle>
            <CardDescription>
              Cancelled payments where the provider checkout session could not be expired.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAcknowledged((v) => !v)}
          >
            {showAcknowledged ? "Hide acknowledged" : "Show acknowledged"}
          </Button>
        </CardHeader>
        <CardContent>
          {!hasErrors ? (
            <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              {showAcknowledged
                ? "No void errors on record."
                : "No unacknowledged void errors. All clear."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Occurred</TableHead>
                  <TableHead>Alerted</TableHead>
                  {showAcknowledged && <TableHead>Acknowledged</TableHead>}
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors!.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      #{e.id}
                      {e.orderId && (
                        <div className="text-xs text-muted-foreground">Order #{e.orderId}</div>
                      )}
                    </TableCell>
                    <TableCell>{e.vendorName ?? `Vendor ${e.vendorId}`}</TableCell>
                    <TableCell>{formatCurrency(e.amount, e.currency)}</TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">
                        <Badge variant="secondary" className="mb-1">{e.provider}</Badge>
                        <div className="text-muted-foreground truncate max-w-[180px]" title={e.providerReference}>
                          {e.providerReference}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-[220px]">
                      <span className="line-clamp-2" title={e.voidError}>{e.voidError}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(e.voidErrorAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {e.voidErrorAlertedAt ? (
                        <span className="text-emerald-600">✓ {formatTimestamp(e.voidErrorAlertedAt)}</span>
                      ) : (
                        <span className="text-amber-600">Pending</span>
                      )}
                    </TableCell>
                    {showAcknowledged && (
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {e.voidErrorAcknowledgedAt ? formatTimestamp(e.voidErrorAcknowledgedAt) : "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      {!e.voidErrorAcknowledgedAt ? (
                        <Button size="sm" variant="outline" onClick={() => setActive(e)}>
                          Acknowledge
                        </Button>
                      ) : (
                        <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Done
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge void error?</DialogTitle>
            <DialogDescription>
              {active && (
                <>
                  Payment #{active.id} ({active.provider} ref: {active.providerReference}) for{" "}
                  {active.vendorName ?? `vendor ${active.vendorId}`} —{" "}
                  {formatCurrency(active.amount, active.currency)}.
                  <br /><br />
                  Acknowledging confirms you have verified this checkout session is no longer
                  payable (e.g. it has expired naturally or was voided manually in the Stripe
                  dashboard). The payment will be removed from this list.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={confirmAcknowledge} disabled={submitting}>
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Acknowledge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
