import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { Link } from "wouter";

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

async function fetchNeedsReconnect(): Promise<NeedsReconnectAccount[]> {
  const res = await fetch(`${BASE_URL}/api/admin/social-account-health/needs-reconnect`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load social account health list");
  return (await res.json()) as NeedsReconnectAccount[];
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
function ReconnectCountBadge({ count }: { count: number }) {
  if (count <= 1) return null;
  const isHighFrequency = count >= 3;
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

export default function SocialAccountHealthPanel() {
  const { data: accounts, isLoading, error } = useQuery({
    queryKey: ["admin-social-account-needs-reconnect"],
    queryFn: fetchNeedsReconnect,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading social account health…</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-destructive">Failed to load social account health.</div>;
  }

  const list = accounts ?? [];
  const repeatOffenders = list.filter((a) => a.reconnectCount30d >= 3);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Facebook/Instagram accounts are re-checked periodically (see Background Jobs). When a
        vendor's connection stops validating — expired or revoked — it shows up here so admins
        don't have to rely on Slack history or a vendor complaint to find out.
      </p>

      {list.length > 0 && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            {list.length} account{list.length > 1 ? "s" : ""} currently need{list.length > 1 ? "" : "s"} reconnecting.
            {repeatOffenders.length > 0 && (
              <span className="ml-1 font-medium text-orange-700">
                {repeatOffenders.length} {repeatOffenders.length > 1 ? "are" : "is"} repeat offender{repeatOffenders.length > 1 ? "s" : ""} (3+ breaks in 30 days).
              </span>
            )}
          </div>
        </div>
      )}

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
                      <ReconnectCountBadge count={a.reconnectCount30d} />
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
    </div>
  );
}
