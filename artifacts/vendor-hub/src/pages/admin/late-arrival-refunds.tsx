import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export type LateArrivalRefundRow = {
  id: number;
  vendorId: number;
  vendorName: string | null;
  orderId: number | null;
  provider: string;
  providerReference: string | null;
  amount: string;
  currency: string;
  status: string;
  lateArrivalRefunded: boolean;
  lateArrivalRefundedAt: string | null;
  lateArrivalRefundFailed: boolean;
  lateArrivalRefundFailedAt: string | null;
  lateArrivalRefundError: string | null;
  lateArrivalRefundResolved: boolean;
  lateArrivalRefundResolvedAt: string | null;
  lateArrivalRefundResolvedBy: string | null;
  lateArrivalRefundResolvedByDisplayName: string | null;
  updatedAt: string;
};

async function fetchLateArrivalRefunds(status: "failed" | "refunded" | "all"): Promise<LateArrivalRefundRow[]> {
  const url = `${BASE_URL}/api/admin/late-arrival-refunds?status=${status}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load late-arrival refunds");
  return (await res.json()) as LateArrivalRefundRow[];
}

async function resolveRefundFailure(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/late-arrival-refunds/${id}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to mark refund resolved");
  }
}

function formatCurrency(amount: string, currency: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? `${currency} ${n.toFixed(2)}` : `${currency} ${amount}`;
}

// ─── Unresolved Failures Tab ───────────────────────────────────────────────────

function UnresolvedFailuresTab() {
  const qc = useQueryClient();
  const [pendingResolve, setPendingResolve] = useState<LateArrivalRefundRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["admin-late-arrival-refunds", "failed"],
    queryFn: () => fetchLateArrivalRefunds("failed"),
    refetchInterval: 30_000,
  });

  async function confirmResolve() {
    if (!pendingResolve) return;
    setSubmitting(true);
    try {
      await resolveRefundFailure(pendingResolve.id);
      toast.success(`Payment #${pendingResolve.id} marked resolved.`);
      qc.invalidateQueries({ queryKey: ["admin-late-arrival-refunds"] });
      qc.invalidateQueries({ queryKey: ["admin-late-arrival-refunds-summary"] });
      setPendingResolve(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resolve");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading refund failures…</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-destructive">Failed to load refund failures.</div>;
  }

  const hasRows = (rows?.length ?? 0) > 0;

  return (
    <>
      {hasRows && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {rows!.length} unresolved late-arrival refund failure{rows!.length === 1 ? "" : "s"} — each requires
          manual action in the payment provider's dashboard.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <XCircle className="w-4 h-4 text-destructive" /> Unresolved Refund Failures
          </CardTitle>
          <CardDescription>
            The platform tried to auto-refund the customer but Paystack rejected or couldn't complete it.
            Issue the refund manually in the Paystack dashboard, then click "Mark resolved" here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasRows ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No unresolved refund failures. All clear.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Failed at</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows!.map((r) => (
                  <TableRow key={r.id} data-testid={`row-late-arrival-failure-${r.id}`}>
                    <TableCell className="font-medium">
                      #{r.id}
                      {r.providerReference && (
                        <div className="text-xs text-muted-foreground font-mono">{r.providerReference}</div>
                      )}
                    </TableCell>
                    <TableCell>{r.vendorName ?? `Vendor ${r.vendorId}`}</TableCell>
                    <TableCell>{formatCurrency(r.amount, r.currency)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{r.provider}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.lateArrivalRefundFailedAt
                        ? new Date(r.lateArrivalRefundFailedAt).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {r.lateArrivalRefundError ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => setPendingResolve(r)}>
                        Mark resolved
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!pendingResolve} onOpenChange={(open) => !open && setPendingResolve(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark refund failure as resolved?</DialogTitle>
            <DialogDescription>
              {pendingResolve && (
                <>
                  Payment #{pendingResolve.id} for{" "}
                  {pendingResolve.vendorName ?? `vendor ${pendingResolve.vendorId}`} —{" "}
                  {formatCurrency(pendingResolve.amount, pendingResolve.currency)}.
                  <br />
                  <br />
                  Only mark this resolved after you have manually issued the refund in the{" "}
                  <strong className="capitalize">{pendingResolve.provider}</strong> dashboard. This action
                  removes the case from the open failures list and records your name for audit.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingResolve(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={confirmResolve} disabled={submitting}>
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Auto-Refunded Tab ────────────────────────────────────────────────────────

function AutoRefundedTab() {
  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["admin-late-arrival-refunds", "refunded"],
    queryFn: () => fetchLateArrivalRefunds("refunded"),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading auto-refunded payments…</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-destructive">Failed to load refunded payments.</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="w-4 h-4 text-green-600" /> Auto-Refunded
        </CardTitle>
        <CardDescription>
          Payments where the platform successfully issued an automatic refund when a customer paid a cancelled link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!(rows?.length) ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No auto-refunded payments yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Refunded at</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows!.map((r) => (
                <TableRow key={r.id} data-testid={`row-late-arrival-refunded-${r.id}`}>
                  <TableCell className="font-medium">
                    #{r.id}
                    {r.providerReference && (
                      <div className="text-xs text-muted-foreground font-mono">{r.providerReference}</div>
                    )}
                  </TableCell>
                  <TableCell>{r.vendorName ?? `Vendor ${r.vendorId}`}</TableCell>
                  <TableCell>{formatCurrency(r.amount, r.currency)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{r.provider}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.lateArrivalRefundedAt
                      ? new Date(r.lateArrivalRefundedAt).toLocaleString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Resolved Failures Tab ────────────────────────────────────────────────────

function ResolvedFailuresTab() {
  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["admin-late-arrival-refunds", "all"],
    queryFn: () => fetchLateArrivalRefunds("all"),
    refetchInterval: 60_000,
    // derive resolved-failed rows on the client from the "all" superset
    select: (data) =>
      data.filter((r) => r.lateArrivalRefundFailed && r.lateArrivalRefundResolved),
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading resolved failures…</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-destructive">Failed to load resolved failures.</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RefreshCw className="w-4 h-4 text-muted-foreground" /> Resolved Failures
        </CardTitle>
        <CardDescription>
          Refund failures that an admin has already handled manually and marked resolved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!(rows?.length) ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No resolved failures yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Failed at</TableHead>
                <TableHead>Resolved by</TableHead>
                <TableHead>Resolved at</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows!.map((r) => (
                <TableRow key={r.id} data-testid={`row-late-arrival-resolved-${r.id}`}>
                  <TableCell className="font-medium">
                    #{r.id}
                    {r.providerReference && (
                      <div className="text-xs text-muted-foreground font-mono">{r.providerReference}</div>
                    )}
                  </TableCell>
                  <TableCell>{r.vendorName ?? `Vendor ${r.vendorId}`}</TableCell>
                  <TableCell>{formatCurrency(r.amount, r.currency)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{r.provider}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.lateArrivalRefundFailedAt
                      ? new Date(r.lateArrivalRefundFailedAt).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.lateArrivalRefundResolvedByDisplayName ? (
                      <>
                        <span className="font-medium text-foreground">
                          {r.lateArrivalRefundResolvedByDisplayName}
                        </span>
                        <div className="text-muted-foreground">{r.lateArrivalRefundResolvedBy}</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        {r.lateArrivalRefundResolvedBy ?? "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.lateArrivalRefundResolvedAt
                      ? new Date(r.lateArrivalRefundResolvedAt).toLocaleString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Export ───────────────────────────────────────────────────────────────

export default function LateArrivalRefundsPanel() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        When a customer pays on a Paystack link that was already cancelled locally, the platform
        automatically attempts to refund them. This panel tracks every case — whether the auto-refund
        succeeded, failed, or was later resolved manually.
      </p>

      <Tabs defaultValue="failures">
        <TabsList>
          <TabsTrigger value="failures">Unresolved Failures</TabsTrigger>
          <TabsTrigger value="refunded">Auto-Refunded</TabsTrigger>
          <TabsTrigger value="resolved">Resolved Failures</TabsTrigger>
        </TabsList>

        <TabsContent value="failures" className="space-y-4 mt-4">
          <UnresolvedFailuresTab />
        </TabsContent>

        <TabsContent value="refunded" className="mt-4">
          <AutoRefundedTab />
        </TabsContent>

        <TabsContent value="resolved" className="mt-4">
          <ResolvedFailuresTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
