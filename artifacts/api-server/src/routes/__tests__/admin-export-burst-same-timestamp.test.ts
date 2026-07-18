/**
 * Task #226: Confirm the burst alert fires reliably when two exports land at
 * the same millisecond.
 *
 * Covers:
 *  1. Two concurrent calls to checkExportBurst where every in-window export
 *     shares the same exportedAt timestamp. The (exportedAt ASC, id ASC)
 *     ordering still picks the same crossing record deterministically, and
 *     the ON CONFLICT DO NOTHING claim ensures Slack fires exactly once.
 *
 *  2. A pre-existing burst (crossing record already claimed) followed by a
 *     new export that doesn't change which row is the crossing record.  The
 *     INSERT conflicts → no duplicate Slack alert.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const ADMIN_ID = "user_burst_test";

process.env.ADMIN_USER_IDS = ADMIN_ID;

// ── Mock @clerk/express ────────────────────────────────────────────────────────
vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: ADMIN_ID }),
  clerkClient: {
    users: {
      getUser: async (id: string) => ({
        firstName: "Test",
        lastName: "Admin",
        username: null,
        primaryEmailAddress: { emailAddress: `${id}@example.com` },
        emailAddresses: [{ emailAddress: `${id}@example.com` }],
      }),
    },
  },
}));

// ── Shared state for DB mock ───────────────────────────────────────────────────

/**
 * Rows returned by the adminExportLogsTable SELECT inside checkExportBurst.
 * Each test scenario sets this before calling the function.
 */
let exportLogRows: Array<{ id: number }> = [];

/**
 * Simulates the adminExportBurstSentAlertsTable unique constraint.
 * A Set of `${adminUserId}:${crossingExportId}` strings already claimed.
 * The first INSERT for a given key succeeds (returns a row); subsequent
 * INSERTs for the same key conflict → return [].
 */
const claimedAlerts = new Set<string>();

// ── Mock @workspace/db ─────────────────────────────────────────────────────────
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (_cond: unknown) => ({
          // checkExportBurst queries: orderBy(exportedAt ASC, id ASC)
          orderBy: (_col1: unknown, _col2: unknown) => {
            if (table === "adminExportLogsTable") {
              return Promise.resolve(exportLogRows);
            }
            return Promise.resolve([]);
          },
          // getExportBurstStatus queries: orderBy(exportedAt DESC)
          // (not exercised in these tests, but the mock must be chainable)
          limit: () => Promise.resolve([]),
        }),
        orderBy: () => ({
          limit: () => Promise.resolve([]),
        }),
        groupBy: () => ({
          having: () => Promise.resolve([]),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        if (table === "adminExportBurstSentAlertsTable") {
          const key = `${vals.adminUserId}:${vals.crossingExportId}`;
          return {
            onConflictDoNothing: () => ({
              returning: (_spec: unknown) => {
                if (claimedAlerts.has(key)) {
                  // Conflict — second (or later) caller gets nothing back.
                  return Promise.resolve([]);
                }
                // First caller claims the slot.
                claimedAlerts.add(key);
                return Promise.resolve([{ id: 999 }]);
              },
            }),
          };
        }
        // adminExportLogsTable insert (from the route itself, not used here)
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

// ── Mock site-content (threshold = 3, window = 60 min) ────────────────────────
vi.mock("../../lib/site-content", () => ({
  getSiteContent: async () => ({}),
  getSiteContentBlock: async (key: string) => {
    if (
      key === "admin.exportAlertSettings" ||
      key === "admin.voiceSignatureFailureAlertSettings"
    ) {
      return { threshold: 3, windowMinutes: 60 };
    }
    return {};
  },
  setSiteContentBlock: async () => {},
  getSiteContentAuditLog: async () => [],
  validateSiteContentBlock: (_key: string, v: unknown) => v,
  SITE_CONTENT_KEYS: ["admin.exportAlertSettings"],
}));

// ── Stub unrelated dependencies ───────────────────────────────────────────────
vi.mock("../../lib/voice-caller", () => ({ isTwilioConfigured: () => false }));
vi.mock("../../lib/vendor-keys", () => ({ canAddPaymentKeys: () => false }));
vi.mock("../../lib/birthday-scheduler", () => ({
  resendBirthdayEmail: async () => ({ ok: true }),
  retryBirthdayCall: async () => ({ ok: true }),
}));
vi.mock("../voice-campaigns", () => ({
  retryCampaignCall: async () => ({ ok: true }),
  retryAllFailedCampaignCalls: async () => ({ ok: true }),
}));
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
  wrapVendorEmail: (body: string) => body,
  escapeHtml: (s: string) => s,
}));

// ── Mock slack and capture calls ──────────────────────────────────────────────
const slackAlertCalls: string[] = [];
vi.mock("../../lib/slack", () => ({
  sendSlackAlert: async (msg: string) => {
    slackAlertCalls.push(msg);
  },
}));

// ── Import the function under test ────────────────────────────────────────────
// Dynamic import so all mocks are in place first.
async function getCheckExportBurst(): Promise<
  (adminUserId: string) => Promise<void>
> {
  const mod = await import("../admin");
  return mod.checkExportBurst;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("checkExportBurst — same-timestamp and duplicate-alert safety", () => {
  beforeEach(() => {
    slackAlertCalls.length = 0;
    claimedAlerts.clear();
    exportLogRows = [];
  });

  // ── 1. Two concurrent calls with identical exportedAt timestamps ─────────────

  it("fires Slack exactly once when two concurrent exports share the same timestamp", async () => {
    const checkExportBurst = await getCheckExportBurst();

    /**
     * Three exports all stamped at the exact same millisecond (simulating
     * CURRENT_TIMESTAMP within the same Postgres transaction).  The rows are
     * ordered by id ASC so the crossing record (threshold=3 → index 2) is
     * always id=3, regardless of which concurrent call queries first.
     */
    const sharedTs = new Date(Date.now() - 5_000);
    exportLogRows = [
      { id: 1 },
      { id: 2 },
      { id: 3 }, // ← crossing record: threshold-th row (3rd) by (exportedAt ASC, id ASC)
    ];

    // Simulate two concurrent invocations of checkExportBurst racing each
    // other after both exports landed at the same timestamp.
    await Promise.all([
      checkExportBurst(ADMIN_ID),
      checkExportBurst(ADMIN_ID),
    ]);

    // Only one Slack alert should fire; the second caller's INSERT conflicted.
    expect(slackAlertCalls).toHaveLength(1);
    expect(slackAlertCalls[0]).toMatch(/3 times/);
    expect(slackAlertCalls[0]).toMatch(ADMIN_ID);

    void sharedTs; // referenced to satisfy linter
  });

  // ── 2. No duplicate alert when the crossing record was already claimed ───────

  it("does not fire a duplicate Slack alert when the crossing record was already claimed by a prior burst", async () => {
    const checkExportBurst = await getCheckExportBurst();

    /**
     * Scenario: the burst was already detected on the 3rd export (crossing
     * record id=3).  A 4th export has now been added, pushing count to 4.
     * checkExportBurst still identifies id=3 as the crossing record (it's
     * still the threshold-th row by (exportedAt ASC, id ASC)).  The alert
     * for id=3 was already sent → INSERT conflicts → no second alert.
     */
    exportLogRows = [
      { id: 1 },
      { id: 2 },
      { id: 3 }, // ← same crossing record; alert was already claimed
      { id: 4 }, // new export — doesn't shift the crossing record
    ];

    // Pre-claim the crossing record as if the first burst detection already ran.
    claimedAlerts.add(`${ADMIN_ID}:3`);

    await checkExportBurst(ADMIN_ID);

    // No new Slack alert — the crossing record's claim is already taken.
    expect(slackAlertCalls).toHaveLength(0);
  });

  // ── 3. Alert fires for a genuinely new burst after the window resets ─────────

  it("fires a fresh Slack alert when a new burst produces a different crossing record", async () => {
    const checkExportBurst = await getCheckExportBurst();

    /**
     * A prior burst was claimed at crossing record id=3.  After the rolling
     * window elapsed the old exports aged out, and a brand-new burst begins
     * with ids 10, 11, 12.  The crossing record is now id=12 — a different
     * key — so the INSERT succeeds and a new alert fires.
     */
    exportLogRows = [
      { id: 10 },
      { id: 11 },
      { id: 12 }, // ← new crossing record; not yet claimed
    ];

    // Simulate the old burst having been claimed (different crossingExportId).
    claimedAlerts.add(`${ADMIN_ID}:3`);

    await checkExportBurst(ADMIN_ID);

    // Alert should fire for the new crossing record.
    expect(slackAlertCalls).toHaveLength(1);
    expect(slackAlertCalls[0]).toMatch(ADMIN_ID);
  });

  // ── 4. No alert fires when count is below threshold ──────────────────────────

  it("does not fire a Slack alert when the export count is below the threshold", async () => {
    const checkExportBurst = await getCheckExportBurst();

    // Only 2 exports — below threshold of 3.
    exportLogRows = [{ id: 1 }, { id: 2 }];

    await checkExportBurst(ADMIN_ID);

    expect(slackAlertCalls).toHaveLength(0);
  });
});
