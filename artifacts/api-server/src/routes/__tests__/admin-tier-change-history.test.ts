/**
 * Tests for GET /admin/tier-change-history:
 *  - auth gating (401 unauthenticated, 403 non-admin)
 *  - filters to vendor_notifications rows that are real tier changes
 *    (type="tier_change" with structured previousTier/newTier set),
 *    excluding a verification-level "tier_change"-typed row without those
 *    fields and an unrelated "general" notification
 *  - joins in the vendor's name
 *  - tie-breaker: two entries at the same timestamp appear exactly once
 *    across pages (no skips or duplicates at the page boundary)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";

process.env.ADMIN_USER_IDS = "user_admin";

vi.mock("@clerk/express", () => ({
  getAuth: (req: Request) => ({ userId: (req.headers["x-test-user"] as string) ?? undefined }),
  clerkClient: { users: { getUser: async () => ({}) } },
}));

type NotificationRow = {
  id: number;
  vendorId: number;
  type: string;
  previousTier: string | null;
  newTier: string | null;
  message: string;
  createdAt: string;
};

type VendorRow = { id: number; name: string };

let notificationRows: NotificationRow[] = [];
let vendorRows: VendorRow[] = [];

const vendorNotificationsTableRef = {
  id: "vn.id",
  vendorId: "vn.vendorId",
  type: "vn.type",
  previousTier: "vn.previousTier",
  newTier: "vn.newTier",
  message: "vn.message",
  createdAt: "vn.createdAt",
};
const vendorsTableRef = { id: "v.id", name: "v.name" };

function getValue(col: unknown, notifRow: NotificationRow, vendorRow: VendorRow | undefined): unknown {
  if (typeof col !== "string") return undefined;
  if (col.startsWith("vn.")) return (notifRow as unknown as Record<string, unknown>)[col.slice(3)];
  if (col.startsWith("v.")) return vendorRow ? (vendorRow as unknown as Record<string, unknown>)[col.slice(2)] : undefined;
  return undefined;
}

function evaluateCondition(cond: unknown, notifRow: NotificationRow, vendorRow: VendorRow | undefined): boolean {
  const c = cond as Record<string, unknown>;
  if (Array.isArray(c.and)) {
    return (c.and as unknown[]).every((sub) => evaluateCondition(sub, notifRow, vendorRow));
  }
  if (Array.isArray(c.eq)) {
    const [col, val] = c.eq as [unknown, unknown];
    return getValue(col, notifRow, vendorRow) === val;
  }
  if (Array.isArray(c.values)) {
    // sql`${col} IS NOT NULL` — the only raw-sql condition this route uses.
    const col = (c.values as unknown[])[0];
    const v = getValue(col, notifRow, vendorRow);
    return v !== null && v !== undefined;
  }
  return true;
}

/**
 * Sort matching rows: primary DESC by createdAt, secondary DESC by id —
 * mirrors the tie-breaker orderBy the route applies.
 */
function sortRows(rows: NotificationRow[]): NotificationRow[] {
  return [...rows].sort((a, b) => {
    const tDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (tDiff !== 0) return tDiff;
    return b.id - a.id; // tie-breaker: higher id first (DESC)
  });
}

// ── Mock @workspace/db ────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: {
    select: (_fields: unknown) => ({
      from: (_table: unknown) => ({
        // Path used by the count query (no leftJoin).
        where: (whereCond: unknown) => {
          const filtered = notificationRows.filter((n) =>
            evaluateCondition(whereCond, n, vendorRows.find((v) => v.id === n.vendorId)),
          );
          return Promise.resolve([{ count: filtered.length }]);
        },
        // Path used by the data query (with leftJoin).
        leftJoin: (_joinTable: unknown, _onCond: unknown) => ({
          where: (whereCond: unknown) => {
            const filtered = notificationRows.filter((n) =>
              evaluateCondition(whereCond, n, vendorRows.find((v) => v.id === n.vendorId)),
            );
            const sorted = sortRows(filtered);
            return {
              orderBy: (..._args: unknown[]) => ({
                limit: (n: number) => ({
                  offset: (skip: number) =>
                    Promise.resolve(
                      sorted.slice(skip, skip + n).map((r) => ({
                        id: r.id,
                        vendorId: r.vendorId,
                        vendorName: vendorRows.find((v) => v.id === r.vendorId)?.name ?? null,
                        previousTier: r.previousTier,
                        newTier: r.newTier,
                        message: r.message,
                        createdAt: r.createdAt,
                      })),
                    ),
                }),
              }),
            };
          },
        }),
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  vendorsTable: vendorsTableRef,
  vendorPaymentCredentialsTable: {},
  birthdayMessageLogsTable: {},
  voiceCallLogsTable: {},
  adminAuditLogTable: {},
  adminExportLogsTable: {},
  adminExportAcknowledgmentsTable: {},
  adminExportAcknowledgmentLogTable: {},
  adminExportBurstSentAlertsTable: {},
  voiceCampaignsTable: {},
  voiceCampaignCallsTable: {},
  voiceSignatureFailuresTable: {},
  voiceSignatureFailureAcknowledgmentsTable: {},
  voiceSignatureFailureAcknowledgmentLogTable: {},
  vendorNotificationsTable: vendorNotificationsTableRef,
  paymentsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  desc: (col: unknown) => ({ desc: col }),
  and: (...args: unknown[]) => ({ and: args }),
  gte: (col: unknown, val: unknown) => ({ gte: [col, val] }),
  lte: (col: unknown, val: unknown) => ({ lte: [col, val] }),
  gt: (col: unknown, val: unknown) => ({ gt: [col, val] }),
  asc: (col: unknown) => ({ asc: col }),
  inArray: (col: unknown, vals: unknown[]) => ({ inArray: [col, vals] }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings, values }),
    { raw: (s: string) => s },
  ),
}));

vi.mock("../../lib/voice-caller", () => ({ isTwilioConfigured: () => true }));
vi.mock("../../lib/vendor-keys", () => ({ canAddPaymentKeys: () => false }));
vi.mock("../../lib/site-content", () => ({
  getSiteContent: async () => ({}),
  getSiteContentBlock: async () => ({ threshold: 5, windowMinutes: 15 }),
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
  sendPushToVendor: async () => {},
}));
vi.mock("../../lib/mailer", () => ({ sendEmail: async () => {} }));
vi.mock("../../lib/email-branding", () => ({
  wrapVendorEmail: (_opts: unknown, body: string) => body,
  escapeHtml: (s: string) => s,
}));

async function buildApp() {
  vi.resetModules();
  const { default: router } = await import("../admin");
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
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      fetch(`http://localhost:${addr.port}${path}`, { headers })
        .then(async (res) => {
          const text = await res.text();
          let json: unknown = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          server.close();
          resolve({ status: res.status, body: json });
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

describe("GET /admin/tier-change-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationRows = [];
    vendorRows = [];
  });

  it("rejects unauthenticated requests with 401", async () => {
    const app = await buildApp();
    const { status } = await callApp(app, "/admin/tier-change-history");
    expect(status).toBe(401);
  });

  it("rejects non-admin users with 403", async () => {
    const app = await buildApp();
    const { status } = await callApp(app, "/admin/tier-change-history", { "x-test-user": "user_someone_else" });
    expect(status).toBe(403);
  });

  it("returns only real tier-change rows, joined with the vendor name", async () => {
    vendorRows = [{ id: 42, name: "Acme Co" }];
    notificationRows = [
      {
        id: 1,
        vendorId: 42,
        type: "tier_change",
        previousTier: "starter",
        newTier: "pro",
        message: "Your plan changed from Starter to Pro.",
        createdAt: "2026-07-10T00:00:00.000Z",
      },
      // A verification-level edit reuses the "tier_change" type historically
      // but carries no structured previousTier/newTier — must be excluded.
      {
        id: 2,
        vendorId: 42,
        type: "tier_change",
        previousTier: null,
        newTier: null,
        message: "Verification level updated.",
        createdAt: "2026-07-11T00:00:00.000Z",
      },
      // An unrelated notification type — must be excluded.
      {
        id: 3,
        vendorId: 42,
        type: "general",
        previousTier: "starter",
        newTier: "pro",
        message: "Some other notice.",
        createdAt: "2026-07-12T00:00:00.000Z",
      },
    ];

    const app = await buildApp();
    const { status, body } = await callApp(app, "/admin/tier-change-history", { "x-test-user": "user_admin" });

    expect(status).toBe(200);
    const { data: rows } = body as { data: Array<Record<string, unknown>>; page: number; pageSize: number; total: number };
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 1,
      vendorId: 42,
      vendorName: "Acme Co",
      previousTier: "starter",
      newTier: "pro",
    });
  });

  it("orders results newest first", async () => {
    vendorRows = [{ id: 1, name: "Vendor One" }];
    notificationRows = [
      {
        id: 10,
        vendorId: 1,
        type: "tier_change",
        previousTier: "free",
        newTier: "starter",
        message: "older",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: 11,
        vendorId: 1,
        type: "tier_change",
        previousTier: "starter",
        newTier: "pro",
        message: "newer",
        createdAt: "2026-07-14T00:00:00.000Z",
      },
    ];

    const app = await buildApp();
    const { status, body } = await callApp(app, "/admin/tier-change-history", { "x-test-user": "user_admin" });

    expect(status).toBe(200);
    const { data: rows } = body as { data: Array<Record<string, unknown>>; page: number; pageSize: number; total: number };
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(11);
    expect(rows[1].id).toBe(10);
  });

  it("returns both same-timestamp entries exactly once when paging with pageSize=1", async () => {
    // Two tier-change notifications inserted at the exact same timestamp.
    // Without a tie-breaker, the DESC-by-createdAt order is non-deterministic
    // and a page boundary could skip or repeat one entry. With the secondary
    // DESC-by-id sort the order is always id=20 first, then id=19.
    vendorRows = [{ id: 5, name: "Tie Vendor" }];
    const sharedTimestamp = "2026-07-20T12:00:00.000Z";
    notificationRows = [
      {
        id: 19,
        vendorId: 5,
        type: "tier_change",
        previousTier: "free",
        newTier: "starter",
        message: "First simultaneous change.",
        createdAt: sharedTimestamp,
      },
      {
        id: 20,
        vendorId: 5,
        type: "tier_change",
        previousTier: "starter",
        newTier: "pro",
        message: "Second simultaneous change.",
        createdAt: sharedTimestamp,
      },
    ];

    const app = await buildApp();

    // Page 1 — should return the higher-id entry first (tie-breaker: id DESC).
    const { status: s1, body: b1 } = await callApp(
      app,
      "/admin/tier-change-history?page=1&pageSize=1",
      { "x-test-user": "user_admin" },
    );
    expect(s1).toBe(200);
    const page1 = b1 as { data: Array<Record<string, unknown>>; total: number };
    expect(page1.total).toBe(2);
    expect(page1.data).toHaveLength(1);
    expect(page1.data[0].id).toBe(20);

    // Page 2 — should return the lower-id entry (no skip, no repeat).
    const { status: s2, body: b2 } = await callApp(
      app,
      "/admin/tier-change-history?page=2&pageSize=1",
      { "x-test-user": "user_admin" },
    );
    expect(s2).toBe(200);
    const page2 = b2 as { data: Array<Record<string, unknown>>; total: number };
    expect(page2.total).toBe(2);
    expect(page2.data).toHaveLength(1);
    expect(page2.data[0].id).toBe(19);

    // Confirm the two pages together cover both entries exactly once.
    const allIds = [page1.data[0].id, page2.data[0].id];
    expect(allIds).toEqual(expect.arrayContaining([19, 20]));
    expect(new Set(allIds).size).toBe(2);
  });
});
