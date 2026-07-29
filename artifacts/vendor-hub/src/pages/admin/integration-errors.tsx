/**
 * Admin: Integration Error Tracker Panel
 *
 * Lifecycle: open → in_progress → fix_deployed → resolved
 *
 * Key rules enforced here:
 *  1. "Fix Deployed" and "Resolved" both REQUIRE a non-empty fixDescription
 *     ("What was fixed in the code?") — you cannot close a report without one.
 *  2. "Escalate to Developer" generates a copy-ready prompt with full context
 *     (platform, error code, log metadata, vendor description) for pasting
 *     directly into the agent chat to request an actual code fix.
 *  3. Vendor is notified (email + push) only when status moves to "resolved".
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
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  AlertCircle, CheckCircle2, Clock, RefreshCw, ShieldAlert,
  Activity, Wrench, Copy, Check, ArrowRight, Info,
} from "lucide-react";

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
  open:         { label: "Open",              color: "bg-red-100 text-red-700",     icon: <AlertCircle className="w-3 h-3" /> },
  in_progress:  { label: "Under Investigation", color: "bg-yellow-100 text-yellow-700", icon: <Clock className="w-3 h-3" /> },
  fix_deployed: { label: "Fix Deployed",      color: "bg-blue-100 text-blue-700",   icon: <Wrench className="w-3 h-3" /> },
  resolved:     { label: "Resolved",          color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="w-3 h-3" /> },
};

type LinkedLog = {
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
};

type SupportReport = {
  id: number;
  vendorId: number;
  vendorName?: string | null;
  vendorEmail?: string | null;
  errorLogId?: number | null;
  platform: string;
  description: string;
  status: string;
  adminNote?: string | null;
  fixDescription?: string | null;
  resolvedByAdminName?: string | null;
  resolvedAt?: string | null;
  vendorNotifiedAt?: string | null;
  createdAt: string;
  linkedLog?: LinkedLog | null;
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

/** Builds the full copy-paste prompt an admin pastes into the agent chat. */
function buildEscalatePrompt(r: SupportReport): string {
  const bar = "━".repeat(52);
  const platform = PLATFORM_LABELS[r.platform] ?? r.platform;
  const date = new Date(r.createdAt).toUTCString();

  let lines = [
    `INTEGRATION BUG FIX REQUEST — Report #${r.id}`,
    bar,
    `Platform:  ${platform}`,
    `Vendor:    ${r.vendorName ?? `ID #${r.vendorId}`}${r.vendorEmail ? ` <${r.vendorEmail}>` : ""}`,
    `Submitted: ${date}`,
  ];

  if (r.errorLogId && r.linkedLog) {
    const log = r.linkedLog;
    lines.push(`Error Log: #${r.errorLogId}`);
    if (log.errorCode)   lines.push(`Error Code: ${log.errorCode}`);
    if (log.errorMessage) lines.push(`Error Message: ${log.errorMessage}`);
    if (log.metadata) {
      lines.push("", "Auto-captured metadata:");
      lines.push(JSON.stringify(log.metadata, null, 2));
    }
  }

  lines.push(
    "",
    "VENDOR'S DESCRIPTION:",
    r.description,
    "",
    bar,
    "Please investigate the root cause in the codebase, apply a code fix, and",
    "report back exactly what file/function was changed. The admin will fill in",
    "the fix description here and then notify the vendor that it is resolved.",
  );

  return lines.join("\n");
}

export default function IntegrationErrorsPanel() {
  const qc = useQueryClient();
  const [innerTab, setInnerTab] = useState<"reports" | "logs">("reports");

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  // Update dialog
  const [updateReport, setUpdateReport] = useState<SupportReport | null>(null);
  const [updateStatus, setUpdateStatus] = useState<"open" | "in_progress" | "fix_deployed" | "resolved">("in_progress");
  const [adminNote, setAdminNote]         = useState("");
  const [fixDescription, setFixDescription] = useState("");
  const [updating, setUpdating]           = useState(false);

  // Escalate dialog
  const [escalateReport, setEscalateReport] = useState<SupportReport | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: reports = [], isLoading: reportsLoading } = useQuery<SupportReport[]>({
    queryKey: ["admin-integration-reports"],
    queryFn: () => authFetch(`${BASE_URL}/api/admin/integration-errors/reports`).then((r) => r.json()),
  });

  const filteredReports = useMemo(() => reports.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (platformFilter !== "all" && r.platform !== platformFilter) return false;
    return true;
  }), [reports, statusFilter, platformFilter]);

  const { data: logs = [], isLoading: logsLoading } = useQuery<ErrorLog[]>({
    queryKey: ["admin-integration-logs"],
    queryFn: () => authFetch(`${BASE_URL}/api/admin/integration-errors/logs`).then((r) => r.json()),
    enabled: innerTab === "logs",
  });

  const filteredLogs = useMemo(() => logs.filter((l) =>
    platformFilter === "all" || l.platform === platformFilter
  ), [logs, platformFilter]);

  const openCount        = reports.filter((r) => r.status === "open").length;
  const inProgressCount  = reports.filter((r) => r.status === "in_progress").length;
  const fixDeployedCount = reports.filter((r) => r.status === "fix_deployed").length;

  // ── Actions ───────────────────────────────────────────────────────────────

  const needsFixDescription = updateStatus === "fix_deployed" || updateStatus === "resolved";
  const canSave = !needsFixDescription || fixDescription.trim().length >= 10;

  async function handleUpdateSubmit() {
    if (!updateReport || !canSave) return;
    setUpdating(true);
    try {
      const body: Record<string, unknown> = { status: updateStatus, adminNote };
      if (needsFixDescription) body.fixDescription = fixDescription;

      const res = await authFetch(
        `${BASE_URL}/api/admin/integration-errors/reports/${updateReport.id}/status`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      if (!res.ok) throw new Error(await res.text());

      const label = STATUS_META[updateStatus]?.label ?? updateStatus;
      toast.success(
        updateStatus === "resolved"
          ? `Marked resolved — vendor notified by email and push.`
          : `Status updated to "${label}".`
      );
      qc.invalidateQueries({ queryKey: ["admin-integration-reports"] });
      setUpdateReport(null);
    } catch {
      toast.error("Failed to update report.");
    } finally {
      setUpdating(false);
    }
  }

  function openUpdateDialog(r: SupportReport) {
    setUpdateReport(r);
    // Suggest the next logical status
    const next: Record<string, "in_progress" | "fix_deployed" | "resolved"> = {
      open:         "in_progress",
      in_progress:  "fix_deployed",
      fix_deployed: "resolved",
    };
    setUpdateStatus(next[r.status] ?? "in_progress");
    setAdminNote(r.adminNote ?? "");
    setFixDescription(r.fixDescription ?? "");
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Prompt copied — paste it into the agent chat.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-orange-500" />
            Integration Error Tracker
          </CardTitle>
          <CardDescription>
            Vendor-reported integration issues and auto-captured API failures.
            Use <strong>Escalate</strong> to get a code fix, then fill in <strong>What was fixed</strong> before closing.
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
              <Clock className="w-3 h-3" /> {inProgressCount} investigating
            </Badge>
          )}
          {fixDeployedCount > 0 && (
            <Badge className="bg-blue-100 text-blue-700 gap-1">
              <Wrench className="w-3 h-3" /> {fixDeployedCount} fix deployed
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

        {/* Workflow explainer */}
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="w-4 h-4 text-blue-600" />
          <AlertDescription className="text-blue-800 text-sm">
            <strong>How it works:</strong> When a vendor reports an error →
            click <strong>Escalate to Developer</strong> to copy a ready-made prompt →
            paste it into the agent chat to get a real code fix →
            come back here, fill in <strong>What was fixed</strong>, and mark it resolved.
            The vendor is notified only after you confirm a fix was deployed.
          </AlertDescription>
        </Alert>

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
              <SelectTrigger className="w-52">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">Under Investigation</SelectItem>
                <SelectItem value="fix_deployed">Fix Deployed</SelectItem>
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

          {/* ── Vendor Reports ── */}
          <TabsContent value="reports">
            {reportsLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading…</p>
            ) : filteredReports.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No reports match the selected filters.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>What was fixed</TableHead>
                    <TableHead>Submitted</TableHead>
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
                          {r.linkedLog?.errorCode && (
                            <Badge className="font-mono text-xs bg-red-50 text-red-700 border border-red-200 mt-1">
                              {r.linkedLog.errorCode}
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="max-w-xs">
                          <p className="text-sm line-clamp-2">{r.description}</p>
                          {r.adminNote && (
                            <p className="text-xs text-blue-600 mt-1">Note to vendor: {r.adminNote}</p>
                          )}
                        </TableCell>

                        <TableCell>
                          <Badge className={`${sm.color} flex items-center gap-1 w-fit text-xs`}>
                            {sm.icon} {sm.label}
                          </Badge>
                          {r.vendorNotifiedAt && (
                            <span className="text-xs text-green-600 block mt-1">Vendor notified ✓</span>
                          )}
                        </TableCell>

                        <TableCell className="max-w-xs">
                          {r.fixDescription ? (
                            <p className="text-xs text-green-700 bg-green-50 rounded p-1.5 border border-green-200 line-clamp-3">
                              {r.fixDescription}
                            </p>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              {r.status === "resolved" ? "—" : "Not yet provided"}
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(r.createdAt).toLocaleString()}
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {/* Escalate button — always visible on unresolved reports */}
                            {r.status !== "resolved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-orange-700 border-orange-200 hover:bg-orange-50 text-xs whitespace-nowrap"
                                onClick={() => { setEscalateReport(r); setCopied(false); }}
                              >
                                <ArrowRight className="w-3 h-3 mr-1" /> Escalate
                              </Button>
                            )}
                            {/* Update status button */}
                            {r.status !== "resolved" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs"
                                onClick={() => openUpdateDialog(r)}
                              >
                                Update status
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* ── Raw Error Logs ── */}
          <TabsContent value="logs">
            {logsLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading…</p>
            ) : filteredLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No error logs yet. Logs appear here automatically when external API calls fail.
              </p>
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
                          <Badge className="font-mono text-xs bg-red-50 text-red-700 border border-red-200">
                            {l.errorCode}
                          </Badge>
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

      {/* ── Escalate to Developer dialog ─────────────────────────────────── */}
      <Dialog open={!!escalateReport} onOpenChange={(o) => { if (!o) setEscalateReport(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-orange-500" />
              Escalate to Developer — Report #{escalateReport?.id}
            </DialogTitle>
            <DialogDescription>
              Copy this prompt and paste it into the agent chat. The agent will investigate
              the root cause and fix the code. Come back here afterwards to fill in what was
              fixed before notifying the vendor.
            </DialogDescription>
          </DialogHeader>

          {escalateReport && (
            <div className="space-y-3">
              <pre className="text-xs bg-gray-950 text-green-300 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap max-h-80 font-mono leading-relaxed border">
                {buildEscalatePrompt(escalateReport)}
              </pre>
              <Button
                className="w-full"
                onClick={() => handleCopy(buildEscalatePrompt(escalateReport!))}
              >
                {copied
                  ? <><Check className="w-4 h-4 mr-2 text-green-300" /> Copied!</>
                  : <><Copy className="w-4 h-4 mr-2" /> Copy prompt to clipboard</>
                }
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                After the agent deploys the fix, return here and click <strong>Update status → Fix Deployed</strong>,
                fill in what changed, then mark it <strong>Resolved</strong> to notify the vendor.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateReport(null)}>Close</Button>
            {escalateReport && (
              <Button
                variant="secondary"
                onClick={() => { setEscalateReport(null); openUpdateDialog(escalateReport); }}
              >
                Update status now
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Update status dialog ─────────────────────────────────────────── */}
      <Dialog open={!!updateReport} onOpenChange={(o) => { if (!o) setUpdateReport(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update Report #{updateReport?.id}</DialogTitle>
            <DialogDescription>
              {PLATFORM_LABELS[updateReport?.platform ?? ""] ?? updateReport?.platform}
              {" · "}
              {updateReport?.vendorName ?? `Vendor #${updateReport?.vendorId}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Vendor's original report */}
            <div>
              <Label className="text-sm font-medium mb-1 block">Vendor's report</Label>
              <p className="text-sm bg-gray-50 rounded p-3 border line-clamp-4">
                {updateReport?.description}
              </p>
            </div>

            {/* Status picker */}
            <div className="space-y-1">
              <Label htmlFor="update-status">New Status</Label>
              <Select value={updateStatus} onValueChange={(v) => setUpdateStatus(v as typeof updateStatus)}>
                <SelectTrigger id="update-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open (revert)</SelectItem>
                  <SelectItem value="in_progress">Under Investigation</SelectItem>
                  <SelectItem value="fix_deployed">Fix Deployed — code change is live</SelectItem>
                  <SelectItem value="resolved">Resolved — notify vendor ✓</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Fix description — REQUIRED for fix_deployed / resolved */}
            {needsFixDescription && (
              <div className="space-y-1">
                <Label htmlFor="fix-desc" className="flex items-center gap-1">
                  What was fixed in the code?
                  <span className="text-red-500">*</span>
                  <span className="text-muted-foreground font-normal text-xs ml-1">(required)</span>
                </Label>
                <Textarea
                  id="fix-desc"
                  rows={4}
                  placeholder={
                    `e.g. Fixed token refresh in lib/meta.ts — the access token was not being refreshed ` +
                    `before publishing. Added a pre-publish token validity check and auto-refresh on ` +
                    `401 responses. Deployed in the API server restart at 14:30 UTC.`
                  }
                  value={fixDescription}
                  onChange={(e) => setFixDescription(e.target.value)}
                  className={fixDescription.trim().length > 0 && fixDescription.trim().length < 10
                    ? "border-red-300"
                    : ""}
                />
                {fixDescription.trim().length > 0 && fixDescription.trim().length < 10 && (
                  <p className="text-xs text-red-600">Please describe the fix in more detail.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  This is shown to the vendor so they know exactly what changed.
                  Do not leave this vague — "fixed" is not a fix description.
                </p>
              </div>
            )}

            {/* Optional note to vendor */}
            <div className="space-y-1">
              <Label htmlFor="admin-note">
                Message to vendor{" "}
                <span className="text-muted-foreground font-normal text-xs">(optional — shown in the notification)</span>
              </Label>
              <Textarea
                id="admin-note"
                rows={2}
                placeholder="e.g. Please reconnect your Meta account under Settings → Social Accounts."
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
              />
            </div>

            {/* Confirm banner */}
            {updateStatus === "resolved" && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <AlertDescription className="text-green-800 text-sm">
                  Vendor will receive an email + push notification confirming the fix.
                  Only do this after the code fix is deployed and you have verified it works.
                </AlertDescription>
              </Alert>
            )}

            {updateStatus === "fix_deployed" && (
              <Alert className="border-blue-200 bg-blue-50">
                <Wrench className="w-4 h-4 text-blue-600" />
                <AlertDescription className="text-blue-800 text-sm">
                  Marking as "Fix Deployed" lets you confirm the vendor's issue once they test it.
                  The vendor is not notified yet — that happens on "Resolved".
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateReport(null)}>Cancel</Button>
            <Button
              onClick={handleUpdateSubmit}
              disabled={updating || !canSave}
              title={!canSave ? "Fill in 'What was fixed' before saving" : undefined}
            >
              {updating ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
