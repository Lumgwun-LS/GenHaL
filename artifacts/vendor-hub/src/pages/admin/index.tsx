import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, ShieldOff, CreditCard, AlertCircle, CheckCircle2, XCircle, ShieldAlert, Cake, Mail, Bell, Phone, PhoneCall, PhoneOff, PhoneMissed, Download, ClipboardList, ArrowRight, Layout, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Redirect } from "wouter";
import SiteEditor from "./site-editor";
import PaymentGatewaysPanel from "./payment-gateways";
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

const AUDIT_FIELD_ANY = "__any__";

export default function AdminPanel() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();

  const [auditVendorSearch, setAuditVendorSearch] = useState("");
  const [auditFieldFilter, setAuditFieldFilter] = useState(AUDIT_FIELD_ANY);
  const [auditAfter, setAuditAfter] = useState("");
  const [auditBefore, setAuditBefore] = useState("");

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

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin-vendors"] });
    qc.invalidateQueries({ queryKey: ["admin-audit-log"] });
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
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Audit Log
          </TabsTrigger>
          <TabsTrigger value="payment-gateways" className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Payment Gateways
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
              <ExportFilterPopover
                onExport={(filters) => {
                  const params = new URLSearchParams();
                  if (filters.tier !== ANY) params.set("tier", filters.tier);
                  if (filters.status !== ANY) params.set("status", filters.status);
                  if (filters.verificationLevel !== ANY) params.set("verificationLevel", filters.verificationLevel);
                  if (filters.joinedAfter) params.set("joinedAfter", filters.joinedAfter);
                  if (filters.joinedBefore) params.set("joinedBefore", filters.joinedBefore);
                  const qs = params.toString();
                  const a = document.createElement("a");
                  a.href = `${BASE_URL}/api/admin/vendors/export${qs ? `?${qs}` : ""}`;
                  a.download = "";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  toast.success("CSV download started");
                  setTimeout(() => qc.invalidateQueries({ queryKey: ["admin-export-logs"] }), 1500);
                }}
              />
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
                      <TableHead>Vendor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Subscription Tier</TableHead>
                      <TableHead>Verification</TableHead>
                      <TableHead>Payment Keys</TableHead>
                      <TableHead className="text-right">Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No vendors found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      vendors?.map((vendor) => (
                        <TableRow key={vendor.id}>
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
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="w-4 h-4" /> Export History
              </CardTitle>
              <CardDescription>Recent CSV downloads of vendor data, for compliance tracking.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
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
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
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

        {/* ── Payment Gateways tab ─────────────────────────────────────── */}
        <TabsContent value="payment-gateways">
          <PaymentGatewaysPanel />
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
