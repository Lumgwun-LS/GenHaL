/**
 * Billing Enforcement Panel
 *
 * Shows three things admins need for billing discipline:
 *  1. Vendors whose resource access is currently suspended (billing_blocked = true)
 *     — with a one-click Unblock button
 *  2. Permanently banned email / phone identifiers from deleted accounts
 *     — with a Remove button to lift the ban
 *  3. Recent $60-threshold auto-charges that were settled
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldOff, Ban, DollarSign, RefreshCw, Unlock, Trash2,
  AlertTriangle, CheckCircle2, Users, Mail, Phone,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BlockedVendor {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  subscriptionTier: string;
  updatedAt: string | null;
  unsettledUsd: number;
}

interface BannedIdentifier {
  id: number;
  email: string | null;
  phone: string | null;
  reason: string;
  bannedAt: string;
}

interface ThresholdCharge {
  id: number;
  vendorId: number;
  vendorName: string | null;
  totalUsd: string;
  settledAt: string | null;
  periodStart: string | null;
}

interface Overview {
  blockedVendors: BlockedVendor[];
  bannedIdentifiers: BannedIdentifier[];
  thresholdCharges: ThresholdCharge[];
  summary: {
    blockedCount: number;
    bannedCount: number;
    unsettledChargesCount: number;
    unsettledTotalUsd: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number | string) {
  return `$${Number(n).toFixed(2)}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function tierColor(tier: string) {
  if (tier === "enterprise") return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
  if (tier === "pro")        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  if (tier === "starter")    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (tier === "basic")      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
  return "bg-muted text-muted-foreground";
}

// ── Summary KPI card ──────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: "default" | "red" | "amber" | "green";
}) {
  const colors = {
    default: "text-primary",
    red:     "text-red-500",
    amber:   "text-amber-500",
    green:   "text-emerald-500",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${colors[accent]}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <Icon className={`w-5 h-5 ${colors[accent]} mt-1`} />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function BillingEnforcementPanel() {
  const queryClient = useQueryClient();
  const [unblockedIds, setUnblockedIds] = useState<Set<number>>(new Set());
  const [removedBannedIds, setRemovedBannedIds] = useState<Set<number>>(new Set());

  const { data, isLoading, isError, refetch, isFetching } = useQuery<Overview>({
    queryKey: ["admin-billing-enforcement"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/admin/billing-enforcement/overview`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load enforcement data");
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const unblockMutation = useMutation({
    mutationFn: async (vendorId: number) => {
      const r = await fetch(
        `${BASE_URL}/api/admin/billing-enforcement/vendors/${vendorId}/unblock`,
        { method: "POST", credentials: "include" },
      );
      if (!r.ok) throw new Error("Unblock failed");
      return vendorId;
    },
    onSuccess: (vendorId) => {
      setUnblockedIds((s) => new Set([...s, vendorId]));
      queryClient.invalidateQueries({ queryKey: ["admin-billing-enforcement"] });
    },
  });

  const removeBanMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(
        `${BASE_URL}/api/admin/billing-enforcement/banned/${id}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!r.ok) throw new Error("Remove failed");
      return id;
    },
    onSuccess: (id) => {
      setRemovedBannedIds((s) => new Set([...s, id]));
      queryClient.invalidateQueries({ queryKey: ["admin-billing-enforcement"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading enforcement data…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-12 text-center text-destructive flex flex-col items-center gap-2">
        <AlertTriangle className="w-6 h-6" />
        Failed to load billing enforcement data.
      </div>
    );
  }

  const { blockedVendors, bannedIdentifiers, thresholdCharges, summary } = data;
  const visibleBlocked = blockedVendors.filter((v) => !unblockedIds.has(v.id));
  const visibleBanned  = bannedIdentifiers.filter((b) => !removedBannedIds.has(b.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ShieldOff className="w-5 h-5 text-red-500" /> Billing Enforcement
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage billing blocks, banned sign-up identifiers, and auto-charge history.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={ShieldOff}
          label="Billing-Blocked Vendors"
          value={String(summary.blockedCount)}
          sub="Resource access suspended"
          accent={summary.blockedCount > 0 ? "red" : "green"}
        />
        <KpiCard
          icon={Ban}
          label="Banned Identifiers"
          value={String(summary.bannedCount)}
          sub="Blocked from re-registration"
          accent={summary.bannedCount > 0 ? "amber" : "default"}
        />
        <KpiCard
          icon={DollarSign}
          label="Unsettled Overage"
          value={fmt(summary.unsettledTotalUsd)}
          sub={`${summary.unsettledChargesCount} vendor${summary.unsettledChargesCount !== 1 ? "s" : ""} pending`}
          accent={summary.unsettledTotalUsd > 0 ? "amber" : "green"}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Threshold Charges Collected"
          value={String(thresholdCharges.length)}
          sub="Most recent 50 shown"
          accent="green"
        />
      </div>

      {/* ── Section 1: Billing-blocked vendors ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldOff className="w-4 h-4 text-red-500" /> Billing-Blocked Vendors
          </CardTitle>
          <CardDescription>
            These vendors have had their resource access suspended due to a failed invoice payment.
            Unblocking restores access and sends the vendor an in-app notification.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {visibleBlocked.length === 0 ? (
            <div className="px-6 py-10 text-center text-muted-foreground flex flex-col items-center gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <p className="font-medium">No billing-blocked vendors</p>
              <p className="text-xs">All vendor resource access is active.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Unsettled Balance</TableHead>
                  <TableHead>Blocked Since</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleBlocked.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{v.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {v.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{v.email}</span>}
                          {v.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{v.phone}</span>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs capitalize ${tierColor(v.subscriptionTier)}`}>
                        {v.subscriptionTier}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`font-mono font-medium ${v.unsettledUsd > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                        {fmt(v.unsettledUsd)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{fmtDate(v.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-950"
                        onClick={() => unblockMutation.mutate(v.id)}
                        disabled={unblockMutation.isPending}
                      >
                        <Unlock className="w-3.5 h-3.5 mr-1.5" /> Unblock
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Section 2: Banned identifiers ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-amber-500" /> Banned Identifiers
          </CardTitle>
          <CardDescription>
            Email addresses and phone numbers that may not be used to register a new account.
            These are set automatically when a vendor permanently deletes their account.
            Remove an entry only if you are certain the ban should be lifted.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {visibleBanned.length === 0 ? (
            <div className="px-6 py-10 text-center text-muted-foreground flex flex-col items-center gap-2">
              <Users className="w-8 h-8 text-muted-foreground/40" />
              <p className="font-medium">No banned identifiers</p>
              <p className="text-xs">No accounts have been permanently deleted yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Banned On</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleBanned.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-sm">{b.email ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="font-mono text-sm">{b.phone ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {b.reason.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{fmtDate(b.bannedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/5"
                        onClick={() => removeBanMutation.mutate(b.id)}
                        disabled={removeBanMutation.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Section 3: Threshold charge history ────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" /> Auto-Charge History ($60 Threshold)
          </CardTitle>
          <CardDescription>
            Most recent 50 vendor overage charges collected by the billing threshold scheduler.
            A charge fires when a vendor's unsettled resource usage reaches $60.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {thresholdCharges.length === 0 ? (
            <div className="px-6 py-10 text-center text-muted-foreground flex flex-col items-center gap-2">
              <DollarSign className="w-8 h-8 text-muted-foreground/40" />
              <p className="font-medium">No threshold charges yet</p>
              <p className="text-xs">Charges appear here once a vendor hits the $60 threshold.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount Charged</TableHead>
                  <TableHead>Settled On</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {thresholdCharges.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-medium">{c.vendorName ?? `Vendor #${c.vendorId}`}</p>
                      <p className="text-xs text-muted-foreground">ID {c.vendorId}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.periodStart ? new Date(c.periodStart).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"}
                    </TableCell>
                    <TableCell className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {fmt(c.totalUsd)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{fmtDate(c.settledAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
