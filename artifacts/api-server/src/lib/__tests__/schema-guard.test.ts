/**
 * Tests for schema-guard.ts — the startup schema-drift check that compares
 * the Drizzle schema against what information_schema reports is actually in
 * the database, then logs and Slack-alerts on any mismatch.
 *
 * Covers:
 *  - No drift → info log, no Slack alert
 *  - Entirely missing table → error log + Slack alert (columns suppressed to
 *    avoid redundant noise when the whole table is absent)
 *  - Missing individual column on an existing table → error log + Slack alert
 *  - Guard never throws even if db.execute itself rejects
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── hoisted fixtures ──────────────────────────────────────────────────────────
// vi.mock factories are hoisted above imports, so any objects that need to be
// referenced inside them must be created with vi.hoisted().
const { FakePgTable, vendorsFakeTable, ordersFakeTable } = vi.hoisted(() => {
  class FakePgTable {}

  const vendorsFakeTable = Object.assign(new FakePgTable(), {
    __config: {
      name: "vendors",
      columns: [{ name: "id" }, { name: "email" }, { name: "name" }],
    },
  });

  const ordersFakeTable = Object.assign(new FakePgTable(), {
    __config: {
      name: "orders",
      columns: [{ name: "id" }, { name: "vendor_id" }, { name: "total" }],
    },
  });

  return { FakePgTable, vendorsFakeTable, ordersFakeTable };
});

// ── mocks ─────────────────────────────────────────────────────────────────────
vi.mock("drizzle-orm/pg-core", () => ({
  PgTable: FakePgTable,
  getTableConfig: (t: any) => t.__config,
}));

vi.mock("@workspace/db/schema", () => ({
  vendorsTable: vendorsFakeTable,
  ordersFakeTable: ordersFakeTable,
  // A non-table export (should be silently skipped by the guard).
  someHelperString: "not-a-table",
}));

// db.execute returns { rows: [...] } — make it a vi.fn() so individual tests
// can override it with mockRejectedValueOnce without redefining the whole mock.
let dbExecuteResult: Array<{ table_name: string; column_name: string }> = [];
const dbExecuteMock = vi.fn(() => Promise.resolve({ rows: dbExecuteResult }));
vi.mock("@workspace/db", () => ({
  db: {
    execute: dbExecuteMock,
  },
}));

// sql tagged template (schema-guard passes a template literal to db.execute).
vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings, values }),
    { raw: (s: string) => s },
  ),
}));

const loggerInfoMock = vi.fn();
const loggerErrorMock = vi.fn();
vi.mock("../logger", () => ({
  logger: {
    info: (...args: unknown[]) => loggerInfoMock(...args),
    error: (...args: unknown[]) => loggerErrorMock(...args),
  },
}));

const sendSlackAlertMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../slack", () => ({
  sendSlackAlert: (...args: unknown[]) => sendSlackAlertMock(...args),
}));

const { runSchemaDriftGuard } = await import("../schema-guard");

// Helper: build the full column list for a table with the given columns.
function colRows(tableName: string, colNames: string[]): Array<{ table_name: string; column_name: string }> {
  return colNames.map((column_name) => ({ table_name: tableName, column_name }));
}

beforeEach(() => {
  dbExecuteResult = [];
  loggerInfoMock.mockClear();
  loggerErrorMock.mockClear();
  sendSlackAlertMock.mockClear();
});

// ── no drift ──────────────────────────────────────────────────────────────────
describe("runSchemaDriftGuard — no drift", () => {
  it("logs info and sends no Slack alert when every expected table and column is present", async () => {
    dbExecuteResult = [
      ...colRows("vendors", ["id", "email", "name"]),
      ...colRows("orders", ["id", "vendor_id", "total"]),
    ];

    await runSchemaDriftGuard();

    expect(loggerInfoMock).toHaveBeenCalledOnce();
    expect(loggerInfoMock.mock.calls[0][0]).toMatch(/no schema drift/i);
    expect(sendSlackAlertMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it("ignores extra columns in the database that the Drizzle schema doesn't know about", async () => {
    dbExecuteResult = [
      ...colRows("vendors", ["id", "email", "name", "legacy_field"]),
      ...colRows("orders", ["id", "vendor_id", "total", "another_extra"]),
    ];

    await runSchemaDriftGuard();

    expect(sendSlackAlertMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });
});

// ── missing table ─────────────────────────────────────────────────────────────
describe("runSchemaDriftGuard — missing table", () => {
  it("logs an error and sends a Slack alert when a whole table is absent", async () => {
    // Only vendors present; orders table is entirely missing.
    dbExecuteResult = colRows("vendors", ["id", "email", "name"]);

    await runSchemaDriftGuard();

    expect(loggerErrorMock).toHaveBeenCalledOnce();
    const [, message] = loggerErrorMock.mock.calls[0];
    expect(message).toMatch(/orders/);

    expect(sendSlackAlertMock).toHaveBeenCalledOnce();
    expect(sendSlackAlertMock.mock.calls[0][0]).toMatch(/orders/);
  });

  it("does not flood the alert with per-column lines for a missing table", async () => {
    dbExecuteResult = colRows("vendors", ["id", "email", "name"]);

    await runSchemaDriftGuard();

    const alertText: string = sendSlackAlertMock.mock.calls[0][0];
    // "- table: orders" should appear once; individual column lines for
    // orders (id, vendor_id, total) should NOT appear since the table itself
    // is already reported.
    expect(alertText).toMatch(/table: orders/);
    expect(alertText).not.toMatch(/column: orders\./);
  });
});

// ── missing column ────────────────────────────────────────────────────────────
describe("runSchemaDriftGuard — missing column", () => {
  it("logs an error and sends a Slack alert when a column is absent from an existing table", async () => {
    // orders table exists but is missing the "total" column.
    dbExecuteResult = [
      ...colRows("vendors", ["id", "email", "name"]),
      ...colRows("orders", ["id", "vendor_id"]), // total is missing
    ];

    await runSchemaDriftGuard();

    expect(loggerErrorMock).toHaveBeenCalledOnce();
    const alertText: string = sendSlackAlertMock.mock.calls[0][0];
    expect(alertText).toMatch(/column: orders\.total/);
    // No missing-table line for orders (the table itself is present).
    expect(alertText).not.toMatch(/table: orders/);
  });

  it("reports multiple orphan columns across different tables", async () => {
    dbExecuteResult = [
      ...colRows("vendors", ["id"]), // email and name missing
      ...colRows("orders", ["id", "vendor_id", "total"]),
    ];

    await runSchemaDriftGuard();

    expect(loggerErrorMock).toHaveBeenCalledOnce();
    const alertText: string = sendSlackAlertMock.mock.calls[0][0];
    expect(alertText).toMatch(/column: vendors\.email/);
    expect(alertText).toMatch(/column: vendors\.name/);
  });
});

// ── guard resilience ──────────────────────────────────────────────────────────
describe("runSchemaDriftGuard — resilience", () => {
  it("never throws even when db.execute rejects", async () => {
    dbExecuteMock.mockRejectedValueOnce(new Error("Connection refused"));

    await expect(runSchemaDriftGuard()).resolves.toBeUndefined();
    expect(loggerErrorMock).toHaveBeenCalledOnce();
    expect(loggerErrorMock.mock.calls[0][1]).toMatch(/failed to run/i);
  });
});
