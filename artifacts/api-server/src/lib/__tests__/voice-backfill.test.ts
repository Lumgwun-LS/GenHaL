/**
 * Tests that the backfill run records which specific calls it reconciled
 * (callSid + before/after status), not just aggregate counts, so admins can
 * see exactly which calls were fixed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type LogRow = { callSid: string | null; status: string; initiatedAt: Date };
type CampaignRow = { callSid: string | null; status: string; initiatedAt: Date };

let logRows: LogRow[] = [];
let campaignRows: CampaignRow[] = [];
const logUpdates: Array<{ callSid: string; status: string }> = [];
const campaignUpdates: Array<{ callSid: string; status: string }> = [];

const voiceCallLogsTableRef = { callSid: "logs.callSid", status: "logs.status", initiatedAt: "logs.initiatedAt", vendorId: "logs.vendorId", campaignId: "logs.campaignId" };
const voiceCampaignCallsTableRef = { callSid: "campaign.callSid", status: "campaign.status", initiatedAt: "campaign.initiatedAt", campaignId: "campaign.campaignId" };
const vendorsTableRef = { id: "vendors.id", name: "vendors.name" };
const voiceCampaignsTableRef = { id: "voiceCampaigns.id", name: "voiceCampaigns.name" };

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === voiceCallLogsTableRef)
            return Promise.resolve(logRows.map((r) => ({ callSid: r.callSid, status: r.status, vendorId: null, campaignId: null })));
          if (table === voiceCampaignCallsTableRef)
            return Promise.resolve(campaignRows.map((r) => ({ callSid: r.callSid, status: r.status, campaignId: null })));
          // vendorsTable / voiceCampaignsTable name lookups — return empty (names stay null)
          return Promise.resolve([]);
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (vals: { status: string }) => ({
        where: (whereArg: { val: string }) => {
          if (table === voiceCallLogsTableRef) logUpdates.push({ callSid: whereArg.val, status: vals.status });
          else campaignUpdates.push({ callSid: whereArg.val, status: vals.status });
          return Promise.resolve();
        },
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  voiceCallLogsTable: voiceCallLogsTableRef,
  voiceCampaignCallsTable: voiceCampaignCallsTableRef,
  vendorsTable: vendorsTableRef,
  voiceCampaignsTable: voiceCampaignsTableRef,
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (col: unknown, val: unknown) => ({ col, val }),
  inArray: () => true,
  isNotNull: () => true,
  lt: () => true,
  or: (...args: unknown[]) => args,
}));

vi.mock("../job-run-status", () => ({
  recordJobRun: () => Promise.resolve(),
}));

const siteContent = new Map<string, unknown>();
vi.mock("../site-content", () => ({
  getSiteContentBlock: (key: string) => Promise.resolve(siteContent.get(key) ?? (key === "admin.voiceBackfillRecentFixes" ? [] : {})),
  setSiteContentBlock: (key: string, value: unknown) => {
    siteContent.set(key, value);
    return Promise.resolve();
  },
}));

let twilioConfigured = true;
const callStatuses = new Map<string, { status: string; durationSeconds?: number } | null>();
vi.mock("../voice-caller", () => ({
  isTwilioConfigured: () => twilioConfigured,
  fetchCallStatus: (callSid: string) => Promise.resolve(callStatuses.get(callSid) ?? null),
}));

vi.mock("../logger", () => ({
  logger: { info: () => {}, error: () => {} },
}));

describe("runVoiceBackfill recent fixes", () => {
  beforeEach(() => {
    vi.resetModules();
    logRows = [];
    campaignRows = [];
    logUpdates.length = 0;
    campaignUpdates.length = 0;
    siteContent.clear();
    twilioConfigured = true;
    callStatuses.clear();
  });

  it("records callSid + before/after status for each reconciled call", async () => {
    logRows = [{ callSid: "CA1", status: "in-progress", initiatedAt: new Date(0) }];
    campaignRows = [{ callSid: "CA1", status: "in-progress", initiatedAt: new Date(0) }];
    callStatuses.set("CA1", { status: "completed", durationSeconds: 42 });

    const { runVoiceBackfill, getVoiceBackfillRecentFixes } = await import("../voice-backfill");
    const result = await runVoiceBackfill("system");

    expect(result.updated).toBe(1);
    expect(logUpdates).toEqual([{ callSid: "CA1", status: "completed" }]);
    expect(campaignUpdates).toEqual([{ callSid: "CA1", status: "completed" }]);

    const fixes = await getVoiceBackfillRecentFixes();
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({ callSid: "CA1", fromStatus: "in-progress", toStatus: "completed" });
  });

  it("prepends new fixes onto prior runs and caps the list at 50", async () => {
    siteContent.set(
      "admin.voiceBackfillRecentFixes",
      Array.from({ length: 50 }, (_, i) => ({ ranAt: "old", callSid: `OLD${i}`, fromStatus: "queued", toStatus: "completed" })),
    );
    logRows = [{ callSid: "CA2", status: "ringing", initiatedAt: new Date(0) }];
    campaignRows = [];
    callStatuses.set("CA2", { status: "failed" });

    const { runVoiceBackfill, getVoiceBackfillRecentFixes } = await import("../voice-backfill");
    await runVoiceBackfill("system");

    const fixes = await getVoiceBackfillRecentFixes();
    expect(fixes).toHaveLength(50);
    expect(fixes[0]).toMatchObject({ callSid: "CA2", fromStatus: "ringing", toStatus: "failed" });
  });

  it("does not record a fix for calls that are still genuinely in progress", async () => {
    logRows = [{ callSid: "CA3", status: "in-progress", initiatedAt: new Date(0) }];
    campaignRows = [];
    callStatuses.set("CA3", { status: "in-progress" });

    const { runVoiceBackfill, getVoiceBackfillRecentFixes } = await import("../voice-backfill");
    const result = await runVoiceBackfill("system");

    expect(result.updated).toBe(0);
    expect(await getVoiceBackfillRecentFixes()).toEqual([]);
  });
});
