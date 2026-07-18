/**
 * Tests for the "Remove from selection" mode in TargetByFilterPopover.
 *
 * The remove mode subtracts filter matches from the current selection.
 * These tests verify that:
 *  1. Only vendors that were already selected AND matched by the filter are
 *     removed — vendors that were selected but NOT matched stay in the
 *     selection (partial-overlap case).
 *  2. When none of the filter-matched vendors are in the current selection,
 *     the selection is left completely unchanged (zero-overlap case).
 *
 * Also covers the add-to-selection helper for symmetry.
 */

import { describe, it, expect } from "vitest";
import { applyAddToSelection, applyRemoveFromSelection } from "../vendor-selection";

// ─── applyRemoveFromSelection ─────────────────────────────────────────────────

describe("applyRemoveFromSelection – partial overlap", () => {
  it("removes only the IDs that are both selected AND matched by the filter", () => {
    // Current selection: vendors 1, 2, 3, 4
    // Filter matches:    vendors 2, 3, 5   (5 is not selected)
    // Expected result:   vendors 1, 4  (2 and 3 removed; 5 ignored because it was never selected)
    const result = applyRemoveFromSelection([1, 2, 3, 4], [2, 3, 5]);
    expect(result).toEqual([1, 4]);
  });

  it("does not remove a vendor that was matched by the filter but was not in the selection", () => {
    // Vendor 5 matched the filter but was never selected — the selection must not be corrupted.
    const result = applyRemoveFromSelection([1, 2, 3, 4], [2, 3, 5]);
    expect(result).not.toContain(5);
  });

  it("keeps all selected vendors that were not in the filter match", () => {
    // Selection: 10, 20, 30. Filter matches only 20.
    // 10 and 30 must remain untouched.
    const result = applyRemoveFromSelection([10, 20, 30], [20]);
    expect(result).toContain(10);
    expect(result).toContain(30);
    expect(result).not.toContain(20);
  });
});

describe("applyRemoveFromSelection – zero overlap (no matched vendor was selected)", () => {
  it("leaves the selection unchanged when none of the filter matches are in the current selection", () => {
    // Current selection: vendors 1, 2, 3
    // Filter matches:    vendors 4, 5, 6  (none were selected)
    // The selection must not change at all.
    const before = [1, 2, 3];
    const result = applyRemoveFromSelection(before, [4, 5, 6]);
    expect(result).toEqual([1, 2, 3]);
  });

  it("returns the same IDs when the filter match set is empty", () => {
    const result = applyRemoveFromSelection([1, 2, 3], []);
    expect(result).toEqual([1, 2, 3]);
  });

  it("returns an empty array when both the selection and the filter match set are empty", () => {
    const result = applyRemoveFromSelection([], []);
    expect(result).toEqual([]);
  });

  it("returns an empty array when the current selection is empty, regardless of filter matches", () => {
    // No selected vendors — nothing can be removed even if the filter matched many.
    const result = applyRemoveFromSelection([], [1, 2, 3]);
    expect(result).toEqual([]);
  });
});

describe("applyRemoveFromSelection – full overlap", () => {
  it("removes all selected vendors when the filter match is a superset of the selection", () => {
    // All selected vendors (1, 2) are covered by the filter match (1, 2, 3).
    const result = applyRemoveFromSelection([1, 2], [1, 2, 3]);
    expect(result).toEqual([]);
  });

  it("removes all selected vendors when the filter match equals the selection exactly", () => {
    const result = applyRemoveFromSelection([1, 2, 3], [1, 2, 3]);
    expect(result).toEqual([]);
  });
});

// ─── applyAddToSelection ──────────────────────────────────────────────────────

describe("applyAddToSelection", () => {
  it("merges two disjoint sets without duplicates", () => {
    const result = applyAddToSelection([1, 2], [3, 4]);
    expect(result).toEqual(expect.arrayContaining([1, 2, 3, 4]));
    expect(result).toHaveLength(4);
  });

  it("deduplicates IDs that appear in both current and toAdd", () => {
    const result = applyAddToSelection([1, 2, 3], [2, 3, 4]);
    // 2 and 3 appear in both — each should appear exactly once.
    expect(result.filter((id) => id === 2)).toHaveLength(1);
    expect(result.filter((id) => id === 3)).toHaveLength(1);
    expect(result).toHaveLength(4);
  });
});
