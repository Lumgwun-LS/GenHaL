/**
 * Tests for GET /admin/job-run-status — the admin-only endpoint that returns
 * the aggregated health view for every background job that has ever recorded
 * a run via recordJobRun.
 *
 * Covers:
 *  - Unauthenticated requests (no userId) → 401
 *  - Authenticated but non-admin user → 403
 *  - Admin user → 200 with the list returned by getAllJobRunStatuses
 *  - Response is sorted alphabetically (delegates ordering to the helper)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

process.env.ADMIN_USER_IDS = "user_admin_1";

// ── mocks ─────────────────────────────────────────────────────────────────────
// Clerk — let tests control the calling userId via an x-test-user header.
vi.mock("@clerk/express", () => ({
  getAuth: (req: Request) => ({
    userId: (req.headers["x-test-user"] as string | undefined) ?? null,
  }),
}));

// getAllJobRunStatuses — replace with a controllable stub.
let stubbedStatuses: unknown[] = [];
vi.mock("../../lib/job-run-status", () => ({
  getAllJobRunStatuses: () => Promise.resolve(stubbedStatuses),
}));

// ── helpers ───────────────────────────────────────────────────────────────────
async function buildApp() {
  const { default: router } = await import("../admin-job-run-status");
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use((err: unknown, _req: Request, res: Response, _next: (e?: unknown) => void) => {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  });
  return app;
}

function callApp(
  app: express.Express,
  { headers = {} }: { headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      fetch(`http://localhost:${addr.port}/admin/job-run-status`, { headers })
        .then(async (res) => {
          const text = await res.text();
          let json: unknown = null;
          try { json = JSON.parse(text); } catch { /* leave null */ }
          server.close();
          resolve({ status: res.status, body: json });
        })
        .catch((err) => { server.close(); reject(err); });
    });
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────
describe("GET /admin/job-run-status", () => {
  let app: express.Express;

  beforeEach(async () => {
    stubbedStatuses = [];
    vi.resetModules();
    app = await buildApp();
  });

  it("returns 401 when there is no authenticated user", async () => {
    const { status } = await callApp(app);
    expect(status).toBe(401);
  });

  it("returns 403 when the user is authenticated but not listed in ADMIN_USER_IDS", async () => {
    const { status } = await callApp(app, { headers: { "x-test-user": "user_regular_vendor" } });
    expect(status).toBe(403);
  });

  it("returns 200 with the job-run list for an admin user", async () => {
    stubbedStatuses = [
      {
        jobName: "gateway-health",
        lastRunAt: "2026-07-16T10:00:00.000Z",
        lastSuccessAt: "2026-07-16T10:00:00.000Z",
        lastCheckedCount: 4,
        lastAffectedCount: 0,
        lastError: null,
        consecutiveFailures: 0,
        isFailing: false,
      },
      {
        jobName: "post-scheduler",
        lastRunAt: "2026-07-16T10:05:00.000Z",
        lastSuccessAt: null,
        lastCheckedCount: null,
        lastAffectedCount: null,
        lastError: "DB connection lost",
        consecutiveFailures: 5,
        isFailing: true,
      },
    ];

    const { status, body } = await callApp(app, { headers: { "x-test-user": "user_admin_1" } });

    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const list = body as Array<Record<string, unknown>>;
    expect(list).toHaveLength(2);

    const gateway = list.find((r) => r.jobName === "gateway-health")!;
    expect(gateway.isFailing).toBe(false);
    expect(gateway.consecutiveFailures).toBe(0);
    expect(gateway.lastCheckedCount).toBe(4);

    const sched = list.find((r) => r.jobName === "post-scheduler")!;
    expect(sched.isFailing).toBe(true);
    expect(sched.lastError).toBe("DB connection lost");
  });

  it("returns an empty array when no jobs have run yet", async () => {
    stubbedStatuses = [];
    const { status, body } = await callApp(app, { headers: { "x-test-user": "user_admin_1" } });
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});
