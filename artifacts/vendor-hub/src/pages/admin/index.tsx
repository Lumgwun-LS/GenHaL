import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, ShieldOff, CreditCard, AlertCircle, CheckCircle2, XCircle, ShieldAlert, Cake, Mail, Bell } from "lucide-react";
import { toast } from "sonner";
import { Redirect } from "wouter";

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

export default function AdminPanel() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();

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

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin-vendors"] });
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
        </TabsList>

        {/* ── Vendors tab ─────────────────────────────────────────────── */}
        <TabsContent value="vendors">
          <Card>
            <CardHeader>
              <CardTitle>All Vendors</CardTitle>
              <CardDescription>Adjust subscription tiers and verification levels. Changes take effect immediately.</CardDescription>
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
                          ) : log.channel === "email-queued" ? (
                            <div className="flex items-center gap-1.5 text-xs text-amber-500">
                              <Mail className="w-3.5 h-3.5" /> Email queued
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
      </Tabs>
    </div>
  );
}
