import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Loader2, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type PaymentConflict = {
  id: number;
  vendorId: number;
  vendorName: string | null;
  orderId: number | null;
  provider: string;
  providerReference: string;
  amount: string;
  currency: string;
  currentStatus: string;
  attemptedStatus: string | null;
  webhookProvider: string | null;
  detectedAt: string | null;
  // Resolved-only fields
  resolution: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
};

type Resolution = "dismiss" | "paid" | "failed" | "refunded";

async function fetchConflicts(resolved: boolean): Promise<PaymentConflict[]> {
  const url = `${BASE_URL}/api/admin/payment-conflicts${resolved ? "?resolved=true" : ""}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load payment conflicts");
  return (await res.json()) as PaymentConflict[];
}

async function resolveConflict(id: number, resolution: Resolution): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/payment-conflicts/${id}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ resolution }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to resolve conflict");
  }
}

function formatCurrency(amount: string, currency: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? `${currency} ${n.toFixed(2)}` : `${currency} ${amount}`;
}

function resolutionBadge(resolution: string | null) {
  if (!resolution) return null;
  if (resolution === "dismiss") return <Badge variant="secondary">Dismissed</Badge>;
  if (resolution === "paid") return <Badge className="bg-green-600 text-white">Paid</Badge>;
  if (resolution === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (resolution === "refunded") return <Badge variant="outline">Refunded</Badge>;
  return <Badge variant="secondary">{resolution}</Badge>;
}

// ─── Open Conflicts Tab ────────────────────────────────────────────────────────

function OpenConflictsTab() {
  const qc = useQueryClient();
  const [active, setActive] = useState<PaymentConflict | null>(null);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: conflicts, isLoading, error } = useQuery({
    queryKey: ["admin-payment-conflicts", "open"],
    queryFn: () => fetchConflicts(false),
    refetchInterval: 30_000,
  });

  function openResolve(c: PaymentConflict, r: Resolution) {
    setActive(c);
    setResolution(r);
  }

  async function confirmResolve() {
    if (!active || !resolution) return;
    setSubmitting(true);
    try {
      await resolveConflict(active.id, resolution);
      toast.success(
        resolution === "dismiss"
          ? `Payment #${active.id} kept as ${active.currentStatus} — conflict dismissed.`
          : `Payment #${active.id} manually set to ${resolution}.`,
      );
      qc.invalidateQueries({ queryKey: ["admin-payment-conflicts"] });
      setActive(null);
      setResolution(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resolve conflict");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading payment conflicts…</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-destructive">Failed to load payment conflicts.</div>;
  }

  const hasConflicts = (conflicts?.length ?? 0) > 0;

  return (
    <>
      {hasConflicts && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {conflicts!.length} payment{conflicts!.length === 1 ? "" : "s"} flagged for review.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="w-4 h-4 text-primary" /> Reconciliation Conflicts
          </CardTitle>
          <CardDescription>Payments where a late webhook disagreed with a vendor cancellation.</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasConflicts ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No unresolved conflicts. All clear.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Current status</TableHead>
                  <TableHead>Provider reported</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conflicts!.map((c) => (
                  <TableRow key={c.id} data-testid={`row-payment-conflict-${c.id}`}>
                    <TableCell className="font-medium">
                      #{c.id}
                      <div className="text-xs text-muted-foreground">{c.providerReference}</div>
                    </TableCell>
                    <TableCell>{c.vendorName ?? `Vendor ${c.vendorId}`}</TableCell>
                    <TableCell>{formatCurrency(c.amount, c.currency)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.currentStatus}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive">
                        {c.attemptedStatus ?? "unknown"} ({c.webhookProvider ?? c.provider})
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.detectedAt ? new Date(c.detectedAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => openResolve(c, "dismiss")}>
                        Dismiss
                      </Button>
                      {c.attemptedStatus === "paid" && (
                        <Button size="sm" onClick={() => openResolve(c, "paid")}>
                          Mark paid
                        </Button>
                      )}
                      {c.attemptedStatus === "failed" && (
                        <Button size="sm" variant="destructive" onClick={() => openResolve(c, "failed")}>
                          Mark failed
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openResolve(c, "refunded")}>
                        Mark refunded
                      </Button>
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
            <DialogTitle>
              {resolution === "dismiss" ? "Dismiss this conflict?" : `Mark payment as ${resolution}?`}
            </DialogTitle>
            <DialogDescription>
              {active && (
                <>
                  Payment #{active.id} for {active.vendorName ?? `vendor ${active.vendorId}`} —{" "}
                  {formatCurrency(active.amount, active.currency)}.{" "}
                  {resolution === "dismiss"
                    ? `The status will stay "${active.currentStatus}" and this conflict will be marked resolved.`
                    : `This will change the payment's status from "${active.currentStatus}" to "${resolution}" and notify the vendor.`}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)} disabled={submitting}>
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

// ─── Resolved History Tab ──────────────────────────────────────────────────────

function ResolvedHistoryTab({ initialSearch = "" }: { initialSearch?: string }) {
  const [search, setSearch] = useState(initialSearch);

  // Keep local search in sync if the parent updates initialSearch (e.g. a
  // second Audit Log click while already on this tab).
  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  const { data: conflicts, isLoading, error } = useQuery({
    queryKey: ["admin-payment-conflicts", "resolved"],
    queryFn: () => fetchConflicts(true),
    refetchInterval: 60_000,
  });

  const filtered = (conflicts ?? []).filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(c.id).includes(q) ||
      (c.vendorName ?? "").toLowerCase().includes(q) ||
      (c.providerReference ?? "").toLowerCase().includes(q) ||
      (c.resolution ?? "").toLowerCase().includes(q) ||
      (c.resolvedBy ?? "").toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading resolved conflicts…</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-destructive">Failed to load resolved conflicts.</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="w-4 h-4 text-green-600" /> Resolution History
        </CardTitle>
        <CardDescription>
          All conflicts that have been reviewed and closed. Search by payment ID, vendor, reference, resolution, or admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID, vendor, reference, resolution, or admin…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {search ? "No resolved conflicts match your search." : "No resolved conflicts yet."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Final status</TableHead>
                <TableHead>Provider reported</TableHead>
                <TableHead>Resolution</TableHead>
                <TableHead>Resolved by</TableHead>
                <TableHead>Resolved at</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} data-testid={`row-resolved-conflict-${c.id}`}>
                  <TableCell className="font-medium">
                    #{c.id}
                    <div className="text-xs text-muted-foreground">{c.providerReference}</div>
                  </TableCell>
                  <TableCell>{c.vendorName ?? `Vendor ${c.vendorId}`}</TableCell>
                  <TableCell>{formatCurrency(c.amount, c.currency)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{c.currentStatus}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.attemptedStatus ?? "—"} ({c.webhookProvider ?? c.provider})
                  </TableCell>
                  <TableCell>{resolutionBadge(c.resolution)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.resolvedBy ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.resolvedAt ? new Date(c.resolvedAt).toLocaleString() : "—"}
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

type PaymentConflictsPanelProps = {
  /** When set, the panel switches to the Resolved History tab and pre-fills
   *  the search box so the admin lands directly on the resolved conflict that
   *  was linked from the Audit Log. */
  highlightPaymentId?: number | null;
  onClearHighlight?: () => void;
};

export default function PaymentConflictsPanel({
  highlightPaymentId,
  onClearHighlight,
}: PaymentConflictsPanelProps) {
  const [activeTab, setActiveTab] = useState<"open" | "resolved">(
    highlightPaymentId != null ? "resolved" : "open",
  );
  const [resolvedSearch, setResolvedSearch] = useState(
    highlightPaymentId != null ? String(highlightPaymentId) : "",
  );

  // When the parent navigates here from the Audit Log with a specific payment
  // ID, jump to the Resolved History tab and pre-fill the search automatically.
  useEffect(() => {
    if (highlightPaymentId != null) {
      setActiveTab("resolved");
      setResolvedSearch(String(highlightPaymentId));
    }
  }, [highlightPaymentId]);

  function handleTabChange(value: string) {
    setActiveTab(value as "open" | "resolved");
    // Clear the highlight when the admin manually switches tabs so the search
    // doesn't feel "stuck" when they come back to it later.
    if (value !== "resolved") {
      setResolvedSearch("");
      onClearHighlight?.();
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A payment lands here when a vendor already cancelled it locally, but the payment provider
        later reported a different status on the same reference (e.g. a customer completed
        checkout on a stale link). The status was left untouched and a Slack alert fired at the
        time — review the details below and either dismiss it (keep things as-is) or manually
        apply the status the provider reported.
      </p>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="open">Open Conflicts</TabsTrigger>
          <TabsTrigger value="resolved">Resolved History</TabsTrigger>
        </TabsList>
        <TabsContent value="open" className="space-y-4 mt-4">
          <OpenConflictsTab />
        </TabsContent>
        <TabsContent value="resolved" className="mt-4">
          <ResolvedHistoryTab initialSearch={resolvedSearch} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
