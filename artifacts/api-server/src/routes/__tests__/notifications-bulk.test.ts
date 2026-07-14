/**
 * Tests for POST /vendors/notifications/bulk (bulk admin announcements)
 * covering:
 *  - each targeted vendor gets both an in-app notification row AND an email
 *    via the shared mailer, using the vendorhub email-branding wrapper.
 *  - a vendor with no email address is skipped for email but still gets the
 *    in-app notification.
 *  - a vendor who opted out of announcement emails is skipped for email but
 *    still gets the in-app notification.
 *  - the response reports how many emails actually sent.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.ADMIN_USER_IDS = "admin_1";

type VendorRow = { id: number; name: string; email: string; announcementEmailOptOut: boolean };

let vendorRows: VendorRow[] = [];
let insertedNotifications: Array<Record<string, unknown>> = [];
const sentEmails: Array<{ to: string; subject: string; html: string }> = [];

const vendorsTableRef = { id: "vendors.id", name: "vendors.name", email: "vendors.email" };
const vendorNotificationsTableRef = { id: "vendorNotifications.id" };

vi.mock("@workspace/db", () => ({
  db: {
    select: (cols?: unknown) => ({
      from: (table: unknown) => ({
        where: () => Promise.resolve(vendorRows),
        then: (resolve: (v: VendorRow[]) => unknown) => resolve(vendorRows),
      }),
    }),
    insert: (table: unknown) => ({
      values: (vals: Record<string, unknown>[]) => ({
        returning: () => {
          insertedNotifications = vals.map((v, i) => ({ id: i + 1, ...v, createdAt: new Date() }));
          return Promise.resolve(insertedNotifications);
        },
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  vendorsTable: { id: "vendors.id", name: "vendors.name", email: "vendors.email" },
  vendorNotificationsTable: vendorNotificationsTableRef,
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  and: (...args: unknown[]) => ({ args }),
  desc: (a: unknown) => a,
  inArray: (a: unknown, b: unknown) => ({ a, b }),
}));

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: "admin_1" }),
  clerkClient: {
    users: {
      getUser: () =>
        Promise.resolve({
          firstName: "Ada",
          lastName: "Admin",
          username: null,
          primaryEmailAddress: null,
          emailAddresses: [],
        }),
    },
  },
}));

vi.mock("../../lib/mailer", () => ({
  sendEmail: (opts: { to: string; subject: string; html: string }) => {
    sentEmails.push(opts);
    return Promise.resolve({ status: "sent" as const });
  },
}));

// Since notifications.ts imports "../lib/mailer" (one level up from routes/),
// but this test file lives in routes/__tests__/, mock both possible specifiers
// the module graph could resolve to, matching whichever vitest picks up.
vi.mock("../lib/mailer", () => ({
  sendEmail: (opts: { to: string; subject: string; html: string }) => {
    sentEmails.push(opts);
    return Promise.resolve({ status: "sent" as const });
  },
}));

async function loadRouterHandler() {
  const mod = await import("../notifications");
  return mod.default;
}

function findBulkHandler(router: any): (req: any, res: any) => Promise<void> {
  const layer = router.stack.find(
    (l: any) => l.route?.path === "/vendors/notifications/bulk" && l.route.methods.post,
  );
  return layer.route.stack[0].handle;
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

describe("POST /vendors/notifications/bulk — email fan-out", () => {
  beforeEach(() => {
    vendorRows = [
      { id: 1, name: "Vendor One", email: "one@example.com", announcementEmailOptOut: false },
      { id: 2, name: "Vendor Two", email: "", announcementEmailOptOut: false },
    ];
    insertedNotifications = [];
    sentEmails.length = 0;
  });

  it("emails vendors with an address and skips vendors without one, reporting the count", async () => {
    const router = await loadRouterHandler();
    const handler = findBulkHandler(router);

    const req = { body: { message: "Scheduled maintenance tonight", all: true } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.sent).toBe(2);
    expect(res.body.emailAttempted).toBe(2);
    expect(res.body.emailsSent).toBe(1);

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe("one@example.com");
    expect(sentEmails[0].html).toContain("Scheduled maintenance tonight");
    expect(sentEmails[0].html).toContain("Vendor One");
  });

  it("escapes vendor-controlled message content in the email body", async () => {
    const router = await loadRouterHandler();
    const handler = findBulkHandler(router);

    const req = { body: { message: "<script>alert(1)</script>", all: true } };
    const res = makeRes();

    await handler(req, res);

    expect(sentEmails[0].html).not.toContain("<script>alert(1)</script>");
    expect(sentEmails[0].html).toContain("&lt;script&gt;");
  });

  it("skips emailing a vendor who opted out of announcement emails, but still creates their in-app notification", async () => {
    vendorRows = [
      { id: 1, name: "Vendor One", email: "one@example.com", announcementEmailOptOut: false },
      { id: 2, name: "Vendor Two", email: "two@example.com", announcementEmailOptOut: true },
    ];

    const router = await loadRouterHandler();
    const handler = findBulkHandler(router);

    const req = { body: { message: "Scheduled maintenance tonight", all: true } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.sent).toBe(2);
    expect(insertedNotifications).toHaveLength(2);
    expect(insertedNotifications.map((n) => n.vendorId)).toEqual([1, 2]);

    expect(res.body.emailAttempted).toBe(1);
    expect(res.body.emailsSent).toBe(1);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe("one@example.com");
  });
});
