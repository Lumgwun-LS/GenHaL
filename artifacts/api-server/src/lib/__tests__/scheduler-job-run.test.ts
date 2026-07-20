/**
 * Confirms that every periodic scheduler's tick() calls recordJobRun with the
 * correct job name and success/failure flag on every run.
 *
 * Two tests per scheduler (seven schedulers, eight job-name slots because
 * birthday-scheduler manages two independent jobs):
 *   1. Happy path  → recordJobRun({ success: true, … })
 *   2. Failure path → recordJobRun({ success: false, error: <message> })
 *
 * Schedulers covered:
 *   • pending-reminders (tick exported after this task's refactor)
 *   • gateway-health    (tick exported after this task's refactor)
 *   • post-scheduler    (tick exported after this task's refactor)
 *   • voice-backfill    (runVoiceBackfill is the schedulable unit)
 *   • voice-campaign-scheduler (tick exported after this task's refactor)
 *   • birthday-scheduler — birthday-calls job     (06:00 UTC)
 *   • birthday-scheduler — birthday-notifications job (08:00 UTC)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Shared spy state ─────────────────────────────────────────────────────────

const recordedRuns: Array<{ jobName: string; input: unknown }> = [];

/** Flip to true inside any test that wants all DB selects to throw. */
let dbSelectShouldThrow = false;

// ─── Core module mocks (hoisted by Vitest before any import) ──────────────────

vi.mock("../job-run-status", () => ({
  recordJobRun: async (jobName: string, input: unknown) => {
    recordedRuns.push({ jobName, input });
  },
}));

vi.mock("../logger", () => ({
  logger: { info: () => {}, error: () => {}, warn: () => {} },
}));

// Single unified DB mock shared by all schedulers.
// Selects return [] on happy path or throw on failure path.
// Inserts/updates are always no-ops (schedulers never reach them in the
// happy-path no-op variant we test, or fail before them in the failure path).
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => {
          if (dbSelectShouldThrow) return Promise.reject(new Error("DB select failed"));
          return Promise.resolve([]);
        },
        innerJoin: () => ({
          where: () => {
            if (dbSelectShouldThrow) return Promise.reject(new Error("DB select failed"));
            return Promise.resolve([]);
          },
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
        returning: () => Promise.resolve([]),
      }),
    }),
    update: () => ({
      set: () => ({ where: () => Promise.resolve([]) }),
    }),
  },
  // post-scheduler imports postsTable directly from @workspace/db (not /schema)
  postsTable: {},
}));

vi.mock("@workspace/db/schema", () => ({
  postsTable: {},
  voiceCampaignsTable: {},
  leadsTable: {},
  voiceCallLogsTable: {},
  voiceCampaignCallsTable: {},
  vendorsTable: {},
  paymentsTable: {},
  pendingReminderLogsTable: {},
  vendorNotificationsTable: {},
  birthdayMessageLogsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (col: unknown, val: unknown) => ({ col, val }),
  lt: (col: unknown, val: unknown) => ({ col, val }),
  lte: (col: unknown, val: unknown) => ({ col, val }),
  inArray: () => true,
  isNotNull: () => true,
  or: (...args: unknown[]) => args,
  sql: Object.assign(
    (strings: TemplateStringsArray) => ({ sql: strings.raw.join("") }),
    { raw: (s: string) => s },
  ),
}));

// ── gateway-health deps ───────────────────────────────────────────────────────

let platformCredsShouldThrow = false;
vi.mock("../platform-gateways", () => ({
  recheckAllPlatformCredentials: async () => {
    if (platformCredsShouldThrow) throw new Error("Gateway credential check failed");
    return [];
  },
}));

// ── voice-backfill deps ───────────────────────────────────────────────────────

// Default: Twilio not configured → runVoiceBackfill short-circuits with success.
// Set to true in the failure test to reach the DB-querying code path.
let twilioConfigured = false;

vi.mock("../voice-caller", () => ({
  isTwilioConfigured: () => twilioConfigured,
  fetchCallStatus: async () => null,
  placeCall: async () => ({ status: "skipped" }),
}));

vi.mock("../site-content", () => ({
  getSiteContentBlock: async () => null,
  setSiteContentBlock: async () => {},
}));

// ── pending-reminders deps ────────────────────────────────────────────────────

vi.mock("../mailer", () => ({
  sendEmail: async () => ({ status: "sent" }),
}));

vi.mock("../email-branding", () => ({
  wrapVendorEmail: () => "<html/>",
  escapeHtml: (s: string) => s,
}));

// ── post-scheduler deps ───────────────────────────────────────────────────────

vi.mock("../../routes/posts", () => ({
  executeClaimedPublish: async () => ({ anySucceeded: true }),
}));

vi.mock("../post-notifications", () => ({
  notifyScheduledPostFailed: async () => {},
  notifyPostReminderDue: async () => {},
}));

// ── voice-campaign-scheduler deps ─────────────────────────────────────────────

vi.mock("../../routes/voice-campaigns", () => ({
  runCampaignCalls: async () => {},
}));

// ─── Global beforeEach ────────────────────────────────────────────────────────

beforeEach(() => {
  recordedRuns.length = 0;
  dbSelectShouldThrow = false;
  twilioConfigured = false;
  platformCredsShouldThrow = false;
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. pending-reminders
// ═══════════════════════════════════════════════════════════════════════════════

describe("pending-reminders scheduler — recordJobRun", () => {
  it("records success: true when both reminder passes complete without error", async () => {
    const { tick, PENDING_REMINDERS_JOB_NAME } = await import("../pending-reminders");
    await tick();

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: PENDING_REMINDERS_JOB_NAME,
      input: { success: true },
    });
  });

  it("records success: false when a reminder pass throws, with the error message", async () => {
    dbSelectShouldThrow = true;
    const { tick, PENDING_REMINDERS_JOB_NAME } = await import("../pending-reminders");

    // tick() catches both passes internally — it does NOT re-throw.
    await tick();

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: PENDING_REMINDERS_JOB_NAME,
      input: { success: false },
    });
    expect((recordedRuns[0].input as { error?: string }).error).toContain("DB select failed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. gateway-health
// ═══════════════════════════════════════════════════════════════════════════════

describe("gateway-health scheduler — recordJobRun", () => {
  it("records success: true with zero counts when credential re-check passes", async () => {
    const { tick, GATEWAY_HEALTH_JOB_NAME } = await import("../gateway-health-scheduler");
    await tick();

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: GATEWAY_HEALTH_JOB_NAME,
      input: { success: true, checkedCount: 0, affectedCount: 0 },
    });
  });

  it("records success: false and re-throws when recheckAllPlatformCredentials throws", async () => {
    platformCredsShouldThrow = true;
    const { tick, GATEWAY_HEALTH_JOB_NAME } = await import("../gateway-health-scheduler");

    await expect(tick()).rejects.toThrow("Gateway credential check failed");

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: GATEWAY_HEALTH_JOB_NAME,
      input: { success: false, error: "Gateway credential check failed" },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. post-scheduler
// ═══════════════════════════════════════════════════════════════════════════════

describe("post-scheduler — recordJobRun", () => {
  it("records success: true when publishDuePosts finds no due posts", async () => {
    const { tick, POST_SCHEDULER_JOB_NAME } = await import("../post-scheduler");
    await tick();

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: POST_SCHEDULER_JOB_NAME,
      input: { success: true },
    });
  });

  it("records success: false and re-throws when publishDuePosts throws", async () => {
    dbSelectShouldThrow = true;
    const { tick, POST_SCHEDULER_JOB_NAME } = await import("../post-scheduler");

    await expect(tick()).rejects.toThrow("DB select failed");

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: POST_SCHEDULER_JOB_NAME,
      input: { success: false, error: "DB select failed" },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. voice-backfill
// ═══════════════════════════════════════════════════════════════════════════════

describe("voice-backfill — recordJobRun", () => {
  it("records success: true (Twilio not configured → immediate no-op path)", async () => {
    // twilioConfigured defaults to false — runVoiceBackfill exits early with success.
    const { runVoiceBackfill, VOICE_BACKFILL_JOB_NAME } = await import("../voice-backfill");
    await runVoiceBackfill("system");

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: VOICE_BACKFILL_JOB_NAME,
      input: { success: true, checkedCount: 0, affectedCount: 0 },
    });
  });

  it("records success: false and re-throws when the DB query throws (Twilio configured)", async () => {
    twilioConfigured = true;
    dbSelectShouldThrow = true;
    const { runVoiceBackfill, VOICE_BACKFILL_JOB_NAME } = await import("../voice-backfill");

    await expect(runVoiceBackfill("system")).rejects.toThrow("DB select failed");

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: VOICE_BACKFILL_JOB_NAME,
      input: { success: false, error: "DB select failed" },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. voice-campaign-scheduler
// ═══════════════════════════════════════════════════════════════════════════════

describe("voice-campaign-scheduler — recordJobRun", () => {
  it("records success: true when launchDueCampaigns finds no due campaigns", async () => {
    const { tick, VOICE_CAMPAIGN_SCHEDULER_JOB_NAME } = await import("../voice-campaign-scheduler");
    await tick();

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: VOICE_CAMPAIGN_SCHEDULER_JOB_NAME,
      input: { success: true },
    });
  });

  it("records success: false and re-throws when the DB query throws", async () => {
    dbSelectShouldThrow = true;
    const { tick, VOICE_CAMPAIGN_SCHEDULER_JOB_NAME } = await import("../voice-campaign-scheduler");

    await expect(tick()).rejects.toThrow("DB select failed");

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: VOICE_CAMPAIGN_SCHEDULER_JOB_NAME,
      input: { success: false, error: "DB select failed" },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. birthday-scheduler — birthday-CALLS job (fires at 06:00 UTC)
// ═══════════════════════════════════════════════════════════════════════════════
//
// birthday-scheduler keeps module-level dedup guards (lastCallDate /
// lastNotifDate). vi.resetModules() in beforeEach ensures each test gets a
// fresh module with those guards reset to "".

describe("birthday-scheduler — birthday-calls job (06:00 UTC) — recordJobRun", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records success: true for birthday-calls when there are no birthdays today", async () => {
    vi.setSystemTime(new Date("2026-01-15T06:00:00.000Z"));
    const { tick, BIRTHDAY_CALL_JOB_NAME } = await import("../birthday-scheduler");

    await tick();

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: BIRTHDAY_CALL_JOB_NAME,
      input: { success: true },
    });
  });

  it("records success: false for birthday-calls when the DB throws (tick does NOT re-throw)", async () => {
    vi.setSystemTime(new Date("2026-01-15T06:00:00.000Z"));
    dbSelectShouldThrow = true;
    const { tick, BIRTHDAY_CALL_JOB_NAME } = await import("../birthday-scheduler");

    // birthday-scheduler's tick() catches errors per-job and does not re-throw.
    await tick();

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: BIRTHDAY_CALL_JOB_NAME,
      input: { success: false },
    });
    expect((recordedRuns[0].input as { error?: string }).error).toContain("DB select failed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. birthday-scheduler — birthday-NOTIFICATIONS job (fires at 08:00 UTC)
// ═══════════════════════════════════════════════════════════════════════════════

describe("birthday-scheduler — birthday-notifications job (08:00 UTC) — recordJobRun", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records success: true for birthday-notifications when there are no birthdays today", async () => {
    vi.setSystemTime(new Date("2026-01-15T08:00:00.000Z"));
    const { tick, BIRTHDAY_NOTIFY_JOB_NAME } = await import("../birthday-scheduler");

    await tick();

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: BIRTHDAY_NOTIFY_JOB_NAME,
      input: { success: true },
    });
  });

  it("records success: false for birthday-notifications when the DB throws (tick does NOT re-throw)", async () => {
    vi.setSystemTime(new Date("2026-01-15T08:00:00.000Z"));
    dbSelectShouldThrow = true;
    const { tick, BIRTHDAY_NOTIFY_JOB_NAME } = await import("../birthday-scheduler");

    // birthday-scheduler's tick() catches errors per-job and does not re-throw.
    await tick();

    expect(recordedRuns).toHaveLength(1);
    expect(recordedRuns[0]).toMatchObject({
      jobName: BIRTHDAY_NOTIFY_JOB_NAME,
      input: { success: false },
    });
    expect((recordedRuns[0].input as { error?: string }).error).toContain("DB select failed");
  });
});
