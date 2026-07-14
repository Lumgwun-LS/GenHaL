import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type JobRunStatus = {
  jobName: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastCheckedCount: number | null;
  lastAffectedCount: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  isFailing: boolean;
};

async function fetchAllStatuses(): Promise<JobRunStatus[]> {
  const res = await fetch(`${BASE_URL}/api/admin/job-run-status`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load background job status");
  return (await res.json()) as JobRunStatus[];
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

/** Human-friendly label for the raw job_run_status.job_name key. */
function jobLabel(jobName: string): string {
  return jobName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function BackgroundJobsPanel() {
  const { data: statuses, isLoading, error } = useQuery({
    queryKey: ["admin-job-run-status"],
    queryFn: fetchAllStatuses,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading background job status…</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-destructive">Failed to load background job status.</div>;
  }

  const failing = (statuses ?? []).filter((s) => s.isFailing);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Every scheduled background job (reminders, auto-publishing, gateway and social-account
        health checks, billing sync, voice call reconciliation) reports here after each run — so a
        job silently failing every tick (for example, because a migration was written but never
        applied to this database — see the startup schema-drift check in the server logs) shows up
        here instead of only in logs no one is watching.
      </p>

      {failing.length > 0 && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            {failing.length} job{failing.length > 1 ? "s are" : " is"} currently stuck failing:{" "}
            {failing.map((f) => jobLabel(f.jobName)).join(", ")}. Check server logs for the underlying
            cause (a missing column/table from an unapplied migration is a common one).
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Background Jobs</CardTitle>
          <CardDescription>
            Last run outcome for every scheduled job that reports its health.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(!statuses || statuses.length === 0) ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No jobs have reported a run yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Last success</TableHead>
                  <TableHead>Consecutive failures</TableHead>
                  <TableHead>Last error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statuses.map((s) => (
                  <TableRow key={s.jobName}>
                    <TableCell className="font-medium">{jobLabel(s.jobName)}</TableCell>
                    <TableCell>
                      {s.isFailing ? (
                        <Badge className="gap-1 bg-red-500/15 text-red-600 hover:bg-red-500/15">
                          <AlertTriangle className="w-3.5 h-3.5" /> Failing
                        </Badge>
                      ) : (
                        <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{formatTimestamp(s.lastRunAt)}</TableCell>
                    <TableCell className="text-sm">{formatTimestamp(s.lastSuccessAt)}</TableCell>
                    <TableCell className="text-sm">{s.consecutiveFailures}</TableCell>
                    <TableCell className="text-sm text-red-600 max-w-xs truncate" title={s.lastError ?? ""}>
                      {s.lastError ?? "—"}
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
