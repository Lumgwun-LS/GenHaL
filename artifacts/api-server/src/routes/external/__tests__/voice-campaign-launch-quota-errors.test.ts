/**
 * Tests for POST /external/voice-campaigns/:id/launch — quota and lead
 * validation error paths.
 *
 * The mobile app's handleLaunch catch block reads `err.message` to decide what
 * text goes into Alert.alert('Launch failed', msg).  Because the mobile uses
 * customFetch (lib/api-client-react/src/custom-fetch.ts), that property is set
 * by ApiError.buildErrorMessage(), which pulls the `error` field out of a JSON
 * response body and prepends the HTTP status line.
 *
 * These tests verify two things for each error case:
 *   1. The route handler returns the correct HTTP status and `error` body field.
 *   2. ApiError.message — built from that same body — contains the server's
 *      human-readable text so the mobile Alert shows the real reason instead of
 *      the generic "Could not launch campaign. Please try again." fallback.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Local ApiError stub — replicates the real class without importing outside rootDir ──
function _buildApiErrorMsg(res: { status: number; statusText: string }, data: unknown): string {
  const prefix = `HTTP ${res.status} ${res.statusText}`;
  const getString = (key: string): string | undefined => {
    if (!data || typeof data !== "object") return undefined;
    const v = (data as Record<string, unknown>)[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  if (typeof data === "string" && data.trim()) return `${prefix}: ${data.trim()}`;
  const detail = getString("detail");
  const title = getString("title");
  const msg = getString("message") ?? getString("error_description") ?? getString("error");
  if (title && detail) return `${prefix}: ${title} — ${detail}`;
  if (detail) return `${prefix}: ${detail}`;
  if (msg) return `${prefix}: ${msg}`;
  if (title) return `${prefix}: ${title}`;
  return prefix;
}
class ApiError<T = unknown> extends Error {
  readonly name = "ApiError";
  readonly status: number;
  readonly data: T | null;
  constructor(
    response: { status: number; statusText: string; headers: unknown; url: string },
    data: T | null,
    _info: { method: string; url: string },
  ) {
    super(_buildApiErrorMsg(response, data));
    Object.setPrototypeOf(this, new.target.prototype);
    this.status = response.status;
    this.data = data;
  }
}

// ─── Mutable state shared by mock closures ────────────────────────────────────

let campaignRow: {
  id: number;
  vendorId: number;
  name: string;
  script: string;
  status: string;
  scheduledAt: Date | null;
  createdAt: Date;
} | null = null;

/** Controls what the leads query returns. */
let mockLeadsRows: { id: number; vendorId: number; phone: string | null; name: string }[] = [];

/**
 * Call-counter so the mock can tell "first select = campaign, second = leads"
 * (same pattern as the eligibility test).
 */
let selectCallCount = 0;

/** Controls checkQuota return value. */
let mockQuotaResult: { allowed: boolean; quota: number; used: number } = {
  allowed: true,
  quota: 60,
  used: 0,
};

// ─── Module mocks — must be at top level so Vitest hoists them ───────────────

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => {
          selectCallCount += 1;
          if (selectCallCount === 1) {
            // First query: campaign lookup
            return Promise.resolve(campaignRow ? [campaignRow] : []);
          }
          // Second query: leads lookup
          return Promise.resolve(mockLeadsRows);
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => {
            // If we reach this point the status/lead/quota guards all passed —
            // return the transitioned campaign row.
            return Promise.resolve(
              campaignRow
                ? [{ ...campaignRow, status: "running" }]
                : [],
            );
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
  vendorsTable: { id: "v.id", subscriptionTier: "v.subscriptionTier" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ eq: { a, b } }),
  and: (...args: unknown[]) => ({ and: args }),
  desc: (a: unknown) => a,
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings.raw.join(""),
      values,
    }),
    { raw: () => ({}) },
  ),
}));

vi.mock("../../../lib/usage", () => ({
  getVendorForUsage: () =>
    Promise.resolve({ id: 10, subscriptionTier: "starter", voiceMinutesUsed: "0" }),
  checkQuota: () => Promise.resolve(mockQuotaResult),
  consumeQuota: () => Promise.resolve({ allowed: true }),
  releaseQuota: () => Promise.resolve(),
  getBillingPeriodStart: () => new Date("2026-07-01"),
  VOICE_CALL_RESERVATION_MINUTES: 1,
}));

vi.mock("../../voice-campaigns", () => ({
  runCampaignCalls: () => Promise.resolve(),
}));

vi.mock("../../../middlewares/requireExternalAuth", () => ({
  requireExternalAuth: (_req: any, _res: any, next: () => void) => next(),
}));

// ─── Import the module under test after mocks are registered ─────────────────

const { default: externalVoiceCampaignsRouter } = await import("../voice-campaigns");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findLaunchHandler(router: any): (req: any, res: any) => Promise<void> {
  const layer = router.stack.find(
    (l: any) => l.route?.path === "/voice-campaigns/:id/launch" && l.route.methods.post,
  );
  if (!layer) throw new Error("POST /voice-campaigns/:id/launch not found in router stack");
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function makeReqRes(campaignId: number) {
  const req: any = {
    params: { id: String(campaignId) },
    externalUser: { vendorId: 10 },
    body: {},
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

/**
 * Simulates how customFetch / ApiError constructs err.message from a route
 * response, which is what the mobile handleLaunch catch block reads.
 *
 * ApiError.message = buildErrorMessage(response, data), where buildErrorMessage
 * picks up the `error` field from the JSON body and prepends the HTTP status.
 */
function simulateMobileErrMessage(status: number, statusText: string, body: unknown): string {
  const fakeResponse = {
    status,
    statusText,
    url: "/api/external/voice-campaigns/5/launch",
    headers: new Headers({ "content-type": "application/json" }),
    ok: false,
  } as unknown as Response;

  const err = new ApiError(fakeResponse, body, {
    method: "POST",
    url: "/api/external/voice-campaigns/5/launch",
  });
  return err.message;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /external/voice-campaigns/:id/launch — no callable leads (400)", () => {
  beforeEach(() => {
    selectCallCount = 0;
    // A valid draft campaign so status/ownership checks pass
    campaignRow = {
      id: 5,
      vendorId: 10,
      name: "Test campaign",
      script: "Hello {{name}}",
      status: "draft",
      scheduledAt: null,
      createdAt: new Date(),
    };
    mockQuotaResult = { allowed: true, quota: 60, used: 0 };
  });

  it("returns 400 when the vendor has no leads at all", async () => {
    mockLeadsRows = [];
    const handler = findLaunchHandler(externalVoiceCampaignsRouter);
    const { req, res } = makeReqRes(5);

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when all leads have null or invalid phone numbers", async () => {
    mockLeadsRows = [
      { id: 1, vendorId: 10, phone: null, name: "No Phone" },
      { id: 2, vendorId: 10, phone: "555-1234", name: "Bad Format" },
      { id: 3, vendorId: 10, phone: "0080123456", name: "No Plus" },
    ];
    const handler = findLaunchHandler(externalVoiceCampaignsRouter);
    const { req, res } = makeReqRes(5);

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toMatch(/E\.164/i);
  });

  it("error body contains actionable guidance about E.164 format", async () => {
    mockLeadsRows = [];
    const handler = findLaunchHandler(externalVoiceCampaignsRouter);
    const { req, res } = makeReqRes(5);

    await handler(req, res);

    // The error must tell the vendor what to do, not just that it failed
    expect(res.body?.error).toMatch(/phone numbers/i);
    expect(res.body?.error).toMatch(/\+/); // hint that numbers should start with +
  });

  it("ApiError.message includes the server error text so mobile Alert shows the real reason", async () => {
    mockLeadsRows = [];
    const handler = findLaunchHandler(externalVoiceCampaignsRouter);
    const { req, res } = makeReqRes(5);

    await handler(req, res);

    // The route's error field is the text the mobile must surface
    const serverErrorText = res.body?.error as string;
    expect(serverErrorText).toBeTruthy();

    // Simulate how customFetch / ApiError builds err.message
    const errMessage = simulateMobileErrMessage(400, "Bad Request", res.body);

    // err.message should contain the route's own wording so the vendor
    // understands why the launch failed instead of seeing the generic fallback
    expect(errMessage).toContain(serverErrorText);

    // And it must not be the generic mobile fallback
    expect(errMessage).not.toBe("Could not launch campaign. Please try again.");
  });
});

describe("POST /external/voice-campaigns/:id/launch — quota exceeded (402)", () => {
  beforeEach(() => {
    selectCallCount = 0;
    campaignRow = {
      id: 5,
      vendorId: 10,
      name: "Test campaign",
      script: "Hello {{name}}",
      status: "draft",
      scheduledAt: null,
      createdAt: new Date(),
    };
    // Provide one valid E.164 lead so we reach the quota check
    mockLeadsRows = [{ id: 1, vendorId: 10, phone: "+14155552671", name: "Alice" }];
    // Quota exhausted
    mockQuotaResult = { allowed: false, quota: 60, used: 60 };
  });

  it("returns 402 when the vendor has no remaining voice-minutes quota", async () => {
    const handler = findLaunchHandler(externalVoiceCampaignsRouter);
    const { req, res } = makeReqRes(5);

    await handler(req, res);

    expect(res.statusCode).toBe(402);
    expect(res.body).toHaveProperty("error");
  });

  it("402 error body mentions the quota limit and current plan", async () => {
    const handler = findLaunchHandler(externalVoiceCampaignsRouter);
    const { req, res } = makeReqRes(5);

    await handler(req, res);

    // Quota number from mockQuotaResult
    expect(res.body?.error).toContain("60");
    // Plan name from getVendorForUsage mock
    expect(res.body?.error).toMatch(/starter/i);
  });

  it("402 error body suggests upgrading the plan", async () => {
    const handler = findLaunchHandler(externalVoiceCampaignsRouter);
    const { req, res } = makeReqRes(5);

    await handler(req, res);

    expect(res.body?.error).toMatch(/upgrade/i);
  });

  it("402 response includes a usage object for programmatic handling", async () => {
    const handler = findLaunchHandler(externalVoiceCampaignsRouter);
    const { req, res } = makeReqRes(5);

    await handler(req, res);

    // The route attaches `usage: quotaCheck` alongside the error string so a
    // future mobile UI can show a progress bar without parsing the message.
    expect(res.body).toHaveProperty("usage");
    expect(res.body.usage).toMatchObject({ allowed: false, quota: 60, used: 60 });
  });

  it("ApiError.message includes the server error text so mobile Alert shows the real reason", async () => {
    const handler = findLaunchHandler(externalVoiceCampaignsRouter);
    const { req, res } = makeReqRes(5);

    await handler(req, res);

    const serverErrorText = res.body?.error as string;
    expect(serverErrorText).toBeTruthy();

    const errMessage = simulateMobileErrMessage(402, "Payment Required", res.body);

    expect(errMessage).toContain(serverErrorText);
    expect(errMessage).not.toBe("Could not launch campaign. Please try again.");
  });
});

describe("POST /external/voice-campaigns/:id/launch — success path is unaffected", () => {
  beforeEach(() => {
    selectCallCount = 0;
    campaignRow = {
      id: 5,
      vendorId: 10,
      name: "Test campaign",
      script: "Hello {{name}}",
      status: "draft",
      scheduledAt: null,
      createdAt: new Date(),
    };
    mockLeadsRows = [{ id: 1, vendorId: 10, phone: "+14155552671", name: "Alice" }];
    mockQuotaResult = { allowed: true, quota: 60, used: 0 };
  });

  it("returns 200 with totalCalls when all guards pass", async () => {
    const handler = findLaunchHandler(externalVoiceCampaignsRouter);
    const { req, res } = makeReqRes(5);

    await handler(req, res);

    // No error status set = implicit 200
    expect(res.statusCode).toBeUndefined();
    expect(res.body?.totalCalls).toBe(1);
    expect(res.body?.message).toMatch(/launching/i);
  });
});
