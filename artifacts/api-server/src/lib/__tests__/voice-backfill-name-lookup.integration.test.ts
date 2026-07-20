/**
 * Integration test: vendor and campaign names survive a real backfill run.
 *
 * The unit tests in voice-backfill.test.ts mock the entire DB and intentionally
 * return empty arrays for the vendor/campaign name lookups, so vendorName and
 * campaignName always stay null there.  This test exercises the REAL Drizzle
 * queries — the ones that join against the vendors and voice_campaigns tables —
 * by writing seed rows into the dev database, running the backfill, and
 * asserting the fix entry contains the correct names.
 *
 * If a schema drift, wrong column reference, or a missing join causes the
 * lookups to silently return nulls the test fails loudly (not with a vague
 * "no rows updated" count).
 *
 * External dependencies that can't run in CI without credentials:
 *   - Twilio (voice-caller) → mocked to return "completed" for the test SID.
 *   - site-content → replaced with an in-process Map so the backfill has
 *     somewhere to write the fix list without hitting the site_content table.
 *   - job-run-status / logger → mocked to silence irrelevant side-effects.
 *
 * Everything else (db, drizzle-orm, @workspace/db/schema) runs against the
 * REAL dev database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ── Twilio stub ───────────────────────────────────────────────────────────────
// Configured to say Twilio IS available and return "completed" for any SID.
vi.mock("../voice-caller", () => ({
  isTwilioConfigured: () => true,
  fetchCallStatus: (_callSid: string) =>
    Promise.resolve({ status: "completed", durationSeconds: 30 }),
}));

// ── site-content stub (in-process Map) ───────────────────────────────────────
// Replaces the real site_content DB table so the backfill can write/read
// the fix list without needing that table in the dev DB.
const siteContentStore = new Map<string, unknown>();
vi.mock("../site-content", () => ({
  getSiteContentBlock: (key: string) =>
    Promise.resolve(
      siteContentStore.get(key) ??
        (key === "admin.voiceBackfillRecentFixes" ? [] : {}),
    ),
  setSiteContentBlock: (key: string, value: unknown) => {
    siteContentStore.set(key, value);
    return Promise.resolve();
  },
}));

// ── job-run-status / logger stubs ─────────────────────────────────────────────
vi.mock("../job-run-status", () => ({
  recordJobRun: () => Promise.resolve(),
}));

vi.mock("../logger", () => ({
  logger: { info: () => {}, error: () => {}, warn: () => {} },
}));

// ── real DB imports (NOT mocked) ──────────────────────────────────────────────
import { db } from "@workspace/db";
import {
  vendorsTable,
  voiceCallLogsTable,
  voiceCampaignCallsTable,
  voiceCampaignsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

// IDs of rows we insert — captured at seed time and cleaned up in afterAll.
let seedVendorId: number;
let seedCampaignId: number;
let seedCallLogId: number;
let seedCampaignCallId: number;

const TEST_CALL_SID = `CA-backfill-integration-test-${Date.now()}`;
// Initiating 30 minutes ago guarantees the call is past the 15-min stuck cutoff.
const OLD_INITIATED_AT = new Date(Date.now() - 30 * 60 * 1000);

beforeAll(async () => {
  // Insert a minimal vendor.
  const [vendor] = await db
    .insert(vendorsTable)
    .values({
      name: "Integration Test Vendor — voice backfill",
      industry: "Technology",
      email: `backfill-test-${Date.now()}@example.com`,
    })
    .returning({ id: vendorsTable.id });
  seedVendorId = vendor.id;

  // Insert a campaign owned by that vendor.
  const [campaign] = await db
    .insert(voiceCampaignsTable)
    .values({
      vendorId: seedVendorId,
      name: "Integration Test Campaign — voice backfill",
      script: "Hello {{name}}, this is a test.",
    })
    .returning({ id: voiceCampaignsTable.id });
  seedCampaignId = campaign.id;

  // Insert a stuck call in voice_call_logs (the primary lookup source).
  const [callLog] = await db
    .insert(voiceCallLogsTable)
    .values({
      phone: "+15005550006",
      direction: "outbound",
      purpose: "campaign",
      status: "in-progress",
      callSid: TEST_CALL_SID,
      initiatedAt: OLD_INITIATED_AT,
      vendorId: seedVendorId,
      campaignId: seedCampaignId,
    })
    .returning({ id: voiceCallLogsTable.id });
  seedCallLogId = callLog.id;

  // Insert the matching stuck row in voice_campaign_calls.
  const [campaignCall] = await db
    .insert(voiceCampaignCallsTable)
    .values({
      campaignId: seedCampaignId,
      leadName: "Test Lead",
      phone: "+15005550006",
      status: "in-progress",
      callSid: TEST_CALL_SID,
      initiatedAt: OLD_INITIATED_AT,
    })
    .returning({ id: voiceCampaignCallsTable.id });
  seedCampaignCallId = campaignCall.id;

  // Clear any leftover fix list from a prior run of this test.
  siteContentStore.clear();
});

afterAll(async () => {
  // Clean up in reverse dependency order.
  await db
    .delete(voiceCampaignCallsTable)
    .where(eq(voiceCampaignCallsTable.id, seedCampaignCallId));
  await db
    .delete(voiceCallLogsTable)
    .where(eq(voiceCallLogsTable.id, seedCallLogId));
  await db
    .delete(voiceCampaignsTable)
    .where(eq(voiceCampaignsTable.id, seedCampaignId));
  await db
    .delete(vendorsTable)
    .where(eq(vendorsTable.id, seedVendorId));
});

describe("runVoiceBackfill — name lookup against real DB", () => {
  it("populates vendorName and campaignName from real DB joins, not nulls", async () => {
    const { runVoiceBackfill, getVoiceBackfillRecentFixes } = await import(
      "../voice-backfill"
    );

    const result = await runVoiceBackfill("integration-test");

    // At least one call should have been reconciled (our seeded stuck call).
    expect(result.updated, "expected at least one stuck call to be updated").toBeGreaterThanOrEqual(1);

    const fixes = await getVoiceBackfillRecentFixes();
    const ourFix = fixes.find((f) => f.callSid === TEST_CALL_SID);

    expect(
      ourFix,
      `No fix entry found for callSid ${TEST_CALL_SID} — backfill may have skipped the seeded call`,
    ).toBeDefined();

    // These assertions are the core of the integration test: if the name-lookup
    // JOIN fails (wrong column name, missing table, schema drift) the backfill
    // silently stores null here.  An explicit non-null assertion turns that
    // silent failure into a loud test failure.
    expect(
      ourFix!.vendorName,
      "vendorName is null — the vendors name-lookup JOIN failed or returned no rows; check for schema drift",
    ).not.toBeNull();

    expect(
      ourFix!.campaignName,
      "campaignName is null — the voice_campaigns name-lookup JOIN failed or returned no rows; check for schema drift",
    ).not.toBeNull();

    // Confirm the exact names match what we seeded.
    expect(ourFix!.vendorName).toBe("Integration Test Vendor — voice backfill");
    expect(ourFix!.campaignName).toBe("Integration Test Campaign — voice backfill");

    // Confirm the status transition was captured correctly.
    expect(ourFix!.fromStatus).toBe("in-progress");
    expect(ourFix!.toStatus).toBe("completed");

    // Confirm the IDs are wired correctly too.
    expect(ourFix!.vendorId).toBe(seedVendorId);
    expect(ourFix!.campaignId).toBe(seedCampaignId);
  });
});
