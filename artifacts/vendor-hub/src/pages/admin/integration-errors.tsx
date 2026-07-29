/**
 * Admin: Integration Error Tracker Panel
 *
 * Shows all vendor-submitted support reports and raw auto-captured error logs.
 * Admins can update a report's status and add a resolution note — vendors are
 * notified by email + push when their report is resolved.
 */

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/authFetch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Clock, RefreshCw, ShieldAlert, Activity } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const PLATFORM_LABELS: Record<string, string> = {
  meta:        "Meta (Facebook / Instagram)",
  linkedin:    "LinkedIn",
  x_twitter:   "X / Twitter",
  paystack:    "Paystack",
  stripe:      "Stripe",
  paypal:      "PayPal",
  flutterwave: "Flutterwave",
  nomba:       "Nomba",
  remita:      "Remita",
  twilio:      "Twilio (Voice / SMS)",
  elevenlabs:  "ElevenLabs (AI Voice)",
  openai:      "OpenAI (AI)",
  gemini:      "Gemini (AI)",
  other:       "Other / Unknown",
};

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open:        { label: "Open",        color: "bg-red-100 text-red-700",    icon: <AlertCircle className="w-3 h-3" /> },
  in_progress: { label: "In Progress", color: "bg-yellow-100 text-yellow-700", icon: <Clock className="w-3 h-3" /> },
  resolved:    { label: "Resolved",    color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="w-3 h-3" /> },
};

type SupportReport = {
  id: number;
  vendorId: number;
  vendorName?: string;
  vendorEmail?: string;
  errorLogId?: number | null;
  platform: string;
  description: string;
  status: string;
  adminNote?: string | null;
  resolvedByAdminName?: string | null;
  resolvedAt?: string | null;
  vendorNotifiedAt?: string | null;
  createdAt: string;
};

type ErrorLog = {
  id: number;
  vendorId?: number | null;
  vendorName?: string | null;
  platform: string;
  errorCode?: string | null;
  errorMessage: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export default function IntegrationErrorsPanel() {
  const qc = useQueryClient();
  const [innerTab, setInnerTab] = useState<"reports" | "logs">("reports");

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  // Resolve dialog
  const [resolveReport, setResolveReport] = useState<SupportReport | null>(null);
  const [resolveStatus, setResolveStatus] = useState<"open" | "in_progress" | "resolved">("in_progress");
  const [resolveNote, setResolveNote] = useState("");
  const [resolving, setResolving] = useState(false);

  // ── Reports ──────────────────────────────────────────────────────────────

  const { data: reports = [], isLoading: reportsLoading } = useQuery<SupportReport[]>({
    queryKey: ["admin-integration-reports"],
    queryFn: () => authFetch(`${BASE_URL}/api/admin/integration-errors/reports`).then((r) => r.json()),
  });

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (platformFilter !== "all" && r.platform !== platformFilter) return false;
      return true;
    });
  }, [reports, statusFilter, platformFilter]);

  // ── Raw Logs ─────────────────────────────────────────────────────────────

  const { data: logs = [], isLoading: logsLoading } = useQuery<ErrorLog[]>({
    queryKey: ["admin-integration-logs"],
    queryFn: () => authFetch(`${BASE_URL}/api/admin/integration-errors/logs`).then((r) => r.json()),
    enabled: innerTab === "logs",
  });

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (platformFilter !== "all" && l.platform !== platformFilter) return false;
      return true;
    });
  }, [logs, platformFilter]);

  // ── Counts ────────────────────────────────────────────────────────────────

  const openCount = reports.filter((r) => r.status === "open").length;
  const inProgressCount = reports.filter((r) => r.status === "in_progress").length;

  // ── Resolve ───────────────────────────────────────────────────────────────

  async function handleResolveSubmit() {
    if (!resolveReport) return;
    setResolving(true);
    try {
      const res = await authFetch(
        `${BASE_URL}/api/admin/integration-errors/reports/${resolveReport.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: resolveStatus, adminNote: resolveNote }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      toast.success(resolveStatus === "resolved" ? "Report resolved — vendor notified." : "Report updated.");
      qc.invalidateQueries({ queryKey: ["admin-integration-reports"] });
      setResolveReport(null);
      setResolveNote("");
    } catch (err) {
      toast.error("Failed to update report.");
    } finally {
      setResolving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-orange-500" />
            Integration Error Tracker
          </CardTitle>
          <CardDescription>
            Vendor-reported integration issues and auto-captured API failures. Resolve a report to notify the vendor by email and push.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {openCount > 0 && (
            <Badge className="bg-red-100 text-red-700 gap-1">
              <AlertCircle className="w-3 h-3" /> {openCount} open
            </Badge>
          )}
          {inProgressCount > 0 && (
            <Badge className="bg-yellow-100 text-yellow-700 gap-1">
              <Clock className="w-3 h-3" /> {inProgressCount} in progress
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => {
            qc.invalidateQueries({ queryKey: ["admin-integration-reports"] });
            qc.invalidateQueries({ queryKey: ["admin-integration-logs"] });
          }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All platforms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {innerTab === "reports" && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <Tabs value={innerTab} onValueChange={(v) => setInnerTab(v as "reports" | "logs")}>
          <TabsList>
            <TabsTrigger value="reports" className="flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> Vendor Reports ({reports.length})
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-1">
              <Activity className="w-4 h-4" /> Raw Error Logs
            </TabsTrigger>
          </TabsList>

          {/* ── Reports tab ── */}
          <TabsContent value="reports">
            {reportsLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading…</p>
            ) : filteredReports.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No reports match the selected filters.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Resolved by</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((r) => {
                    const sm = STATUS_META[r.status] ?? STATUS_META.open;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.id}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{r.vendorName ?? `Vendor #${r.vendorId}`}</div>
                          <div className="text-xs text-muted-foreground">{r.vendorEmail}</div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{PLATFORM_LABELS[r.platform] ?? r.platform}</span>
                          {r.errorLogId && (
                            <div className="text-xs text-muted-foreground">Log #{r.errorLogId}</div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="text-sm line-clamp-2">{r.description}</p>
                          {r.adminNote && (
                            <p className="text-xs text-muted-foreground mt-1 italic">Admin: {r.adminNote}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${sm.color} flex items-center gap-1 w-fit`}>
                            {sm.icon}{sm.label}
                          </Badge>
                          {r.vendorNotifiedAt && (
                            <span className="text-xs text-green-600 block mt-1">Vendor notified</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(r.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.resolvedByAdminName ?? "—"}
                          {r.resolvedAt && (
                            <div className="text-xs">{new Date(r.resolvedAt).toLocaleDateString()}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.status !== "resolved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setResolveReport(r);
                                setResolveStatus(r.status === "open" ? "in_progress" : "resolved");
                                setResolveNote(r.adminNote ?? "");
                              }}
                            >
                              Update
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* ── Raw logs tab ── */}
          <TabsContent value="logs">
            {logsLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading…</p>
            ) : filteredLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No error logs yet. Logs appear here automatically when external API calls fail.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Error Code</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Metadata</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{l.id}</TableCell>
                      <TableCell className="text-sm">
                        {l.vendorName ?? (l.vendorId ? `#${l.vendorId}` : "Platform")}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {PLATFORM_LABELS[l.platform] ?? l.platform}
                      </TableCell>
                      <TableCell>
                        {l.errorCode ? (
                          <Badge className="font-mono text-xs bg-red-50 text-red-700 border border-red-200">{l.errorCode}</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="text-sm line-clamp-2">{l.errorMessage}</p>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {l.metadata ? (
                          <details>
                            <summary className="text-xs text-muted-foreground cursor-pointer">View</summary>
                            <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-x-auto max-h-32">
                              {JSON.stringify(l.metadata, null, 2)}
                            </pre>
                          </details>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(l.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Resolve / update dialog */}
      <Dialog open={!!resolveReport} onOpenChange={(o) => { if (!o) setResolveReport(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Report #{resolveReport?.id}</DialogTitle>
            <DialogDescription>
              Vendor: <strong>{resolveReport?.vendorName}</strong> · Platform: <strong>{PLATFORM_LABELS[resolveReport?.platform ?? ""] ?? resolveReport?.platform}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-1 block">Vendor's report</Label>
              <p className="text-sm bg-gray-50 rounded p-3 border">{resolveReport?.description}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="resolve-status">New Status</Label>
              <Select value={resolveStatus} onValueChange={(v) => setResolveStatus(v as any)}>
                <SelectTrigger id="resolve-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open (revert to new)</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved ✓ (notifies vendor)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="resolve-note">
                Admin Note <span className="text-muted-foreground font-normal">(shown to vendor on resolve)</span>
              </Label>
              <Textarea
                id="resolve-note"
                placeholder="e.g. We updated your Meta token — please reconnect your account and try again."
                rows={3}
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
              />
            </div>
            {resolveStatus === "resolved" && !resolveReport?.vendorNotifiedAt && (
              <p className="text-xs text-green-700 bg-green-50 rounded p-2 border border-green-200">
                ✓ Vendor will receive an email + push notification when you save.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveReport(null)}>Cancel</Button>
            <Button onClick={handleResolveSubmit} disabled={resolving}>
              {resolving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
