/**
 * Task #222: Confirm a different admin can always clear a flagged export even
 * when both admins are online at the same time.
 *
 * Covers:
 *  1. Admin A cannot acknowledge their own flag (self-acknowledge guard → 403).
 *  2. Admin B can acknowledge Admin A's flag while Admin A's session is also
 *     live (concurrent-review path).
 *  3. Both requests reaching the server in parallel (Promise.all) still allows
 *     Admin B to succeed and Admin A to be rejected — neither blocks the other
 *     from completing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

// Two admins are both listed so both sessions pass the isAdmin check.
// Admin A is the flagged admin; Admin B is the reviewer.
const ADMIN_A = "user_admin_a";
const ADMIN_B = "user_admin_b";

process.env.ADMIN_USER_IDS = `${ADMIN_A},${ADMIN_B}`;

// ── Mock @clerk/express ────────────────────────────────────────────────────────
// getAuth reads the requester's identity from an x-test-user header so we can
// control which admin session a request belongs to.
vi.mock("@clerk/express", () => ({
  getAuth: (req: Request) => ({
    userId: (req.headers["x-test-user"] as string) ?? ADMIN_B,
  }),
  clerkClient: {
    users: {
      getUser: async (id: string) => ({
        firstName: id === ADMIN_B ? "Admin" : "Flagged",
        lastName: id === ADMIN_B ? "Bee" : "Aye",
        username: null,
        primaryEmailAddress: { emailAddress: `${id}@example.com` },
        emailAddresses: [{ emailAddress: `${id}@example.com` }],
      }),
    },
  },
}));

// ── Mock @workspace/db ─────────────────────────────────────────────────────────
// Tracks the latest upserted acknowledgment and the append-only log.
let latestAcknowledgment: Record<string, unknown> | null = null;
let logRows: Array<Record<string, unknown>> = [];
let nextLogId = 1;

// Export-log rows for Admin A (simulates an existing burst above threshold)
const adminAExportLogs = [
  { id: 1, adminUserId: ADMIN_A, exportedAt: new Date(Date.now() - 60_000) },
  { id: 2, adminUserId: ADMIN_A, exportedAt: new Date(Date.now() - 50_000) },
  { id: 3, adminUserId: ADMIN_A, exportedAt: new Date(Date.now() - 40_000) },
  { id: 4, adminUserId: ADMIN_A, exportedAt: new Date(Date.now() - 30_000) },
  { id: 5, adminUserId: ADMIN_A, exportedAt: new Date(Date.now() - 20_000) },
];

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (_cond: unknown) => {
          // adminExportAcknowledgmentsTable lookup (block-check)
          if (table === "adminExportAcknowledgmentsTable") {
            return Promise.resolve(
              latestAcknowledgment ? [latestAcknowledgment] : [],
            );
          }
          // adminExportAcknowledgmentLogTable lookup (history)
          if (table === "adminExportAcknowledgmentLogTable") {
            return {
              orderBy: () =>
                Promise.resolve(
                  [...logRows].sort(
                    (a, b) => (b.id as number) - (a.id as number),
                  ),
                ),
            };
          }
          // adminExportLogsTable lookup (burst detection)
          if (table === "adminExportLogsTable") {
            // Return all rows regardless of where-condition — sufficient for
            // the acknowledge route tests (they don't call getExportBurstStatus).
            return {
              orderBy: () => ({
                limit: () =>
                  Promise.resolve(
                    adminAExportLogs.sort(
                      (a, b) => b.exportedAt.getTime() - a.exportedAt.getTime(),
                    ),
                  ),
              }),
            };
          }
          return Promise.resolve([]);
        },
        // For the export-alert listing query that uses .groupBy().having()
        groupBy: () => ({
          having: () => Promise.resolve([]),
        }),
        orderBy: () => Promise.resolve([]),
      }),
    }),
    insert: (table: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        if (table === "adminExportAcknowledgmentsTable") {
          return {
            onConflictDoUpdate: ({
              set,
            }: {
              set: Record<string, unknown>;
            }) => {
              latestAcknowledgment = {
                ...(latestAcknowledgment ?? {}),
                ...vals,
                ...set,
              };
              return Promise.resolve();
            },
          };
        }
        if (table === "adminExportAcknowledgmentLogTable") {
          logRows.push({ id: nextLogId++, ...vals });
          return Promise.resolve();
        }
        // adminExportBurstSentAlertsTable / adminExportLogsTable
        return {
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve([]),
          }),
        };
      },
    }),
  },
}));

// ── Mock @workspace/db/schema ──────────────────────────────────────────────────
vi.mock("@workspace/db/schema", () => ({
  vendorsTable: {},
  vendorPaymentCredentialsTable: {},
  birthdayMessageLogsTable: {},
  voiceCallLogsTable: {},
  adminAuditLogTable: {},
  adminExportLogsTable: "adminExportLogsTable",
  adminExportAcknowledgmentsTable: "adminExportAcknowledgmentsTable",
  adminExportAcknowledgmentLogTable: "adminExportAcknowledgmentLogTable",
  adminExportBurstSentAlertsTable: "adminExportBurstSentAlertsTable",
  voiceCampaignsTable: {},
  voiceCampaignCallsTable: {},
  voiceSignatureFailuresTable: {},
  voiceSignatureFailureAcknowledgmentsTable:
    "voiceSignatureFailureAcknowledgmentsTable",
  voiceSignatureFailureAcknowledgmentLogTable:
    "voiceSignatureFailureAcknowledgmentLogTable",
  vendorNotificationsTable: {},
  paymentsTable: {},
}));

// ── Mock drizzle-orm ───────────────────────────────────────────────────────────
vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  desc: (col: unknown) => ({ desc: col }),
  asc: (col: unknown) => ({ asc: col }),
  and: (...args: unknown[]) => ({ and: args }),
  gte: (col: unknown, val: unknown) => ({ gte: [col, val] }),
  lte: (col: unknown, val: unknown) => ({ lte: [col, val] }),
  gt: (col: unknown, val: unknown) => ({ gt: [col, val] }),
  inArray: (col: unknown, vals: unknown[]) => ({ inArray: [col, vals] }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings,
      values,
    }),
    { raw: (s: string) => s },
  ),
}));

// ── Stub out unrelated dependencies ──────────────────────────────────────────
vi.mock("../../lib/voice-caller", () => ({ isTwilioConfigured: () => false }));
vi.mock("../../lib/vendor-keys", () => ({ canAddPaymentKeys: () => false }));
vi.mock("../../lib/site-content", () => ({
  getSiteContent: async () => ({}),
  getSiteContentBlock: async (key: string) => {
    if (key === "admin.voiceSignatureFailureAlertSettings")
      return { threshold: 5, windowMinutes: 15 };
    return { threshold: 5, windowMinutes: 15 };
  },
  setSiteContentBlock: async () => {},
  getSiteContentAuditLog: async () => [],
  validateSiteContentBlock: (_key: string, v: unknown) => v,
  SITE_CONTENT_KEYS: ["admin.exportAlertSettings"],
}));
vi.mock("../../lib/birthday-scheduler", () => ({
  resendBirthdayEmail: async () => ({ ok: true }),
  retryBirthdayCall: async () => ({ ok: true }),
}));
vi.mock("../voice-campaigns", () => ({
  retryCampaignCall: async () => ({ ok: true }),
  retryAllFailedCampaignCalls: async () => ({ ok: true }),
}));
vi.mock("../../lib/slack", () => ({ sendSlackAlert: async () => {} }));
vi.mock("../../lib/voice-backfill", () => ({
  runVoiceBackfill: async () => ({}),
  getVoiceBackfillLastRun: async () => ({}),
  getVoiceBackfillRecentFixes: async () => [],
}));
vi.mock("../../lib/sales-sync", () => ({ syncSaleFromPayment: async () => {} }));
vi.mock("../../lib/push", () => ({
  notifyVendorPaymentStatus: async () => {},
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<express.Express> {
  vi.resetModules();
  const { default: router } = await import("../admin");
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(
    (
      err: unknown,
      _req: Request,
      res: Response,
      _next: (e?: unknown) => void,
    ) => {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Internal error" });
    },
  );
  return app;
}

/**
 * Fire one HTTP request against an already-listening server, identifying the
 * caller via the x-test-user header.
 */
function request(
  baseUrl: string,
  method: string,
  path: string,
  callerUserId?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (callerUserId) headers["x-test-user"] = callerUserId;
  return fetch(`${baseUrl}${path}`, { method, headers }).then(async (res) => {
    let body: Record<string, unknown> = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    return { status: res.status, body };
  });
}

/** Wrap an express app in a real HTTP server and return its base URL. */
function startServer(
  app: express.Express,
): Promise<{ baseUrl: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      resolve({
        baseUrl: `http://localhost:${addr.port}`,
        close: () => server.close(),
      });
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("export-burst concurrent-acknowledgment guard", () => {
  beforeEach(() => {
    latestAcknowledgment = null;
    logRows = [];
    nextLogId = 1;
  });

  // ── 1. Self-acknowledge guard ──────────────────────────────────────────────

  it("returns 403 when Admin A attempts to acknowledge their own export-burst flag directly via the API", async () => {
    const app = await buildApp();
    const { baseUrl, close } = await startServer(app);
    try {
      // Admin A is the caller AND the target — same userId in both request
      // header and URL param.
      const { status, body } = await request(
        baseUrl,
        "POST",
        `/admin/export-alerts/${ADMIN_A}/acknowledge`,
        ADMIN_A, // caller = Admin A (the flagged admin)
      );
      expect(status).toBe(403);
      expect((body.error as string).toLowerCase()).toMatch(
        /cannot acknowledge your own/,
      );
    } finally {
      close();
    }
  });

  // ── 2. Cross-admin acknowledgment while both sessions are live ─────────────

  it("Admin B can acknowledge Admin A's flag while Admin A is simultaneously making authenticated requests", async () => {
    const app = await buildApp();
    const { baseUrl, close } = await startServer(app);
    try {
      // Both admins are "online": Admin A fires an authenticated request
      // (attempting — and being denied — self-acknowledgment) at exactly the
      // same moment that Admin B fires the legitimate cross-acknowledgment.
      // Neither should block the other from completing.
      const [aResult, bResult] = await Promise.all([
        request(
          baseUrl,
          "POST",
          `/admin/export-alerts/${ADMIN_A}/acknowledge`,
          ADMIN_A, // Admin A → self-acknowledge → must be rejected
        ),
        request(
          baseUrl,
          "POST",
          `/admin/export-alerts/${ADMIN_A}/acknowledge`,
          ADMIN_B, // Admin B → cross-acknowledge → must succeed
        ),
      ]);

      // Admin A's self-attempt must be rejected.
      expect(aResult.status).toBe(403);
      expect((aResult.body.error as string).toLowerCase()).toMatch(
        /cannot acknowledge your own/,
      );

      // Admin B's cross-acknowledge must succeed regardless of Admin A's
      // concurrent request.
      expect(bResult.status).toBe(200);
      expect(bResult.body.success).toBe(true);
    } finally {
      close();
    }
  });

  // ── 3. Acknowledgment recorded after cross-admin review ──────────────────

  it("the acknowledgment row is written with Admin B as the reviewer, not Admin A", async () => {
    const app = await buildApp();
    const { baseUrl, close } = await startServer(app);
    try {
      await request(
        baseUrl,
        "POST",
        `/admin/export-alerts/${ADMIN_A}/acknowledge`,
        ADMIN_B,
      );

      // The upserted acknowledgment must record the reviewer (Admin B), not
      // the flagged admin (Admin A).
      expect(latestAcknowledgment).not.toBeNull();
      expect(latestAcknowledgment!.adminUserId).toBe(ADMIN_A);
      expect(latestAcknowledgment!.acknowledgedBy).toBe(ADMIN_B);

      // The append-only log must also carry the correct attribution.
      expect(logRows).toHaveLength(1);
      expect(logRows[0].adminUserId).toBe(ADMIN_A);
      expect(logRows[0].acknowledgedBy).toBe(ADMIN_B);
    } finally {
      close();
    }
  });

  // ── 4. Repeated concurrent attempts by Admin B all succeed independently ──

  it("two simultaneous acknowledge requests from Admin B both complete without corrupting state", async () => {
    const app = await buildApp();
    const { baseUrl, close } = await startServer(app);
    try {
      const [r1, r2] = await Promise.all([
        request(
          baseUrl,
          "POST",
          `/admin/export-alerts/${ADMIN_A}/acknowledge`,
          ADMIN_B,
        ),
        request(
          baseUrl,
          "POST",
          `/admin/export-alerts/${ADMIN_A}/acknowledge`,
          ADMIN_B,
        ),
      ]);

      // Both requests must succeed — the second upsert is idempotent.
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);

      // Two log rows should exist (one per request), confirming both were
      // processed, while the upsert keeps only the latest "latest ack" row.
      expect(logRows).toHaveLength(2);
      expect(logRows.every((r) => r.acknowledgedBy === ADMIN_B)).toBe(true);
    } finally {
      close();
    }
  });
});
