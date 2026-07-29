/**

 * Admin Wallet Panel

 *

 * Two sections:

 *   1. Wallet Settings — USD→NGN rate and platform fee rate

 *   2. Payout Queue — pending/processing payouts, approve/reject

 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, Clock, Banknote, Settings2, RefreshCw } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type WalletSettings = { usdToNgnRate: number; platformFeeRate: number };
type PayoutRow = {
  id: number; vendorId: number; vendorName: string; amountNgn: number;
  status: string; provider: string; bankAccountNumber: string; bankName: string; accountName: string;
  requestedAt: string; processedAt?: string | null; failureReason?: string | null;
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending:    "bg-amber-100 text-amber-700",
    processing: "bg-blue-100 text-blue-700",
    completed:  "bg-green-100 text-green-700",
    failed:     "bg-red-100 text-red-700",
    rejected:   "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold capitalize ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status === "pending"    && <Clock className="w-3 h-3" />}
      {status === "processing" && <Clock className="w-3 h-3" />}
      {status === "completed"  && <CheckCircle2 className="w-3 h-3" />}
      {status === "failed"     && <XCircle className="w-3 h-3" />}
      {status === "rejected"   && <XCircle className="w-3 h-3" />}
      {status}
    </span>
  );
}

// ── Wallet Settings card ──────────────────────────────────────────────────────

function WalletSettingsCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<WalletSettings>({
    queryKey: ["admin-wallet-settings"],
    queryFn: () => authFetch(`${BASE}/api/admin/wallet-settings`).then(r => r.json()),
  });

  const [usdToNgn, setUsdToNgn] = useState<string>("");
  const [feeRate, setFeeRate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Pre-fill once loaded
  if (data && usdToNgn === "" && feeRate === "") {
    setUsdToNgn(String(data.usdToNgnRate));
    setFeeRate(String((data.platformFeeRate * 100).toFixed(2)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authFetch(`${BASE}/api/admin/wallet-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usdToNgnRate:    parseFloat(usdToNgn),
          platformFeeRate: parseFloat(feeRate) / 100,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Wallet settings saved");
      qc.invalidateQueries({ queryKey: ["admin-wallet-settings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Settings2 className="w-4 h-4 text-violet-500" /> Wallet Settings</CardTitle>
        <CardDescription>Controls USD conversion and the platform fee deducted on each payment before crediting the vendor's wallet.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading
          ? <div className="h-20 bg-muted/30 rounded-xl animate-pulse" />
          : (
            <form onSubmit={save} className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1">
                <Label className="text-xs font-bold text-muted-foreground">USD → NGN Rate</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₦</span>
                  <Input value={usdToNgn} onChange={e => setUsdToNgn(e.target.value)} type="number" min="1" step="1" className="pl-7" required />
                </div>
              </div>
              <div className="flex-1">
                <Label className="text-xs font-bold text-muted-foreground">Platform Fee (%)</Label>
                <div className="relative mt-1">
                  <Input value={feeRate} onChange={e => setFeeRate(e.target.value)} type="number" min="0" max="100" step="0.01" className="pr-7" required />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <Button type="submit" disabled={saving} className="shrink-0">
                {saving ? "Saving…" : "Save"}
              </Button>
            </form>
          )
        }
        {data && (
          <p className="text-xs text-muted-foreground mt-3">
            Current: ₦{data.usdToNgnRate.toLocaleString()}/USD · {(data.platformFeeRate * 100).toFixed(2)}% fee
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Payout Queue ──────────────────────────────────────────────────────────────

function PayoutQueueCard() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all"|"pending"|"processing"|"completed"|"failed">("pending");

  const { data, isLoading, refetch } = useQuery<{ payouts: PayoutRow[] }>({
    queryKey: ["admin-payouts", filter],
    queryFn: async () => {
      const res = await authFetch(`${BASE}/api/admin/payouts?status=${filter}`);
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const [rejectionReason, setRejectionReason] = useState<Record<number, string>>({});

  const approve = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${BASE}/api/admin/payouts/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return data;
    },
    onSuccess: (_data, id) => {
      toast.success(`Payout #${id} approved and transfer initiated`);
      qc.invalidateQueries({ queryKey: ["admin-payouts"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const res = await authFetch(`${BASE}/api/admin/payouts/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return data;
    },
    onSuccess: (_data, { id }) => {
      toast.success(`Payout #${id} rejected`);
      qc.invalidateQueries({ queryKey: ["admin-payouts"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const payouts = data?.payouts ?? [];
  const filters: Array<typeof filter> = ["pending", "processing", "completed", "failed", "all"];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Banknote className="w-4 h-4 text-violet-500" /> Payout Queue</CardTitle>
            <CardDescription>Review and approve vendor payout requests. Approved payouts trigger a real bank transfer.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh"><RefreshCw className="w-4 h-4" /></Button>
        </div>
        {/* Filter pills */}
        <div className="flex gap-1.5 flex-wrap mt-2">
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-bold capitalize transition-colors ${filter === f ? "bg-violet-600 text-white" : "bg-muted/40 text-muted-foreground hover:bg-muted/70"}`}>
              {f}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && <div className="h-32 bg-muted/30 rounded-xl animate-pulse m-4" />}
        {!isLoading && payouts.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">No {filter !== "all" ? filter : ""} payouts.</div>
        )}
        {payouts.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Vendor</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Bank</TableHead>
                  <TableHead className="text-xs">Provider</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Requested</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs font-medium">{p.vendorName ?? `#${p.vendorId}`}</TableCell>
                    <TableCell className="text-xs font-bold">₦{p.amountNgn.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.bankName}<br/>
                      <span className="font-mono">{p.bankAccountNumber}</span><br/>
                      {p.accountName}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{p.provider}</TableCell>
                    <TableCell>{statusBadge(p.status)}{p.failureReason && <p className="text-[10px] text-red-500 mt-0.5">{p.failureReason}</p>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(p.requestedAt).toLocaleDateString("en-NG")}</TableCell>
                    <TableCell>
                      {p.status === "pending" && (
                        <div className="flex flex-col gap-1.5">
                          <Button size="sm" variant="default" className="h-7 text-xs bg-green-600 hover:bg-green-700"
                            disabled={approve.isPending} onClick={() => approve.mutate(p.id)}>
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                          </Button>
                          <div className="flex gap-1">
                            <Input placeholder="Reason…" value={rejectionReason[p.id] ?? ""} onChange={e => setRejectionReason(r => ({ ...r, [p.id]: e.target.value }))}
                              className="h-7 text-xs w-28" />
                            <Button size="sm" variant="destructive" className="h-7 text-xs shrink-0"
                              disabled={reject.isPending} onClick={() => reject.mutate({ id: p.id, reason: rejectionReason[p.id] ?? "" })}>
                              <XCircle className="w-3 h-3 mr-1" /> Reject
                            </Button>
                          </div>
                        </div>
                      )}
                      {p.status === "processing" && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs text-blue-500 italic">Awaiting bank…</span>
                          {/* Manual resolution: allow admin to close out ambiguous processing payouts */}
                          <div className="flex gap-1 mt-1">
                            <Input placeholder="Resolution reason…" value={rejectionReason[p.id] ?? ""} onChange={e => setRejectionReason(r => ({ ...r, [p.id]: e.target.value }))}
                              className="h-7 text-xs w-32" />
                            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 border-red-400 text-red-600 hover:bg-red-50"
                              disabled={reject.isPending} onClick={() => reject.mutate({ id: p.id, reason: rejectionReason[p.id] ?? "" })}
                              title="Manually resolve — use only if transfer was confirmed not sent">
                              <XCircle className="w-3 h-3 mr-1" /> Resolve
                            </Button>
                          </div>
                        </div>
                      )}
                      {p.status === "completed" && <span className="text-xs text-green-600 italic">Settled {p.processedAt ? new Date(p.processedAt).toLocaleDateString("en-NG") : ""}</span>}
                      {(p.status === "failed" || p.status === "rejected") && <span className="text-xs text-red-500 italic">Closed</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function WalletAdminPanel() {
  return (
    <div className="space-y-6">
      <WalletSettingsCard />
      <PayoutQueueCard />
    </div>
  );
}
