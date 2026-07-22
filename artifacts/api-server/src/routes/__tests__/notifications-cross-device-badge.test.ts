/**
 * Cross-device unread badge count consistency
 *
 * Both the web notification bell and the mobile Alerts tab independently poll
 * GET /vendors/:id/notifications every 60 seconds.  Read state lives in the
 * database (vendor_notifications.readAt), so any write made from one device is
 * immediately visible to the next poll from any other device.
 *
 * These tests confirm the three scenarios described in the task:
 *
 *  1. Mark one notification read on web → mobile poll clears that badge dot
 *  2. Mark one notification read on mobile → web bell count drops on next poll
 *  3. Mark ALL read on one device → the other device's next poll shows 0 unread
 *     (the badge must not re-appear)
 *
 * All three scenarios exercise the same pair of server routes:
 *   GET  /vendors/:id/notifications          — called by both clients
 *   PATCH /vendors/:id/notifications/:nid/read  — mark-single (web and mobile)
 *   PATCH /vendors/:id/notifications/read-all   — mark-all (web and mobile)
 *
 * The cross-device property is a direct consequence of the shared DB state:
 * once readAt is set by any PATCH, every subsequent GET returns that value.
 * The tests verify this is actually the case and that no optimistic-only or
 * client-local state can hide it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.ADMIN_USER_IDS = "admin_user_1";

// ---------------------------------------------------------------------------
// Shared mutable DB state — tests overwrite per-scenario
// ---------------------------------------------------------------------------

type NotificationRow = {
  id: number;
  vendorId: number;
  type: string;
  message: string;
  adminUserId: string | null;
  adminDisplayName: string | null;
  readAt: Date | null;
  emailFailed: boolean;
  createdAt: Date;
  resourceId: number | null;
};

let notificationRows: NotificationRow[] = [];
let vendorRow = { id: 1, clerkUserId: "vendor_clerk_1", announcementEmailOptOut: false };

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (cond: unknown) => {
          const c = cond as any;
          // Vendor lookup: `eq(vendorsTable.id, id)` → { a: "vendors.id", b: <id> }
          // (no `.args` wrapper — it's a plain eq, not an and())
          if (!c?.args) {
            // Return a promise-like that also has orderBy for chaining safety
            const result = Promise.resolve([vendorRow]);
            return result;
          }
          // Notifications query: `and(eq(...), ne(...))` → { args: [...] }
          // Return something that is thenable AND has .orderBy().limit()
          const rows = notificationRows.filter((n) => n.vendorId === 1);
          const chainable = {
            orderBy: () => ({
              limit: () => Promise.resolve(rows),
            }),
            then: (resolve: any, reject: any) =>
              Promise.resolve(rows).then(resolve, reject),
          };
          return chainable;
        },
      }),
    }),
    update: () => ({
      set: (patch: Partial<NotificationRow>) => ({
        where: (cond: unknown) => ({
          returning: () => {
            const c = cond as any;

            // PATCH read-all: and(eq(vendorId, id), isNull(readAt))
            // One of the args will have `.isNull` property
            const hasIsNull = c?.args?.some((arg: any) => arg?.isNull !== undefined);
            if (hasIsNull) {
              const now = new Date();
              const updated: NotificationRow[] = [];
              notificationRows = notificationRows.map((n) => {
                if (n.vendorId === 1 && n.readAt === null) {
                  const next = { ...n, ...patch, readAt: now };
                  updated.push(next);
                  return next;
                }
                return n;
              });
              return Promise.resolve(updated);
            }

            // PATCH /:nid/read: and(eq(notifications.id, nid), eq(notifications.vendorId, id))
            // Both args have `.a` and `.b`; the notification id is the first arg's `.b`
            const notifIdArg = c?.args?.[0]?.b ?? c?.args?.[1]?.b;
            const targetId = typeof notifIdArg === "number" ? notifIdArg : Number(notifIdArg);
            const now = new Date();
            let matched: NotificationRow | undefined;
            notificationRows = notificationRows.map((n) => {
              if (n.id === targetId) {
                matched = { ...n, ...patch, readAt: now };
                return matched;
              }
              return n;
            });
            return Promise.resolve(matched ? [matched] : []);
          },
        }),
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  vendorsTable: { id: "vendors.id", clerkUserId: "vendors.clerkUserId" },
  vendorNotificationsTable: {
    id: "vendorNotifications.id",
    vendorId: "vendorNotifications.vendorId",
    readAt: "vendorNotifications.readAt",
    type: "vendorNotifications.type",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  and: (...args: unknown[]) => ({ args }),
  desc: (a: unknown) => a,
  inArray: (a: unknown, b: unknown) => ({ a, b }),
  isNull: (a: unknown) => ({ isNull: a }),
  ne: (a: unknown, b: unknown) => ({ ne: a, b }),
}));

let currentUserId = "vendor_clerk_1";

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: currentUserId }),
  clerkClient: {
    users: {
      getUser: () =>
        Promise.resolve({
          firstName: "Test",
          lastName: "User",
          username: null,
          primaryEmailAddress: null,
          emailAddresses: [],
        }),
    },
  },
}));

vi.mock("../../lib/mailer", () => ({
  sendEmail: () => Promise.resolve({ status: "sent" as const }),
}));

vi.mock("../../lib/email-branding", () => ({
  wrapVendorEmail: ({ bodyHtml }: { bodyHtml: string }) => bodyHtml,
  escapeHtml: (s: string) => s,
}));

// ---------------------------------------------------------------------------
// Route loader helpers
// ---------------------------------------------------------------------------

async function loadRouter() {
  const mod = await import("../notifications");
  return mod.default;
}

function findHandler(
  router: any,
  method: "get" | "patch",
  pathSuffix: string,
): (req: any, res: any) => Promise<void> {
  const layer = router.stack.find(
    (l: any) => l.route?.path?.endsWith(pathSuffix) && l.route.methods[method],
  );
  if (!layer) throw new Error(`${method.toUpperCase()} ...${pathSuffix} handler not found`);
  return layer.route.stack[0].handle;
}

function makeRes() {
  const res: any = { statusCode: 200 };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNotification(id: number, readAt: Date | null = null): NotificationRow {
  return {
    id,
    vendorId: 1,
    type: "general",
    message: `Notification ${id}`,
    adminUserId: null,
    adminDisplayName: null,
    readAt,
    emailFailed: false,
    createdAt: new Date("2026-07-01T10:00:00Z"),
    resourceId: null,
  };
}

// ---------------------------------------------------------------------------
// Helper: simulate one GET poll and return the unread count
// ---------------------------------------------------------------------------

async function pollUnreadCount(getHandler: (req: any, res: any) => Promise<void>): Promise<number> {
  const req = { params: { id: "1" } };
  const res = makeRes();
  await getHandler(req, res);
  const notifications: NotificationRow[] = res.body;
  return notifications.filter((n) => !n.readAt).length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Cross-device unread badge count consistency", () => {
  let getHandler: (req: any, res: any) => Promise<void>;
  let markReadHandler: (req: any, res: any) => Promise<void>;
  let markAllReadHandler: (req: any, res: any) => Promise<void>;

  beforeEach(async () => {
    currentUserId = "vendor_clerk_1";
    notificationRows = [
      makeNotification(101),
      makeNotification(102),
      makeNotification(103),
    ];

    const router = await loadRouter();
    getHandler = findHandler(router, "get", "/vendors/:id/notifications");
    markReadHandler = findHandler(router, "patch", "/vendors/:id/notifications/:nid/read");
    markAllReadHandler = findHandler(router, "patch", "/vendors/:id/notifications/read-all");
  });

  // ─── Scenario 1: mark one read on "web" ────────────────────────────────────
  it("mobile poll reflects a single notification marked read on web", async () => {
    // Both devices start with 3 unread
    const webBefore = await pollUnreadCount(getHandler);
    const mobileBefore = await pollUnreadCount(getHandler);
    expect(webBefore).toBe(3);
    expect(mobileBefore).toBe(3);

    // Web device marks notification 101 as read
    const patchReq = { params: { id: "1", nid: "101" }, body: {} };
    const patchRes = makeRes();
    await markReadHandler(patchReq, patchRes);
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.body).toMatchObject({ id: 101, vendorId: 1 });
    expect(patchRes.body.readAt).not.toBeNull();

    // Mobile's next poll (simulated by calling GET again) now shows 2 unread
    const mobileAfter = await pollUnreadCount(getHandler);
    expect(mobileAfter).toBe(2);

    // Web's own next poll also shows 2 (not stale/inconsistent)
    const webAfter = await pollUnreadCount(getHandler);
    expect(webAfter).toBe(2);
  });

  // ─── Scenario 2: mark one read on "mobile" ─────────────────────────────────
  it("web bell count drops on next poll after mobile marks a notification read", async () => {
    // Mobile device marks notification 102 as read
    const patchReq = { params: { id: "1", nid: "102" }, body: {} };
    const patchRes = makeRes();
    await markReadHandler(patchReq, patchRes);
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.body.readAt).not.toBeNull();

    // Web bell's next poll shows 2 unread (was 3)
    const webUnread = await pollUnreadCount(getHandler);
    expect(webUnread).toBe(2);

    // Mobile's own next poll also shows 2 (consistent)
    const mobileUnread = await pollUnreadCount(getHandler);
    expect(mobileUnread).toBe(2);
  });

  // ─── Scenario 3: mark ALL read on web → mobile badge stays at 0 ────────────
  it("mobile badge does not re-appear after web marks all notifications read", async () => {
    // Web hits "Mark all as read"
    const patchAllReq = { params: { id: "1" }, body: {} };
    const patchAllRes = makeRes();
    await markAllReadHandler(patchAllReq, patchAllRes);
    expect(patchAllRes.statusCode).toBe(200);
    expect(patchAllRes.body).toMatchObject({ updated: 3 });

    // Mobile's next poll shows 0 unread — badge must not re-appear
    const mobileAfter = await pollUnreadCount(getHandler);
    expect(mobileAfter).toBe(0);

    // A second mobile poll (simulating the 60-second refetch) still shows 0
    const mobileSecondPoll = await pollUnreadCount(getHandler);
    expect(mobileSecondPoll).toBe(0);

    // Web's own poll also shows 0
    const webAfter = await pollUnreadCount(getHandler);
    expect(webAfter).toBe(0);
  });

  // ─── Scenario 4: mark ALL read on mobile → web badge stays at 0 ───────────
  it("web bell badge does not re-appear after mobile marks all notifications read", async () => {
    // Mobile hits "Mark all read" (same endpoint)
    const patchAllReq = { params: { id: "1" }, body: {} };
    const patchAllRes = makeRes();
    await markAllReadHandler(patchAllReq, patchAllRes);
    expect(patchAllRes.statusCode).toBe(200);

    // Web bell's next poll shows 0 unread
    const webAfter = await pollUnreadCount(getHandler);
    expect(webAfter).toBe(0);

    // Web's own second poll (next 60-second tick) still 0
    const webSecondPoll = await pollUnreadCount(getHandler);
    expect(webSecondPoll).toBe(0);
  });

  // ─── Scenario 5: already-read notifications stay read on subsequent polls ───
  it("a notification marked read on one device stays read on all subsequent polls", async () => {
    // Mark 103 as read on web
    const patchReq = { params: { id: "1", nid: "103" }, body: {} };
    const patchRes = makeRes();
    await markReadHandler(patchReq, patchRes);
    expect(patchRes.statusCode).toBe(200);

    // Three consecutive polls (simulating several 60-second ticks on both devices)
    for (let i = 0; i < 3; i++) {
      const unread = await pollUnreadCount(getHandler);
      expect(unread).toBe(2); // 101 and 102 still unread, 103 stays read
    }
  });

  // ─── Scenario 6: mix — one from web, one from mobile, verify idempotent ────
  it("marking the same notification read twice (once per device) is idempotent", async () => {
    // Web marks 101 read
    const webPatch = { params: { id: "1", nid: "101" }, body: {} };
    const webRes = makeRes();
    await markReadHandler(webPatch, webRes);
    expect(webRes.statusCode).toBe(200);

    // Mobile also marks 101 read (it hadn't polled yet and hit the same button)
    const mobRes = makeRes();
    await markReadHandler(webPatch, mobRes);
    // Still a 200 — the update is a no-op (readAt already set, overwritten with same semantics)
    expect(mobRes.statusCode).toBe(200);

    // Next poll from either device still shows 2 unread (not 1, because 102 and 103 remain)
    const unread = await pollUnreadCount(getHandler);
    expect(unread).toBe(2);
  });
});
