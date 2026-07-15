/**
 * Guards the pre-publish reminder job (task #140): a scheduled post due
 * within the lead window must be reminded exactly once, the claim must be
 * atomic (only fires when still 'scheduled' and un-reminded), and a post
 * outside the window or already reminded must be left alone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const DUE_POST = { id: 9, vendorId: 3, caption: "Big weekend sale", scheduledAt: new Date("2026-01-01T12:00:00Z") };

let dueRows: Array<typeof DUE_POST> = [];
let claimShouldMatch = true;
const updateCalls: Array<{ set: Record<string, unknown> }> = [];

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => dueRows,
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            updateCalls.push({ set: vals });
            return claimShouldMatch ? [{ id: DUE_POST.id }] : [];
          },
        }),
      }),
    }),
  },
  postsTable: {},
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

describe("post-reminders — pre-publish reminder job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dueRows = [{ ...DUE_POST }];
    claimShouldMatch = true;
    updateCalls.length = 0;
  });

  it("claims the reminder atomically and notifies the vendor for a due post", async () => {
    const { sendDuePostReminders } = await import("../post-reminders");
    await sendDuePostReminders();

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set).toHaveProperty("reminderSentAt");
    expect(notifyPostReminderDue).toHaveBeenCalledTimes(1);
    expect(notifyPostReminderDue).toHaveBeenCalledWith(DUE_POST.vendorId, DUE_POST.id, DUE_POST.caption, DUE_POST.scheduledAt);
  });

  it("does not notify when the claim matches zero rows (already reminded or no longer scheduled)", async () => {
    claimShouldMatch = false;

    const { sendDuePostReminders } = await import("../post-reminders");
    await sendDuePostReminders();

    expect(updateCalls).toHaveLength(1);
    expect(notifyPostReminderDue).not.toHaveBeenCalled();
  });

  it("does nothing when there are no due posts", async () => {
    dueRows = [];

    const { sendDuePostReminders } = await import("../post-reminders");
    await sendDuePostReminders();

    expect(updateCalls).toHaveLength(0);
    expect(notifyPostReminderDue).not.toHaveBeenCalled();
  });

  it("does not blow up the whole tick when notifyPostReminderDue throws for one post", async () => {
    notifyPostReminderDue.mockRejectedValueOnce(new Error("smtp down"));

    const { sendDuePostReminders } = await import("../post-reminders");
    await expect(sendDuePostReminders()).resolves.toBeUndefined();
  });
});
