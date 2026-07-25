/**
 * Billing Enforcement Panel
 *
 * Shows four things admins need for billing discipline:
 *  1. Deduction Ladder Editor — admin-configurable escalation thresholds
 *  2. Vendors with unsettled overage — current threshold + reset control
 *  3. Vendors whose resource access is currently suspended (billing_blocked = true)
 *     — with a one-click Unblock button
 *  4. Permanently banned email / phone identifiers from deleted accounts
 *     — with a Remove button to lift the ban
 *  5. Recent auto-charges that were settled
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ShieldOff, Ban, DollarSign, RefreshCw, Unlock, Trash2,
  AlertTriangle, CheckCircle2, Users, Mail, Phone, RotateCcw,
  Layers, Plus, X as XIcon,
} from "lucide-react";
import { toast } from "sonner";

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
  currentDeductionThreshold: string | null;
}

interface UnsettledVendor {
  vendorId: number;
  vendorName: string | null;
  vendorEmail: string | null;
  subscriptionTier: string;
  billingBlocked: boolean;
  currentDeductionThreshold: string | null;
  totalUnsettled: number;
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
  unsettledByVendor: UnsettledVendor[];
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

function thresholdLabel(val: string | null, ladder: number[]) {
  if (val === null) return `$${(ladder[0] ?? 10).toFixed(2)} (base)`;
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  const isTop = ladder.length > 0 && Math.abs(n - (ladder[ladder.length - 1] ?? 0)) < 0.001;
  return `$${n.toFixed(2)}${isTop ? " (top)" : ""}`;
}

// ── Summary KPI card ──────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon, label, value, sub, accent = "default",
}: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  accent?: "default" | "red" | "amber" | "green";
}) {
  const colors = { default: "text-primary", red: "text-red-500", amber: "text-amber-500", green: "text-emerald-500" };
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

// ── Deduction Ladder Editor ───────────────────────────────────────────────────
function DeductionLadderEditor() {
  const queryClient = useQueryClient();

  // Fetch current ladder from site-content
  const { data: siteContent, isLoading: loadingLadder } = useQuery<Record<string, unknown>>({
    queryKey: ["admin-site-content-all"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/admin/site-content`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load site content");
      return r.json();
    },
  });

  const rawLadder = siteContent?.["billing.deductionLadder"];
  const savedLadder: number[] = Array.isArray(rawLadder)
    ? (rawLadder as unknown[]).filter((v): v is number => typeof v === "number")
    : [10, 50, 100, 200];

  const [rungs, setRungs] = useState<number[]>([]);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function startEdit() {
    setRungs([...savedLadder]);
    setErrors([]);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setErrors([]);
  }

  function setRung(idx: number, val: string) {
    const n = parseFloat(val);
    setRungs((prev) => prev.map((v, i) => (i === idx ? (isNaN(n) ? v : n) : v)));
  }

  function addRung() {
    const last = rungs[rungs.length - 1] ?? 0;
    setRungs((prev) => [...prev, last + 100]);
  }

  function removeRung(idx: number) {
    setRungs((prev) => prev.filter((_, i) => i !== idx));
  }

  function validate(): boolean {
    const errs: string[] = [];
    if (rungs.length === 0) errs.push("Ladder must have at least one rung.");
    for (let i = 1; i < rungs.length; i++) {
      if ((rungs[i] ?? 0) <= (rungs[i - 1] ?? 0))
        errs.push(`Rung ${i + 1} ($${rungs[i]}) must be greater than rung ${i} ($${rungs[i - 1]}).`);
    }
    setErrors(errs);
    return errs.length === 0;
  }

  const saveMutation = useMutation({
    mutationFn: async (ladder: number[]) => {
      const r = await fetch(`${BASE_URL}/api/admin/site-content/billing.deductionLadder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value: ladder }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to save ladder");
      }
      return r.json();
    },
    onSuccess: () => {
      toast.success("Deduction ladder saved.");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["admin-site-content-all"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function save() {
    if (!validate()) return;
    saveMutation.mutate(rungs);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" /> Auto-Deduction Escalation Ladder
            </CardTitle>
            <CardDescription>
              Vendors start at the first rung. After each successful charge their threshold advances to
              the next rung, reducing how often they are automatically charged as usage grows.
              Admins can reset any vendor's rung from the Unsettled Overage table below.
            </CardDescription>
          </div>
          {!editing && (
            <Button variant="outline" size="sm" onClick={startEdit} disabled={loadingLadder}>
              Edit Ladder
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!editing ? (
          <div className="flex flex-wrap gap-2 items-center">
            {loadingLadder ? (
              <span className="text-sm text-muted-foreground">Loading…</span>
            ) : savedLadder.map((rung, i) => (
              <div key={i} className="flex items-center gap-1">
                <Badge variant="outline" className="font-mono text-sm px-3 py-1">
                  ${rung.toFixed(2)}
                </Badge>
                {i < savedLadder.length - 1 && (
                  <span className="text-muted-foreground text-xs">→</span>
                )}
              </div>
            ))}
            {savedLadder.length > 0 && (
              <span className="text-xs text-muted-foreground ml-2">
                (stays at ${(savedLadder[savedLadder.length - 1] ?? 0).toFixed(2)} indefinitely after reaching the top)
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              {rungs.map((rung, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Rung {i + 1}</Label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={rung}
                      onChange={(e) => setRung(i, e.target.value)}
                      className="w-24 h-8 text-sm"
                    />
                    {rungs.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeRung(i)}>
                        <XIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="h-8" onClick={addRung}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Rung
              </Button>
            </div>

            {errors.length > 0 && (
              <div className="text-xs text-destructive space-y-0.5">
                {errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save Ladder"}
              </Button>
              <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saveMutation.isPending}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function BillingEnforcementPanel() {
  const queryClient = useQueryClient();
  const [unblockedIds, setUnblockedIds] = useState<Set<number>>(new Set());
  const [removedBannedIds, setRemovedBannedIds] = useState<Set<number>>(new Set());
  const [resetVendorIds, setResetVendorIds] = useState<Set<number>>(new Set());

  const { data: siteContent } = useQuery<Record<string, unknown>>({
    queryKey: ["admin-site-content-all"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/admin/site-content`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load site content");
      return r.json();
    },
  });
  const rawLadder = siteContent?.["billing.deductionLadder"];
  const ladder: number[] = Array.isArray(rawLadder)
    ? (rawLadder as unknown[]).filter((v): v is number => typeof v === "number")
    : [10, 50, 100, 200];

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

  const resetThresholdMutation = useMutation({
    mutationFn: async (vendorId: number) => {
      const r = await fetch(
        `${BASE_URL}/api/admin/billing-enforcement/vendors/${vendorId}/reset-threshold`,
        { method: "POST", credentials: "include" },
      );
      if (!r.ok) throw new Error("Reset failed");
      return vendorId;
    },
    onSuccess: (vendorId) => {
      setResetVendorIds((s) => new Set([...s, vendorId]));
      toast.success("Vendor threshold reset to base level.");
      queryClient.invalidateQueries({ queryKey: ["admin-billing-enforcement"] });
    },
    onError: (err: Error) => toast.error(err.message),
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

  const { blockedVendors, bannedIdentifiers, thresholdCharges, unsettledByVendor, summary } = data;
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
            Manage the auto-deduction ladder, billing blocks, banned identifiers, and auto-charge history.
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

      {/* ── Section 1: Deduction Ladder ──────────────────────────────────────── */}
      <DeductionLadderEditor />

      {/* ── Section 2: Vendors with unsettled overage ─────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-500" /> Unsettled Overage by Vendor
          </CardTitle>
          <CardDescription>
            All vendors with unpaid resource usage. The "Current Threshold" column shows what level
            triggers their next auto-charge. Use Reset to move them back to the base rung.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {unsettledByVendor.length === 0 ? (
            <div className="px-6 py-10 text-center text-muted-foreground flex flex-col items-center gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <p className="font-medium">No unsettled overage charges</p>
              <p className="text-xs">All vendor usage is settled.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Unsettled Balance</TableHead>
                  <TableHead>Current Threshold</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unsettledByVendor.map((v) => {
                  const wasReset = resetVendorIds.has(v.vendorId);
                  return (
                    <TableRow key={v.vendorId}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{v.vendorName ?? `Vendor #${v.vendorId}`}</p>
                          {v.vendorEmail && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3" />{v.vendorEmail}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs capitalize ${tierColor(v.subscriptionTier)}`}>
                          {v.subscriptionTier}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono font-medium text-amber-600 dark:text-amber-400">
                          {fmt(v.totalUnsettled)}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {wasReset
                          ? <span className="text-muted-foreground">Reset — base rung</span>
                          : thresholdLabel(v.currentDeductionThreshold, ladder)
                        }
                      </TableCell>
                      <TableCell>
                        {v.billingBlocked
                          ? <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-xs">Blocked</Badge>
                          : <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs">Active</Badge>
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        {!wasReset && v.currentDeductionThreshold !== null && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => resetThresholdMutation.mutate(v.vendorId)}
                            disabled={resetThresholdMutation.isPending}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" /> Reset Threshold
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Section 3: Billing-blocked vendors ─────────────────────────────── */}
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
                  <TableHead>Current Threshold</TableHead>
                  <TableHead>Blocked Since</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleBlocked.map((v) => {
                  const wasReset = resetVendorIds.has(v.id);
                  return (
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
                      <TableCell className="font-mono text-sm">
                        {wasReset
                          ? <span className="text-muted-foreground">Reset — base rung</span>
                          : thresholdLabel(v.currentDeductionThreshold, ladder)
                        }
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{fmtDate(v.updatedAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!wasReset && v.currentDeductionThreshold !== null && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => resetThresholdMutation.mutate(v.id)}
                              disabled={resetThresholdMutation.isPending}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" /> Reset
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-950"
                            onClick={() => unblockMutation.mutate(v.id)}
                            disabled={unblockMutation.isPending}
                          >
                            <Unlock className="w-3.5 h-3.5 mr-1.5" /> Unblock
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Section 4: Banned identifiers ──────────────────────────────────── */}
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

      {/* ── Section 5: Threshold charge history ────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" /> Auto-Charge History
          </CardTitle>
          <CardDescription>
            Most recent 50 vendor overage charges collected by the billing threshold scheduler.
            Each charge fires when a vendor's unsettled usage crosses their current threshold rung.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {thresholdCharges.length === 0 ? (
            <div className="px-6 py-10 text-center text-muted-foreground flex flex-col items-center gap-2">
              <DollarSign className="w-8 h-8 text-muted-foreground/40" />
              <p className="font-medium">No threshold charges yet</p>
              <p className="text-xs">Charges appear here once a vendor crosses their charge threshold.</p>
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
