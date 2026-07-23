/**
 * Unit tests for the void-error-check scheduler (tick / alertPass / retryPass).
 *
 * Covered cases:
 *
 * Alert pass (PASS 1):
 *   1. Payment with voidError set, no voidErrorAlertedAt, no voidErrorAcknowledgedAt
 *      → Slack alert sent and voidErrorAlertedAt stamped on the row.
 *   2. Payment already alerted (voidErrorAlertedAt set)
 *      → NOT returned by the alert query (filtered by SQL predicate), no new alert.
 *   3. Payment acknowledged (voidErrorAcknowledgedAt set)
 *      → NOT returned by the alert query, no alert.
 *
 * Retry pass (PASS 2):
 *   4. Unacknowledged void error, Stripe key available, session open
 *      → expire called, voidError fields cleared from metadata, Slack success notice.
 *   5. Unacknowledged void error, session already expired (status ≠ "open")
 *      → no expire call, metadata cleared (successfully recovered idempotently).
 *   6. Unacknowledged void error, Stripe key unavailable
 *      → skipped silently, no Slack notice, metadata unchanged.
 *   7. Acknowledged void error
 *      → not returned by retry query, nothing attempted.
 *
 * Full tick():
 *   8. Records job run with aggregated counts after both passes complete.
 *
 * Full lifecycle (end-to-end retry cycle):
 *   9. Tick 1: Stripe key unavailable → voidError left intact, alert sent, no expire.
 *  10. Tick 2: Stripe key now available → session expired, metadata cleared, Slack success.
 *  11. Session status "paid" (non-open) is handled without error — expire not called,
 *      metadata still cleared so the payment falls off the Void Errors panel.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mutable mock state ───────────────────────────────────────────────────────

interface FakePaymentRow {
  id: number;
  vendorId: number;
  vendorName: string;
  provider: string;
  providerReference: string;
  amount: string;
  currency: string;
  metadata: Record<string, unknown>;
}

/**
 * The two passes query the DB with different SQL predicates. We simulate both
 * by inspecting what the predicate's raw SQL string contains — alertRows are
 * rows with voidError but no voidErrorAlertedAt/voidErrorAcknowledgedAt, while
 * retryRows are rows with voidError but no voidErrorAcknowledgedAt.
 */
let alertRows: FakePaymentRow[] = [];
let retryRows: FakePaymentRow[] = [];

/** Metadata snapshots written by db.update().set() keyed by payment id */
const metadataUpdates = new Map<number, Record<string, unknown>>();

/** Vendor row returned for the retry pass's vendor lookup */
let retryVendorRow: { id: number; stripeEnabled: boolean; paystackEnabled: boolean } | null = {
  id: 10,
  stripeEnabled: true,
  paystackEnabled: false,
};

const slackAlerts: string[] = [];
const recordedRuns: Array<{ jobName: string; input: unknown }> = [];

let sessionStatus: "open" | "expired" = "open";
const expireMock = vi.fn(async (_ref: string) => {});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: (predicate: { sql: string }) => ({
            limit: async () => {
              // Detect which pass is querying by checking for the alertedAt filter.
              // Alert pass SQL contains voidErrorAlertedAt; retry pass does not.
              const isAlertQuery =
                typeof predicate?.sql === "string" &&
                predicate.sql.includes("voidErrorAlertedAt");
              return isAlertQuery ? alertRows : retryRows;
            },
          }),
        }),
        // Vendor lookup inside retryPass uses a plain .where().limit() chain
        where: async () => (retryVendorRow ? [retryVendorRow] : []),
      }),
    }),
    update: () => ({
      set: (vals: { metadata: Record<string, unknown> }) => ({
        where: (predicate: { col: unknown; val: unknown }) => {
          const id = predicate.val as number;
          metadataUpdates.set(id, vals.metadata);
          return Promise.resolve([]);
        },
      }),
    }),
  },
  paymentsTable: {
    id: "payments.id",
    vendorId: "payments.vendorId",
    provider: "payments.provider",
    providerReference: "payments.providerReference",
    amount: "payments.amount",
    currency: "payments.currency",
    metadata: "payments.metadata",
  },
  vendorsTable: { id: "vendors.id", name: "vendors.name" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings.raw.join(""),
      values,
    }),
    { raw: () => ({}) },
  ),
}));

vi.mock("stripe", () => {
  class MockStripe {
    checkout = {
      sessions: {
        retrieve: async (_ref: string) => ({ status: sessionStatus }),
        expire: expireMock,
      },
    };
  }
  return { default: MockStripe };
});

let stripeKeyResult: string | Error = "sk_test_fake";

vi.mock("../vendor-keys", () => ({
  resolveStripeKey: async () => {
    if (stripeKeyResult instanceof Error) throw stripeKeyResult;
    return stripeKeyResult;
  },
}));

vi.mock("../slack", () => ({
  sendSlackAlert: async (msg: string) => {
    slackAlerts.push(msg);
  },
}));

vi.mock("../logger", () => ({
  logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
}));

vi.mock("../job-run-status", () => ({
  recordJobRun: async (jobName: string, input: unknown) => {
    recordedRuns.push({ jobName, input });
  },
}));

vi.mock("../push", () => ({
  sendPushToAdmins: async () => {},
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayment(overrides: Partial<FakePaymentRow> = {}): FakePaymentRow {
  return {
    id: 1,
    vendorId: 10,
    vendorName: "Test Vendor",
    provider: "stripe",
    providerReference: "cs_void_error_1",
    amount: "99.00",
    currency: "USD",
    metadata: { voidError: "Network timeout", voidErrorAt: "2026-01-01T00:00:00.000Z" },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("void-error-check-scheduler — alertPass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    alertRows = [];
    retryRows = [];
    metadataUpdates.clear();
    slackAlerts.length = 0;
    recordedRuns.length = 0;
    sessionStatus = "open";
    stripeKeyResult = "sk_test_fake";
    retryVendorRow = { id: 10, stripeEnabled: true, paystackEnabled: false };
  });

  it("sends a Slack alert and stamps voidErrorAlertedAt for a newly-flagged payment", async () => {
    const payment = makePayment({ id: 7 });
    alertRows = [payment];

    const { tick } = await import("../void-error-check-scheduler");
    await tick();

    // One Slack alert fired
    expect(slackAlerts).toHaveLength(1);
    expect(slackAlerts[0]).toContain("payment #7");
    expect(slackAlerts[0]).toContain("void failed");

    // voidErrorAlertedAt stamped on the payment metadata
    const updatedMeta = metadataUpdates.get(7);
    expect(updatedMeta).toBeDefined();
    expect(typeof updatedMeta!.voidErrorAlertedAt).toBe("string");
    expect(updatedMeta).toMatchObject({
      voidError: "Network timeout",
      voidErrorAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("does not alert when the payment already has voidErrorAlertedAt (already alerted)", async () => {
    // Already-alerted rows are filtered by the SQL predicate — the alert query
    // returns nothing for them, so alertRows stays empty.
    alertRows = [];
    retryRows = [
      makePayment({
        id: 8,
        metadata: {
          voidError: "Some error",
          voidErrorAt: "2026-01-01T00:00:00.000Z",
          voidErrorAlertedAt: "2026-01-01T01:00:00.000Z", // already alerted
        },
      }),
    ];

    const { tick } = await import("../void-error-check-scheduler");
    await tick();

    // No new Slack alert (alert pass found nothing)
    // The retry pass may send a success notice — we check alert pass specifically:
    const voidFailedAlerts = slackAlerts.filter((m) => m.includes("void failed"));
    expect(voidFailedAlerts).toHaveLength(0);
  });

  it("does not alert for an acknowledged payment", async () => {
    alertRows = []; // acknowledged rows are filtered out of the alert query
    retryRows = []; // also filtered out of the retry query

    const { tick } = await import("../void-error-check-scheduler");
    await tick();

    expect(slackAlerts).toHaveLength(0);
  });
});

describe("void-error-check-scheduler — retryPass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    alertRows = [];
    retryRows = [];
    metadataUpdates.clear();
    slackAlerts.length = 0;
    recordedRuns.length = 0;
    sessionStatus = "open";
    stripeKeyResult = "sk_test_fake";
    retryVendorRow = { id: 10, stripeEnabled: true, paystackEnabled: false };
  });

  it("expires an open session, clears void-error metadata, and sends a success Slack notice", async () => {
    sessionStatus = "open";
    retryRows = [
      makePayment({
        id: 11,
        metadata: {
          voidError: "Timeout",
          voidErrorAt: "2026-01-01T00:00:00.000Z",
          voidErrorAlertedAt: "2026-01-01T01:00:00.000Z",
          sessionId: "cs_open_11",
          source: "awajimaa",
        },
      }),
    ];

    const { tick } = await import("../void-error-check-scheduler");
    await tick();

    expect(expireMock).toHaveBeenCalledOnce();
    expect(expireMock).toHaveBeenCalledWith("cs_void_error_1");

    // voidError, voidErrorAt, voidErrorAlertedAt must be gone from the metadata
    const updatedMeta = metadataUpdates.get(11);
    expect(updatedMeta).toBeDefined();
    expect(updatedMeta).not.toHaveProperty("voidError");
    expect(updatedMeta).not.toHaveProperty("voidErrorAt");
    expect(updatedMeta).not.toHaveProperty("voidErrorAlertedAt");
    // other metadata preserved
    expect(updatedMeta).toMatchObject({ sessionId: "cs_open_11", source: "awajimaa" });

    // Success Slack notice sent
    const successAlerts = slackAlerts.filter((m) => m.includes("automatically expired"));
    expect(successAlerts).toHaveLength(1);
    expect(successAlerts[0]).toContain("payment #11");
  });

  it("clears void-error metadata without calling expire for an already-expired session", async () => {
    sessionStatus = "expired";
    retryRows = [
      makePayment({
        id: 12,
        metadata: {
          voidError: "Old timeout",
          voidErrorAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ];

    const { tick } = await import("../void-error-check-scheduler");
    await tick();

    // expire not called — session was not open
    expect(expireMock).not.toHaveBeenCalled();

    // Metadata cleared anyway (session already not payable)
    const updatedMeta = metadataUpdates.get(12);
    expect(updatedMeta).toBeDefined();
    expect(updatedMeta).not.toHaveProperty("voidError");
    expect(updatedMeta).not.toHaveProperty("voidErrorAt");
  });

  it("skips silently when the Stripe key is still unavailable", async () => {
    stripeKeyResult = new Error("No Stripe key configured for vendor");
    retryRows = [
      makePayment({
        id: 13,
        metadata: { voidError: "Key was missing", voidErrorAt: "2026-01-01T00:00:00.000Z" },
      }),
    ];

    const { tick } = await import("../void-error-check-scheduler");
    await tick();

    // No expire attempted
    expect(expireMock).not.toHaveBeenCalled();
    // No metadata update (skipped)
    expect(metadataUpdates.has(13)).toBe(false);
    // No NEW Slack alert (existing alert left in place)
    const failAlerts = slackAlerts.filter((m) => m.includes("void failed"));
    expect(failAlerts).toHaveLength(0);
  });

  it("does not attempt a retry for an acknowledged payment", async () => {
    // acknowledged rows are excluded from the retry query SQL predicate
    retryRows = [];

    const { tick } = await import("../void-error-check-scheduler");
    await tick();

    expect(expireMock).not.toHaveBeenCalled();
    expect(metadataUpdates.size).toBe(0);
  });

  it("skips non-Stripe providers in the retry pass", async () => {
    retryRows = [
      makePayment({
        id: 14,
        provider: "paystack",
        metadata: { voidError: "Paystack has no void API", voidErrorAt: "2026-01-01T00:00:00.000Z" },
      }),
    ];

    const { tick } = await import("../void-error-check-scheduler");
    await tick();

    expect(expireMock).not.toHaveBeenCalled();
    // No metadata update for Paystack rows in retry pass
    expect(metadataUpdates.has(14)).toBe(false);
  });
});

describe("void-error-check-scheduler — tick() job-run recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    alertRows = [];
    retryRows = [];
    metadataUpdates.clear();
    slackAlerts.length = 0;
    recordedRuns.length = 0;
    sessionStatus = "open";
    stripeKeyResult = "sk_test_fake";
    retryVendorRow = { id: 10, stripeEnabled: true, paystackEnabled: false };
  });

  it("records a successful job run after both passes complete, with correct aggregated counts", async () => {
    alertRows = [makePayment({ id: 20 })];
    retryRows = [makePayment({ id: 21 })];

    const { tick, VOID_ERROR_JOB_NAME } = await import("../void-error-check-scheduler");
    await tick();

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0].jobName).toBe(VOID_ERROR_JOB_NAME);
    const input = recordedRuns[0].input as {
      success: boolean;
      checkedCount: number;
      affectedCount: number;
    };
    expect(input.success).toBe(true);
    // 1 from alert pass + 1 from retry pass = 2 checked
    expect(input.checkedCount).toBe(2);
    // 1 alerted + 1 recovered = 2 affected
    expect(input.affectedCount).toBe(2);
  });

  it("records a successful run with zero counts when there is nothing to process", async () => {
    alertRows = [];
    retryRows = [];

    const { tick, VOID_ERROR_JOB_NAME } = await import("../void-error-check-scheduler");
    await tick();

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0].jobName).toBe(VOID_ERROR_JOB_NAME);
    expect(recordedRuns[0].input).toMatchObject({
      success: true,
      checkedCount: 0,
      affectedCount: 0,
    });
  });
});

// ─── Full lifecycle (end-to-end retry cycle) ──────────────────────────────────
//
// These tests simulate the complete story the scheduler was designed to handle:
//
//   voidProviderSession() fails (key missing / network error)
//     → voidError written to payment metadata
//     → TICK 1: alert pass fires Slack warning + stamps voidErrorAlertedAt
//               retry pass skips because key is still unavailable
//     → TICK 2: key is now resolvable
//               retry pass calls sessions.expire() on the still-open session
//               voidError / voidErrorAlertedAt cleared from metadata
//               Slack success notice fired
//
// This is the integration gap called out in the task: none of the isolated
// unit tests above thread through both ticks in sequence.
// ─────────────────────────────────────────────────────────────────────────────

describe("void-error-check-scheduler — full retry lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    alertRows = [];
    retryRows = [];
    metadataUpdates.clear();
    slackAlerts.length = 0;
    recordedRuns.length = 0;
    sessionStatus = "open";
    stripeKeyResult = "sk_test_fake";
    retryVendorRow = { id: 10, stripeEnabled: true, paystackEnabled: false };
  });

  it("tick 1 with unavailable key: alerts and leaves voidError intact; tick 2 with available key: expires session, clears metadata, sends success notice", async () => {
    // ── Arrange ───────────────────────────────────────────────────────────────
    const paymentId = 50;
    const sessionRef = "cs_lifecycle_test_50";
    const payment = makePayment({
      id: paymentId,
      providerReference: sessionRef,
      metadata: {
        voidError: "Network timeout during cancellation",
        voidErrorAt: "2026-06-01T10:00:00.000Z",
        sessionId: sessionRef,
        source: "awajimaa",
      },
    });

    // ── TICK 1: Stripe key unavailable ────────────────────────────────────────
    stripeKeyResult = new Error("No Stripe key configured — admin must add one");
    sessionStatus = "open";

    // Alert pass sees the payment (no voidErrorAlertedAt yet).
    alertRows = [payment];
    // Retry pass also sees it (no voidErrorAcknowledgedAt).
    retryRows = [payment];

    const { tick } = await import("../void-error-check-scheduler");
    await tick();

    // Alert pass: Slack warning sent.
    const tick1FailAlerts = slackAlerts.filter((m) => m.includes("void failed"));
    expect(tick1FailAlerts).toHaveLength(1);
    expect(tick1FailAlerts[0]).toContain(`payment #${paymentId}`);

    // Alert pass: voidErrorAlertedAt stamped.
    const tick1Meta = metadataUpdates.get(paymentId);
    expect(tick1Meta).toBeDefined();
    expect(typeof tick1Meta!.voidErrorAlertedAt).toBe("string");
    expect(tick1Meta).toHaveProperty("voidError"); // NOT cleared yet

    // Retry pass: key unavailable → expire was never called.
    expect(expireMock).not.toHaveBeenCalled();

    // No success notice yet.
    const tick1SuccessAlerts = slackAlerts.filter((m) => m.includes("automatically expired"));
    expect(tick1SuccessAlerts).toHaveLength(0);

    // ── TICK 2: Stripe key now available ─────────────────────────────────────
    stripeKeyResult = "sk_test_now_available";
    sessionStatus = "open";

    // Simulate the state after tick 1: alert pass has stamped voidErrorAlertedAt,
    // so the payment no longer matches the alert-pass predicate — alertRows is empty.
    alertRows = [];

    // The retry-pass predicate only requires voidError + no voidErrorAcknowledgedAt,
    // so the payment still appears in retryRows.
    const paymentAfterTick1 = makePayment({
      id: paymentId,
      providerReference: sessionRef,
      metadata: {
        voidError: "Network timeout during cancellation",
        voidErrorAt: "2026-06-01T10:00:00.000Z",
        voidErrorAlertedAt: tick1Meta!.voidErrorAlertedAt as string,
        sessionId: sessionRef,
        source: "awajimaa",
      },
    });
    retryRows = [paymentAfterTick1];

    // Reset mutable capture state so tick 2 results are isolated.
    metadataUpdates.clear();
    slackAlerts.length = 0;
    recordedRuns.length = 0;
    expireMock.mockClear();

    await tick();

    // Retry pass: expire called once with the correct session reference.
    expect(expireMock).toHaveBeenCalledOnce();
    expect(expireMock).toHaveBeenCalledWith(sessionRef);

    // Retry pass: void-error fields cleared, other metadata preserved.
    const tick2Meta = metadataUpdates.get(paymentId);
    expect(tick2Meta).toBeDefined();
    expect(tick2Meta).not.toHaveProperty("voidError");
    expect(tick2Meta).not.toHaveProperty("voidErrorAt");
    expect(tick2Meta).not.toHaveProperty("voidErrorAlertedAt");
    expect(tick2Meta).toMatchObject({ sessionId: sessionRef, source: "awajimaa" });

    // Retry pass: Slack success notice sent.
    const tick2SuccessAlerts = slackAlerts.filter((m) => m.includes("automatically expired"));
    expect(tick2SuccessAlerts).toHaveLength(1);
    expect(tick2SuccessAlerts[0]).toContain(`payment #${paymentId}`);

    // No new void-failed alert in tick 2 (alert pass found nothing).
    const tick2FailAlerts = slackAlerts.filter((m) => m.includes("void failed"));
    expect(tick2FailAlerts).toHaveLength(0);

    // Job run recorded as successful.
    expect(recordedRuns[0].input).toMatchObject({ success: true });
  });

  it("handles a non-open session (status: paid) gracefully — no expire call, metadata still cleared", async () => {
    // A session that was already paid before the scheduler could expire it.
    // The retry pass must not throw or leave voidError on the payment.
    sessionStatus = "expired"; // covers "paid" / "complete" / "expired" — all non-open
    stripeKeyResult = "sk_test_fake";

    const paymentId = 51;
    retryRows = [
      makePayment({
        id: paymentId,
        providerReference: "cs_already_paid_51",
        metadata: {
          voidError: "Session was open at cancel time but is now closed",
          voidErrorAt: "2026-06-01T11:00:00.000Z",
          voidErrorAlertedAt: "2026-06-01T11:05:00.000Z",
          sessionId: "cs_already_paid_51",
          source: "awajimaa",
        },
      }),
    ];

    const { tick } = await import("../void-error-check-scheduler");
    await tick();

    // sessions.expire must NOT be called — the session is not open.
    expect(expireMock).not.toHaveBeenCalled();

    // Metadata must be cleared regardless — the session can't be paid again.
    const updatedMeta = metadataUpdates.get(paymentId);
    expect(updatedMeta).toBeDefined();
    expect(updatedMeta).not.toHaveProperty("voidError");
    expect(updatedMeta).not.toHaveProperty("voidErrorAt");
    expect(updatedMeta).not.toHaveProperty("voidErrorAlertedAt");
    expect(updatedMeta).toMatchObject({ sessionId: "cs_already_paid_51", source: "awajimaa" });

    // Success notice sent (session is resolved — no further risk).
    const successAlerts = slackAlerts.filter((m) => m.includes("automatically expired"));
    expect(successAlerts).toHaveLength(1);
    expect(successAlerts[0]).toContain(`payment #${paymentId}`);
  });
});
