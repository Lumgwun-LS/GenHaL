/**
 * Feature Trials admin panel.
 *
 * Shows all active and recently-expired admin-granted feature trials,
 * provides a grant form (vendor picker, tier, days, optional note),
 * and a revoke button per active trial row.
 */
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/authFetch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, Plus, Trash2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

type TrialRow = {
  id: number;
  name: string;
  email: string;
  subscriptionTier: string;
  featureTrialTier: string;
  featureTrialExpiresAt: string;
  featureTrialGrantedBy: string | null;
  featureTrialGrantedAt: string | null;
  featureTrialNote: string | null;
  active: boolean;
};

type AdminVendor = {
  id: number;
  name: string;
  email: string;
  subscriptionTier: string;
};

const TIER_OPTIONS = [
  { value: "starter",    label: "Starter" },
  { value: "pro",        label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
] as const;

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchTrials(): Promise<TrialRow[]> {
  const res = await authFetch(`${BASE_URL}/api/admin/feature-trials`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load feature trials");
  return res.json() as Promise<TrialRow[]>;
}

async function fetchAdminVendors(): Promise<AdminVendor[]> {
  const res = await authFetch(`${BASE_URL}/api/admin/vendors`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load vendors");
  return res.json() as Promise<AdminVendor[]>;
}

async function grantTrial(vendorId: number, tier: string, days: number, note: string): Promise<void> {
  const res = await authFetch(`${BASE_URL}/api/admin/feature-trials/${vendorId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ tier, days, note: note.trim() || undefined }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to grant trial");
  }
}

async function revokeTrial(vendorId: number): Promise<void> {
  const res = await authFetch(`${BASE_URL}/api/admin/feature-trials/${vendorId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to revoke trial");
  }
}

// ─── Grant dialog ─────────────────────────────────────────────────────────────

function GrantTrialDialog({ onGranted }: { onGranted: () => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [tier, setTier] = useState("pro");
  const [days, setDays] = useState("7");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: vendors = [] } = useQuery({
    queryKey: ["admin-vendors-for-trials"],
    queryFn: fetchAdminVendors,
    enabled: open,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return vendors.slice(0, 50);
    const q = search.toLowerCase();
    return vendors.filter((v) => v.name.toLowerCase().includes(q) || v.email.toLowerCase().includes(q)).slice(0, 50);
  }, [vendors, search]);

  const selectedVendor = vendors.find((v) => v.id === selectedVendorId);

  function resetForm() {
    setSearch("");
    setSelectedVendorId(null);
    setTier("pro");
    setDays("7");
    setNote("");
  }

  async function handleGrant() {
    if (!selectedVendorId) { toast.error("Select a vendor first"); return; }
    const daysNum = Number(days);
    if (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 365) {
      toast.error("Days must be between 1 and 365");
      return;
    }
    setSaving(true);
    try {
      await grantTrial(selectedVendorId, tier, daysNum, note);
      toast.success(`Granted ${daysNum}-day ${tier} trial to ${selectedVendor?.name}`);
      onGranted();
      setOpen(false);
      resetForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Grant failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); setOpen(v); }}>
      <Button size="sm" className="gap-2" onClick={() => setOpen(true)} data-testid="button-grant-feature-trial">
        <Plus className="w-3.5 h-3.5" /> Grant Trial
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Grant feature trial</DialogTitle>
          <DialogDescription>
            Give a vendor temporary access to all features included in the selected plan tier.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Vendor search */}
          <div className="space-y-1.5">
            <Label className="text-xs">Vendor</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-8 h-8 text-xs"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelectedVendorId(null); }}
                data-testid="input-trial-vendor-search"
              />
            </div>
            {search.trim() && !selectedVendorId && (
              <div className="border rounded-md max-h-40 overflow-y-auto text-xs" data-testid="list-trial-vendor-results">
                {filtered.length === 0 ? (
                  <p className="p-2 text-muted-foreground">No vendors found</p>
                ) : filtered.map((v) => (
                  <button
                    key={v.id}
                    className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
                    onClick={() => { setSelectedVendorId(v.id); setSearch(v.name); }}
                    data-testid={`option-trial-vendor-${v.id}`}
                  >
                    <span className="font-medium">{v.name}</span>
                    <span className="ml-2 text-muted-foreground">{v.email}</span>
                    <Badge variant="outline" className="ml-2 text-[10px]">{v.subscriptionTier}</Badge>
                  </button>
                ))}
              </div>
            )}
            {selectedVendor && (
              <p className="text-xs text-muted-foreground">
                Selected: <span className="font-medium text-foreground">{selectedVendor.name}</span> ({selectedVendor.email})
              </p>
            )}
          </div>

          {/* Tier + Days */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Trial tier</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-trial-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIER_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Duration (days)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                className="h-8 text-xs"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                data-testid="input-trial-days"
              />
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-xs">Note (optional)</Label>
            <Textarea
              className="text-xs min-h-16 resize-none"
              placeholder="Reason for the trial, e.g. 'Sales demo for enterprise prospect'"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="input-trial-note"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleGrant} disabled={saving || !selectedVendorId} data-testid="button-confirm-grant-trial">
            {saving ? "Granting…" : "Grant trial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Revoke button ─────────────────────────────────────────────────────────────

function RevokeButton({ vendorId, vendorName, onRevoked }: { vendorId: number; vendorName: string; onRevoked: () => void }) {
  const [saving, setSaving] = useState(false);

  async function handleRevoke() {
    if (!confirm(`Revoke the feature trial for ${vendorName}?`)) return;
    setSaving(true);
    try {
      await revokeTrial(vendorId);
      toast.success(`Trial revoked for ${vendorName}`);
      onRevoked();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-xs text-destructive hover:text-destructive h-7 px-2"
      onClick={handleRevoke}
      disabled={saving}
      data-testid={`button-revoke-trial-${vendorId}`}
    >
      <Trash2 className="w-3.5 h-3.5 mr-1" />
      {saving ? "Revoking…" : "Revoke"}
    </Button>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function FeatureTrialsPanel() {
  const qc = useQueryClient();

  const { data: trials = [], isLoading, error } = useQuery({
    queryKey: ["admin-feature-trials"],
    queryFn: fetchTrials,
    refetchInterval: 60_000,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin-feature-trials"] });
    qc.invalidateQueries({ queryKey: ["admin-vendors-for-trials"] });
  }

  const active  = trials.filter((t) => t.active);
  const expired = trials.filter((t) => !t.active);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="w-4 h-4 text-violet-400" /> Feature Trials
              </CardTitle>
              <CardDescription className="mt-1">
                Grant vendors temporary access to premium features without changing their billing tier.
                Trials expire automatically and the vendor is notified by email and in-app notification.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={refresh} className="gap-1.5 text-xs">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </Button>
              <GrantTrialDialog onGranted={refresh} />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Active trials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            Active Trials
            {active.length > 0 && (
              <Badge variant="default" className="text-xs">{active.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-destructive">Failed to load feature trials.</div>
          ) : active.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground" data-testid="empty-active-trials">
              <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium text-sm">No active trials</p>
              <p className="text-xs mt-1">Use the Grant Trial button above to give a vendor temporary premium access.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Billing tier</TableHead>
                  <TableHead>Trial tier</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Granted by</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map((t) => {
                  const daysLeft = Math.ceil(
                    (new Date(t.featureTrialExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                  );
                  return (
                    <TableRow key={t.id} data-testid={`row-active-trial-${t.id}`}>
                      <TableCell>
                        <div className="font-medium text-sm">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{t.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{t.subscriptionTier}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className="text-xs capitalize bg-violet-500/20 text-violet-300 border-violet-500/30">
                          {t.featureTrialTier}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{new Date(t.featureTrialExpiresAt).toLocaleDateString()}</div>
                        <div className="text-xs text-muted-foreground">
                          {daysLeft <= 1 ? "Expires today" : `${daysLeft} days left`}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.featureTrialGrantedBy ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {t.featureTrialNote ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <RevokeButton vendorId={t.id} vendorName={t.name} onRevoked={refresh} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recently expired (not yet cleared by scheduler) */}
      {expired.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Recently Expired
              <Badge variant="secondary" className="text-xs">{expired.length}</Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              These trials have passed their expiry date. The scheduler will clear them and notify vendors on its next hourly run.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Trial tier</TableHead>
                  <TableHead>Expired</TableHead>
                  <TableHead>Granted by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expired.map((t) => (
                  <TableRow key={t.id} className="opacity-60" data-testid={`row-expired-trial-${t.id}`}>
                    <TableCell>
                      <div className="font-medium text-sm">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs capitalize">{t.featureTrialTier}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(t.featureTrialExpiresAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.featureTrialGrantedBy ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
