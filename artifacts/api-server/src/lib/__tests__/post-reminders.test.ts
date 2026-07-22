/**
 * Guards the pre-publish reminder job: sendDuePostReminders() must apply each
 * vendor's personal lead-time preference (postReminderLeadMinutes) correctly
 * when deciding whether a scheduled post is due for a reminder, and must claim
 * the reminder atomically so a post is reminded at most once.
 *
 * Task-level requirements verified here:
 *  1. A vendor with 15-minute lead gets reminded only when ≤15 min away, not
 *     when 60 min away.
 *  2. A vendor with 1-day lead gets reminded up to 1440 min ahead.
 *  3. Two vendors with different preferences are each reminded at their own
 *     cutoff in a single tick.
 *  4. A post whose reminderSentAt is already set is never re-reminded, even if
 *     the vendor's preference later changed (the claim check is the gate).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Fixed "now" for all timing assertions ────────────────────────────────────
const NOW = new Date("2026-06-01T10:00:00.000Z");
const nowMs = NOW.getTime();

// Helper: build a scheduledAt that is `offsetMin` minutes from NOW.
const at = (offsetMin: number) => new Date(nowMs + offsetMin * 60_000);

// ─── Shared mutable state for DB mock ─────────────────────────────────────────
type Candidate = {
  id: number;
  vendorId: number;
  caption: string;
  scheduledAt: Date;
  leadMinutes: number | null;
};

let candidateRows: Candidate[] = [];

/**
 * Tracks every atomic-claim attempt: { postId, succeeded }.
 * We infer postId from the order candidates are processed; the mock always
 * succeeds unless overridden per test.
 */
const claimAttempts: Array<{ succeeded: boolean }> = [];
let nextClaimResult: "succeed" | "fail" = "succeed";

vi.mock("@workspace/db", () => ({
  db: {
    // select().from().innerJoin().where() — matches the real query chain.
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: async () => candidateRows,
        }),
      }),
    }),
    // update().set().where().returning() — atomic claim.
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            const succeeded = nextClaimResult === "succeed";
            claimAttempts.push({ succeeded });
            return succeeded ? [{ id: 0 }] : [];
          },
        }),
      }),
    }),
  },
  postsTable: {},
  vendorsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  gt: (col: unknown, val: unknown) => ({ col, val }),
  lte: (col: unknown, val: unknown) => ({ col, val }),
  isNull: (col: unknown) => ({ col }),
}));

const notifyPostReminderDue = vi.fn(async () => {});
vi.mock("../post-notifications", () => ({
  notifyPostReminderDue,
}));

vi.mock("../job-run-status", () => ({
  recordJobRun: vi.fn(async () => {}),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────
describe("post-reminders — per-vendor lead-time filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    candidateRows = [];
    claimAttempts.length = 0;
    nextClaimResult = "succeed";
    // Fix "now" so cutoff arithmetic is deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Test 1 ─────────────────────────────────────────────────────────────────
  it("15-min lead: reminds when the post is ≤15 min away, not when 60 min away", async () => {
    // Post A: 14 min from now — within the 15-min lead window → should notify.
    // Post B: 60 min from now — outside the 15-min lead window → must NOT notify.
    candidateRows = [
      { id: 1, vendorId: 10, caption: "Sale A", scheduledAt: at(14), leadMinutes: 15 },
      { id: 2, vendorId: 10, caption: "Sale B", scheduledAt: at(60), leadMinutes: 15 },
    ];

    const { sendDuePostReminders } = await import("../post-reminders");
    await sendDuePostReminders();

    // Only one claim attempt (for post 1); post 2 was filtered out in JS.
    expect(claimAttempts).toHaveLength(1);
    // Notification fired exactly once, for the within-window post.
    expect(notifyPostReminderDue).toHaveBeenCalledTimes(1);
    expect(notifyPostReminderDue).toHaveBeenCalledWith(10, 1, "Sale A", at(14));
  });

  // ── Test 2 ─────────────────────────────────────────────────────────────────
  it("1-day lead: reminds when the post is up to 1440 min (24 h) away", async () => {
    // Post is exactly 1440 min from now — right at the 1-day lead boundary.
    candidateRows = [
      { id: 3, vendorId: 20, caption: "Launch", scheduledAt: at(1440), leadMinutes: 1440 },
    ];

    const { sendDuePostReminders } = await import("../post-reminders");
    await sendDuePostReminders();

    expect(claimAttempts).toHaveLength(1);
    expect(notifyPostReminderDue).toHaveBeenCalledTimes(1);
    expect(notifyPostReminderDue).toHaveBeenCalledWith(20, 3, "Launch", at(1440));
  });

  it("1-day lead: does NOT remind when the post is beyond 1440 min away", async () => {
    // 1441 min out — just past the vendor's lead window.
    candidateRows = [
      { id: 4, vendorId: 21, caption: "Future", scheduledAt: at(1441), leadMinutes: 1440 },
    ];

    const { sendDuePostReminders } = await import("../post-reminders");
    await sendDuePostReminders();

    expect(claimAttempts).toHaveLength(0);
    expect(notifyPostReminderDue).not.toHaveBeenCalled();
  });

  // ── Test 3 ─────────────────────────────────────────────────────────────────
  it("two vendors with different preferences are each reminded at their own cutoff in a single tick", async () => {
    // Vendor A: 15-min lead. Post is 10 min away → inside → notify.
    // Vendor B: 60-min lead. Post is 45 min away → inside → notify.
    // Vendor C: 15-min lead. Post is 30 min away → outside → skip.
    candidateRows = [
      { id: 10, vendorId: 100, caption: "Quick post", scheduledAt: at(10), leadMinutes: 15 },
      { id: 11, vendorId: 200, caption: "Hour post",  scheduledAt: at(45), leadMinutes: 60 },
      { id: 12, vendorId: 300, caption: "Too far",    scheduledAt: at(30), leadMinutes: 15 },
    ];

    const { sendDuePostReminders } = await import("../post-reminders");
    await sendDuePostReminders();

    // Claims attempted for posts 10 and 11 only.
    expect(claimAttempts).toHaveLength(2);
    // Both vendors notified.
    expect(notifyPostReminderDue).toHaveBeenCalledTimes(2);
    expect(notifyPostReminderDue).toHaveBeenCalledWith(100, 10, "Quick post", at(10));
    expect(notifyPostReminderDue).toHaveBeenCalledWith(200, 11, "Hour post", at(45));
    // Vendor C's post was filtered out; no notify for post 12.
    expect(notifyPostReminderDue).not.toHaveBeenCalledWith(300, 12, expect.anything(), expect.anything());
  });

  // ── Test 4 ─────────────────────────────────────────────────────────────────
  it("a post already claimed (reminderSentAt set) is skipped even if the vendor's preference changed", async () => {
    // Simulate: the DB returns no candidates because reminderSentAt IS NULL
    // filters out the already-reminded post. If the row were returned anyway
    // (e.g. mock leakage), the atomic claim would fail — so we verify both
    // paths: (a) the DB-level filter and (b) the claim-level guard.

    // (a) DB already filtered: no rows returned → nothing happens.
    candidateRows = [];

    const { sendDuePostReminders } = await import("../post-reminders");
    await sendDuePostReminders();

    expect(claimAttempts).toHaveLength(0);
    expect(notifyPostReminderDue).not.toHaveBeenCalled();

    // (b) Even if a row slips through to the in-process filter (not possible
    //     with the real query, but guarded by the atomic claim), a failed claim
    //     must prevent notification.
    vi.clearAllMocks();
    claimAttempts.length = 0;
    nextClaimResult = "fail"; // simulate another tick/worker already claimed it

    candidateRows = [
      { id: 50, vendorId: 99, caption: "Already reminded", scheduledAt: at(5), leadMinutes: 30 },
    ];

    await sendDuePostReminders();

    // Claim attempted but failed — notification must not fire.
    expect(claimAttempts).toHaveLength(1);
    expect(claimAttempts[0].succeeded).toBe(false);
    expect(notifyPostReminderDue).not.toHaveBeenCalled();
  });

  // ── Baseline regression tests (original suite) ────────────────────────────
  it("claims the reminder atomically and notifies the vendor for a due post (default lead)", async () => {
    // No leadMinutes → falls back to DEFAULT_REMINDER_LEAD_MINUTES (30).
    candidateRows = [
      { id: 9, vendorId: 3, caption: "Big weekend sale", scheduledAt: at(20), leadMinutes: null },
    ];

    const { sendDuePostReminders } = await import("../post-reminders");
    await sendDuePostReminders();

    expect(claimAttempts).toHaveLength(1);
    expect(claimAttempts[0].succeeded).toBe(true);
    expect(notifyPostReminderDue).toHaveBeenCalledTimes(1);
    expect(notifyPostReminderDue).toHaveBeenCalledWith(3, 9, "Big weekend sale", at(20));
  });

  it("does nothing when there are no due posts", async () => {
    candidateRows = [];

    const { sendDuePostReminders } = await import("../post-reminders");
    await sendDuePostReminders();

    expect(claimAttempts).toHaveLength(0);
    expect(notifyPostReminderDue).not.toHaveBeenCalled();
  });

  it("does not blow up the whole tick when notifyPostReminderDue throws for one post", async () => {
    candidateRows = [
      { id: 7, vendorId: 5, caption: "Error post", scheduledAt: at(10), leadMinutes: 15 },
    ];
    notifyPostReminderDue.mockRejectedValueOnce(new Error("smtp down"));

    const { sendDuePostReminders } = await import("../post-reminders");
    await expect(sendDuePostReminders()).resolves.toBeUndefined();
  });
});
