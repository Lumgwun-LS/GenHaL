/**
 * Tests for PATCH /vendors/:id/notifications/:nid/read
 * covering:
 *  - 200 when the owning vendor marks their own notification read
 *  - 403 when a different vendor (wrong clerkUserId) tries to mark it read
 *  - 404 when the notification doesn't belong to the given vendor
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Set the admin list BEFORE any module is imported so the isAdmin() helper sees it.
process.env.ADMIN_USER_IDS = "admin_user_1";

// ---------------------------------------------------------------------------
// Shared mutable state — tests can overwrite these per-case
// ---------------------------------------------------------------------------

type VendorRow = {
  id: number;
  clerkUserId: string;
  name: string;
  email: string;
  announcementEmailOptOut: boolean;
};

let vendorRows: VendorRow[] = [];
let updateReturning: Record<string, unknown>[] = []; // what the UPDATE … RETURNING yields

// ---------------------------------------------------------------------------
// Module mocks (must be declared before any dynamic import of the route)
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(vendorRows),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve(updateReturning),
        }),
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  vendorsTable: { id: "vendors.id", clerkUserId: "vendors.clerkUserId" },
  vendorNotificationsTable: { id: "vendorNotifications.id", vendorId: "vendorNotifications.vendorId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  and: (...args: unknown[]) => ({ args }),
  desc: (a: unknown) => a,
  inArray: (a: unknown, b: unknown) => ({ a, b }),
  isNull: (a: unknown) => ({ isNull: a }),
}));

// The caller identity is controlled per-test by setting this variable.
let currentUserId = "vendor_clerk_1";

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: currentUserId }),
  clerkClient: {
    users: {
      getUser: () =>
        Promise.resolve({
          firstName: "Test",
          lastName: "Admin",
          username: null,
          primaryEmailAddress: null,
          emailAddresses: [],
        }),
    },
  },
}));

// Mailer is imported transitively by notifications.ts; stub it out.
vi.mock("../../lib/mailer", () => ({
  sendEmail: () => Promise.resolve({ status: "sent" as const }),
}));

// ---------------------------------------------------------------------------
// Helper: load the router once, then find the PATCH /:id/notifications/:nid/read handler
// ---------------------------------------------------------------------------

async function loadRouter() {
  const mod = await import("../notifications");
  return mod.default;
}

function findReadHandler(router: any): (req: any, res: any) => Promise<void> {
  const layer = router.stack.find(
    (l: any) =>
      l.route?.path === "/vendors/:id/notifications/:nid/read" &&
      l.route.methods.patch,
  );
  if (!layer) throw new Error("PATCH /:id/notifications/:nid/read handler not found in router");
  return layer.route.stack[0].handle;
}

function makeReq(vendorId: number | string, notificationId: number | string) {
  return {
    params: { id: String(vendorId), nid: String(notificationId) },
    body: {},
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PATCH /vendors/:id/notifications/:nid/read — ownership guard", () => {
  let handler: (req: any, res: any) => Promise<void>;

  beforeEach(async () => {
    // Reset to a known state: one vendor whose clerkUserId matches vendor_clerk_1
    vendorRows = [
      {
        id: 1,
        clerkUserId: "vendor_clerk_1",
        name: "Owning Vendor",
        email: "owner@example.com",
        announcementEmailOptOut: false,
      },
    ];
    // Default: the notification exists and belongs to vendor 1
    updateReturning = [
      { id: 10, vendorId: 1, type: "general", message: "Hello", readAt: new Date() },
    ];
    currentUserId = "vendor_clerk_1";

    handler = findReadHandler(await loadRouter());
  });

  it("returns 200 and the updated notification when the owning vendor marks it read", async () => {
    const req = makeReq(1, 10);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ id: 10, vendorId: 1 });
  });

  it("returns 403 when a different vendor (wrong clerkUserId) tries to mark it read", async () => {
    // Caller is a completely different Clerk user who doesn't own vendor 1
    currentUserId = "vendor_clerk_OTHER";

    const req = makeReq(1, 10);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: "Forbidden" });
  });

  it("returns 404 when the notification ID doesn't belong to the vendor (DB returns empty)", async () => {
    // The owning vendor is authenticated correctly but the notification belongs to
    // a different vendor — the WHERE clause (id=nid AND vendorId=vid) returns nothing.
    updateReturning = [];

    const req = makeReq(1, 999); // notification 999 doesn't exist for vendor 1
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: "Notification not found" });
  });

  it("returns 403 even when the notification exists but the caller owns a different vendor", async () => {
    // Simulate: vendor 2 row in DB for this request, caller is vendor_clerk_2.
    // We set vendorRows to return vendor 2 whose clerkUserId is vendor_clerk_2,
    // but the authenticated user is vendor_clerk_OTHER — so it should still 403.
    vendorRows = [
      {
        id: 2,
        clerkUserId: "vendor_clerk_2",
        name: "Other Vendor",
        email: "other@example.com",
        announcementEmailOptOut: false,
      },
    ];
    currentUserId = "vendor_clerk_OTHER";

    const req = makeReq(2, 10);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: "Forbidden" });
  });

  it("allows an admin to mark any vendor's notification read", async () => {
    // Admin user ID is in ADMIN_USER_IDS
    currentUserId = "admin_user_1";

    const req = makeReq(1, 10);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ id: 10, vendorId: 1 });
  });
});
