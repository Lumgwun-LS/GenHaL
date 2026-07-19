import { useMemo, useState, useEffect } from "react";
import { applyAddToSelection, applyRemoveFromSelection } from "@/lib/vendor-selection";
import { computeOptedOutVendors, formatOptOutBannerText, formatOptOutPopoverDescription } from "@/lib/bulk-message-opt-out";
import { useUser } from "@clerk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCreateVendorNotification,
  useCreateBulkVendorNotifications,
  useGetAdminMessageHistory,
  getGetAdminMessageHistoryQueryKey,
} from "@workspace/api-client-react";
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
import { ShieldCheck, ShieldOff, CreditCard, AlertCircle, CheckCircle2, XCircle, ShieldAlert, Cake, Mail, Bell, Phone, PhoneCall, PhoneOff, PhoneMissed, Download, ClipboardList, ArrowRight, Layout, BarChart3, Send, MessageSquare, RefreshCw, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Redirect, Link } from "wouter";
import SiteEditor from "./site-editor";
import PlansEditor from "./plans";
import PaymentGatewaysPanel from "./payment-gateways";
import BillingSyncPanel from "./billing-sync";
import AdminAnalyticsPanel from "./analytics";
import AdminFinanceRollupPanel from "./finance-rollup";
import PaymentConflictsPanel from "./payment-conflicts";
import VoidErrorsPanel from "./void-errors";
import BackgroundJobsPanel from "./background-jobs";
import SocialAccountHealthPanel from "./social-account-health";

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
  announcementEmailOptOut: boolean;
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
  /** Populated only for payment_conflict_resolution entries. */
  paymentId: number | null;
};

type AuditLogPage = {
  entries: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
};

const AUDIT_LOG_PAGE_SIZE = 50;

async function fetchAuditLog(page: number): Promise<AuditLogPage> {
  const offset = (page - 1) * AUDIT_LOG_PAGE_SIZE;
  const qs = new URLSearchParams({ limit: String(AUDIT_LOG_PAGE_SIZE), offset: String(offset) });
  const res = await fetch(`${BASE_URL}/api/admin/audit-log?${qs}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load audit log");
  return res.json() as Promise<AuditLogPage>;
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

type ExportAcknowledgmentHistoryEntry = {
  id: number;
  adminUserId: string;
  acknowledgedAt: string;
  acknowledgedBy: string;
  acknowledgedByDisplayName: string | null;
};

async function fetchExportAcknowledgmentHistory(adminUserId: string): Promise<ExportAcknowledgmentHistoryEntry[]> {
  const res = await fetch(`${BASE_URL}/api/admin/export-alerts/${encodeURIComponent(adminUserId)}/history`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load review history");
  return res.json() as Promise<ExportAcknowledgmentHistoryEntry[]>;
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

type ExportAlertSettingsHistoryEntry = {
  id: number;
  contentKey: string;
  adminUserId: string;
  adminDisplayName: string | null;
  oldValue: string;
  newValue: string;
  changedAt: string;
};

async function fetchExportAlertSettingsHistory(): Promise<ExportAlertSettingsHistoryEntry[]> {
  const res = await fetch(`${BASE_URL}/api/admin/site-content/admin.exportAlertSettings/history`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load threshold change history");
  return res.json() as Promise<ExportAlertSettingsHistoryEntry[]>;
}

function formatAlertSettingsValue(raw: string): string {
  try {
    const v = JSON.parse(raw) as { threshold?: number; windowMinutes?: number };
    return `${v.threshold ?? "?"} downloads / ${v.windowMinutes ?? "?"} min`;
  } catch {
    return raw;
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
      qc.invalidateQueries({ queryKey: ["admin-export-acknowledgment-history", adminUserId] });
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

function ExportAcknowledgmentHistoryButton({ adminUserId }: { adminUserId: string }) {
  const [open, setOpen] = useState(false);
  const { data: history, isLoading } = useQuery({
    queryKey: ["admin-export-acknowledgment-history", adminUserId],
    queryFn: () => fetchExportAcknowledgmentHistory(adminUserId),
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs shrink-0"
          data-testid={`button-export-review-history-${adminUserId}`}
        >
          Review history
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="text-sm font-medium mb-2">Review history for {adminUserId}</div>
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : !history?.length ? (
          <div className="text-xs text-muted-foreground">No past reviews recorded yet.</div>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto" data-testid={`list-export-review-history-${adminUserId}`}>
            {history.map((h) => (
              <li key={h.id} className="text-xs border-b last:border-b-0 pb-2 last:pb-0">
                <div>
                  Cleared by <span className="font-medium">{h.acknowledgedByDisplayName ?? h.acknowledgedBy}</span>
                </div>
                <div className="text-muted-foreground">{new Date(h.acknowledgedAt).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ExportReviewHistoryLookupCard() {
  const [lookupId, setLookupId] = useState("");
  const [submittedId, setSubmittedId] = useState("");

  const { data: history, isLoading, isError } = useQuery({
    queryKey: ["admin-export-acknowledgment-history", submittedId],
    queryFn: () => fetchExportAcknowledgmentHistory(submittedId),
    enabled: Boolean(submittedId),
  });

  function handleLookup() {
    const trimmed = lookupId.trim();
    if (!trimmed) return;
    setSubmittedId(trimmed);
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="w-4 h-4" /> Past Reviews Lookup
        </CardTitle>
        <CardDescription>
          Look up the full export-review history for any admin, even when they are not currently flagged.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Input
            className="h-8 text-xs"
            placeholder="Admin user ID (e.g. user_abc123)"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }}
            data-testid="input-export-review-history-lookup"
          />
          <Button
            size="sm"
            onClick={handleLookup}
            disabled={!lookupId.trim() || isLoading}
            data-testid="button-export-review-history-lookup"
          >
            {isLoading ? "Loading…" : "Look up"}
          </Button>
        </div>
        {submittedId && (
          isLoading ? null : isError ? (
            <div className="text-xs text-destructive">Failed to load review history.</div>
          ) : !history?.length ? (
            <div className="text-xs text-muted-foreground">
              No past reviews found for <span className="font-mono">{submittedId}</span>.
            </div>
          ) : (
            <div>
              <div className="text-xs text-muted-foreground mb-2">
                Review history for <span className="font-mono font-medium text-foreground">{submittedId}</span>:
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cleared By</TableHead>
                      <TableHead className="text-right">Cleared At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h) => (
                      <TableRow key={h.id} data-testid={`row-export-review-history-lookup-${h.id}`}>
                        <TableCell className="text-xs">
                          {h.acknowledgedByDisplayName ?? <span className="font-mono">{h.acknowledgedBy}</span>}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {new Date(h.acknowledgedAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )
        )}
      </CardContent>
    </Card>
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
      qc.invalidateQueries({ queryKey: ["admin-export-alert-settings-history"] });
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
  flaggedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
};

type VoiceSignatureFailureAcknowledgmentHistoryEntry = {
  id: number;
  acknowledgedAt: string;
  acknowledgedBy: string;
  acknowledgedByDisplayName: string | null;
};

async function fetchVoiceSignatureFailureAcknowledgmentHistory(): Promise<
  VoiceSignatureFailureAcknowledgmentHistoryEntry[]
> {
  const res = await fetch(`${BASE_URL}/api/admin/voice/signature-failures/history`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load review history");
  return res.json() as Promise<VoiceSignatureFailureAcknowledgmentHistoryEntry[]>;
}

async function acknowledgeVoiceSignatureFailureBurst(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/voice/signature-failures/acknowledge`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to clear the flag");
  }
}

function AcknowledgeVoiceSignatureFailureButton() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  async function handleClick() {
    setSaving(true);
    try {
      await acknowledgeVoiceSignatureFailureBurst();
      toast.success("Cleared the signature-failure flag.");
      qc.invalidateQueries({ queryKey: ["admin-voice-signature-failure-alert"] });
      qc.invalidateQueries({ queryKey: ["admin-voice-signature-failure-history"] });
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
      data-testid="button-acknowledge-voice-signature-failure"
    >
      {saving ? "Clearing…" : "Acknowledge & clear"}
    </Button>
  );
}

function VoiceSignatureFailureHistoryButton() {
  const [open, setOpen] = useState(false);
  const { data: history, isLoading } = useQuery({
    queryKey: ["admin-voice-signature-failure-history"],
    queryFn: fetchVoiceSignatureFailureAcknowledgmentHistory,
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs shrink-0"
          data-testid="button-voice-signature-failure-review-history"
        >
          Review history
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="text-sm font-medium mb-2">Review history</div>
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : !history?.length ? (
          <div className="text-xs text-muted-foreground">No past reviews recorded yet.</div>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto" data-testid="list-voice-signature-failure-review-history">
            {history.map((h) => (
              <li key={h.id} className="text-xs border-b last:border-b-0 pb-2 last:pb-0">
                <div>
                  Cleared by <span className="font-medium">{h.acknowledgedByDisplayName ?? h.acknowledgedBy}</span>
                </div>
                <div className="text-muted-foreground">{new Date(h.acknowledgedAt).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

type PaymentConflictSummary = { id: number }[];

async function fetchPaymentConflicts(): Promise<PaymentConflictSummary> {
  const res = await fetch(`${BASE_URL}/api/admin/payment-conflicts`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load payment conflicts");
  return res.json() as Promise<PaymentConflictSummary>;
}

type VoidErrorSummary = { id: number }[];

async function fetchVoidErrors(): Promise<VoidErrorSummary> {
  const res = await fetch(`${BASE_URL}/api/admin/void-errors`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load void errors");
  return res.json() as Promise<VoidErrorSummary>;
}

async function fetchVoiceSignatureFailureAlert(): Promise<VoiceSignatureFailureAlert> {
  const res = await fetch(`${BASE_URL}/api/admin/voice/signature-failures/alert`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load signature-failure alert status");
  return res.json() as Promise<VoiceSignatureFailureAlert>;
}

async function fetchVoiceSignatureFailureAlertSettingsHistory(): Promise<ExportAlertSettingsHistoryEntry[]> {
  const res = await fetch(`${BASE_URL}/api/admin/site-content/admin.voiceSignatureFailureAlertSettings/history`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load threshold change history");
  return res.json() as Promise<ExportAlertSettingsHistoryEntry[]>;
}

function formatVoiceSignatureFailureAlertSettingsValue(raw: string): string {
  try {
    const v = JSON.parse(raw) as { threshold?: number; windowMinutes?: number };
    return `${v.threshold ?? "?"} failures / ${v.windowMinutes ?? "?"} min`;
  } catch {
    return raw;
  }
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

type VoiceBackfillFix = {
  ranAt: string;
  callSid: string;
  fromStatus: string;
  toStatus: string;
  vendorId: number | null;
  vendorName: string | null;
  campaignId: number | null;
  campaignName: string | null;
};

type VoiceBackfillStatus = {
  ranAt: string | null;
  triggeredBy: string;
  checked: number;
  updated: number;
  failed: number;
  recentFixes: VoiceBackfillFix[];
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

        {status.recentFixes.length > 0 && (
          <div className="mt-4 rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Call SID</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Before</TableHead>
                  <TableHead>After</TableHead>
                  <TableHead>Fixed at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.recentFixes.map((fix) => (
                  <TableRow key={`${fix.callSid}-${fix.ranAt}`} data-testid={`row-voice-backfill-fix-${fix.callSid}`}>
                    <TableCell className="font-mono text-xs">{fix.callSid}</TableCell>
                    <TableCell>
                      {fix.vendorId != null ? (
                        <Link href={`/vendors/${fix.vendorId}`} className="text-primary hover:underline text-sm font-medium">
                          {fix.vendorName ?? `Vendor #${fix.vendorId}`}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {fix.campaignId != null ? (
                        <Link href={`/voice-campaigns/${fix.campaignId}`} className="text-primary hover:underline text-sm font-medium">
                          {fix.campaignName ?? `Campaign #${fix.campaignId}`}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{fix.fromStatus}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{fix.toStatus}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{new Date(fix.ranAt).toLocaleString()}</TableCell>
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
      qc.invalidateQueries({ queryKey: ["admin-voice-signature-failure-alert-settings-history"] });
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
  onApply: (vendorIds: number[], mode: "add" | "replace" | "remove") => void;
}) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<ExportFilters>(EMPTY_FILTERS);
  const [mode, setMode] = useState<"add" | "replace" | "remove">("add");

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
        <div className="space-y-1">
          <Label className="text-xs">If vendors are already selected</Label>
          <div className="flex rounded-md border p-0.5 gap-0.5">
            <Button
              type="button"
              variant={mode === "add" ? "default" : "ghost"}
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => setMode("add")}
              data-testid="button-target-filter-mode-add"
            >
              Add to selection
            </Button>
            <Button
              type="button"
              variant={mode === "replace" ? "default" : "ghost"}
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => setMode("replace")}
              data-testid="button-target-filter-mode-replace"
            >
              Replace selection
            </Button>
            <Button
              type="button"
              variant={mode === "remove" ? "default" : "ghost"}
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => setMode("remove")}
              data-testid="button-target-filter-mode-remove"
            >
              Remove from selection
            </Button>
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
              onApply(vendors.filter((v) => vendorMatchesFilters(v, filters)).map((v) => v.id), mode);
              setOpen(false);
            }}
            data-testid="button-apply-target-filter"
          >
            {mode === "add" ? "Add" : mode === "remove" ? "Remove" : "Select"} {matchCount} vendor{matchCount === 1 ? "" : "s"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type BulkEmailFailure = { vendorId: number; vendorName: string; reason: "opted_out" | "no_email" | "send_failed" };

function emailFailureReasonLabel(reason: BulkEmailFailure["reason"]): string {
  switch (reason) {
    case "opted_out":
      return "Opted out of announcement emails";
    case "no_email":
      return "No email on file";
    case "send_failed":
      return "Email failed to send";
    default:
      return reason;
  }
}

async function retryBulkAnnouncementEmails(
  message: string,
  failures: BulkEmailFailure[],
): Promise<{ retried: number; succeeded: number; failures: BulkEmailFailure[] }> {
  // Pass the full failures array so the server can enforce that only
  // send_failed vendors are retried — it extracts send_failed IDs itself.
  const res = await fetch(`${BASE_URL}/api/vendors/notifications/bulk/retry-emails`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ message, failures }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to retry emails");
  }
  return res.json() as Promise<{ retried: number; succeeded: number; failures: BulkEmailFailure[] }>;
}

/**
 * "Retry failed email" button shown per-row in the message history for any
 * "general" notification whose announcement email failed to deliver.
 * Calls the same bulk/retry-emails endpoint used by BulkMessageDialog,
 * passing a single-vendor failure list so only this vendor is re-tried.
 */
function RetryEmailButton({ entry }: { entry: { id: number; vendorId: number; vendorName: string | null; message: string } }) {
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    try {
      const failures: BulkEmailFailure[] = [
        {
          vendorId: entry.vendorId,
          vendorName: entry.vendorName ?? `Vendor #${entry.vendorId}`,
          reason: "send_failed",
        },
      ];
      const result = await retryBulkAnnouncementEmails(entry.message, failures);
      if (result.succeeded > 0) {
        toast.success(`Email re-delivered to ${entry.vendorName ?? `Vendor #${entry.vendorId}`}.`);
        qc.invalidateQueries({ queryKey: getGetAdminMessageHistoryQueryKey() });
        qc.invalidateQueries({
          queryKey: getGetAdminMessageHistoryQueryKey({ vendorId: entry.vendorId }),
        });
      } else {
        toast.error("Email still couldn't be delivered. Check SMTP settings and try again.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to retry email");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs gap-1.5 whitespace-nowrap"
      onClick={handleRetry}
      disabled={retrying}
      data-testid={`button-retry-email-${entry.id}`}
    >
      <RefreshCw className={`w-3 h-3 ${retrying ? "animate-spin" : ""}`} />
      {retrying ? "Retrying…" : "Retry email"}
    </Button>
  );
}

function BulkMessageDialog({
  selectedIds,
  allSelected,
  totalVendors,
  vendors,
  onSent,
}: {
  selectedIds: number[];
  allSelected: boolean;
  totalVendors: number;
  vendors: AdminVendor[];
  onSent: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [lastResult, setLastResult] = useState<{
    sent: number;
    emailsSent: number;
    emailAttempted: number;
    failures: BulkEmailFailure[];
    /** The message text used for the original send, kept for email retry */
    sentMessage: string;
  } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const { mutateAsync: sendBulkMessage, isPending: sending } = useCreateBulkVendorNotifications();

  const recipientCount = allSelected ? totalVendors : selectedIds.length;
  const disabled = recipientCount === 0;

  // Collect vendors that have opted out of announcement emails.
  // When "all" is selected we use the full vendor list; otherwise filter by selectedIds.
  const optedOutVendors = computeOptedOutVendors(vendors, allSelected, selectedIds);
  const optOutCount = optedOutVendors.length;
  const [optOutPopoverOpen, setOptOutPopoverOpen] = useState(false);

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed || disabled) return;
    try {
      const { sent, emailsSent, emailAttempted, failures } = await sendBulkMessage({
        data: allSelected ? { message: trimmed, all: true } : { message: trimmed, vendorIds: selectedIds },
      });
      toast.success(
        `Message sent to ${sent} vendor${sent === 1 ? "" : "s"}` +
          (emailsSent > 0 ? ` — email also sent to ${emailsSent} of them` : " (email not sent — SMTP isn't configured)"),
      );
      const sentMessage = trimmed;
      setMessage("");
      qc.invalidateQueries({ queryKey: getGetAdminMessageHistoryQueryKey() });
      onSent();
      if (failures.length > 0) {
        // Keep the dialog open so the admin can see exactly who to follow up with.
        setLastResult({ sent, emailsSent, emailAttempted, failures, sentMessage });
      } else {
        setLastResult(null);
        setOpen(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send message");
    }
  }

  async function handleRetryEmails() {
    if (!lastResult) return;
    const sendFailedFailures = lastResult.failures.filter((f) => f.reason === "send_failed");
    if (sendFailedFailures.length === 0) return;
    setRetrying(true);
    try {
      // Pass the full failures list — the server extracts send_failed IDs itself,
      // ensuring previously-successful vendors can never be double-sent.
      const result = await retryBulkAnnouncementEmails(lastResult.sentMessage, lastResult.failures);
      const recovered = result.succeeded;
      toast.success(
        recovered > 0
          ? `Email delivered to ${recovered} vendor${recovered === 1 ? "" : "s"}.`
          : "Retry completed — emails still couldn't be delivered.",
      );
      if (recovered > 0) {
        // Refresh message history so the new email_retry_audit rows
        // are visible immediately as a persistent audit trail.
        qc.invalidateQueries({ queryKey: getGetAdminMessageHistoryQueryKey() });
      }
      // Replace the old send_failed entries with the new failure set from the retry.
      const nonRetryable = lastResult.failures.filter((f) => f.reason !== "send_failed");
      const remaining = [...nonRetryable, ...result.failures.filter((f) => f.reason === "send_failed")];
      if (remaining.length === 0) {
        setLastResult(null);
        setOpen(false);
      } else {
        setLastResult({ ...lastResult, failures: remaining });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to retry emails");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setLastResult(null);
      }}
    >
      <Button
        variant="default"
        size="sm"
        className="shrink-0 gap-2"
        onClick={() => {
          setLastResult(null);
          setOpen(true);
        }}
        disabled={disabled}
        data-testid="button-message-selected-vendors"
      >
        <Send className="w-4 h-4" />
        Message {allSelected ? "All Vendors" : `Selected${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`}
      </Button>
      <DialogContent className="sm:max-w-md">
        {lastResult ? (
          <>
            <DialogHeader>
              <DialogTitle>{lastResult.failures.length} vendor{lastResult.failures.length === 1 ? "" : "s"} didn't get the email</DialogTitle>
              <DialogDescription>
                The in-app notification was sent to all {lastResult.sent} vendor{lastResult.sent === 1 ? "" : "s"}, but{" "}
                {lastResult.failures.length} of them didn't receive the announcement email.
              </DialogDescription>
            </DialogHeader>
            <ul
              className="max-h-64 overflow-y-auto space-y-2 border rounded-md p-2"
              data-testid="list-bulk-message-email-failures"
            >
              {lastResult.failures.map((f) => (
                <li
                  key={f.vendorId}
                  className="flex items-center justify-between gap-2 text-xs"
                  data-testid={`row-bulk-message-email-failure-${f.vendorId}`}
                >
                  <span className="font-medium truncate">{f.vendorName}</span>
                  <Badge
                    variant={f.reason === "send_failed" ? "destructive" : "secondary"}
                    className="shrink-0"
                  >
                    {emailFailureReasonLabel(f.reason)}
                  </Badge>
                </li>
              ))}
            </ul>
            {lastResult.failures.some((f) => f.reason === "send_failed") && (
              <p className="text-xs text-muted-foreground">
                Vendors marked <span className="font-medium text-destructive">Email failed to send</span> may have been affected by a transient SMTP error — you can retry delivery for just those vendors below.
              </p>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setLastResult(null);
                  setOpen(false);
                }}
                data-testid="button-close-bulk-message-email-failures"
              >
                Done
              </Button>
              {lastResult.failures.some((f) => f.reason === "send_failed") && (
                <Button
                  onClick={handleRetryEmails}
                  disabled={retrying}
                  data-testid="button-retry-bulk-message-emails"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  {retrying
                    ? "Retrying…"
                    : `Retry ${lastResult.failures.filter((f) => f.reason === "send_failed").length} failed email${lastResult.failures.filter((f) => f.reason === "send_failed").length === 1 ? "" : "s"}`}
                </Button>
              )}
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Message {recipientCount} vendor{recipientCount === 1 ? "" : "s"}</DialogTitle>
              <DialogDescription>
                Sends the same in-app notification to {allSelected ? "every vendor" : "each selected vendor"}. It will
                appear in their notification bell, and we'll also email each vendor a copy of the announcement.
              </DialogDescription>
            </DialogHeader>
            {optOutCount > 0 && (
              <div
                className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                data-testid="alert-bulk-message-opt-out-count"
              >
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>
                  <Popover open={optOutPopoverOpen} onOpenChange={setOptOutPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="font-bold underline decoration-dotted underline-offset-2 cursor-pointer hover:text-amber-900 focus:outline-none"
                        data-testid="button-bulk-message-opt-out-count"
                        aria-label={`View ${optOutCount} opted-out vendor${optOutCount === 1 ? "" : "s"}`}
                      >
                        {optOutCount}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start" data-testid="popover-bulk-message-opt-out-vendors">
                      <div className="text-sm font-medium mb-2 text-foreground">
                        Opted out of announcement emails
                      </div>
                      <ul
                        className="space-y-1 max-h-48 overflow-y-auto"
                        data-testid="list-bulk-message-opt-out-vendors"
                      >
                        {optedOutVendors.map((v) => (
                          <li key={v.id} className="text-xs text-foreground truncate" data-testid={`row-bulk-message-opt-out-vendor-${v.id}`}>
                            {v.name}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-muted-foreground mt-2">
                        {optOutCount === 1 ? "This vendor" : "These vendors"} will still receive the in-app notification.
                      </p>
                    </PopoverContent>
                  </Popover>
                  {" "}of {recipientCount} vendor{recipientCount === 1 ? "" : "s"} ha{optOutCount === 1 ? "s" : "ve"} opted out of announcement
                  emails — {optOutCount === 1 ? "they" : "they"} will still receive the in-app notification, but no email will be sent. <span className="underline decoration-dotted cursor-pointer hover:text-amber-900" onClick={() => setOptOutPopoverOpen(true)}>View list</span>
                </span>
              </div>
            )}
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MessageVendorDialog({
  vendor,
  onViewHistory,
}: {
  vendor: { id: number; name: string };
  onViewHistory?: (vendor: { id: number; name: string }) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const { mutateAsync: sendMessage, isPending: sending } = useCreateVendorNotification();

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed) return;
    try {
      await sendMessage({ id: vendor.id, data: { message: trimmed } });
      toast.success(`Message sent to ${vendor.name}`);
      setMessage("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: getGetAdminMessageHistoryQueryKey() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send message");
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
        <DialogFooter className="sm:justify-between">
          {onViewHistory && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => {
                setOpen(false);
                onViewHistory(vendor);
              }}
              data-testid={`button-view-message-history-dialog-${vendor.id}`}
            >
              <ClipboardList className="w-3.5 h-3.5" /> View history
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending || !message.trim()} data-testid="button-send-vendor-message">
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
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

type RetryJobState =
  | { status: "running"; total: number; attempted: number; succeeded: number; failed: number }
  | { status: "done"; total: number; attempted: number; succeeded: number; failed: number }
  | { status: "error"; error: string }
  | { status: "idle" };

async function startRetryAllFailedCampaignCalls(campaignId: number): Promise<RetryJobState> {
  const res = await fetch(`${BASE_URL}/api/admin/voice-campaigns/${campaignId}/retry-failed`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to retry campaign calls");
  }
  return res.json() as Promise<RetryJobState>;
}

async function pollRetryStatus(campaignId: number): Promise<RetryJobState> {
  const res = await fetch(`${BASE_URL}/api/admin/voice-campaigns/${campaignId}/retry-status`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch retry status");
  return res.json() as Promise<RetryJobState>;
}

function RetryAllFailedButton({
  campaignId,
  failedCount,
  onDone,
}: {
  campaignId: number;
  failedCount: number;
  onDone: () => void;
}) {
  const [jobState, setJobState] = useState<RetryJobState>({ status: "idle" });

  // On mount, check if a retry is already running on the server so that
  // navigating away and back mid-run resumes showing progress immediately.
  useEffect(() => {
    let cancelled = false;
    pollRetryStatus(campaignId).then((state) => {
      if (!cancelled && (state.status === "running" || state.status === "done" || state.status === "error")) {
        setJobState(state);
        if (state.status === "done") {
          toast.success(
            `Retried ${state.attempted} call(s): ${state.succeeded} placed, ${state.failed} still failed.`,
          );
          onDone();
        } else if (state.status === "error") {
          toast.error(`Retry failed: ${state.error}`);
        }
      }
    }).catch(() => { /* ignore — server may not have a job for this campaign */ });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Poll for progress while the job is running
  useQuery({
    queryKey: ["retry-job-status", campaignId],
    queryFn: async () => {
      const state = await pollRetryStatus(campaignId);
      setJobState(state);
      if (state.status === "done") {
        toast.success(
          `Retried ${state.attempted} call(s): ${state.succeeded} placed, ${state.failed} still failed.`,
        );
        onDone();
      } else if (state.status === "error") {
        toast.error(`Retry failed: ${state.error}`);
      }
      return state;
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "running" ? 1500 : false;
    },
    enabled: jobState.status === "running",
    refetchIntervalInBackground: true,
  });

  async function handleRetryAll() {
    try {
      const initial = await startRetryAllFailedCampaignCalls(campaignId);
      setJobState(initial);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to retry campaign calls");
    }
  }

  const isRunning = jobState.status === "running";
  const progressLabel = isRunning
    ? `${jobState.attempted} of ${jobState.total} retried…`
    : `Retry all failed (${failedCount})`;

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 text-xs shrink-0"
      onClick={handleRetryAll}
      disabled={isRunning}
      data-testid={`button-retry-all-failed-${campaignId}`}
    >
      <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? "animate-spin" : ""}`} />
      {progressLabel}
    </Button>
  );
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

type PlanChangeEntry = {
  id: number;
  vendorId: number;
  vendorName: string | null;
  previousTier: string | null;
  newTier: string | null;
  message: string;
  createdAt: string;
};

type PlanChangeHistoryPage = {
  data: PlanChangeEntry[];
  page: number;
  pageSize: number;
  total: number;
};

const PLAN_CHANGE_PAGE_SIZE = 50;

async function fetchTierChangeHistory(params: { page: number; vendorId?: number }): Promise<PlanChangeHistoryPage> {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: String(PLAN_CHANGE_PAGE_SIZE) });
  if (params.vendorId !== undefined) qs.set("vendorId", String(params.vendorId));
  const res = await fetch(`${BASE_URL}/api/admin/tier-change-history?${qs}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load plan change history");
  return res.json() as Promise<PlanChangeHistoryPage>;
}

export default function AdminPanel() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const { user: currentUser } = useUser();

  const [auditVendorSearch, setAuditVendorSearch] = useState("");
  const [auditFieldFilter, setAuditFieldFilter] = useState(AUDIT_FIELD_ANY);
  const [auditAfter, setAuditAfter] = useState("");
  const [auditBefore, setAuditBefore] = useState("");
  const [auditPage, setAuditPage] = useState(1);

  const [activeAdminTab, setActiveAdminTab] = useState("vendors");
  const [messageVendorSearch, setMessageVendorSearch] = useState("");
  const [messageHistoryVendorFilter, setMessageHistoryVendorFilter] = useState<{ id: number; name: string } | null>(
    null,
  );

  const [planChangeVendorSearch, setPlanChangeVendorSearch] = useState("");
  const [planChangePage, setPlanChangePage] = useState(1);
  const [planChangeVendorId, setPlanChangeVendorId] = useState<number | undefined>(undefined);

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

  const failedCampaignCallsByCampaign = useMemo(() => {
    const counts = new Map<number, number>();
    for (const log of voiceCallLogs ?? []) {
      if (log.purpose === "campaign" && log.status === "failed" && log.campaignId != null) {
        counts.set(log.campaignId, (counts.get(log.campaignId) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([campaignId, count]) => ({ campaignId, count }))
      .sort((a, b) => b.count - a.count);
  }, [voiceCallLogs]);

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

  const { data: auditLogPage, isLoading: auditLoading } = useQuery({
    queryKey: ["admin-audit-log", auditPage],
    queryFn: () => fetchAuditLog(auditPage),
    enabled: isAdmin,
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });
  const auditLog = auditLogPage?.entries;

  const { data: exportLogs, isLoading: exportLogsLoading } = useQuery({
    queryKey: ["admin-export-logs"],
    queryFn: fetchExportLogs,
    enabled: isAdmin,
  });

  const { data: messageHistory, isLoading: messageHistoryLoading } = useGetAdminMessageHistory(
    messageHistoryVendorFilter?.id !== undefined ? { vendorId: messageHistoryVendorFilter.id } : undefined,
    {
      query: {
        queryKey: getGetAdminMessageHistoryQueryKey(
          messageHistoryVendorFilter?.id !== undefined ? { vendorId: messageHistoryVendorFilter.id } : undefined,
        ),
        enabled: isAdmin,
      },
    },
  );

  const { data: planChangeHistory, isLoading: planChangeHistoryLoading } = useQuery({
    queryKey: ["admin-tier-change-history", planChangePage, planChangeVendorId],
    queryFn: () => fetchTierChangeHistory({ page: planChangePage, vendorId: planChangeVendorId }),
    enabled: isAdmin,
    placeholderData: (prev) => prev,
  });

  const { data: exportAlerts } = useQuery({
    queryKey: ["admin-export-alerts"],
    queryFn: fetchExportAlerts,
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const { data: exportAlertSettingsHistory, isLoading: exportAlertSettingsHistoryLoading } = useQuery({
    queryKey: ["admin-export-alert-settings-history"],
    queryFn: fetchExportAlertSettingsHistory,
    enabled: isAdmin,
  });

  const { data: voiceSignatureFailureAlert } = useQuery({
    queryKey: ["admin-voice-signature-failure-alert"],
    queryFn: fetchVoiceSignatureFailureAlert,
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const { data: voiceSignatureFailureAlertSettingsHistory, isLoading: voiceSignatureFailureAlertSettingsHistoryLoading } = useQuery({
    queryKey: ["admin-voice-signature-failure-alert-settings-history"],
    queryFn: fetchVoiceSignatureFailureAlertSettingsHistory,
    enabled: isAdmin,
  });

  const { data: paymentConflicts } = useQuery({
    queryKey: ["admin-payment-conflicts"],
    queryFn: fetchPaymentConflicts,
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const { data: voidErrors } = useQuery({
    queryKey: ["admin-void-errors"],
    queryFn: fetchVoidErrors,
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
    // When jumping in from a specific vendor, the server already filtered by
    // exact vendorId — don't re-apply the free-text name filter on top of it.
    if (messageHistoryVendorFilter) return messageHistory;
    const search = messageVendorSearch.trim().toLowerCase();
    if (!search) return messageHistory;
    return messageHistory.filter((entry) =>
      (entry.vendorName ?? `Vendor #${entry.vendorId}`).toLowerCase().includes(search),
    );
  }, [messageHistory, messageVendorSearch, messageHistoryVendorFilter]);

  function viewVendorMessageHistory(vendor: { id: number; name: string }) {
    setMessageHistoryVendorFilter({ id: vendor.id, name: vendor.name });
    setMessageVendorSearch("");
    setActiveAdminTab("messages");
  }

  const filteredPlanChangeHistory = useMemo(() => {
    if (!planChangeHistory) return planChangeHistory;
    const search = planChangeVendorSearch.trim().toLowerCase();
    if (!search) return planChangeHistory.data;
    return planChangeHistory.data.filter((entry) =>
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

      <Tabs value={activeAdminTab} onValueChange={setActiveAdminTab}>
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
          <TabsTrigger value="payment-conflicts" className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Payment Conflicts
            {(paymentConflicts?.length ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-[10px] leading-4">
                {paymentConflicts!.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="void-errors" className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Void Errors
            {(voidErrors?.length ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-[10px] leading-4">
                {voidErrors!.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="payment-gateways" className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Payment Gateways
          </TabsTrigger>
          <TabsTrigger value="billing-sync" className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Billing Sync
          </TabsTrigger>
          <TabsTrigger value="background-jobs" className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Background Jobs
          </TabsTrigger>
          <TabsTrigger value="social-account-health" className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Social Account Health
          </TabsTrigger>
          <TabsTrigger value="plans" className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Plans
          </TabsTrigger>
          <TabsTrigger value="site-editor" className="flex items-center gap-2">
            <Layout className="w-4 h-4" /> Site Editor
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="finance-rollup" className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Finance Rollup
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
                  onApply={(vendorIds, mode) => {
                    setSelectAllVendors(false);
                    if (mode === "add") {
                      setSelectedVendorIds((prev) => applyAddToSelection(prev, vendorIds));
                      toast.success(
                        vendorIds.length > 0
                          ? `Added ${vendorIds.length} vendor${vendorIds.length === 1 ? "" : "s"} matching the filter to your selection`
                          : "No vendors matched that filter",
                      );
                    } else if (mode === "remove") {
                      setSelectedVendorIds((prev) => applyRemoveFromSelection(prev, vendorIds));
                      toast.success(
                        vendorIds.length > 0
                          ? `Removed ${vendorIds.length} vendor${vendorIds.length === 1 ? "" : "s"} matching the filter from your selection`
                          : "No vendors matched that filter",
                      );
                    } else {
                      setSelectedVendorIds(vendorIds);
                      toast.success(
                        vendorIds.length > 0
                          ? `Selected ${vendorIds.length} vendor${vendorIds.length === 1 ? "" : "s"} matching the filter`
                          : "No vendors matched that filter",
                      );
                    }
                  }}
                />
                <BulkMessageDialog
                  selectedIds={selectedVendorIds}
                  allSelected={selectAllVendors}
                  totalVendors={totalVendors}
                  vendors={vendors ?? []}
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
                      <TableHead className="text-right">Messages</TableHead>
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
                            <div className="flex items-center justify-end gap-1">
                              <MessageVendorDialog vendor={vendor} onViewHistory={viewVendorMessageHistory} />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                onClick={() => viewVendorMessageHistory(vendor)}
                                data-testid={`button-view-message-history-${vendor.id}`}
                              >
                                <ClipboardList className="w-3.5 h-3.5" /> History
                              </Button>
                            </div>
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
                          <div className="flex items-center gap-1 shrink-0">
                            <ExportAcknowledgmentHistoryButton adminUserId={f.adminUserId} />
                            {f.blocked && currentUser?.id === f.adminUserId ? (
                              <span className="text-xs text-muted-foreground italic">
                                A different admin must review this
                              </span>
                            ) : (
                              f.blocked && <AcknowledgeExportBurstButton adminUserId={f.adminUserId} />
                            )}
                          </div>
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
                      <TableHead />
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
                        <TableCell className="text-right">
                          <ExportAcknowledgmentHistoryButton adminUserId={log.adminUserId} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <ExportReviewHistoryLookupCard />

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="w-4 h-4" /> Threshold Change History
              </CardTitle>
              <CardDescription>
                Every edit to the export-burst alert threshold and window — who changed it, from what, and when. Read-only.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {exportAlertSettingsHistoryLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading history…</div>
              ) : !exportAlertSettingsHistory?.length ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No changes recorded yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Changed By</TableHead>
                      <TableHead>Previous</TableHead>
                      <TableHead>New</TableHead>
                      <TableHead className="text-right">Changed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exportAlertSettingsHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-xs">
                          {entry.adminDisplayName ?? <span className="font-mono">{entry.adminUserId}</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatAlertSettingsValue(entry.oldValue)}
                        </TableCell>
                        <TableCell className="text-xs">{formatAlertSettingsValue(entry.newValue)}</TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">
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
                        <TableCell className="font-medium">
                          <Link href={`/vendors/${log.vendorId}`} className="hover:underline text-primary">
                            {log.vendorName}
                          </Link>
                        </TableCell>
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
                  <div>
                    {voiceSignatureFailureAlert.count} status-callback requests were rejected for bad/missing
                    signatures in the last {voiceSignatureFailureAlert.windowMinutes} minutes
                    {voiceSignatureFailureAlert.lastFailureAt
                      ? ` (last at ${new Date(voiceSignatureFailureAlert.lastFailureAt).toLocaleTimeString()})`
                      : ""}
                    . This usually means the Auth Token was rotated in the Twilio console. Update{" "}
                    <code className="bg-black/10 px-1 rounded text-xs">TWILIO_AUTH_TOKEN</code> in Replit Secrets to
                    match Twilio Console → Account → API keys &amp; tokens.
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <AcknowledgeVoiceSignatureFailureButton />
                    <VoiceSignatureFailureHistoryButton />
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {!voiceSignatureFailureAlert?.flagged && voiceSignatureFailureAlert?.acknowledgedAt && (
              <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                <span data-testid="text-voice-signature-failure-cleared">
                  Last cleared {new Date(voiceSignatureFailureAlert.acknowledgedAt).toLocaleString()}
                  {voiceSignatureFailureAlert.acknowledgedBy ? ` by ${voiceSignatureFailureAlert.acknowledgedBy}` : ""}
                </span>
                <VoiceSignatureFailureHistoryButton />
              </div>
            )}

            <Card className="mt-2" data-testid="card-voice-signature-failure-alert-settings-history">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="w-4 h-4" /> Threshold Change History
                </CardTitle>
                <CardDescription>
                  Every edit to the signature-failure alert threshold and window — who changed it, from what, and when. Read-only.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {voiceSignatureFailureAlertSettingsHistoryLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading history…</div>
                ) : !voiceSignatureFailureAlertSettingsHistory?.length ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">No changes recorded yet.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Changed By</TableHead>
                        <TableHead>Previous</TableHead>
                        <TableHead>New</TableHead>
                        <TableHead className="text-right">Changed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {voiceSignatureFailureAlertSettingsHistory.map((entry) => (
                        <TableRow key={entry.id} data-testid={`row-voice-sig-failure-threshold-change-${entry.id}`}>
                          <TableCell className="text-xs">
                            {entry.adminDisplayName ?? <span className="font-mono">{entry.adminUserId}</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatVoiceSignatureFailureAlertSettingsValue(entry.oldValue)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatVoiceSignatureFailureAlertSettingsValue(entry.newValue)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground text-sm">
                            {new Date(entry.changedAt).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {voiceBackfillStatus && <VoiceBackfillCard status={voiceBackfillStatus} />}

            {failedCampaignCallsByCampaign.length > 0 && (
              <Card data-testid="card-failed-campaign-calls">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertCircle className="w-4 h-4 text-destructive" /> Failed campaign calls
                  </CardTitle>
                  <CardDescription>
                    Retry every failed call for a campaign in one click, instead of retrying rows one at a time.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {failedCampaignCallsByCampaign.map(({ campaignId, count }) => (
                    <div
                      key={campaignId}
                      className="flex items-center justify-between rounded-md border p-2.5"
                      data-testid={`row-failed-campaign-${campaignId}`}
                    >
                      <span className="text-sm">
                        Campaign #{campaignId} — {count} failed call{count === 1 ? "" : "s"}
                      </span>
                      <RetryAllFailedButton
                        campaignId={campaignId}
                        failedCount={count}
                        onDone={() => qc.invalidateQueries({ queryKey: ["admin-voice-call-logs"] })}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

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
                Changes to vendor subscription tiers, verification levels, and payment conflict resolutions. Read-only — entries cannot be deleted.
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
                      <SelectItem value="payment_conflict_resolution" className="text-xs">Conflict Resolution</SelectItem>
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
                <>
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
                              {entry.field === "subscriptionTier"
                                ? "Tier"
                                : entry.field === "verificationLevel"
                                ? "Verification"
                                : entry.field === "payment_conflict_resolution"
                                ? `Conflict resolved: ${entry.newValue === "dismiss" ? "dismissed" : entry.newValue}`
                                : entry.field}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {entry.field === "payment_conflict_resolution" ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-sm">
                                  <span className="text-xs text-muted-foreground">provider reported:</span>
                                  <Badge variant="secondary" className="text-xs capitalize">{entry.oldValue}</Badge>
                                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <Badge
                                    variant={entry.newValue === "dismiss" ? "outline" : "default"}
                                    className="text-xs capitalize"
                                  >
                                    {entry.newValue === "dismiss" ? "dismissed" : entry.newValue}
                                  </Badge>
                                </div>
                                {entry.paymentId != null && (
                                  <button
                                    className="text-xs text-primary underline-offset-2 hover:underline"
                                    onClick={() => setActiveAdminTab("payment-conflicts")}
                                  >
                                    Payment #{entry.paymentId}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-sm">
                                <Badge variant="secondary" className="text-xs capitalize">{entry.oldValue}</Badge>
                                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <Badge variant="default" className="text-xs capitalize">{entry.newValue}</Badge>
                              </div>
                            )}
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
                  {auditLogPage && auditLogPage.total > AUDIT_LOG_PAGE_SIZE && auditVendorSearch.trim() === "" && auditFieldFilter === AUDIT_FIELD_ANY && auditAfter === "" && auditBefore === "" && (
                    <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                      <span>
                        Showing {(auditPage - 1) * AUDIT_LOG_PAGE_SIZE + 1}–
                        {Math.min(auditPage * AUDIT_LOG_PAGE_SIZE, auditLogPage.total)} of{" "}
                        {auditLogPage.total}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setAuditPage((p) => p - 1)}
                          disabled={auditPage <= 1 || auditLoading}
                        >
                          Previous
                        </Button>
                        <span className="text-xs">
                          Page {auditPage} of {Math.ceil(auditLogPage.total / AUDIT_LOG_PAGE_SIZE)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setAuditPage((p) => p + 1)}
                          disabled={auditPage * AUDIT_LOG_PAGE_SIZE >= auditLogPage.total || auditLoading}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
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
                  <Label className="text-xs">Filter by vendor</Label>
                  <Select
                    value={planChangeVendorId !== undefined ? String(planChangeVendorId) : "__all__"}
                    onValueChange={(v) => {
                      setPlanChangeVendorId(v === "__all__" ? undefined : Number(v));
                      setPlanChangePage(1);
                      setPlanChangeVendorSearch("");
                    }}
                  >
                    <SelectTrigger className="h-8 w-48 text-xs">
                      <SelectValue placeholder="All vendors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className="text-xs">All vendors</SelectItem>
                      {(vendors ?? []).map((v) => (
                        <SelectItem key={v.id} value={String(v.id)} className="text-xs">
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {planChangeVendorId === undefined && (
                  <div className="space-y-1">
                    <Label className="text-xs">Search name (current page)</Label>
                    <Input
                      placeholder="Search vendor…"
                      className="h-8 w-44 text-xs"
                      value={planChangeVendorSearch}
                      onChange={(e) => setPlanChangeVendorSearch(e.target.value)}
                    />
                  </div>
                )}
                {(planChangeVendorId !== undefined || planChangeVendorSearch.trim() !== "") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => {
                      setPlanChangeVendorId(undefined);
                      setPlanChangeVendorSearch("");
                      setPlanChangePage(1);
                    }}
                  >
                    Clear filter
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {planChangeHistoryLoading && !planChangeHistory ? (
                <div className="p-8 text-center text-muted-foreground">Loading plan change history…</div>
              ) : !planChangeHistory?.data.length ? (
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
                <>
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
                  {planChangeHistory.total > PLAN_CHANGE_PAGE_SIZE && planChangeVendorSearch.trim() === "" && (
                    <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground">
                      <span>
                        Showing {(planChangePage - 1) * PLAN_CHANGE_PAGE_SIZE + 1}–
                        {Math.min(planChangePage * PLAN_CHANGE_PAGE_SIZE, planChangeHistory.total)} of{" "}
                        {planChangeHistory.total} entries
                        {planChangeHistoryLoading && " (loading…)"}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={planChangePage <= 1 || planChangeHistoryLoading}
                          onClick={() => setPlanChangePage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </Button>
                        <span className="text-xs">
                          Page {planChangePage} of {Math.ceil(planChangeHistory.total / PLAN_CHANGE_PAGE_SIZE)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={planChangePage * PLAN_CHANGE_PAGE_SIZE >= planChangeHistory.total || planChangeHistoryLoading}
                          onClick={() => setPlanChangePage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
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
                {messageHistoryVendorFilter ? (
                  <>
                    <Badge
                      variant="secondary"
                      className="h-8 flex items-center gap-1.5 px-3 text-xs"
                      data-testid="badge-message-history-vendor-filter"
                    >
                      Vendor: {messageHistoryVendorFilter.name} (ID {messageHistoryVendorFilter.id})
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() => setMessageHistoryVendorFilter(null)}
                      data-testid="button-clear-message-history-vendor-filter"
                    >
                      View all vendors
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Vendor name</Label>
                      <Input
                        placeholder="Search vendor…"
                        className="h-8 w-44 text-xs"
                        value={messageVendorSearch}
                        onChange={(e) => setMessageVendorSearch(e.target.value)}
                        data-testid="input-message-history-vendor-search"
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
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {messageHistoryLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading message history…</div>
              ) : !messageHistory?.length ? (
                <div className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">
                    {messageHistoryVendorFilter ? "No messages sent to this vendor yet." : "No messages sent yet."}
                  </p>
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
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMessageHistory.map((entry) => {
                      const isRetryAudit = entry.type === "email_retry_audit";
                      const emailFailed = entry.emailFailed === true;
                      return (
                      <TableRow key={entry.id} data-testid={`row-message-history-${entry.id}`}>
                        <TableCell>
                          <Link href={`/vendors/${entry.vendorId}`} className="group">
                            <div className="font-medium group-hover:underline">{entry.vendorName ?? `Vendor #${entry.vendorId}`}</div>
                            <div className="text-xs text-muted-foreground">ID {entry.vendorId}</div>
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-md">
                          {isRetryAudit && (
                            <Badge variant="secondary" className="mb-1 text-xs gap-1">
                              <RefreshCw className="w-3 h-3" /> Email recovered via retry
                            </Badge>
                          )}
                          {emailFailed && (
                            <Badge variant="destructive" className="mb-1 text-xs gap-1">
                              <Mail className="w-3 h-3" /> Email failed
                            </Badge>
                          )}
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
                        <TableCell className="text-right">
                          {emailFailed && (
                            <RetryEmailButton
                              entry={{
                                id: entry.id,
                                vendorId: entry.vendorId,
                                vendorName: entry.vendorName ?? null,
                                message: entry.message,
                              }}
                            />
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
        </TabsContent>

        {/* ── Payment Conflicts tab ────────────────────────────────────── */}
        <TabsContent value="payment-conflicts">
          <PaymentConflictsPanel />
        </TabsContent>

        {/* ── Void Errors tab ──────────────────────────────────────────── */}
        <TabsContent value="void-errors">
          <VoidErrorsPanel />
        </TabsContent>

        <TabsContent value="payment-gateways">
          <PaymentGatewaysPanel />
        </TabsContent>

        {/* ── Billing Sync tab ───────────────────────────────────────── */}
        <TabsContent value="billing-sync">
          <BillingSyncPanel />
        </TabsContent>

        <TabsContent value="background-jobs">
          <BackgroundJobsPanel />
        </TabsContent>

        <TabsContent value="social-account-health">
          <SocialAccountHealthPanel />
        </TabsContent>

        {/* ── Site Editor tab ────────────────────────────────────────── */}
        <TabsContent value="plans">
          <PlansEditor />
        </TabsContent>

        <TabsContent value="site-editor">
          <SiteEditor />
        </TabsContent>

        {/* ── Analytics tab ──────────────────────────────────────────── */}
        <TabsContent value="analytics">
          <AdminAnalyticsPanel />
        </TabsContent>

        {/* ── Finance Rollup tab ─────────────────────────────────────── */}
        <TabsContent value="finance-rollup">
          <AdminFinanceRollupPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
