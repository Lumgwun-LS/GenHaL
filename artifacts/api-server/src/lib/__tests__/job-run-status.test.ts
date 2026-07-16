/**
 * Tests for job-run-status.ts, the shared health bookkeeping used by the
 * admin panel to show when a periodic background job last ran and whether
 * it's currently stuck failing.
 *
 * Covers:
 *  - recordJobRun / getJobRunStatus core behaviour (insert on first run,
 *    consecutive-failure counting, isFailing flag, counts preserved across
 *    failing ticks)
 *  - getAllJobRunStatuses returns every recorded job sorted alphabetically
 *  - Slack alerts fire exactly once on the threshold-crossing tick in each
 *    direction (fail → stuck, stuck → recovered)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JobRunStatus } from "@workspace/db/schema";

// ── in-memory store ──────────────────────────────────────────────────────────
let rows: JobRunStatus[] = [];
const tableRef = { jobName: "job_run_status.job_name" };
let nextId = 1;

// ── mocks ────────────────────────────────────────────────────────────────────
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => {
        // getAllJobRunStatuses awaits from() directly (no .where).
        // getJobRunStatus chains .where().limit() on top.
        // Return a thenable that also exposes .where so both call-sites work.
        const base: any = Promise.resolve(rows);
        base.where = (whereArg: { val: unknown }) => ({
          limit: () => Promise.resolve(rows.filter((r) => r.jobName === whereArg.val)),
        });
        return base;
      },
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

const sendSlackAlertMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../slack", () => ({
  sendSlackAlert: (...args: unknown[]) => sendSlackAlertMock(...args),
}));

// Dynamic import happens after all vi.mock calls are in place.
const { recordJobRun, getJobRunStatus, getAllJobRunStatuses, JOB_FAILING_THRESHOLD } =
  await import("../job-run-status");

const JOB = "subscription-sync";

beforeEach(() => {
  rows = [];
  nextId = 1;
  sendSlackAlertMock.mockClear();
});

// ── recordJobRun / getJobRunStatus ────────────────────────────────────────────
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

// ── getAllJobRunStatuses ───────────────────────────────────────────────────────
describe("getAllJobRunStatuses", () => {
  it("returns an empty list when no jobs have run yet", async () => {
    const statuses = await getAllJobRunStatuses();
    expect(statuses).toEqual([]);
  });

  it("returns one entry per recorded job, each with the correct shape", async () => {
    await recordJobRun("job-alpha", { success: true, checkedCount: 3, affectedCount: 1 });
    await recordJobRun("job-beta", { success: false, error: "oops" });

    const statuses = await getAllJobRunStatuses();
    expect(statuses).toHaveLength(2);

    const alpha = statuses.find((s) => s.jobName === "job-alpha")!;
    expect(alpha.isFailing).toBe(false);
    expect(alpha.lastCheckedCount).toBe(3);
    expect(alpha.lastError).toBeNull();

    const beta = statuses.find((s) => s.jobName === "job-beta")!;
    expect(beta.consecutiveFailures).toBe(1);
    expect(beta.lastError).toBe("oops");
  });

  it("returns jobs sorted alphabetically by name", async () => {
    await recordJobRun("zoo-job", { success: true });
    await recordJobRun("alpha-job", { success: true });
    await recordJobRun("middle-job", { success: true });

    const statuses = await getAllJobRunStatuses();
    expect(statuses.map((s) => s.jobName)).toEqual(["alpha-job", "middle-job", "zoo-job"]);
  });

  it("serializes lastRunAt and lastSuccessAt as ISO strings, not Date objects", async () => {
    await recordJobRun("time-job", { success: true });
    const [status] = await getAllJobRunStatuses();
    expect(typeof status.lastRunAt).toBe("string");
    expect(() => new Date(status.lastRunAt!)).not.toThrow();
  });
});

// ── Slack alert threshold crossing ────────────────────────────────────────────
describe("Slack alert on threshold crossing", () => {
  it("sends no Slack alert while failures are below the threshold", async () => {
    for (let i = 0; i < JOB_FAILING_THRESHOLD - 1; i++) {
      await recordJobRun(JOB, { success: false, error: "transient" });
    }
    expect(sendSlackAlertMock).not.toHaveBeenCalled();
  });

  it("fires a Slack alert exactly once when failures reach the threshold", async () => {
    for (let i = 0; i < JOB_FAILING_THRESHOLD; i++) {
      await recordJobRun(JOB, { success: false, error: "persistent" });
    }
    // Alert fires on the exact threshold-crossing tick.
    expect(sendSlackAlertMock).toHaveBeenCalledTimes(1);
    expect(sendSlackAlertMock.mock.calls[0][0]).toMatch(JOB);

    // Additional failures beyond the threshold must NOT send more alerts.
    await recordJobRun(JOB, { success: false, error: "still failing" });
    expect(sendSlackAlertMock).toHaveBeenCalledTimes(1);
  });

  it("fires a recovery Slack alert when the job succeeds after being stuck", async () => {
    for (let i = 0; i < JOB_FAILING_THRESHOLD; i++) {
      await recordJobRun(JOB, { success: false, error: "persistent" });
    }
    sendSlackAlertMock.mockClear(); // ignore the failure alert

    await recordJobRun(JOB, { success: true, checkedCount: 1, affectedCount: 0 });
    expect(sendSlackAlertMock).toHaveBeenCalledTimes(1);
    expect(sendSlackAlertMock.mock.calls[0][0]).toMatch(/succeeding again/i);

    // Subsequent successes must NOT keep re-alerting.
    await recordJobRun(JOB, { success: true });
    expect(sendSlackAlertMock).toHaveBeenCalledTimes(1);
  });

  it("does not fire a recovery alert on a success that was never in the failing state", async () => {
    await recordJobRun(JOB, { success: false, error: "one off" });
    await recordJobRun(JOB, { success: true });
    // One failure never crossed the threshold, so no failure OR recovery alert.
    expect(sendSlackAlertMock).not.toHaveBeenCalled();
  });
});
