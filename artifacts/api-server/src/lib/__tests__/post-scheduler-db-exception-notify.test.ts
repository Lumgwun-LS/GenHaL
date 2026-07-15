/**
 * Guards the post-scheduler's DB-exception fallback path (task #101 / #138):
 * when executeClaimedPublish throws before it can resolve the "publishing"
 * claim itself (e.g. a transient DB error), publishDuePosts must revert the
 * post to "approved" with autoPublishFailed=true AND notify the vendor —
 * otherwise a future refactor could silently drop the notice on this rarer
 * code path even if the main success/failure paths stay covered.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const DUE_POST = { id: 7, vendorId: 55, caption: "Weekend flash sale" };

let dueRows: Array<typeof DUE_POST> = [];
let claimShouldMatch = true;
let revertShouldMatch = true;
const updateCalls: Array<{ set: Record<string, unknown>; phase: "claim" | "revert" }> = [];

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
            if (vals.status === "publishing") {
              updateCalls.push({ set: vals, phase: "claim" });
              return claimShouldMatch ? [{ id: DUE_POST.id, status: "publishing" }] : [];
            }
            updateCalls.push({ set: vals, phase: "revert" });
            return revertShouldMatch ? [{ id: DUE_POST.id }] : [];
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
  lte: (col: unknown, val: unknown) => ({ col, val }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({ strings, vals }),
}));

const executeClaimedPublish = vi.fn();
vi.mock("../../routes/posts", () => ({
  executeClaimedPublish,
}));

const notifyScheduledPostFailed = vi.fn(async () => {});
vi.mock("../post-notifications", () => ({
  notifyScheduledPostFailed,
}));

vi.mock("../job-run-status", () => ({
  recordJobRun: vi.fn(async () => {}),
}));

describe("post-scheduler DB-exception fallback — auto-publish failure notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dueRows = [{ ...DUE_POST }];
    claimShouldMatch = true;
    revertShouldMatch = true;
    updateCalls.length = 0;
  });

  it("reverts to approved with autoPublishFailed=true and notifies the vendor when executeClaimedPublish throws", async () => {
    executeClaimedPublish.mockRejectedValueOnce(new Error("connection terminated unexpectedly"));

    const { publishDuePosts } = await import("../post-scheduler");
    await publishDuePosts();

    const revertCall = updateCalls.find((c) => c.phase === "revert");
    expect(revertCall?.set).toEqual({ status: "approved", autoPublishFailed: true });

    expect(notifyScheduledPostFailed).toHaveBeenCalledTimes(1);
    expect(notifyScheduledPostFailed).toHaveBeenCalledWith(DUE_POST.vendorId, DUE_POST.id, DUE_POST.caption, []);
  });

  it("does not notify when the revert update matches zero rows (post already moved out of 'publishing' by another path)", async () => {
    executeClaimedPublish.mockRejectedValueOnce(new Error("connection terminated unexpectedly"));
    revertShouldMatch = false;

    const { publishDuePosts } = await import("../post-scheduler");
    await publishDuePosts();

    const revertCall = updateCalls.find((c) => c.phase === "revert");
    expect(revertCall).toBeDefined();
    expect(notifyScheduledPostFailed).not.toHaveBeenCalled();
  });

  it("does not touch autoPublishFailed or notify when the post is no longer 'scheduled' at claim time", async () => {
    claimShouldMatch = false;

    const { publishDuePosts } = await import("../post-scheduler");
    await publishDuePosts();

    expect(executeClaimedPublish).not.toHaveBeenCalled();
    expect(updateCalls.some((c) => c.phase === "revert")).toBe(false);
    expect(notifyScheduledPostFailed).not.toHaveBeenCalled();
  });

  it("does not perform the DB-exception fallback revert/notify when executeClaimedPublish resolves normally (even on total platform failure)", async () => {
    // executeClaimedPublish already performs its own revert + notify internally
    // in this case (covered by posts-auto-publish-failure-notice.test.ts) — the
    // scheduler's catch block must only trigger when the call itself throws.
    executeClaimedPublish.mockResolvedValueOnce({ post: undefined, publications: [], anySucceeded: false });

    const { publishDuePosts } = await import("../post-scheduler");
    await publishDuePosts();

    expect(updateCalls.some((c) => c.phase === "revert")).toBe(false);
    expect(notifyScheduledPostFailed).not.toHaveBeenCalled();
  });
});
