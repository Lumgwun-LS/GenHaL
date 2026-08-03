/**
 * Admin Mobile App Builds Panel
 *
 * Lists all vendor_mobile_apps records across all vendors.
 * Admins can retry failed builds without the vendor having to resubmit.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/authFetch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Smartphone, RefreshCw, ExternalLink, Loader2,
  CheckCircle2, XCircle, Clock, Search,
} from "lucide-react";

const BASE_URL = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

interface MobileAppBuild {
  id:           number;
  vendorId:     number;
  vendorName:   string;
  appName:      string;
  source:       string;
  websiteUrl:   string | null;
  repoUrl:      string | null;
  appSlug:      string;
  packageName:  string;
  status:       "queued" | "building" | "packaging" | "published" | "failed";
  errorMessage: string | null;
  easBuildId:   string | null;
  apkUrl:       string | null;
  storeAppId:   number | null;
  createdAt:    string;
  updatedAt:    string;
}

function StatusBadge({ status }: { status: MobileAppBuild["status"] }) {
  const map: Record<MobileAppBuild["status"], { label: string; variant: string; icon: React.ReactNode }> = {
    queued:    { label: "Queued",    variant: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: <Clock className="w-3 h-3" /> },
    building:  { label: "Building",  variant: "bg-blue-500/15 text-blue-400 border-blue-500/30",       icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    packaging: { label: "Packaging", variant: "bg-purple-500/15 text-purple-400 border-purple-500/30", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    published: { label: "Published", variant: "bg-green-500/15 text-green-400 border-green-500/30",    icon: <CheckCircle2 className="w-3 h-3" /> },
    failed:    { label: "Failed",    variant: "bg-red-500/15 text-red-400 border-red-500/30",          icon: <XCircle className="w-3 h-3" /> },
  };
  const s = map[status] ?? map.queued;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${s.variant}`}>
      {s.icon}{s.label}
    </span>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export default function MobileAppBuildsPanel() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery<{ builds: MobileAppBuild[] }>({
    queryKey: ["admin-mobile-builds"],
    queryFn: () =>
      authFetch(`${BASE_URL}/api/admin/mobile-apps`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: (q) => {
      const builds = q.state.data?.builds ?? [];
      const hasPending = builds.some((b) => b.status === "building" || b.status === "queued");
      return hasPending ? 15_000 : false;
    },
  });

  const retry = useMutation({
    mutationFn: (id: number) =>
      authFetch(`${BASE_URL}/api/admin/mobile-apps/${id}/retry`, {
        method: "POST",
        credentials: "include",
      }).then(async (r) => {
        if (!r.ok) { const t = await r.text(); throw new Error(t || `HTTP ${r.status}`); }
        return r.json();
      }),
    onSuccess: (_data, id) => {
      toast.success(`Retry started for build #${id}`);
      qc.invalidateQueries({ queryKey: ["admin-mobile-builds"] });
    },
    onError: (err: any, id) => {
      toast.error(`Could not retry build #${id}: ${err?.message ?? "Unknown error"}`);
    },
  });

  const builds = (data?.builds ?? []).filter((b) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      b.vendorName.toLowerCase().includes(q) ||
      b.appName.toLowerCase().includes(q) ||
      b.status.toLowerCase().includes(q) ||
      String(b.id).includes(q)
    );
  });

  const counts = {
    total:     data?.builds.length ?? 0,
    building:  data?.builds.filter((b) => b.status === "building" || b.status === "queued").length ?? 0,
    published: data?.builds.filter((b) => b.status === "published").length ?? 0,
    failed:    data?.builds.filter((b) => b.status === "failed").length ?? 0,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-violet-400" />
          <div>
            <h2 className="text-base font-semibold">Mobile App Builds</h2>
            <p className="text-xs text-muted-foreground">All vendor APK builds across the platform</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-7 px-2">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total builds", value: counts.total,     color: "text-foreground" },
          { label: "In progress",  value: counts.building,  color: "text-blue-400" },
          { label: "Published",    value: counts.published, color: "text-green-400" },
          { label: "Failed",       value: counts.failed,    color: "text-red-400" },
        ].map((s) => (
          <Card key={s.label} className="p-3">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search vendor, app, status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading builds…
        </div>
      ) : builds.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {search ? "No builds match your search." : "No mobile app builds yet."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">ID</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {builds.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{b.id}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{b.vendorName}</div>
                      <div className="text-xs text-muted-foreground">#{b.vendorId}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{b.appName}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {b.websiteUrl ?? b.repoUrl ?? b.packageName}
                      </div>
                      {b.status === "failed" && b.errorMessage && (
                        <div className="text-xs text-red-400 mt-0.5 max-w-[220px] truncate" title={b.errorMessage}>
                          {b.errorMessage}
                        </div>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge status={b.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmt(b.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* GitHub Actions logs link */}
                        {b.easBuildId && (
                          <a
                            href={`https://github.com/lumgwun/AwaAIApps/actions/runs/${b.easBuildId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="w-3 h-3" />Logs
                          </a>
                        )}
                        {/* Retry button — only for failed/published (not currently building) */}
                        {(b.status === "failed") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => retry.mutate(b.id)}
                            disabled={retry.isPending}
                          >
                            {retry.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <><RefreshCw className="w-3 h-3 mr-1" />Retry</>
                            )}
                          </Button>
                        )}
                        {/* APK download */}
                        {b.apkUrl && (
                          <a
                            href={b.apkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
                          >
                            APK
                          </a>
                        )}
                      </div>
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
