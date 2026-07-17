/**
 * Integration test for POST /ads/contacts/import
 *
 * Verifies:
 *  1. JSON array path — the path used by the generated React client
 *     (application/json body, array of { name, email, ... })
 *  2. CSV text path — for direct HTTP callers (text/plain / text/csv body)
 *  3. Empty input returns { imported: 0, skipped: 0 } without inserting
 *  4. Admin without a vendor account receives 403 (not 401)
 *  5. Unauthenticated callers receive 401
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.PAYMENT_CREDS_ENCRYPTION_KEY = "0".repeat(64);

// ── Inserted-row capture (mutable, reset in beforeEach) ───────────────────────
//
// The import route calls db.insert(table).values(rows) WITHOUT chaining
// .returning(), so we capture at the .values() call rather than .returning().

const insertedRows: Record<string, unknown>[] = [];

// ── DB mock ───────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: {
    // resolveAuthedVendor does: db.select().from(vendorsTable).where(...)
    select: () => ({
      from: () => ({
        where: async () => (vendorClerkId ? [{ id: 42 }] : []),
      }),
    }),
    // import route calls: db.insert(adContactsTable).values(rows) — no .returning()
    insert: () => ({
      values: (rows: unknown) => {
        const list = Array.isArray(rows) ? rows : [rows];
        insertedRows.push(...(list as Record<string, unknown>[]));
        // Provide .returning() so other routes that use it don't crash
        return {
          returning: async () =>
            list.map((r: any, i: number) => ({
              id: i + 1,
              ...r,
              createdAt: new Date(),
              updatedAt: new Date(),
              tags: r.tags ?? [],
            })),
        };
      },
    }),
  },
  vendorsTable: {},
  adContactsTable: {},
  adCampaignsTable: {},
  adCreativesTable: {},
  adCampaignAnalyticsTable: {},
  adEmailCampaignsTable: {},
}));

// ── Clerk mock ────────────────────────────────────────────────────────────────

let vendorClerkId: string | null = "clerk-vendor-1";
let callerUserId: string | null = "clerk-vendor-1";

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: callerUserId }),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ── Build Express app ─────────────────────────────────────────────────────────

import express from "express";
import adsRouter from "../ads";

function makeApp(adminUserIds = "") {
  process.env.ADMIN_USER_IDS = adminUserIds;
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  // express.text() is added per-route inside adsRouter for text/* bodies
  app.use(adsRouter);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /ads/contacts/import", () => {
  beforeEach(() => {
    insertedRows.length = 0;
    vendorClerkId = "clerk-vendor-1";
    callerUserId = "clerk-vendor-1";
    process.env.ADMIN_USER_IDS = "";
  });

  // ── 1. JSON array path (generated-client path) ───────────────────────────

  it("imports a JSON array of contacts and returns the count", async () => {
    const { default: supertest } = await import("supertest");
    const app = makeApp();
    const body = [
      { name: "Ada Lovelace", email: "ada@example.com", phone: "0801" },
      { name: "Grace Hopper", email: "grace@example.com" },
    ];

    const response = await supertest(app)
      .post("/ads/contacts/import")
      .set("content-type", "application/json")
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ imported: 2, skipped: 0 });
    // Verify the rows were actually passed to db.insert().values()
    expect(insertedRows).toHaveLength(2);
    const names = insertedRows.map((r) => r.name as string);
    expect(names).toContain("Ada Lovelace");
    expect(names).toContain("Grace Hopper");
  });

  it("persists a string[] tags array from a JSON contact without dropping values", async () => {
    const { default: supertest } = await import("supertest");
    const app = makeApp();
    const body = [{ name: "Test Contact", email: "t@example.com", tags: ["vip", "lagos"] }];

    const response = await supertest(app)
      .post("/ads/contacts/import")
      .set("content-type", "application/json")
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body.imported).toBe(1);
    expect(insertedRows).toHaveLength(1);
    // Tags must be preserved as an array — not silently dropped or flattened
    expect(insertedRows[0].tags).toEqual(["vip", "lagos"]);
  });

  // ── 2. CSV text path (direct HTTP / non-generated-client path) ──────────

  it("imports a CSV body (text/plain) with a header row", async () => {
    const { default: supertest } = await import("supertest");
    const app = makeApp();
    const csv = ["name,email,phone", "Elon Musk,elon@example.com,0802", "Jeff Bezos,jeff@example.com,0803"].join("\n");

    const response = await supertest(app)
      .post("/ads/contacts/import")
      .set("content-type", "text/plain")
      .send(csv);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ imported: 2, skipped: 0 });
    expect(insertedRows).toHaveLength(2);
    const names = insertedRows.map((r) => r.name as string);
    expect(names).toContain("Elon Musk");
    expect(names).toContain("Jeff Bezos");
  });

  it("imports a CSV body (text/csv content-type) with positional columns", async () => {
    const { default: supertest } = await import("supertest");
    const app = makeApp();
    const csv = "Nikola Tesla,tesla@example.com,0900";

    const response = await supertest(app)
      .post("/ads/contacts/import")
      .set("content-type", "text/csv")
      .send(csv);

    expect(response.status).toBe(200);
    expect(response.body.imported).toBe(1);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].name).toBe("Nikola Tesla");
    expect(insertedRows[0].email).toBe("tesla@example.com");
  });

  // ── 3. Empty input ────────────────────────────────────────────────────────

  it("returns { imported: 0, skipped: 0 } for an empty JSON array without inserting", async () => {
    const { default: supertest } = await import("supertest");
    const app = makeApp();

    const response = await supertest(app)
      .post("/ads/contacts/import")
      .set("content-type", "application/json")
      .send([]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ imported: 0, skipped: 0 });
    expect(insertedRows).toHaveLength(0);
  });

  it("returns { imported: 0, skipped: 0 } for a CSV body with only a header row", async () => {
    const { default: supertest } = await import("supertest");
    const app = makeApp();

    const response = await supertest(app)
      .post("/ads/contacts/import")
      .set("content-type", "text/plain")
      .send("name,email,phone\n");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ imported: 0, skipped: 0 });
    expect(insertedRows).toHaveLength(0);
  });

  // ── 4. Admin without a vendor account ─────────────────────────────────────

  it("returns 403 when an admin has no vendor account", async () => {
    const { default: supertest } = await import("supertest");
    // admin-only-id is in ADMIN_USER_IDS but has no vendor row in the DB
    vendorClerkId = null;
    callerUserId = "admin-only-id";
    const app = makeApp("admin-only-id");

    const response = await supertest(app)
      .post("/ads/contacts/import")
      .set("content-type", "application/json")
      .send([{ name: "Test" }]);

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/vendor account/i);
  });

  // ── 5. Unauthenticated caller ─────────────────────────────────────────────

  it("returns 401 when the caller is not authenticated", async () => {
    const { default: supertest } = await import("supertest");
    vendorClerkId = null;
    callerUserId = null;
    const app = makeApp();

    const response = await supertest(app)
      .post("/ads/contacts/import")
      .set("content-type", "application/json")
      .send([{ name: "Ghost User" }]);

    expect(response.status).toBe(401);
  });
});
