/**
 * Tests for POST /vendors/notifications/bulk/retry-emails
 * covering:
 *  - The endpoint extracts send_failed vendor IDs from the supplied failures
 *    array — vendors who already received the email are not in that array and
 *    therefore can never be double-sent (server-side invariant, not just a
 *    frontend filter).
 *  - opted-out and no-email vendors are silently skipped even if included in
 *    the failures list, as an extra server-side safety net.
 *  - NO new in-app notification row is ever inserted by the retry endpoint.
 *  - The response has the correct { retried, succeeded, failures } shape.
 *  - A transient mailer failure is captured in failures with reason "send_failed".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.ADMIN_USER_IDS = "admin_1";

type VendorRow = { id: number; name: string; email: string; announcementEmailOptOut: boolean };
type BulkEmailFailure = { vendorId: number; vendorName: string; reason: "opted_out" | "no_email" | "send_failed" };

let vendorRows: VendorRow[] = [];
let insertCallCount = 0;
const sentEmails: Array<{ to: string; subject: string; html: string }> = [];

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(vendorRows),
      }),
    }),
    insert: () => {
      insertCallCount += 1;
      return {
        values: () => ({
          returning: () => Promise.resolve([]),
        }),
      };
    },
  },
}));

vi.mock("@workspace/db/schema", () => ({
  vendorsTable: { id: "vendors.id", name: "vendors.name", email: "vendors.email" },
  vendorNotificationsTable: { id: "vendorNotifications.id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  and: (...args: unknown[]) => ({ args }),
  desc: (a: unknown) => a,
  inArray: (a: unknown, b: unknown) => ({ a, b }),
  isNull: (a: unknown) => ({ a }),
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

function findRetryHandler(router: any): (req: any, res: any) => Promise<void> {
  const layer = router.stack.find(
    (l: any) =>
      l.route?.path === "/vendors/notifications/bulk/retry-emails" && l.route.methods.post,
  );
  if (!layer) throw new Error("retry-emails route not found on router");
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

/** Build a minimal failures array as the bulk endpoint would return it. */
function failureList(entries: Array<{ vendorId: number; vendorName: string; reason: BulkEmailFailure["reason"] }>): BulkEmailFailure[] {
  return entries;
}

describe("POST /vendors/notifications/bulk/retry-emails", () => {
  beforeEach(() => {
    vendorRows = [];
    insertCallCount = 0;
    sentEmails.length = 0;
  });

  // ── Core double-send guard ─────────────────────────────────────────────────

  it("never emails a vendor who succeeded on the first send (not in failures list)", async () => {
    // Vendor 1 succeeded on first send — they are NOT in the failures list.
    // Vendor 2 failed — they are in the failures list with reason send_failed.
    // The DB returns both if somehow both IDs were queried, but the server
    // should only extract vendor 2 from the send_failed entries.
    vendorRows = [
      { id: 2, name: "Failed Vendor", email: "failed@example.com", announcementEmailOptOut: false },
    ];

    const router = await loadRouterHandler();
    const handler = findRetryHandler(router);

    const failures = failureList([
      { vendorId: 2, vendorName: "Failed Vendor", reason: "send_failed" },
      // Vendor 1 is absent — they received the email successfully.
    ]);

    const req = { body: { message: "Retry: important update", failures } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.retried).toBe(1);
    expect(res.body.succeeded).toBe(1);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe("failed@example.com");
  });

  it("rejects the request if failures contains no send_failed entries (would-be double-send)", async () => {
    // A caller that passes only opted_out / no_email entries — or an empty
    // list — gets a 400 instead of silently emailing nobody.
    const router = await loadRouterHandler();
    const handler = findRetryHandler(router);

    const failures = failureList([
      { vendorId: 1, vendorName: "Opted Out", reason: "opted_out" },
      { vendorId: 2, vendorName: "No Email", reason: "no_email" },
    ]);

    const req = { body: { message: "Retry notice", failures } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(sentEmails).toHaveLength(0);
  });

  it("ignores non-send_failed entries in the failures list — they are never queried or emailed", async () => {
    // The caller passes the full failures list (opted_out + send_failed).
    // Only the send_failed vendor should be retried; opted_out vendor must not.
    vendorRows = [
      { id: 3, name: "Send-Failed Vendor", email: "fail@example.com", announcementEmailOptOut: false },
    ];

    const router = await loadRouterHandler();
    const handler = findRetryHandler(router);

    const failures = failureList([
      { vendorId: 2, vendorName: "Opted Out", reason: "opted_out" },
      { vendorId: 3, vendorName: "Send-Failed Vendor", reason: "send_failed" },
    ]);

    const req = { body: { message: "Mixed list retry", failures } };
    const res = makeRes();

    await handler(req, res);

    expect(res.body.retried).toBe(1);
    expect(res.body.succeeded).toBe(1);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe("fail@example.com");
  });

  // ── No in-app notification row ─────────────────────────────────────────────

  it("never inserts an in-app notification row", async () => {
    vendorRows = [
      { id: 1, name: "Vendor One", email: "one@example.com", announcementEmailOptOut: false },
      { id: 2, name: "Vendor Two", email: "two@example.com", announcementEmailOptOut: false },
    ];

    const router = await loadRouterHandler();
    const handler = findRetryHandler(router);

    const failures = failureList([
      { vendorId: 1, vendorName: "Vendor One", reason: "send_failed" },
      { vendorId: 2, vendorName: "Vendor Two", reason: "send_failed" },
    ]);

    const req = { body: { message: "Retry notice", failures } };
    const res = makeRes();

    await handler(req, res);

    // The retry endpoint must never call db.insert (no new notification rows)
    expect(insertCallCount).toBe(0);
    expect(res.body.retried).toBe(2);
    expect(res.body.succeeded).toBe(2);
  });

  // ── Extra safety: opt-out / no-email still skipped ─────────────────────────

  it("skips opted-out vendors from the DB even if they appear in failures as send_failed", async () => {
    // Edge case: opt-out flag was set between the original send and the retry.
    vendorRows = [
      { id: 1, name: "Vendor One", email: "one@example.com", announcementEmailOptOut: false },
      { id: 2, name: "Now Opted Out", email: "out@example.com", announcementEmailOptOut: true },
    ];

    const router = await loadRouterHandler();
    const handler = findRetryHandler(router);

    const failures = failureList([
      { vendorId: 1, vendorName: "Vendor One", reason: "send_failed" },
      { vendorId: 2, vendorName: "Now Opted Out", reason: "send_failed" },
    ]);

    const req = { body: { message: "Retry notice", failures } };
    const res = makeRes();

    await handler(req, res);

    expect(res.body.retried).toBe(1);
    expect(res.body.succeeded).toBe(1);
    expect(res.body.failures).toEqual([
      { vendorId: 2, vendorName: "Now Opted Out", reason: "opted_out" },
    ]);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe("one@example.com");
  });

  it("skips vendors whose email was removed from the DB between the first send and the retry", async () => {
    vendorRows = [
      { id: 1, name: "Vendor One", email: "one@example.com", announcementEmailOptOut: false },
      { id: 3, name: "No Email Now", email: "", announcementEmailOptOut: false },
    ];

    const router = await loadRouterHandler();
    const handler = findRetryHandler(router);

    const failures = failureList([
      { vendorId: 1, vendorName: "Vendor One", reason: "send_failed" },
      { vendorId: 3, vendorName: "No Email Now", reason: "send_failed" },
    ]);

    const req = { body: { message: "Retry notice", failures } };
    const res = makeRes();

    await handler(req, res);

    expect(res.body.retried).toBe(1);
    expect(res.body.succeeded).toBe(1);
    expect(res.body.failures).toEqual([
      { vendorId: 3, vendorName: "No Email Now", reason: "no_email" },
    ]);
    expect(sentEmails).toHaveLength(1);
  });

  // ── Response shape ─────────────────────────────────────────────────────────

  it("returns the correct { retried, succeeded, failures } shape on success", async () => {
    vendorRows = [
      { id: 1, name: "Vendor One", email: "one@example.com", announcementEmailOptOut: false },
    ];

    const router = await loadRouterHandler();
    const handler = findRetryHandler(router);

    const failures = failureList([
      { vendorId: 1, vendorName: "Vendor One", reason: "send_failed" },
    ]);

    const req = { body: { message: "Retry: important update", failures } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      retried: 1,
      succeeded: 1,
      failures: [],
    });
  });

  it("reports a send_failed failure when the mailer returns a failed status on retry", async () => {
    vendorRows = [
      { id: 1, name: "Vendor One", email: "one@example.com", announcementEmailOptOut: false },
      { id: 4, name: "Flaky Inbox", email: "flaky@example.com", announcementEmailOptOut: false },
    ];

    const mailerModule = await import("../../lib/mailer");
    const originalSendEmail = mailerModule.sendEmail;
    (mailerModule as unknown as { sendEmail: typeof originalSendEmail }).sendEmail = (opts) => {
      sentEmails.push(opts);
      if (opts.to === "flaky@example.com") return Promise.resolve({ status: "failed" as const, error: "SMTP timeout" });
      return Promise.resolve({ status: "sent" as const });
    };

    try {
      const router = await loadRouterHandler();
      const handler = findRetryHandler(router);

      const failures = failureList([
        { vendorId: 1, vendorName: "Vendor One", reason: "send_failed" },
        { vendorId: 4, vendorName: "Flaky Inbox", reason: "send_failed" },
      ]);

      const req = { body: { message: "Retry notice", failures } };
      const res = makeRes();

      await handler(req, res);

      expect(res.body.retried).toBe(2);
      expect(res.body.succeeded).toBe(1);
      expect(res.body.failures).toEqual([
        { vendorId: 4, vendorName: "Flaky Inbox", reason: "send_failed" },
      ]);
    } finally {
      (mailerModule as unknown as { sendEmail: typeof originalSendEmail }).sendEmail = originalSendEmail;
    }
  });

  // ── Input validation ───────────────────────────────────────────────────────

  it("returns 400 when failures array is empty", async () => {
    const router = await loadRouterHandler();
    const handler = findRetryHandler(router);

    const req = { body: { message: "Retry notice", failures: [] } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 400 when message is missing", async () => {
    const router = await loadRouterHandler();
    const handler = findRetryHandler(router);

    const req = { body: { failures: [{ vendorId: 1, vendorName: "V", reason: "send_failed" }] } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
