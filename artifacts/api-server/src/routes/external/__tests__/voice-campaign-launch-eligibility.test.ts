/**
 * Tests for POST /external/voice-campaigns/:id/launch and
 * PATCH /external/voice-campaigns/:id covering:
 *
 * Launch eligibility:
 *   - draft campaigns can be launched
 *   - scheduled campaigns can be launched
 *   - running campaigns are rejected with 409
 *   - completed campaigns are rejected with 409 (prevents duplicate outbound calls)
 *   - failed campaigns are rejected with 409
 *
 * PATCH eligibility:
 *   - draft/scheduled campaigns can be edited
 *   - running/completed/failed campaigns are rejected with 409
 *   - empty body (no fields) is rejected with 400
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mutable state captured by mock closures ──────────────────────────────────

let campaignRow: {
  id: number;
  vendorId: number;
  name: string;
  script: string;
  status: string;
  scheduledAt: Date | null;
  createdAt: Date;
} | null = null;

let transitionedStatus: string | null = null;

// Tracks how many times db.select().from().where() has been called per-test
// so we can return campaign on call #1 and leads on call #2.
let selectCallCount = 0;

const leadsRows = [{ id: 1, vendorId: 10, phone: "+14155552671", name: "Alice" }];

// ─── Module mocks — must be at top level so Vitest hoists them ───────────────

// External router's DB access
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => {
          selectCallCount += 1;
          if (selectCallCount === 1) {
            // First query: campaign fetch
            return Promise.resolve(campaignRow ? [campaignRow] : []);
          }
          // Second query: leads fetch
          return Promise.resolve(leadsRows);
        },
      }),
    }),
    update: () => ({
      set: (vals: { status: string }) => ({
        where: () => ({
          returning: () => {
            if (
              !campaignRow ||
              (campaignRow.status !== "draft" && campaignRow.status !== "scheduled")
            ) {
              return Promise.resolve([]);
            }
            transitionedStatus = vals.status;
            return Promise.resolve([{ ...campaignRow, status: vals.status }]);
          },
        }),
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  voiceCampaignsTable: { id: "vc.id", vendorId: "vc.vendorId", status: "vc.status" },
  voiceCampaignCallsTable: { campaignId: "vcc.campaignId" },
  leadsTable: { vendorId: "l.vendorId" },
  // vendorsTable is imported by lib/usage.ts — include it so the fallback
  // real usage path (if mocked incorrectly) doesn't throw "no export".
  vendorsTable: { id: "v.id", subscriptionTier: "v.subscriptionTier" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ eq: { a, b } }),
  and: (...args: unknown[]) => ({ and: args }),
  desc: (a: unknown) => a,
  // sql template tag — return an object that won't throw when used as a where clause
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings.raw.join(""),
      values,
    }),
    { raw: () => ({}) },
  ),
}));

// From src/routes/external/__tests__/, ../../../lib/usage resolves to src/lib/usage.ts
vi.mock("../../../lib/usage", () => ({
  getVendorForUsage: () =>
    Promise.resolve({ id: 10, subscriptionTier: "starter", voiceMinutesUsed: "0" }),
  checkQuota: () => Promise.resolve({ allowed: true, quota: 60, used: 0 }),
  consumeQuota: () => Promise.resolve({ allowed: true }),
  releaseQuota: () => Promise.resolve(),
  getBillingPeriodStart: () => new Date("2026-07-01"),
  VOICE_CALL_RESERVATION_MINUTES: 1,
}));

// Mock the web voice-campaigns module that external/voice-campaigns.ts imports
// runCampaignCalls from. From this test file's location:
//   routes/external/__tests__/ → ../../voice-campaigns resolves to routes/voice-campaigns.ts
vi.mock("../../voice-campaigns", () => ({
  runCampaignCalls: () => Promise.resolve(),
}));

// requireExternalAuth lives at src/middlewares/ — mocked so the router.use()
// call doesn't fail on import, but tests extract handlers directly so it's
// never actually invoked in the request path.
vi.mock("../../../middlewares/requireExternalAuth", () => ({
  requireExternalAuth: (_req: any, _res: any, next: () => void) => next(),
}));

// ─── Import the module under test after mocks are registered ─────────────────

const { default: externalVoiceCampaignsRouter } = await import("../voice-campaigns");

// ─── Test helpers ─────────────────────────────────────────────────────────────

function findRoute(
  router: any,
  path: string,
  method: "post" | "patch",
): (req: any, res: any) => Promise<void> {
  const layer = router.stack.find(
    (l: any) => l.route?.path === path && l.route.methods[method],
  );
  if (!layer) throw new Error(`${method.toUpperCase()} ${path} not found in router stack`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function makeReqRes(campaignId: number, body: Record<string, unknown> = {}) {
  const req: any = {
    params: { id: String(campaignId) },
    externalUser: { vendorId: 10 },
    body,
  };
  const res: any = {};
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return { req, res };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /external/voice-campaigns/:id/launch — status eligibility guard", () => {
  beforeEach(() => {
    transitionedStatus = null;
    selectCallCount = 0;
  });

  it("allows launch of a draft campaign (responds 200 with totalCalls)", async () => {
    campaignRow = {
      id: 7, vendorId: 10, name: "Test draft", script: "Hello {{name}}",
      status: "draft", scheduledAt: null, createdAt: new Date(),
    };
    const handler = findRoute(externalVoiceCampaignsRouter, "/voice-campaigns/:id/launch", "post");
    const { req, res } = makeReqRes(7);

    await handler(req, res);

    expect(res.statusCode).toBeUndefined(); // no .status() called = implicit 200
    expect(res.body?.totalCalls).toBe(1);
  });

  it("allows launch of a scheduled campaign", async () => {
    campaignRow = {
      id: 8, vendorId: 10, name: "Test scheduled", script: "Hi {{name}}",
      status: "scheduled", scheduledAt: new Date("2026-07-20T10:00:00Z"),
      createdAt: new Date(),
    };
    const handler = findRoute(externalVoiceCampaignsRouter, "/voice-campaigns/:id/launch", "post");
    const { req, res } = makeReqRes(8);

    await handler(req, res);

    expect(res.statusCode).toBeUndefined();
    expect(res.body?.totalCalls).toBe(1);
  });

  it("rejects launch of a running campaign with 409", async () => {
    campaignRow = {
      id: 9, vendorId: 10, name: "Already running", script: "Hi {{name}}",
      status: "running", scheduledAt: null, createdAt: new Date(),
    };
    const handler = findRoute(externalVoiceCampaignsRouter, "/voice-campaigns/:id/launch", "post");
    const { req, res } = makeReqRes(9);

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toMatch(/already running/i);
    expect(transitionedStatus).toBeNull();
  });

  it("rejects launch of a completed campaign with 409 — prevents re-calling leads", async () => {
    campaignRow = {
      id: 10, vendorId: 10, name: "Completed campaign", script: "Hi {{name}}",
      status: "completed", scheduledAt: null, createdAt: new Date(),
    };
    const handler = findRoute(externalVoiceCampaignsRouter, "/voice-campaigns/:id/launch", "post");
    const { req, res } = makeReqRes(10);

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toContain("completed");
    expect(transitionedStatus).toBeNull();
  });

  it("rejects launch of a failed campaign with 409 — prevents re-calling leads", async () => {
    campaignRow = {
      id: 11, vendorId: 10, name: "Failed campaign", script: "Hi {{name}}",
      status: "failed", scheduledAt: null, createdAt: new Date(),
    };
    const handler = findRoute(externalVoiceCampaignsRouter, "/voice-campaigns/:id/launch", "post");
    const { req, res } = makeReqRes(11);

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toContain("failed");
    expect(transitionedStatus).toBeNull();
  });
});

describe("PATCH /external/voice-campaigns/:id — edit eligibility and empty-body guard", () => {
  beforeEach(() => {
    transitionedStatus = null;
    selectCallCount = 0;
  });

  it("allows editing a draft campaign", async () => {
    campaignRow = {
      id: 20, vendorId: 10, name: "Draft to edit", script: "Old script",
      status: "draft", scheduledAt: null, createdAt: new Date(),
    };
    const handler = findRoute(externalVoiceCampaignsRouter, "/voice-campaigns/:id", "patch");
    const { req, res } = makeReqRes(20, { name: "Updated name" });

    await handler(req, res);

    // On success, no error status — the mocked update returns the updated row
    expect(res.statusCode).not.toBe(409);
    expect(res.statusCode).not.toBe(400);
  });

  it("allows editing a scheduled campaign", async () => {
    campaignRow = {
      id: 21, vendorId: 10, name: "Scheduled to edit", script: "Hi {{name}}",
      status: "scheduled", scheduledAt: new Date("2026-07-25T09:00:00Z"),
      createdAt: new Date(),
    };
    const handler = findRoute(externalVoiceCampaignsRouter, "/voice-campaigns/:id", "patch");
    const { req, res } = makeReqRes(21, { script: "New script content" });

    await handler(req, res);

    expect(res.statusCode).not.toBe(409);
    expect(res.statusCode).not.toBe(400);
  });

  it("rejects editing a running campaign with 409", async () => {
    campaignRow = {
      id: 22, vendorId: 10, name: "Running campaign", script: "Hi {{name}}",
      status: "running", scheduledAt: null, createdAt: new Date(),
    };
    const handler = findRoute(externalVoiceCampaignsRouter, "/voice-campaigns/:id", "patch");
    const { req, res } = makeReqRes(22, { name: "Attempted rename" });

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toMatch(/running/i);
  });

  it("rejects editing a completed campaign with 409 — cannot re-enable for launch", async () => {
    campaignRow = {
      id: 23, vendorId: 10, name: "Completed campaign", script: "Hi {{name}}",
      status: "completed", scheduledAt: null, createdAt: new Date(),
    };
    const handler = findRoute(externalVoiceCampaignsRouter, "/voice-campaigns/:id", "patch");
    const { req, res } = makeReqRes(23, { name: "New name" });

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toMatch(/completed/i);
  });

  it("rejects editing a failed campaign with 409 — prevents re-enabling for launch", async () => {
    campaignRow = {
      id: 24, vendorId: 10, name: "Failed campaign", script: "Hi {{name}}",
      status: "failed", scheduledAt: null, createdAt: new Date(),
    };
    const handler = findRoute(externalVoiceCampaignsRouter, "/voice-campaigns/:id", "patch");
    const { req, res } = makeReqRes(24, { name: "Attempted rename" });

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toMatch(/failed/i);
  });

  it("rejects an empty body (no fields provided) with 400", async () => {
    campaignRow = {
      id: 25, vendorId: 10, name: "Draft campaign", script: "Hi {{name}}",
      status: "draft", scheduledAt: null, createdAt: new Date(),
    };
    const handler = findRoute(externalVoiceCampaignsRouter, "/voice-campaigns/:id", "patch");
    const { req, res } = makeReqRes(25, {}); // empty body

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toMatch(/at least one field/i);
  });
});
