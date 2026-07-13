/**
 * Shared health bookkeeping for unattended periodic background jobs (e.g.
 * the subscription-sync scheduler). A job calls `recordJobRun` at the end of
 * every tick — success or failure — so the admin panel can show when it last
 * ran, what it found, and whether it's currently stuck failing.
 *
 * Mirrors the "last checked / currently failing" pattern already used for
 * platform gateway health (see platform-gateways.ts), generalized to a
 * job-name-keyed table since more than one background job can use this.
 */
import { db } from "@workspace/db";
import { jobRunStatusTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

// Consecutive failed ticks before the admin UI treats a job as "stuck
// failing" rather than a one-off transient blip.
export const JOB_FAILING_THRESHOLD = 3;

export interface RecordJobRunInput {
  success: boolean;
  checkedCount?: number;
  affectedCount?: number;
  error?: string;
}

/** Upserts the outcome of a single tick for a named job. */
export async function recordJobRun(jobName: string, input: RecordJobRunInput): Promise<void> {
  const [existing] = await db.select().from(jobRunStatusTable).where(eq(jobRunStatusTable.jobName, jobName)).limit(1);
  const now = new Date();

  const values = {
    lastRunAt: now,
    lastSuccessAt: input.success ? now : existing?.lastSuccessAt ?? null,
    lastCheckedCount: input.success ? input.checkedCount ?? null : existing?.lastCheckedCount ?? null,
    lastAffectedCount: input.success ? input.affectedCount ?? null : existing?.lastAffectedCount ?? null,
    lastError: input.success ? null : input.error ?? "Unknown error",
    consecutiveFailures: input.success ? 0 : (existing?.consecutiveFailures ?? 0) + 1,
  };

  if (existing) {
    await db.update(jobRunStatusTable).set(values).where(eq(jobRunStatusTable.jobName, jobName));
  } else {
    await db.insert(jobRunStatusTable).values({ jobName, ...values });
  }
}

export interface JobRunStatusView {
  jobName: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastCheckedCount: number | null;
  lastAffectedCount: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  isFailing: boolean;
}

/** Returns the current health view for a named job, or a "never run" shape if it has no row yet. */
export async function getJobRunStatus(jobName: string): Promise<JobRunStatusView> {
  const [row] = await db.select().from(jobRunStatusTable).where(eq(jobRunStatusTable.jobName, jobName)).limit(1);
  return {
    jobName,
    lastRunAt: row?.lastRunAt?.toISOString() ?? null,
    lastSuccessAt: row?.lastSuccessAt?.toISOString() ?? null,
    lastCheckedCount: row?.lastCheckedCount ?? null,
    lastAffectedCount: row?.lastAffectedCount ?? null,
    lastError: row?.lastError ?? null,
    consecutiveFailures: row?.consecutiveFailures ?? 0,
    isFailing: (row?.consecutiveFailures ?? 0) >= JOB_FAILING_THRESHOLD,
  };
}
