/**
 * Task #324: Confirm the finance rollup CSV export can't be triggered
 * excessively without triggering an alert.
 *
 * Exercises GET /admin/analytics/finance-rollup/export end-to-end through
 * the real admin-export-burst helpers (getExportBurstStatus + checkExportBurst)
 * so the same shared infrastructure that guards the vendor-list export also
 * protects the finance rollup export.
 *
 * Covers:
 *  1. Below threshold → 200 with CSV content-type
 *  2. Threshold-th export → still 200 (the burst logs after serving); Slack
 *     alert fires exactly once
 *  3. (threshold + 1)-th export → 429 with the expected error body
 *  4. Extra exports beyond +1 do NOT send additional Slack alerts
 *  5. Acknowledging the burst (simulated via the ack store) unblocks the admin
 *  6. Non-admin user receives 403
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

// ── Admin user IDs ─────────────────────────────────────────────────────────────
process.env.ADMIN_USER_IDS = "admin_flagged,admin_reviewer";

// ── In-memory stores ───────────────────────────────────────────────────────────

// Rows in adminExportLogsTable — appended by each successful export
type ExportLogRow = { id: number; adminUserId: string; exportedAt: Date };
let exportLogs: ExportLogRow[] = [];
let nextExportId = 1;

// Singleton acknowledgment row for the flagged admin
type AckRow = { adminUserId: string; acknowledgedAt: Date };
let ackRow: AckRow | null = null;

// Tracks (adminUserId:crossingExportId) pairs already claimed for Slack alerts
// — mirrors the adminExportBurstSentAlertsTable unique constraint
const claimedAlerts = new Set<string>();

// Counts how many times sendSlackAlert has been called
let slackAlertsSent = 0;

// ── Table identity symbols ─────────────────────────────────────────────────────
const EXPORT_LOGS_TBL     = Symbol("adminExportLogs");
const EXPORT_ACK_TBL      = Symbol("adminExportAcknowledgments");
const BURST_ALERTS_TBL    = Symbol("adminExportBurstSentAlerts");
const SALES_TBL           = Symbol("sales");
const EXPENSES_TBL        = Symbol("expenses");
const INVESTMENTS_TBL     = Symbol("investments");
const VENDORS_TBL         = Symbol("vendors");
const PAYMENTS_TBL        = Symbol("payments");
const PAGE_VIEWS_TBL      = Symbol("pageViews");
const STORE_DEV_TBL       = Symbol("storeDeveloperAccounts");

// ── @workspace/db mock ─────────────────────────────────────────────────────────
vi.mock("@workspace/db", () => {
  function makeSelectFrom(table: unknown) {
    // ── adminExportLogsTable ──────────────────────────────────────────────────
    if (table === EXPORT_LOGS_TBL) {
      // getExportBurstStatus: .where(...).orderBy(desc) → rows newest-first
      // checkExportBurst:     .where(...).orderBy(asc, asc) → rows oldest-first
      // The mock returns rows in both orderings; callers use [threshold-1] index
      // so ordering direction matters. We return desc-sorted for getExportBurstStatus
      // and asc-sorted for checkExportBurst (callers chain different orderBy args;
      // we simplify by returning asc-sorted for all and let test data be symmetric).
      return {
        where: (_cond: unknown) => ({
          orderBy: (..._args: unknown[]) => {
            // Return asc by (exportedAt, id) — deterministic for checkExportBurst.
            // getExportBurstStatus uses desc but only checks [threshold-1] which is
            // the same row in a simple sequential scenario.
            const sorted = [...exportLogs].sort(
              (a, b) => a.exportedAt.getTime() - b.exportedAt.getTime() || a.id - b.id,
            );
            return Promise.resolve(sorted);
          },
        }),
      };
    }

    // ── adminExportAcknowledgmentsTable ───────────────────────────────────────
    if (table === EXPORT_ACK_TBL) {
      return {
        // getExportBurstStatus: .where(eq(adminUserId, x)) → [ackRow?]
        where: (_cond: unknown) => Promise.resolve(ackRow ? [{ ...ackRow }] : []),
      };
    }

    // ── Other tables used by the finance-rollup export route ──────────────────
    // All return empty arrays so the CSV is valid but has no data rows.
    const emptyChain = {
      where: (_cond: unknown) => ({
        orderBy: (..._args: unknown[]) => Promise.resolve([]),
        limit:   (_n: number)           => Promise.resolve([]),
        then:    (resolve: (v: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
      }),
      then: (resolve: (v: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
      orderBy: (..._args: unknown[]) => Promise.resolve([]),
      limit: (_n: number) => Promise.resolve([]),
    };
    return emptyChain;
  }

  function makeInsert(table: unknown) {
    return {
      values: (vals: Record<string, unknown>) => {
        // ── adminExportLogsTable ────────────────────────────────────────────────
        if (table === EXPORT_LOGS_TBL) {
          const row: ExportLogRow = {
            id: nextExportId++,
            adminUserId: vals.adminUserId as string,
            exportedAt: new Date(),
          };
          exportLogs.push(row);
          // Return a thenable so the route can `await` the insert
          return Promise.resolve();
        }

        // ── adminExportBurstSentAlertsTable ────────────────────────────────────
        if (table === BURST_ALERTS_TBL) {
          const key = `${vals.adminUserId}:${vals.crossingExportId}`;
          return {
            onConflictDoNothing: () => ({
              returning: (_cols?: unknown) => {
                if (claimedAlerts.has(key)) {
                  return Promise.resolve([]); // already claimed → no alert
                }
                claimedAlerts.add(key);
                return Promise.resolve([{ id: 1 }]); // claimed → send alert
              },
            }),
          };
        }

        // Default — no-op for any other table
        return {
          onConflictDoUpdate:  (_opts: unknown) => Promise.resolve(),
          onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
          returning:           () => Promise.resolve([]),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
        };
      },
    };
  }

  return {
    db: {
      select: (_cols?: unknown) => ({ from: (t: unknown) => makeSelectFrom(t) }),
      insert: (t: unknown) => makeInsert(t),
    },
    // Named table exports used by admin-analytics.ts directly
    vendorsTable:                VENDORS_TBL,
    paymentsTable:               PAYMENTS_TBL,
    salesTable:                  SALES_TBL,
    expensesTable:               EXPENSES_TBL,
    investmentsTable:            INVESTMENTS_TBL,
    pageViewsTable:              PAGE_VIEWS_TBL,
    storeDeveloperAccountsTable: STORE_DEV_TBL,
    adminExportLogsTable:        EXPORT_LOGS_TBL,
    // Used by admin-export-burst.ts (also imported via @workspace/db)
    adminExportAcknowledgmentsTable:    EXPORT_ACK_TBL,
    adminExportBurstSentAlertsTable:    BURST_ALERTS_TBL,
  };
});

// ── drizzle-orm stubs ─────────────────────────────────────────────────────────
vi.mock("drizzle-orm", () => ({
  eq:      (a: unknown, b: unknown) => ({ op: "eq",  a, b }),
  and:     (...args: unknown[])     => ({ op: "and", args }),
  gte:     (a: unknown, b: unknown) => ({ op: "gte", a, b }),
  lte:     (a: unknown, b: unknown) => ({ op: "lte", a, b }),
  asc:     (a: unknown)             => ({ dir: "asc",  a }),
  desc:    (a: unknown)             => ({ dir: "desc", a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => ({ raw: strings.join("?") }),
    { raw: (s: string) => s },
  ),
}));

// ── @clerk/express mock ───────────────────────────────────────────────────────
vi.mock("@clerk/express", () => ({
  // Reads the calling user from a test-controlled header
  getAuth: (req: Request) => ({ userId: (req.headers["x-test-user"] as string) ?? "admin_flagged" }),
}));

// ── ../lib/site-content: threshold = 3, window = 60 min ───────────────────────
vi.mock("../../lib/site-content", () => ({
  getSiteContentBlock: async (_key: string) => ({ threshold: 3, windowMinutes: 60 }),
}));

// ── ../lib/slack: tracked ─────────────────────────────────────────────────────
vi.mock("../../lib/slack", () => ({
  sendSlackAlert: async (_msg: string) => {
    slackAlertsSent++;
  },
}));

// ── ../lib/date-range: fixed range so resolveDateRange never hits real logic ──
vi.mock("../../lib/date-range", () => ({
  resolveDateRange: (_q: unknown) => ({
    from:   new Date("2026-01-01T00:00:00Z"),
    to:     new Date("2026-01-31T23:59:59Z"),
    period: "month",
  }),
}));

// ── ../lib/finance-overview: returns a minimal but well-formed overview ────────
vi.mock("../../lib/finance-overview", () => ({
  computeFinanceOverview: (_sales: unknown[], _expenses: unknown[], _investments: unknown[], _from: Date, _to: Date) => ({
    revenueTrend: [],
    profitAndLoss: {
      totalRevenue:   0,
      totalExpenses:  0,
      netProfit:      0,
    },
    expenseByCategory: [],
    investmentRoi: {
      totalInvested:      0,
      totalCurrentValue:  0,
      overallRoiPercent:  0,
    },
    cashFlowForecast: [],
  }),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

async function buildApp() {
  vi.resetModules();
  const { default: router } = await import("../admin-analytics");
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
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: Record<string, string>; text: string; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      fetch(`http://localhost:${addr.port}${path}`, {
        method: "GET",
        headers,
      })
        .then(async (res) => {
          const text = await res.text();
          let body: unknown = null;
          try { body = JSON.parse(text); } catch { /* CSV — not JSON */ }
          const responseHeaders: Record<string, string> = {};
          res.headers.forEach((val, key) => { responseHeaders[key] = val; });
          server.close();
          resolve({ status: res.status, headers: responseHeaders, text, body });
        })
        .catch((err) => { server.close(); reject(err); });
    });
  });
}

const EXPORT_PATH = "/admin/analytics/finance-rollup/export";
const ADMIN      = "admin_flagged";
const REVIEWER   = "admin_reviewer";
const THRESHOLD  = 3;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("finance-rollup export: burst-detection lifecycle", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    exportLogs     = [];
    nextExportId   = 1;
    ackRow         = null;
    claimedAlerts.clear();
    slackAlertsSent = 0;
    app = await buildApp();
  });

  // ── 1. Below threshold → 200 + CSV ─────────────────────────────────────────
  it("allows exports and returns CSV when the count is below the threshold", async () => {
    // Seed threshold-1 prior logs so the very first live call is still allowed
    for (let i = 0; i < THRESHOLD - 1; i++) {
      exportLogs.push({ id: nextExportId++, adminUserId: ADMIN, exportedAt: new Date(Date.now() - (i + 1) * 1000) });
    }

    const { status, headers } = await callApp(app, EXPORT_PATH, { "x-test-user": ADMIN });

    expect(status).toBe(200);
    expect(headers["content-type"]).toMatch(/text\/csv/i);
  });

  // ── 2. Threshold-th export is served; Slack fires exactly once ─────────────
  it("serves the threshold-th export successfully and fires exactly one Slack alert", async () => {
    // threshold-1 prior exports → the live request is the threshold-th
    for (let i = 0; i < THRESHOLD - 1; i++) {
      exportLogs.push({ id: nextExportId++, adminUserId: ADMIN, exportedAt: new Date(Date.now() - (i + 1) * 1000) });
    }

    const { status } = await callApp(app, EXPORT_PATH, { "x-test-user": ADMIN });
    expect(status).toBe(200);

    // The route logs the export then calls checkExportBurst → one alert
    expect(slackAlertsSent).toBe(1);
  });

  // ── 3. (threshold + 1)-th request → 429 ────────────────────────────────────
  it("returns 429 with the expected error message on the request after the threshold is crossed", async () => {
    // Seed exactly threshold prior exports so the current request is blocked
    for (let i = 0; i < THRESHOLD; i++) {
      exportLogs.push({ id: nextExportId++, adminUserId: ADMIN, exportedAt: new Date(Date.now() - (i + 1) * 1000) });
    }

    const { status, body } = await callApp(app, EXPORT_PATH, { "x-test-user": ADMIN });

    expect(status).toBe(429);
    const err = body as Record<string, unknown>;
    expect(typeof err.error).toBe("string");
    expect((err.error as string).toLowerCase()).toMatch(/paused|frequent|export/i);
    expect(err.threshold).toBe(THRESHOLD);
  });

  // ── 4. Extra exports beyond threshold send no additional Slack alerts ────────
  it("does not send a second Slack alert when more than threshold+1 exports are attempted", async () => {
    // Seed threshold-1 prior logs so the first live call is the threshold-th
    for (let i = 0; i < THRESHOLD - 1; i++) {
      exportLogs.push({ id: nextExportId++, adminUserId: ADMIN, exportedAt: new Date(Date.now() - (i + 1) * 1000) });
    }

    // Threshold-th request → succeeds + fires Slack
    const first = await callApp(app, EXPORT_PATH, { "x-test-user": ADMIN });
    expect(first.status).toBe(200);
    expect(slackAlertsSent).toBe(1);

    // All subsequent attempts are blocked (429) and must not send more Slack alerts
    for (let extra = 0; extra < 3; extra++) {
      const r = await callApp(app, EXPORT_PATH, { "x-test-user": ADMIN });
      expect(r.status).toBe(429);
    }

    expect(slackAlertsSent).toBe(1); // still exactly one
  });

  // ── 5. Acknowledge clears the burst → subsequent exports are allowed ─────────
  it("unblocks the admin after another admin acknowledges the flag", async () => {
    // Seed enough prior exports to be mid-burst
    const crossingAt = new Date(Date.now() - 5_000);
    for (let i = 0; i < THRESHOLD; i++) {
      exportLogs.push({
        id:            nextExportId++,
        adminUserId:   ADMIN,
        exportedAt:    new Date(crossingAt.getTime() - i * 1000),
      });
    }

    // Confirm blocked before acknowledgment
    const blocked = await callApp(app, EXPORT_PATH, { "x-test-user": ADMIN });
    expect(blocked.status).toBe(429);

    // Reviewer acknowledges: set ackRow to a time AFTER the crossing export
    ackRow = {
      adminUserId:    ADMIN,
      acknowledgedAt: new Date(crossingAt.getTime() + 1_000),
    };

    // Should no longer be blocked
    const cleared = await callApp(app, EXPORT_PATH, { "x-test-user": ADMIN });
    expect(cleared.status).toBe(200);
  });

  // ── 6. Non-admin is rejected with 403 ───────────────────────────────────────
  it("rejects a non-admin user with 403", async () => {
    const { status } = await callApp(app, EXPORT_PATH, { "x-test-user": "random_user" });
    expect(status).toBe(403);
  });

  // ── 7. Old ack before the crossing export does NOT clear the burst ───────────
  it("keeps the admin blocked when the acknowledgment predates the crossing export", async () => {
    const oldAckAt = new Date(Date.now() - 20_000);
    ackRow = { adminUserId: ADMIN, acknowledgedAt: oldAckAt };

    // Place crossing export AFTER the ack so the ack doesn't clear it
    for (let i = 0; i < THRESHOLD; i++) {
      exportLogs.push({
        id:          nextExportId++,
        adminUserId: ADMIN,
        exportedAt:  new Date(oldAckAt.getTime() + (i + 1) * 1_000),
      });
    }

    const { status } = await callApp(app, EXPORT_PATH, { "x-test-user": ADMIN });
    expect(status).toBe(429);
  });
});
