/**
 * Tests for job-run-status.ts, the shared health bookkeeping used by the
 * admin panel to show when a periodic background job last ran and whether
 * it's currently stuck failing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JobRunStatus } from "@workspace/db/schema";

let rows: JobRunStatus[] = [];
const tableRef = { jobName: "job_run_status.job_name" };
let nextId = 1;

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (whereArg: { val: unknown }) => ({
          limit: () => Promise.resolve(rows.filter((r) => r.jobName === whereArg.val)),
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: (whereArg: { val: unknown }) => {
          const idx = rows.findIndex((r) => r.jobName === whereArg.val);
          if (idx !== -1) rows[idx] = { ...rows[idx], ...vals } as JobRunStatus;
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        rows.push({ id: nextId++, ...vals } as JobRunStatus);
        return Promise.resolve();
      },
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  jobRunStatusTable: tableRef,
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

const { recordJobRun, getJobRunStatus, JOB_FAILING_THRESHOLD } = await import("../job-run-status");

const JOB = "subscription-sync";

beforeEach(() => {
  rows = [];
  nextId = 1;
});

describe("recordJobRun / getJobRunStatus", () => {
  it("creates a row on first successful run and reports it", async () => {
    await recordJobRun(JOB, { success: true, checkedCount: 5, affectedCount: 2 });
    const status = await getJobRunStatus(JOB);

    expect(status.lastRunAt).not.toBeNull();
    expect(status.lastSuccessAt).not.toBeNull();
    expect(status.lastCheckedCount).toBe(5);
    expect(status.lastAffectedCount).toBe(2);
    expect(status.lastError).toBeNull();
    expect(status.consecutiveFailures).toBe(0);
    expect(status.isFailing).toBe(false);
  });

  it("a never-run job reports a clean 'never run' shape, not a crash", async () => {
    const status = await getJobRunStatus("some-other-job");
    expect(status.lastRunAt).toBeNull();
    expect(status.consecutiveFailures).toBe(0);
    expect(status.isFailing).toBe(false);
  });

  it("increments consecutiveFailures on failure and preserves the last successful counts", async () => {
    await recordJobRun(JOB, { success: true, checkedCount: 10, affectedCount: 1 });
    await recordJobRun(JOB, { success: false, error: "Stripe key invalid" });

    const status = await getJobRunStatus(JOB);
    expect(status.consecutiveFailures).toBe(1);
    expect(status.lastError).toBe("Stripe key invalid");
    // The last successful run's counts stay visible even though this tick failed.
    expect(status.lastCheckedCount).toBe(10);
    expect(status.lastAffectedCount).toBe(1);
    // lastSuccessAt must not be bumped by a failing tick.
    const successAt = status.lastSuccessAt;
    await recordJobRun(JOB, { success: false, error: "Stripe key still invalid" });
    const status2 = await getJobRunStatus(JOB);
    expect(status2.lastSuccessAt).toBe(successAt);
  });

  it("flags isFailing once consecutive failures reach the threshold, and resets on success", async () => {
    for (let i = 0; i < JOB_FAILING_THRESHOLD - 1; i++) {
      await recordJobRun(JOB, { success: false, error: "boom" });
    }
    let status = await getJobRunStatus(JOB);
    expect(status.isFailing).toBe(false);

    await recordJobRun(JOB, { success: false, error: "boom" });
    status = await getJobRunStatus(JOB);
    expect(status.consecutiveFailures).toBe(JOB_FAILING_THRESHOLD);
    expect(status.isFailing).toBe(true);

    await recordJobRun(JOB, { success: true, checkedCount: 3, affectedCount: 0 });
    status = await getJobRunStatus(JOB);
    expect(status.consecutiveFailures).toBe(0);
    expect(status.isFailing).toBe(false);
  });
});
