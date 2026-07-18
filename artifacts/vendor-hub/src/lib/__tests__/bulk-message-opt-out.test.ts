/**
 * Tests for the BulkMessageDialog opt-out count computation.
 *
 * The BulkMessageDialog computes opt-out count differently for
 * allSelected=true vs. a specific selectedIds subset. These tests verify:
 *  - Correct count when allSelected=true vs. a subset selection.
 *  - Count is 0 (and banner is therefore hidden) when no targeted vendors
 *    have opted out.
 *  - Banner and popover text is grammatically correct for 1 vs. many
 *    opted-out vendors.
 */

import { describe, it, expect } from "vitest";
import {
  computeOptedOutVendors,
  formatOptOutBannerText,
  formatOptOutPopoverDescription,
} from "../bulk-message-opt-out";

type Vendor = { id: number; name: string; announcementEmailOptOut: boolean };

const ALL_OPTED_IN: Vendor[] = [
  { id: 1, name: "Alpha Corp", announcementEmailOptOut: false },
  { id: 2, name: "Beta Ltd", announcementEmailOptOut: false },
  { id: 3, name: "Gamma Inc", announcementEmailOptOut: false },
];

const MIXED: Vendor[] = [
  { id: 1, name: "Alpha Corp", announcementEmailOptOut: false },
  { id: 2, name: "Beta Ltd", announcementEmailOptOut: true },
  { id: 3, name: "Gamma Inc", announcementEmailOptOut: false },
  { id: 4, name: "Delta Co", announcementEmailOptOut: true },
  { id: 5, name: "Epsilon LLC", announcementEmailOptOut: false },
];

// ─── computeOptedOutVendors ───────────────────────────────────────────────────

describe("computeOptedOutVendors – allSelected=true", () => {
  it("returns all opted-out vendors when all vendors are selected", () => {
    const result = computeOptedOutVendors(MIXED, true, []);
    expect(result.map((v) => v.id)).toEqual([2, 4]);
  });

  it("returns an empty array when no vendor has opted out", () => {
    const result = computeOptedOutVendors(ALL_OPTED_IN, true, []);
    expect(result).toHaveLength(0);
  });

  it("ignores selectedIds entirely when allSelected=true", () => {
    // selectedIds=[1] should not reduce the result — allSelected takes precedence.
    const result = computeOptedOutVendors(MIXED, true, [1]);
    expect(result.map((v) => v.id)).toEqual([2, 4]);
  });
});

describe("computeOptedOutVendors – allSelected=false (subset selection)", () => {
  it("counts only opted-out vendors within the selection", () => {
    // Select ids 1, 2, 3.  Only id 2 has opted out.
    const result = computeOptedOutVendors(MIXED, false, [1, 2, 3]);
    expect(result.map((v) => v.id)).toEqual([2]);
  });

  it("returns 0 when the selection contains no opted-out vendors", () => {
    // Select ids 1, 3, 5 — none have opted out.
    const result = computeOptedOutVendors(MIXED, false, [1, 3, 5]);
    expect(result).toHaveLength(0);
  });

  it("returns 0 when the selection is empty", () => {
    const result = computeOptedOutVendors(MIXED, false, []);
    expect(result).toHaveLength(0);
  });

  it("counts multiple opted-out vendors within a subset", () => {
    // Select all 5 vendors — both id 2 and id 4 are opted out.
    const result = computeOptedOutVendors(MIXED, false, [1, 2, 3, 4, 5]);
    expect(result.map((v) => v.id)).toEqual([2, 4]);
  });

  it("does not count an opted-out vendor that is NOT in the selection", () => {
    // id 4 is opted-out but is not selected.
    const result = computeOptedOutVendors(MIXED, false, [1, 2, 3]);
    expect(result.map((v) => v.id)).not.toContain(4);
  });

  it("switching from allSelected=true to a subset re-computes correctly", () => {
    const allResult = computeOptedOutVendors(MIXED, true, []);
    expect(allResult).toHaveLength(2); // ids 2 and 4

    // Now switch to a subset that only contains id 2 (opted out) and id 1 (not opted out).
    const subsetResult = computeOptedOutVendors(MIXED, false, [1, 2]);
    expect(subsetResult).toHaveLength(1);
    expect(subsetResult[0]!.id).toBe(2);
  });

  it("switching from a subset to allSelected=true re-computes correctly", () => {
    const subsetResult = computeOptedOutVendors(MIXED, false, [1]);
    expect(subsetResult).toHaveLength(0); // id 1 did not opt out

    // Flip to allSelected — now both opted-out vendors are included.
    const allResult = computeOptedOutVendors(MIXED, true, []);
    expect(allResult).toHaveLength(2);
  });
});

// ─── formatOptOutBannerText ───────────────────────────────────────────────────

describe("formatOptOutBannerText – grammar", () => {
  it("uses singular 'vendor has' when recipientCount=1 and optOutCount=1", () => {
    const text = formatOptOutBannerText(1, 1);
    expect(text).toBe("1 of 1 vendor has opted out of announcement emails");
  });

  it("uses plural 'vendors have' when there are multiple recipients and multiple opt-outs", () => {
    const text = formatOptOutBannerText(3, 10);
    expect(text).toBe("3 of 10 vendors have opted out of announcement emails");
  });

  it("uses 'has' for a single opted-out vendor even when there are many recipients", () => {
    const text = formatOptOutBannerText(1, 50);
    expect(text).toBe("1 of 50 vendors has opted out of announcement emails");
  });

  it("uses 'have' for multiple opted-out vendors", () => {
    const text = formatOptOutBannerText(2, 50);
    expect(text).toBe("2 of 50 vendors have opted out of announcement emails");
  });
});

// ─── formatOptOutPopoverDescription ──────────────────────────────────────────

describe("formatOptOutPopoverDescription – grammar", () => {
  it("uses 'This vendor' when exactly one vendor opted out", () => {
    const text = formatOptOutPopoverDescription(1);
    expect(text).toBe("This vendor will still receive the in-app notification.");
  });

  it("uses 'These vendors' when more than one vendor opted out", () => {
    const text = formatOptOutPopoverDescription(2);
    expect(text).toBe("These vendors will still receive the in-app notification.");
  });

  it("uses 'These vendors' for a large count", () => {
    const text = formatOptOutPopoverDescription(10);
    expect(text).toBe("These vendors will still receive the in-app notification.");
  });
});
