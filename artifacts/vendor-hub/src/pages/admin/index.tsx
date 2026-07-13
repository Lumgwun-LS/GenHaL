import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ShieldCheck, ShieldOff, CreditCard, AlertCircle, CheckCircle2, XCircle, ShieldAlert, Cake, Mail, Bell, Phone, PhoneCall, PhoneOff, PhoneMissed, Download, ClipboardList, ArrowRight, Layout, BarChart3, Send, MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Redirect } from "wouter";
import SiteEditor from "./site-editor";
import PaymentGatewaysPanel from "./payment-gateways";
import BillingSyncPanel from "./billing-sync";
import AdminAnalyticsPanel from "./analytics";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const TIERS = ["free", "starter", "pro", "enterprise"] as const;
const LEVELS = ["unverified", "basic", "verified", "premium"] as const;

type AdminVendor = {
  id: number;
  name: string;
  industry: string;
  status: string;
  email: string;
  subscriptionTier: string;
  verificationLevel: string;
  featureUnlocked: boolean;
  createdAt: string;
  stripe: { hasKey: boolean; testPassed: boolean };
  paystack: { hasKey: boolean; testPassed: boolean };
};

async function fetchAdminVendors(): Promise<AdminVendor[]> {
  const res = await fetch(`${BASE_URL}/api/admin/vendors`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load vendors");
  return res.json() as Promise<AdminVendor[]>;
}

async function patchTier(
  vendorId: number,
  update: { subscriptionTier?: string; verificationLevel?: string },
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/tier`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to update vendor");
  }
}

const TIER_COLORS: Record<string, string> = {
  free: "secondary",
  starter: "outline",
  pro: "default",
  enterprise: "default",
};

const LEVEL_COLORS: Record<string, string> = {
  unverified: "secondary",
  basic: "outline",
  verified: "default",
  premium: "default",
};

function TierSelect({ vendorId, value, onSave }: { vendorId: number; value: string; onSave: () => void }) {
  const [saving, setSaving] = useState(false);

  async function handleChange(next: string) {
    if (next === value) return;
    setSaving(true);
    try {
      await patchTier(vendorId, { subscriptionTier: next });
      toast.success(`Tier updated to ${next}`);
      onSave();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger className="h-8 w-32 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TIERS.map((t) => (
          <SelectItem key={t} value={t} className="text-xs">
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LevelSelect({ vendorId, value, onSave }: { vendorId: number; value: string; onSave: () => void }) {
  const [saving, setSaving] = useState(false);

  async function handleChange(next: string) {
    if (next === value) return;
    setSaving(true);
    try {
      await patchTier(vendorId, { verificationLevel: next });
      toast.success(`Verification updated to ${next}`);
      onSave();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger className="h-8 w-32 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEVELS.map((l) => (
          <SelectItem key={l} value={l} className="text-xs">
            {l.charAt(0).toUpperCase() + l.slice(1)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function KeyStatus({ hasKey, testPassed, label }: { hasKey: boolean; testPassed: boolean; label: string }) {
  if (!hasKey) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <XCircle className="w-3.5 h-3.5" />
        <span>No {label}</span>
      </div>
    );
  }
  if (testPassed) {
    return (
      <div className="flex items-center gap-1 text-xs text-emerald-500">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>{label} ✓</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-xs text-yellow-500">
      <AlertCircle className="w-3.5 h-3.5" />
      <span>{label} (untested)</span>
    </div>
  );
}

type AuditLogEntry = {
  id: number;
  adminUserId: string;
  adminDisplayName: string | null;
  vendorId: number;
  vendorName: string | null;
  field: string;
  oldValue: string;
  newValue: string;
  changedAt: string;
};

async function fetchAuditLog(): Promise<AuditLogEntry[]> {
  const res = await fetch(`${BASE_URL}/api/admin/audit-log`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load audit log");
  return res.json() as Promise<AuditLogEntry[]>;
}

type BirthdayLog = {
  id: number;
  vendorId: number;
  vendorName: string;
  vendorEmail: string | null;
  channel: string;
  sentAt: string;
};

async function fetchBirthdayLogs(): Promise<BirthdayLog[]> {
  const res = await fetch(`${BASE_URL}/api/admin/birthday-logs`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load birthday logs");
  return res.json() as Promise<BirthdayLog[]>;
}

type VoiceCallLog = {
  id: number;
  vendorId: number | null;
  campaignId: number | null;
  phone: string;
  purpose: string;
  status: string;
  durationSeconds: number | null;
  callSid: string | null;
  initiatedAt: string;
};

async function fetchVoiceCallLogs(): Promise<VoiceCallLog[]> {
  const res = await fetch(`${BASE_URL}/api/admin/voice-call-logs`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load voice call logs");
  return res.json() as Promise<VoiceCallLog[]>;
}

type ScheduledCampaign = {
  id: number;
  name: string;
  scheduledAt: string | null;
  vendorId: number;
  vendorName: string;
  leadCount: number;
};

async function fetchScheduledCampaigns(): Promise<ScheduledCampaign[]> {
  const res = await fetch(`${BASE_URL}/api/admin/voice-campaigns/scheduled`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load scheduled campaigns");
  return res.json() as Promise<ScheduledCampaign[]>;
}

async function fetchVoiceStatus(): Promise<{ configured: boolean }> {
  const res = await fetch(`${BASE_URL}/api/admin/voice-status`, { credentials: "include" });
  if (!res.ok) return { configured: false };
  return res.json();
}

type ExportLog = {
  id: number;
  adminUserId: string;
  filters: string;
  rowCount: number;
  exportedAt: string;
};

async function fetchExportLogs(): Promise<ExportLog[]> {
  const res = await fetch(`${BASE_URL}/api/admin/export-logs`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load export history");
  return res.json() as Promise<ExportLog[]>;
}

type ExportAlerts = {
  threshold: number;
  windowMinutes: number;
  flagged: {
    adminUserId: string;
    count: number;
    lastExportAt: string;
    blocked: boolean;
    acknowledgedAt: string | null;
    acknowledgedBy: string | null;
  }[];
};

async function fetchExportAlerts(): Promise<ExportAlerts> {
  const res = await fetch(`${BASE_URL}/api/admin/export-alerts`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load export alerts");
  return res.json() as Promise<ExportAlerts>;
}

async function acknowledgeExportBurst(adminUserId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/export-alerts/${encodeURIComponent(adminUserId)}/acknowledge`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to clear the flag");
  }
}

async function saveExportAlertSettings(value: { threshold: number; windowMinutes: number }): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/site-content/admin.exportAlertSettings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to save alert settings");
  }
}

function AcknowledgeExportBurstButton({ adminUserId }: { adminUserId: string }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  async function handleClick() {
    setSaving(true);
    try {
      await acknowledgeExportBurst(adminUserId);
      toast.success(`Cleared the export flag for ${adminUserId}. Exports are unblocked.`);
      qc.invalidateQueries({ queryKey: ["admin-export-alerts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear the flag");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-xs shrink-0"
      onClick={handleClick}
      disabled={saving}
      data-testid={`button-acknowledge-export-burst-${adminUserId}`}
    >
      {saving ? "Clearing…" : "Acknowledge & unblock"}
    </Button>
  );
}

function ExportAlertSettingsDialog({ threshold, windowMinutes }: { threshold: number; windowMinutes: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [thresholdInput, setThresholdInput] = useState(String(threshold));
  const [windowInput, setWindowInput] = useState(String(windowMinutes));
  const [saving, setSaving] = useState(false);

  function openDialog() {
    setThresholdInput(String(threshold));
    setWindowInput(String(windowMinutes));
    setOpen(true);
  }

  async function handleSave() {
    const t = Number(thresholdInput);
    const w = Number(windowInput);
    if (!Number.isInteger(t) || t < 1 || t > 1000) {
      toast.error("Threshold must be a whole number between 1 and 1000.");
      return;
    }
    if (!Number.isInteger(w) || w < 1 || w > 1440) {
      toast.error("Window must be a whole number of minutes between 1 and 1440.");
      return;
    }
    setSaving(true);
    try {
      await saveExportAlertSettings({ threshold: t, windowMinutes: w });
      toast.success("Export alert threshold updated.");
      qc.invalidateQueries({ queryKey: ["admin-export-alerts"] });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? openDialog() : setOpen(false))}>
      <Button variant="outline" size="sm" className="gap-2" onClick={openDialog} data-testid="button-edit-export-alert-settings">
        <Bell className="w-3.5 h-3.5" />
        Alert Settings
      </Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Export burst alert settings</DialogTitle>
          <DialogDescription>
            Flag an admin when they download the vendor export this many times within the window below.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Threshold (downloads)</Label>
            <Input
              type="number"
              min={1}
              max={1000}
              className="h-8 text-xs"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              data-testid="input-export-alert-threshold"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Window (minutes)</Label>
            <Input
              type="number"
              min={1}
              max={1440}
              className="h-8 text-xs"
              value={windowInput}
              onChange={(e) => setWindowInput(e.target.value)}
              data-testid="input-export-alert-window"
            />
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" onClick={handleSave} disabled={saving} data-testid="button-save-export-alert-settings">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type VoiceSignatureFailureAlert = {
  threshold: number;
  windowMinutes: number;
  count: number;
  lastFailureAt: string | null;
  flagged: boolean;
};

async function fetchVoiceSignatureFailureAlert(): Promise<VoiceSignatureFailureAlert> {
  const res = await fetch(`${BASE_URL}/api/admin/voice/signature-failures/alert`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load signature-failure alert status");
  return res.json() as Promise<VoiceSignatureFailureAlert>;
}

async function saveVoiceSignatureFailureAlertSettings(value: { threshold: number; windowMinutes: number }): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/site-content/admin.voiceSignatureFailureAlertSettings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to save alert settings");
  }
}

type VoiceBackfillStatus = {
  ranAt: string | null;
  triggeredBy: string;
  checked: number;
  updated: number;
  failed: number;
};

async function fetchVoiceBackfillStatus(): Promise<VoiceBackfillStatus> {
  const res = await fetch(`${BASE_URL}/api/admin/voice-backfill`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load backfill status");
  return res.json() as Promise<VoiceBackfillStatus>;
}

async function runVoiceBackfillNow(): Promise<VoiceBackfillStatus> {
  const res = await fetch(`${BASE_URL}/api/admin/voice-backfill/run`, { method: "POST", credentials: "include" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to run backfill");
  }
  return res.json() as Promise<VoiceBackfillStatus>;
}

function VoiceBackfillCard({ status }: { status: VoiceBackfillStatus }) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    try {
      await runVoiceBackfillNow();
      await qc.invalidateQueries({ queryKey: ["admin-voice-backfill"] });
      await qc.invalidateQueries({ queryKey: ["admin-voice-call-logs"] });
    } catch {
      // surfaced implicitly by stale status remaining on-screen
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="w-4 h-4 text-primary" /> Call Status Backfill
          </CardTitle>
          <CardDescription>
            Recovers calls stuck mid-status because their Twilio callback was rejected (e.g. during a Twilio Auth
            Token rotation). Runs automatically every 5 minutes.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={handleRun} disabled={running} data-testid="button-run-voice-backfill">
          {running ? "Running…" : "Run now"}
        </Button>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {status.ranAt ? (
          <p>
            Last ran {new Date(status.ranAt).toLocaleString()} ({status.triggeredBy === "system" ? "automatic" : `by ${status.triggeredBy}`}) —{" "}
            found <strong className="text-foreground">{status.checked}</strong> stuck call{status.checked === 1 ? "" : "s"},
            fixed <strong className="text-foreground">{status.updated}</strong>
            {status.failed > 0 ? `, ${status.failed} failed to reconcile` : ""}.
          </p>
        ) : (
          <p>Hasn't run yet — it will run automatically within 5 minutes of the server starting.</p>
        )}
      </CardContent>
    </Card>
  );
}

function VoiceSignatureFailureAlertSettingsDialog({ threshold, windowMinutes }: { threshold: number; windowMinutes: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [thresholdInput, setThresholdInput] = useState(String(threshold));
  const [windowInput, setWindowInput] = useState(String(windowMinutes));
  const [saving, setSaving] = useState(false);

  function openDialog() {
    setThresholdInput(String(threshold));
    setWindowInput(String(windowMinutes));
    setOpen(true);
  }

  async function handleSave() {
    const t = Number(thresholdInput);
    const w = Number(windowInput);
    if (!Number.isInteger(t) || t < 1 || t > 1000) {
      toast.error("Threshold must be a whole number between 1 and 1000.");
      return;
    }
    if (!Number.isInteger(w) || w < 1 || w > 1440) {
      toast.error("Window must be a whole number of minutes between 1 and 1440.");
      return;
    }
    setSaving(true);
    try {
      await saveVoiceSignatureFailureAlertSettings({ threshold: t, windowMinutes: w });
      toast.success("Signature-failure alert threshold updated.");
      qc.invalidateQueries({ queryKey: ["admin-voice-signature-failure-alert"] });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? openDialog() : setOpen(false))}>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={openDialog}
        data-testid="button-edit-voice-signature-failure-alert-settings"
      >
        <Bell className="w-3.5 h-3.5" />
        Alert Settings
      </Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Signature-failure alert settings</DialogTitle>
          <DialogDescription>
            Warn admins when this many Twilio status-callback requests are rejected for bad/missing signatures
            within the window below — usually a sign the Auth Token was rotated in the Twilio console.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Threshold (failures)</Label>
            <Input
              type="number"
              min={1}
              max={1000}
              className="h-8 text-xs"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              data-testid="input-voice-signature-failure-alert-threshold"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Window (minutes)</Label>
            <Input
              type="number"
              min={1}
              max={1440}
              className="h-8 text-xs"
              value={windowInput}
              onChange={(e) => setWindowInput(e.target.value)}
              data-testid="input-voice-signature-failure-alert-window"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            data-testid="button-save-voice-signature-failure-alert-settings"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatExportFilters(raw: string): string {
  try {
    const f = JSON.parse(raw) as Record<string, string | undefined>;
    const parts = Object.entries(f)
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => `${k}: ${v}`);
    return parts.length > 0 ? parts.join(", ") : "No filters";
  } catch {
    return "No filters";
  }
}

const ANY = "__any__";

type ExportFilters = {
  tier: string;
  status: string;
  verificationLevel: string;
  joinedAfter: string;
  joinedBefore: string;
};

const EMPTY_FILTERS: ExportFilters = {
  tier: ANY,
  status: ANY,
  verificationLevel: ANY,
  joinedAfter: "",
  joinedBefore: "",
};

const STATUSES = ["active", "inactive", "suspended"] as const;

function ExportFilterPopover({ onExport }: { onExport: (filters: ExportFilters) => void }) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<ExportFilters>(EMPTY_FILTERS);

  function update<K extends keyof ExportFilters>(key: K, value: ExportFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div className="space-y-1">
          <Label className="text-xs">Subscription Tier</Label>
          <Select value={filters.tier} onValueChange={(v) => update("tier", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY} className="text-xs">Any tier</SelectItem>
              {TIERS.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={filters.status} onValueChange={(v) => update("status", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY} className="text-xs">Any status</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Verification Level</Label>
          <Select value={filters.verificationLevel} onValueChange={(v) => update("verificationLevel", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY} className="text-xs">Any level</SelectItem>
              {LEVELS.map((l) => (
                <SelectItem key={l} value={l} className="text-xs">{l.charAt(0).toUpperCase() + l.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Joined after</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={filters.joinedAfter}
              onChange={(e) => update("joinedAfter", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Joined before</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={filters.joinedBefore}
              onChange={(e) => update("joinedBefore", e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-between gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Clear
          </Button>
          <Button
            size="sm"
            className="text-xs"
            onClick={() => {
              onExport(filters);
              setOpen(false);
            }}
          >
            Export CSV
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function vendorMatchesFilters(vendor: AdminVendor, filters: ExportFilters): boolean {
  if (filters.tier !== ANY && vendor.subscriptionTier !== filters.tier) return false;
  if (filters.status !== ANY && vendor.status !== filters.status) return false;
  if (filters.verificationLevel !== ANY && vendor.verificationLevel !== filters.verificationLevel) return false;
  const createdAt = new Date(vendor.createdAt);
  if (filters.joinedAfter) {
    const after = new Date(filters.joinedAfter);
    if (!isNaN(after.getTime()) && createdAt < after) return false;
  }
  if (filters.joinedBefore) {
    const before = new Date(new Date(filters.joinedBefore).getTime() + 24 * 60 * 60 * 1000 - 1);
    if (!isNaN(before.getTime()) && createdAt > before) return false;
  }
  return true;
}

function TargetByFilterPopover({
  vendors,
  onApply,
}: {
  vendors: AdminVendor[];
  onApply: (vendorIds: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<ExportFilters>(EMPTY_FILTERS);

  function update<K extends keyof ExportFilters>(key: K, value: ExportFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  const filtersActive =
    filters.tier !== ANY || filters.status !== ANY || filters.verificationLevel !== ANY || filters.joinedAfter !== "" || filters.joinedBefore !== "";
  const matchCount = vendors.filter((v) => vendorMatchesFilters(v, filters)).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 gap-2" data-testid="button-target-by-filter">
          <ShieldAlert className="w-4 h-4" />
          Filter &amp; Select
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-medium">Select vendors matching…</p>
          <p className="text-xs text-muted-foreground">Pre-selects vendors below so you can send them a bulk message.</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Subscription Tier</Label>
          <Select value={filters.tier} onValueChange={(v) => update("tier", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY} className="text-xs">Any tier</SelectItem>
              {TIERS.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={filters.status} onValueChange={(v) => update("status", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY} className="text-xs">Any status</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Verification Level</Label>
          <Select value={filters.verificationLevel} onValueChange={(v) => update("verificationLevel", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY} className="text-xs">Any level</SelectItem>
              {LEVELS.map((l) => (
                <SelectItem key={l} value={l} className="text-xs">{l.charAt(0).toUpperCase() + l.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Joined after</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={filters.joinedAfter}
              onChange={(e) => update("joinedAfter", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Joined before</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={filters.joinedBefore}
              onChange={(e) => update("joinedBefore", e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setFilters(EMPTY_FILTERS)}
            data-testid="button-clear-target-filter"
          >
            Clear
          </Button>
          <Button
            size="sm"
            className="text-xs"
            disabled={!filtersActive || matchCount === 0}
            onClick={() => {
              onApply(vendors.filter((v) => vendorMatchesFilters(v, filters)).map((v) => v.id));
              setOpen(false);
            }}
            data-testid="button-apply-target-filter"
          >
            Select {matchCount} vendor{matchCount === 1 ? "" : "s"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

async function postVendorMessage(vendorId: number, message: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to send message");
  }
}

async function postBulkVendorMessage(
  message: string,
  target: { all: true } | { all: false; vendorIds: number[] },
): Promise<{ sent: number; emailsSent: number; emailAttempted: number }> {
  const res = await fetch(`${BASE_URL}/api/vendors/notifications/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(
      target.all ? { message, all: true } : { message, vendorIds: target.vendorIds },
    ),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to send message");
  }
  return res.json() as Promise<{ sent: number; emailsSent: number; emailAttempted: number }>;
}

function BulkMessageDialog({
  selectedIds,
  allSelected,
  totalVendors,
  onSent,
}: {
  selectedIds: number[];
  allSelected: boolean;
  totalVendors: number;
  onSent: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const recipientCount = allSelected ? totalVendors : selectedIds.length;
  const disabled = recipientCount === 0;

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed || disabled) return;
    setSending(true);
    try {
      const { sent, emailsSent } = await postBulkVendorMessage(
        trimmed,
        allSelected ? { all: true } : { all: false, vendorIds: selectedIds },
      );
      toast.success(
        `Message sent to ${sent} vendor${sent === 1 ? "" : "s"}` +
          (emailsSent > 0 ? ` — email also sent to ${emailsSent} of them` : " (email not sent — SMTP isn't configured)"),
      );
      setMessage("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-message-history"] });
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="default"
        size="sm"
        className="shrink-0 gap-2"
        onClick={() => setOpen(true)}
        disabled={disabled}
        data-testid="button-message-selected-vendors"
      >
        <Send className="w-4 h-4" />
        Message {allSelected ? "All Vendors" : `Selected${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`}
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Message {recipientCount} vendor{recipientCount === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            Sends the same in-app notification to {allSelected ? "every vendor" : "each selected vendor"}. It will
            appear in their notification bell, and we'll also email each vendor a copy of the announcement.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your announcement…"
          className="min-h-28"
          maxLength={1000}
          data-testid="textarea-bulk-vendor-message"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || !message.trim() || disabled} data-testid="button-send-bulk-vendor-message">
            {sending ? "Sending…" : `Send to ${recipientCount}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MessageVendorDialog({ vendor }: { vendor: { id: number; name: string } }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await postVendorMessage(vendor.id, trimmed);
      toast.success(`Message sent to ${vendor.name}`);
      setMessage("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-message-history"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
        data-testid={`button-message-vendor-${vendor.id}`}
      >
        <Send className="w-3.5 h-3.5" /> Message
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Message {vendor.name}</DialogTitle>
          <DialogDescription>
            Sends a one-off in-app notification to this vendor. It will appear in their notification bell.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message…"
          className="min-h-28"
          maxLength={1000}
          data-testid="textarea-vendor-message"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || !message.trim()} data-testid="button-send-vendor-message">
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function resendBirthdayEmail(logId: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/birthday-logs/${logId}/resend`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to resend email");
  }
}

function ResendBirthdayEmailButton({ logId, onDone }: { logId: number; onDone: () => void }) {
  const [sending, setSending] = useState(false);

  async function handleResend() {
    setSending(true);
    try {
      await resendBirthdayEmail(logId);
      toast.success("Birthday email resent");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resend email");
    } finally {
      setSending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 text-xs"
      onClick={handleResend}
      disabled={sending}
      data-testid={`button-resend-birthday-${logId}`}
    >
      <Send className="w-3.5 h-3.5" /> {sending ? "Resending…" : "Resend"}
    </Button>
  );
}

async function retryVoiceCall(logId: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/voice-call-logs/${logId}/retry`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to retry call");
  }
}

function RetryVoiceCallButton({ logId, purpose, onDone }: { logId: number; purpose: string; onDone: () => void }) {
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    try {
      await retryVoiceCall(logId);
      toast.success(purpose === "campaign" ? "Campaign call retried" : "Birthday call retried");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to retry call");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 text-xs"
      onClick={handleRetry}
      disabled={retrying}
      data-testid={`button-retry-call-${logId}`}
    >
      <PhoneCall className="w-3.5 h-3.5" /> {retrying ? "Retrying…" : "Retry"}
    </Button>
  );
}

const AUDIT_FIELD_ANY = "__any__";

type MessageHistoryEntry = {
  id: number;
  vendorId: number;
  vendorName: string | null;
  message: string;
  adminUserId: string | null;
  adminDisplayName: string | null;
  createdAt: string;
};

async function fetchMessageHistory(): Promise<MessageHistoryEntry[]> {
  const res = await fetch(`${BASE_URL}/api/admin/message-history`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load message history");
  return res.json() as Promise<MessageHistoryEntry[]>;
}

type PlanChangeEntry = {
  id: number;
  vendorId: number;
  vendorName: string | null;
  previousTier: string | null;
  newTier: string | null;
  message: string;
  createdAt: string;
};

async function fetchTierChangeHistory(): Promise<PlanChangeEntry[]> {
  const res = await fetch(`${BASE_URL}/api/admin/tier-change-history`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load plan change history");
  return res.json() as Promise<PlanChangeEntry[]>;
}

export default function AdminPanel() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();

  const [auditVendorSearch, setAuditVendorSearch] = useState("");
  const [auditFieldFilter, setAuditFieldFilter] = useState(AUDIT_FIELD_ANY);
  const [auditAfter, setAuditAfter] = useState("");
  const [auditBefore, setAuditBefore] = useState("");

  const [messageVendorSearch, setMessageVendorSearch] = useState("");

  const [planChangeVendorSearch, setPlanChangeVendorSearch] = useState("");

  const [selectedVendorIds, setSelectedVendorIds] = useState<number[]>([]);
  const [selectAllVendors, setSelectAllVendors] = useState(false);

  const { data: vendors, isLoading, error } = useQuery({
    queryKey: ["admin-vendors"],
    queryFn: fetchAdminVendors,
    enabled: isAdmin,
  });

  const { data: birthdayLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["admin-birthday-logs"],
    queryFn: fetchBirthdayLogs,
    enabled: isAdmin,
  });

  const { data: voiceCallLogs, isLoading: voiceLoading } = useQuery({
    queryKey: ["admin-voice-call-logs"],
    queryFn: fetchVoiceCallLogs,
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const { data: voiceStatus } = useQuery({
    queryKey: ["admin-voice-status"],
    queryFn: fetchVoiceStatus,
    enabled: isAdmin,
  });

  const { data: scheduledCampaigns, isLoading: scheduledCampaignsLoading } = useQuery({
    queryKey: ["admin-scheduled-campaigns"],
    queryFn: fetchScheduledCampaigns,
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const { data: auditLog, isLoading: auditLoading } = useQuery({
    queryKey: ["admin-audit-log"],
    queryFn: fetchAuditLog,
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const { data: exportLogs, isLoading: exportLogsLoading } = useQuery({
    queryKey: ["admin-export-logs"],
    queryFn: fetchExportLogs,
    enabled: isAdmin,
  });

  const { data: messageHistory, isLoading: messageHistoryLoading } = useQuery({
    queryKey: ["admin-message-history"],
    queryFn: fetchMessageHistory,
    enabled: isAdmin,
  });

  const { data: planChangeHistory, isLoading: planChangeHistoryLoading } = useQuery({
    queryKey: ["admin-tier-change-history"],
    queryFn: fetchTierChangeHistory,
    enabled: isAdmin,
  });

  const { data: exportAlerts } = useQuery({
    queryKey: ["admin-export-alerts"],
    queryFn: fetchExportAlerts,
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const { data: voiceSignatureFailureAlert } = useQuery({
    queryKey: ["admin-voice-signature-failure-alert"],
    queryFn: fetchVoiceSignatureFailureAlert,
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const { data: voiceBackfillStatus } = useQuery({
    queryKey: ["admin-voice-backfill"],
    queryFn: fetchVoiceBackfillStatus,
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const filteredAuditLog = useMemo(() => {
    if (!auditLog) return auditLog;
    const search = auditVendorSearch.trim().toLowerCase();
    const afterDate = auditAfter ? new Date(auditAfter) : null;
    const beforeDate = auditBefore ? new Date(new Date(auditBefore).getTime() + 24 * 60 * 60 * 1000 - 1) : null;
    return auditLog.filter((entry) => {
      if (search) {
        const name = (entry.vendorName ?? `Vendor #${entry.vendorId}`).toLowerCase();
        if (!name.includes(search)) return false;
      }
      if (auditFieldFilter !== AUDIT_FIELD_ANY && entry.field !== auditFieldFilter) return false;
      const changedAt = new Date(entry.changedAt);
      if (afterDate && !isNaN(afterDate.getTime()) && changedAt < afterDate) return false;
      if (beforeDate && !isNaN(beforeDate.getTime()) && changedAt > beforeDate) return false;
      return true;
    });
  }, [auditLog, auditVendorSearch, auditFieldFilter, auditAfter, auditBefore]);

  const auditFiltersActive =
    auditVendorSearch.trim() !== "" || auditFieldFilter !== AUDIT_FIELD_ANY || auditAfter !== "" || auditBefore !== "";

  const filteredMessageHistory = useMemo(() => {
    if (!messageHistory) return messageHistory;
    const search = messageVendorSearch.trim().toLowerCase();
    if (!search) return messageHistory;
    return messageHistory.filter((entry) =>
      (entry.vendorName ?? `Vendor #${entry.vendorId}`).toLowerCase().includes(search),
    );
  }, [messageHistory, messageVendorSearch]);

  const filteredPlanChangeHistory = useMemo(() => {
    if (!planChangeHistory) return planChangeHistory;
    const search = planChangeVendorSearch.trim().toLowerCase();
    if (!search) return planChangeHistory;
    return planChangeHistory.filter((entry) =>
      (entry.vendorName ?? `Vendor #${entry.vendorId}`).toLowerCase().includes(search),
    );
  }, [planChangeHistory, planChangeVendorSearch]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin-vendors"] });
    qc.invalidateQueries({ queryKey: ["admin-audit-log"] });
  }

  function toggleVendorSelected(id: number, checked: boolean) {
    setSelectAllVendors(false);
    setSelectedVendorIds((prev) => (checked ? [...prev, id] : prev.filter((v) => v !== id)));
  }

  function toggleSelectAllVendors(checked: boolean) {
    setSelectAllVendors(checked);
    setSelectedVendorIds(checked ? (vendors?.map((v) => v.id) ?? []) : []);
  }

  function clearVendorSelection() {
    setSelectAllVendors(false);
    setSelectedVendorIds([]);
  }

  if (!isAdmin && !isLoading) return <Redirect to="/dashboard" />;

  const totalVendors = vendors?.length ?? 0;
  const featureUnlocked = vendors?.filter((v) => v.featureUnlocked).length ?? 0;
  const verified = vendors?.filter((v) => ["verified", "premium"].includes(v.verificationLevel)).length ?? 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Admin Panel</h1>
        </div>
        <p className="text-muted-foreground mt-1">Manage vendors, tiers, and platform activity.</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Vendors</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalVendors}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payments Unlocked</CardTitle>
            <CreditCard className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{featureUnlocked}</div>
            <p className="text-xs text-muted-foreground">Pro/Enterprise + Verified</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified Vendors</CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{verified}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="vendors">
        <TabsList>
          <TabsTrigger value="vendors" className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Vendors
          </TabsTrigger>
          <TabsTrigger value="birthdays" className="flex items-center gap-2">
            <Cake className="w-4 h-4" /> Birthday Messages
          </TabsTrigger>
          <TabsTrigger value="voice" className="flex items-center gap-2">
            <Phone className="w-4 h-4" /> Voice Calls
          </TabsTrigger>
          <TabsTrigger value="scheduled-campaigns" className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4" /> Scheduled Campaigns
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Audit Log
          </TabsTrigger>
          <TabsTrigger value="plan-changes" className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4" /> Plan Changes
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Messages
          </TabsTrigger>
          <TabsTrigger value="payment-gateways" className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Payment Gateways
          </TabsTrigger>
          <TabsTrigger value="billing-sync" className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Billing Sync
          </TabsTrigger>
          <TabsTrigger value="site-editor" className="flex items-center gap-2">
            <Layout className="w-4 h-4" /> Site Editor
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Analytics
          </TabsTrigger>
        </TabsList>

        {/* ── Vendors tab ─────────────────────────────────────────────── */}
        <TabsContent value="vendors">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>All Vendors</CardTitle>
                <CardDescription>Adjust subscription tiers and verification levels. Changes take effect immediately.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <TargetByFilterPopover
                  vendors={vendors ?? []}
                  onApply={(vendorIds) => {
                    setSelectAllVendors(false);
                    setSelectedVendorIds(vendorIds);
                    toast.success(
                      vendorIds.length > 0
                        ? `Selected ${vendorIds.length} vendor${vendorIds.length === 1 ? "" : "s"} matching the filter`
                        : "No vendors matched that filter",
                    );
                  }}
                />
                <BulkMessageDialog
                  selectedIds={selectedVendorIds}
                  allSelected={selectAllVendors}
                  totalVendors={totalVendors}
                  onSent={clearVendorSelection}
                />
                <ExportFilterPopover
                  onExport={async (filters) => {
                    const params = new URLSearchParams();
                    if (filters.tier !== ANY) params.set("tier", filters.tier);
                    if (filters.status !== ANY) params.set("status", filters.status);
                    if (filters.verificationLevel !== ANY) params.set("verificationLevel", filters.verificationLevel);
                    if (filters.joinedAfter) params.set("joinedAfter", filters.joinedAfter);
                    if (filters.joinedBefore) params.set("joinedBefore", filters.joinedBefore);
                    const qs = params.toString();
                    const url = `${BASE_URL}/api/admin/vendors/export${qs ? `?${qs}` : ""}`;

                    // Fetch first (rather than a bare anchor navigation) so a
                    // 429 mid-burst block surfaces as a toast instead of
                    // silently downloading an error page as "export.csv".
                    try {
                      const res = await fetch(url, { credentials: "include" });
                      if (res.status === 429) {
                        const body = (await res.json().catch(() => ({}))) as { error?: string };
                        toast.error(body.error ?? "Exports are paused for this account. Ask another admin to review.");
                        qc.invalidateQueries({ queryKey: ["admin-export-alerts"] });
                        return;
                      }
                      if (!res.ok) {
                        toast.error("Export failed.");
                        return;
                      }
                      const blob = await res.blob();
                      const blobUrl = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = blobUrl;
                      a.download = `vendors-export-${new Date().toISOString().slice(0, 10)}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(blobUrl);
                      toast.success("CSV download started");
                      qc.invalidateQueries({ queryKey: ["admin-export-logs"] });
                      qc.invalidateQueries({ queryKey: ["admin-export-alerts"] });
                    } catch {
                      toast.error("Export failed.");
                    }
                  }}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading vendors…</div>
              ) : error ? (
                <div className="p-8 text-center text-destructive">Failed to load vendors.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            totalVendors > 0 && selectedVendorIds.length === totalVendors
                              ? true
                              : selectedVendorIds.length > 0
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={(checked) => toggleSelectAllVendors(checked === true)}
                          aria-label="Select all vendors"
                          data-testid="checkbox-select-all-vendors"
                        />
                      </TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Subscription Tier</TableHead>
                      <TableHead>Verification</TableHead>
                      <TableHead>Payment Keys</TableHead>
                      <TableHead className="text-right">Joined</TableHead>
                      <TableHead className="text-right">Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No vendors found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      vendors?.map((vendor) => (
                        <TableRow key={vendor.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedVendorIds.includes(vendor.id)}
                              onCheckedChange={(checked) => toggleVendorSelected(vendor.id, checked === true)}
                              aria-label={`Select ${vendor.name}`}
                              data-testid={`checkbox-select-vendor-${vendor.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{vendor.name}</div>
                            <div className="text-xs text-muted-foreground">{vendor.email}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={vendor.status === "active" ? "default" : "secondary"}>
                              {vendor.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <TierSelect vendorId={vendor.id} value={vendor.subscriptionTier} onSave={refresh} />
                          </TableCell>
                          <TableCell>
                            <LevelSelect vendorId={vendor.id} value={vendor.verificationLevel} onSave={refresh} />
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <KeyStatus hasKey={vendor.stripe.hasKey} testPassed={vendor.stripe.testPassed} label="Stripe" />
                              <KeyStatus hasKey={vendor.paystack.hasKey} testPassed={vendor.paystack.testPassed} label="Paystack" />
                              {vendor.featureUnlocked ? (
                                <div className="flex items-center gap-1 text-xs text-primary">
                                  <ShieldCheck className="w-3.5 h-3.5" /><span>Payments unlocked</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <ShieldOff className="w-3.5 h-3.5" /><span>Locked</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground text-sm">
                            {new Date(vendor.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <MessageVendorDialog vendor={vendor} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="w-4 h-4" /> Export History
                </CardTitle>
                <CardDescription>Recent CSV downloads of vendor data, for compliance tracking.</CardDescription>
              </div>
              {exportAlerts && (
                <ExportAlertSettingsDialog threshold={exportAlerts.threshold} windowMinutes={exportAlerts.windowMinutes} />
              )}
            </CardHeader>
            <CardContent className="p-0">
              {exportAlerts && exportAlerts.flagged.length > 0 && (
                <div className="p-4 pb-0 space-y-3">
                  {exportAlerts.flagged.map((f) => (
                    <Alert key={f.adminUserId} variant="destructive" data-testid={`alert-export-burst-${f.adminUserId}`}>
                      <ShieldAlert className="h-4 w-4" />
                      <AlertTitle>
                        {f.blocked ? "Exports paused — unusual export activity" : "Unusual export activity detected"}
                      </AlertTitle>
                      <AlertDescription>
                        <div className="flex items-start justify-between gap-3">
                          <span>
                            Admin <span className="font-mono">{f.adminUserId}</span> has downloaded the vendor export{" "}
                            <strong>{f.count} times</strong> in the last {exportAlerts.windowMinutes} minutes (threshold:{" "}
                            {exportAlerts.threshold}). Last download {new Date(f.lastExportAt).toLocaleTimeString()}.
                            {f.blocked
                              ? " Further exports from this account are blocked until this is reviewed."
                              : f.acknowledgedAt
                                ? ` Cleared by ${f.acknowledgedBy} at ${new Date(f.acknowledgedAt).toLocaleTimeString()}.`
                                : ""}
                          </span>
                          {f.blocked && <AcknowledgeExportBurstButton adminUserId={f.adminUserId} />}
                        </div>
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}
              {exportLogsLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading export history…</div>
              ) : !exportLogs?.length ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No exports yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Admin</TableHead>
                      <TableHead>Filters Used</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                      <TableHead className="text-right">Downloaded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exportLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">{log.adminUserId}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatExportFilters(log.filters)}</TableCell>
                        <TableCell className="text-right text-sm">{log.rowCount}</TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">
                          {new Date(log.exportedAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Birthday Messages tab ────────────────────────────────────── */}
        <TabsContent value="birthdays">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cake className="w-5 h-5 text-pink-400" /> Birthday Message Log
              </CardTitle>
              <CardDescription>
                A record of every birthday greeting sent automatically by the platform. The scheduler runs daily at 08:00 server time.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {logsLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading logs…</div>
              ) : !birthdayLogs?.length ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Cake className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No birthday messages sent yet.</p>
                  <p className="text-xs mt-1">Messages appear here once vendors with a saved date of birth have their birthday.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {birthdayLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.vendorName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.vendorEmail ?? "—"}
                        </TableCell>
                        <TableCell>
                          {log.channel === "in-app" ? (
                            <div className="flex items-center gap-1.5 text-xs text-primary">
                              <Bell className="w-3.5 h-3.5" /> In-app
                            </div>
                          ) : log.channel === "email-failed" ? (
                            <div className="flex items-center gap-1.5 text-xs text-red-500">
                              <Mail className="w-3.5 h-3.5" /> Email failed
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-500">
                              <Mail className="w-3.5 h-3.5" /> Email sent
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {new Date(log.sentAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {log.channel === "email-failed" && (
                            <ResendBirthdayEmailButton
                              logId={log.id}
                              onDone={() => qc.invalidateQueries({ queryKey: ["admin-birthday-logs"] })}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Voice Calls tab ──────────────────────────────────────────── */}
        <TabsContent value="voice">
          <div className="space-y-4">
            {/* Twilio status */}
            {voiceStatus && (
              <div className={`rounded-lg border p-4 text-sm flex items-center gap-3 ${voiceStatus.configured ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400" : "border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400"}`}>
                {voiceStatus.configured
                  ? <><CheckCircle2 className="w-4 h-4 shrink-0" /> <span><strong>Twilio connected.</strong> Birthday calls at 06:00 UTC and vendor campaigns are active.</span></>
                  : <><AlertCircle className="w-4 h-4 shrink-0" /> <span><strong>Almost there.</strong> The Twilio integration is connected — just add <code className="bg-black/10 px-1 rounded text-xs">TWILIO_PHONE_NUMBER</code> (your Twilio from-number in E.164 format, e.g. +12345678900) to Replit Secrets to enable calls.</span></>
                }
              </div>
            )}

            {voiceSignatureFailureAlert && (
              <div className="flex items-center justify-end">
                <VoiceSignatureFailureAlertSettingsDialog
                  threshold={voiceSignatureFailureAlert.threshold}
                  windowMinutes={voiceSignatureFailureAlert.windowMinutes}
                />
              </div>
            )}

            {voiceSignatureFailureAlert?.flagged && (
              <Alert variant="destructive" data-testid="alert-voice-signature-failures">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Twilio call status updates may be failing</AlertTitle>
                <AlertDescription>
                  {voiceSignatureFailureAlert.count} status-callback requests were rejected for bad/missing
                  signatures in the last {voiceSignatureFailureAlert.windowMinutes} minutes
                  {voiceSignatureFailureAlert.lastFailureAt
                    ? ` (last at ${new Date(voiceSignatureFailureAlert.lastFailureAt).toLocaleTimeString()})`
                    : ""}
                  . This usually means the Auth Token was rotated in the Twilio console. Update{" "}
                  <code className="bg-black/10 px-1 rounded text-xs">TWILIO_AUTH_TOKEN</code> in Replit Secrets to
                  match Twilio Console → Account → API keys &amp; tokens.
                </AlertDescription>
              </Alert>
            )}

            {voiceBackfillStatus && <VoiceBackfillCard status={voiceBackfillStatus} />}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="w-5 h-5 text-primary" /> Voice Call Log
                </CardTitle>
                <CardDescription>
                  All outbound calls placed by the platform — birthday greetings (06:00 UTC) and vendor campaigns. Refreshes every 30 seconds.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {voiceLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading call logs…</div>
                ) : !voiceCallLogs?.length ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Phone className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="font-medium">No calls placed yet.</p>
                    <p className="text-xs mt-1">Birthday calls appear here at 06:00 UTC on vendors' birthdays. Campaign calls appear when a vendor launches a campaign.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Phone</TableHead>
                        <TableHead>Purpose</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead className="text-right">Initiated</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {voiceCallLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-sm">{log.phone}</TableCell>
                          <TableCell>
                            {log.purpose === "birthday" ? (
                              <div className="flex items-center gap-1.5 text-xs text-pink-500">
                                <Cake className="w-3.5 h-3.5" /> Birthday
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-xs text-primary">
                                <Phone className="w-3.5 h-3.5" /> Campaign
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {log.status === "completed" ? (
                              <div className="flex items-center gap-1.5 text-xs text-emerald-500"><PhoneCall className="w-3.5 h-3.5" /> Completed</div>
                            ) : log.status === "no-answer" ? (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><PhoneMissed className="w-3.5 h-3.5" /> No answer</div>
                            ) : log.status === "failed" ? (
                              <div className="flex items-center gap-1.5 text-xs text-destructive"><PhoneOff className="w-3.5 h-3.5" /> Failed</div>
                            ) : log.status === "canceled" ? (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><PhoneOff className="w-3.5 h-3.5" /> Skipped</div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-xs text-blue-500"><Phone className="w-3.5 h-3.5 animate-pulse" /> {log.status}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {log.durationSeconds != null ? `${log.durationSeconds}s` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {new Date(log.initiatedAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {log.status === "failed" && (
                              <RetryVoiceCallButton
                                logId={log.id}
                                purpose={log.purpose}
                                onDone={() => qc.invalidateQueries({ queryKey: ["admin-voice-call-logs"] })}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Scheduled Campaigns tab ────────────────────────────────── */}
        <TabsContent value="scheduled-campaigns">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-primary" /> Scheduled Voice Campaigns
              </CardTitle>
              <CardDescription>
                All vendors' campaigns queued to auto-launch, sorted by launch time. Refreshes every 30 seconds.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {scheduledCampaignsLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading scheduled campaigns…</div>
              ) : !scheduledCampaigns?.length ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Phone className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No campaigns scheduled.</p>
                  <p className="text-xs mt-1">Campaigns vendors schedule for a future launch time will appear here.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Leads</TableHead>
                      <TableHead className="text-right">Scheduled For</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduledCampaigns.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.vendorName}</TableCell>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.leadCount}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {c.scheduledAt ? new Date(c.scheduledAt).toLocaleString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Audit Log tab ─────────────────────────────────────────── */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" /> Tier Change Audit Log
              </CardTitle>
              <CardDescription>
                The last 50 changes to vendor subscription tiers and verification levels. Read-only — entries cannot be deleted.
              </CardDescription>
              <div className="flex flex-wrap items-end gap-3 pt-3">
                <div className="space-y-1">
                  <Label className="text-xs">Vendor name</Label>
                  <Input
                    placeholder="Search vendor…"
                    className="h-8 w-44 text-xs"
                    value={auditVendorSearch}
                    onChange={(e) => setAuditVendorSearch(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Field</Label>
                  <Select value={auditFieldFilter} onValueChange={setAuditFieldFilter}>
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUDIT_FIELD_ANY} className="text-xs">Any field</SelectItem>
                      <SelectItem value="subscriptionTier" className="text-xs">Tier</SelectItem>
                      <SelectItem value="verificationLevel" className="text-xs">Verification</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    className="h-8 w-36 text-xs"
                    value={auditAfter}
                    onChange={(e) => setAuditAfter(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    className="h-8 w-36 text-xs"
                    value={auditBefore}
                    onChange={(e) => setAuditBefore(e.target.value)}
                  />
                </div>
                {auditFiltersActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => {
                      setAuditVendorSearch("");
                      setAuditFieldFilter(AUDIT_FIELD_ANY);
                      setAuditAfter("");
                      setAuditBefore("");
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {auditLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading audit log…</div>
              ) : !auditLog?.length ? (
                <div className="p-8 text-center text-muted-foreground">
                  <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No changes recorded yet.</p>
                  <p className="text-xs mt-1">Every tier or verification level change made from this panel will appear here.</p>
                </div>
              ) : !filteredAuditLog?.length ? (
                <div className="p-8 text-center text-muted-foreground">
                  <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No entries match your filters.</p>
                  <p className="text-xs mt-1">Try adjusting the vendor name, field, or date range.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead className="text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAuditLog.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="font-medium">{entry.vendorName ?? `Vendor #${entry.vendorId}`}</div>
                          <div className="text-xs text-muted-foreground">ID {entry.vendorId}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {entry.field === "subscriptionTier" ? "Tier" : "Verification"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <Badge variant="secondary" className="text-xs capitalize">{entry.oldValue}</Badge>
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <Badge variant="default" className="text-xs capitalize">{entry.newValue}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {entry.adminDisplayName ? (
                            <span className="text-xs">{entry.adminDisplayName}</span>
                          ) : (
                            <span className="font-mono text-xs text-muted-foreground">{entry.adminUserId.slice(0, 12)}…</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {new Date(entry.changedAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Plan Changes tab ─────────────────────────────────────────── */}
        <TabsContent value="plan-changes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="w-5 h-5 text-primary" /> Plan Change History
              </CardTitle>
              <CardDescription>
                Every vendor subscription tier upgrade or downgrade — via the billing portal, cancellation, refund, automatic reconciliation, or a manual edit from this panel.
              </CardDescription>
              <div className="flex flex-wrap items-end gap-3 pt-3">
                <div className="space-y-1">
                  <Label className="text-xs">Vendor name</Label>
                  <Input
                    placeholder="Search vendor…"
                    className="h-8 w-44 text-xs"
                    value={planChangeVendorSearch}
                    onChange={(e) => setPlanChangeVendorSearch(e.target.value)}
                  />
                </div>
                {planChangeVendorSearch.trim() !== "" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => setPlanChangeVendorSearch("")}
                  >
                    Clear filter
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {planChangeHistoryLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading plan change history…</div>
              ) : !planChangeHistory?.length ? (
                <div className="p-8 text-center text-muted-foreground">
                  <ArrowRight className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No plan changes recorded yet.</p>
                  <p className="text-xs mt-1">Upgrades and downgrades — from the billing portal, cancellations, refunds, or reconciliation — will appear here.</p>
                </div>
              ) : !filteredPlanChangeHistory?.length ? (
                <div className="p-8 text-center text-muted-foreground">
                  <ArrowRight className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No entries match your filter.</p>
                  <p className="text-xs mt-1">Try a different vendor name.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead className="text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPlanChangeHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="font-medium">{entry.vendorName ?? `Vendor #${entry.vendorId}`}</div>
                          <div className="text-xs text-muted-foreground">ID {entry.vendorId}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <Badge variant="secondary" className="text-xs capitalize">{entry.previousTier}</Badge>
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <Badge variant="default" className="text-xs capitalize">{entry.newTier}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Messages tab ─────────────────────────────────────────────── */}
        <TabsContent value="messages">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" /> Message History
              </CardTitle>
              <CardDescription>
                Every message an admin has sent to a vendor, whether via a single vendor's page or a bulk announcement.
              </CardDescription>
              <div className="flex flex-wrap items-end gap-3 pt-3">
                <div className="space-y-1">
                  <Label className="text-xs">Vendor name</Label>
                  <Input
                    placeholder="Search vendor…"
                    className="h-8 w-44 text-xs"
                    value={messageVendorSearch}
                    onChange={(e) => setMessageVendorSearch(e.target.value)}
                  />
                </div>
                {messageVendorSearch.trim() !== "" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => setMessageVendorSearch("")}
                  >
                    Clear filter
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {messageHistoryLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading message history…</div>
              ) : !messageHistory?.length ? (
                <div className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No messages sent yet.</p>
                  <p className="text-xs mt-1">Messages sent from a vendor's page or the bulk-message tool will appear here.</p>
                </div>
              ) : !filteredMessageHistory?.length ? (
                <div className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No messages match your filter.</p>
                  <p className="text-xs mt-1">Try a different vendor name.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Sent by</TableHead>
                      <TableHead className="text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMessageHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="font-medium">{entry.vendorName ?? `Vendor #${entry.vendorId}`}</div>
                          <div className="text-xs text-muted-foreground">ID {entry.vendorId}</div>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p className="text-sm whitespace-pre-wrap break-words">{entry.message}</p>
                        </TableCell>
                        <TableCell>
                          {entry.adminDisplayName ? (
                            <span className="text-xs">{entry.adminDisplayName}</span>
                          ) : entry.adminUserId ? (
                            <span className="font-mono text-xs text-muted-foreground">{entry.adminUserId.slice(0, 12)}…</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Payment Gateways tab ─────────────────────────────────────── */}
        <TabsContent value="payment-gateways">
          <PaymentGatewaysPanel />
        </TabsContent>

        {/* ── Billing Sync tab ───────────────────────────────────────── */}
        <TabsContent value="billing-sync">
          <BillingSyncPanel />
        </TabsContent>

        {/* ── Site Editor tab ────────────────────────────────────────── */}
        <TabsContent value="site-editor">
          <SiteEditor />
        </TabsContent>

        {/* ── Analytics tab ──────────────────────────────────────────── */}
        <TabsContent value="analytics">
          <AdminAnalyticsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
