import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Settings, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type NeedsReconnectAccount = {
  id: number;
  vendorId: number;
  vendorName: string;
  platform: string;
  accountName: string;
  lastHealthCheckError: string | null;
  healthCheckFailingSince: string | null;
  lastHealthCheckAt: string | null;
  /** Number of times this account transitioned active → needs_reconnect in the last 30 days. */
  reconnectCount30d: number;
};

type FrequentBreakerAccount = {
  id: number;
  vendorId: number;
  vendorName: string;
  platform: string;
  accountName: string;
  lastHealthCheckAt: string | null;
  reconnectCount30d: number;
};

type SocialHealthSettings = {
  repeatOffenderThreshold: number;
};

async function fetchNeedsReconnect(): Promise<NeedsReconnectAccount[]> {
  const res = await fetch(`${BASE_URL}/api/admin/social-account-health/needs-reconnect`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load social account health list");
  return (await res.json()) as NeedsReconnectAccount[];
}

async function fetchFrequentBreakers(): Promise<FrequentBreakerAccount[]> {
  const res = await fetch(`${BASE_URL}/api/admin/social-account-health/frequent-breakers`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load frequent breakers list");
  return (await res.json()) as FrequentBreakerAccount[];
}

async function fetchSocialHealthSettings(): Promise<SocialHealthSettings> {
  const res = await fetch(`${BASE_URL}/api/admin/site-content`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load settings");
  const all = (await res.json()) as Record<string, unknown>;
  const s = all["admin.socialHealthSettings"] as SocialHealthSettings | undefined;
  return s ?? { repeatOffenderThreshold: 3 };
}

async function saveSocialHealthSettings(value: SocialHealthSettings): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/site-content/admin.socialHealthSettings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to save settings");
  }
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

/** Human-readable "how long has this been failing" duration since healthCheckFailingSince. */
function formatDuration(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Badge shown when an account has broken more than once in 30 days. */
function ReconnectCountBadge({ count, threshold }: { count: number; threshold: number }) {
  if (count <= 1) return null;
  const isHighFrequency = count >= threshold;
  return (
    <Badge
      className={
        isHighFrequency
          ? "ml-1.5 gap-1 bg-orange-500/15 text-orange-700 hover:bg-orange-500/15 border-orange-400/30"
          : "ml-1.5 gap-1 bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/10 border-yellow-400/30"
      }
      title={`This account has broken and been reconnected ${count} time${count > 1 ? "s" : ""} in the last 30 days — it may have a deeper issue worth investigating.`}
    >
      ↻ {count}× in 30d
    </Badge>
  );
}

function ThresholdSettings({ current, onSaved }: { current: SocialHealthSettings; onSaved: () => void }) {
  const [threshold, setThreshold] = useState(String(current.repeatOffenderThreshold));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const n = parseInt(threshold, 10);
    if (isNaN(n) || n < 2 || n > 100) {
      toast.error("Threshold must be a whole number between 2 and 100.");
      return;
    }
    setSaving(true);
    try {
      await saveSocialHealthSettings({ repeatOffenderThreshold: n });
      toast.success(`Repeat-offender threshold updated to ${n}.`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="w-4 h-4" /> Repeat-Offender Threshold
        </CardTitle>
        <CardDescription>
          When a social account breaks this many times in a rolling 30-day window, an escalation
          Slack alert fires ("needs direct follow-up"). The alert fires only at the exact crossing —
          not on every subsequent break. Changes take effect on the next health-check tick.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3 max-w-xs">
          <div className="flex-1">
            <Label htmlFor="repeat-threshold" className="text-xs mb-1.5 block">
              Breaks in 30 days before escalation
            </Label>
            <Input
              id="repeat-threshold"
              type="number"
              min={2}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-28"
            />
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Current value: <span className="font-medium">{current.repeatOffenderThreshold}</span> breaks.
          Min 2, max 100.
        </p>
      </CardContent>
    </Card>
  );
}

export default function SocialAccountHealthPanel() {
  const qc = useQueryClient();

  const { data: accounts, isLoading: loadingReconnect, error: errorReconnect } = useQuery({
    queryKey: ["admin-social-account-needs-reconnect"],
    queryFn: fetchNeedsReconnect,
    refetchInterval: 60_000,
  });

  const { data: frequentBreakers, isLoading: loadingBreakers, error: errorBreakers } = useQuery({
    queryKey: ["admin-social-account-frequent-breakers"],
    queryFn: fetchFrequentBreakers,
    refetchInterval: 60_000,
  });

  const { data: settings } = useQuery({
    queryKey: ["admin-social-health-settings"],
    queryFn: fetchSocialHealthSettings,
  });

  if (loadingReconnect || loadingBreakers) {
    return <div className="p-8 text-center text-muted-foreground">Loading social account health…</div>;
  }
  if (errorReconnect || errorBreakers) {
    return <div className="p-8 text-center text-destructive">Failed to load social account health.</div>;
  }

  const threshold = settings?.repeatOffenderThreshold ?? 3;
  const list = accounts ?? [];
  const breakers = frequentBreakers ?? [];
  const repeatOffenders = list.filter((a) => a.reconnectCount30d >= threshold);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Facebook/Instagram, LinkedIn, and X accounts are re-checked periodically (see Background Jobs). When a
        vendor's connection stops validating — expired or revoked — it shows up here so admins
        don't have to rely on Slack history or a vendor complaint to find out.
      </p>

      {(list.length > 0 || breakers.length > 0) && (
        <div className="space-y-2">
          {list.length > 0 && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                {list.length} account{list.length > 1 ? "s" : ""} currently need{list.length > 1 ? "" : "s"} reconnecting.
                {repeatOffenders.length > 0 && (
                  <span className="ml-1 font-medium text-orange-700">
                    {repeatOffenders.length} {repeatOffenders.length > 1 ? "are" : "is"} repeat offender{repeatOffenders.length > 1 ? "s" : ""} ({threshold}+ breaks in 30 days).
                  </span>
                )}
              </div>
            </div>
          )}
          {breakers.length > 0 && (
            <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-700 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                {breakers.length} currently-active account{breakers.length > 1 ? "s have" : " has"} broken 2+ times in the last 30 days — consider proactive outreach before they break again.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 1: Accounts currently broken and needing reconnect */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounts Needing Reconnect</CardTitle>
          <CardDescription>
            Vendors have been notified in-app and by email; posts to these accounts won't publish
            until they're reconnected from the Social Hub.{" "}
            <span className="text-yellow-700">↻ N× in 30d</span> badges highlight accounts that
            keep breaking — these may need direct follow-up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No accounts currently need reconnecting.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Failing for</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead>Last error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      <Link href={`/vendors/${a.vendorId}`} className="text-primary hover:underline">
                        {a.vendorName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.platform}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.accountName}
                      <ReconnectCountBadge count={a.reconnectCount30d} threshold={threshold} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge className="gap-1 bg-red-500/15 text-red-600 hover:bg-red-500/15">
                        {formatDuration(a.healthCheckFailingSince)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatTimestamp(a.healthCheckFailingSince)}</TableCell>
                    <TableCell className="text-sm text-red-600 max-w-xs truncate" title={a.lastHealthCheckError ?? ""}>
                      {a.lastHealthCheckError ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Currently-active accounts that have broken multiple times */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-orange-500" />
            Reconnected But At Risk
          </CardTitle>
          <CardDescription>
            These accounts are currently active but have broken 2 or more times in the last 30 days.
            They may indicate a deeper issue — a token that keeps expiring early, a platform policy
            change, or a misconfigured app. Consider reaching out proactively.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {breakers.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No currently-active accounts have broken 2+ times in the last 30 days.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>30-day breaks</TableHead>
                  <TableHead>Last checked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakers.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      <Link href={`/vendors/${a.vendorId}`} className="text-primary hover:underline">
                        {a.vendorName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.platform}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{a.accountName}</TableCell>
                    <TableCell className="text-sm">
                      <Badge
                        className={
                          a.reconnectCount30d >= threshold
                            ? "gap-1 bg-orange-500/15 text-orange-700 hover:bg-orange-500/15 border-orange-400/30"
                            : "gap-1 bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/10 border-yellow-400/30"
                        }
                      >
                        ↻ {a.reconnectCount30d}× in 30d
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatTimestamp(a.lastHealthCheckAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Admin-configurable threshold */}
      {settings && (
        <ThresholdSettings
          current={settings}
          onSaved={() => qc.invalidateQueries({ queryKey: ["admin-social-health-settings"] })}
        />
      )}
    </div>
  );
}
