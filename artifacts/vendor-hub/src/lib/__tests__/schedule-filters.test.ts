/**
 * Tests for filterScheduledPosts — the pure filter function behind the
 * Upcoming Schedule view's multi-select platform/account filter, caption
 * search, and date-range filter.
 *
 * Behaviour under test:
 *  1. Two platforms selected → posts from EITHER appear (OR logic).
 *  2. Platform filter + caption search → narrows to posts that match BOTH (AND).
 *  3. Date range with only "from" → one-sided lower bound.
 *  4. Date range with only "to" → one-sided upper bound.
 *  5. Empty selection → all posts returned.
 *  6. Account-id filter (OR with platform filter).
 *  7. Posts with no caption still appear when no caption search is active.
 *  8. Posts with no caption are excluded when they don't match a caption search.
 *  9. Overlapping platform + account selections don't double-count or exclude.
 * 10. A post outside both bounds is excluded; inside both bounds is included.
 */

import { describe, it, expect } from "vitest";
import { filterScheduledPosts, type FilterablePost } from "../schedule-filters";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noFilters() {
  return {
    selectedFilters: new Set<string>(),
    search: "",
    dateFrom: "",
    dateTo: "",
  };
}

function makePost(overrides: Partial<FilterablePost> = {}): FilterablePost {
  return {
    platforms: [],
    socialAccountIds: [],
    caption: null,
    scheduledAt: "2025-09-15T10:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. OR logic across two selected platforms
// ---------------------------------------------------------------------------
describe("platform filter — OR logic", () => {
  const twitter = makePost({ platforms: ["Twitter"] });
  const facebook = makePost({ platforms: ["Facebook"] });
  const linkedin = makePost({ platforms: ["LinkedIn"] });
  const posts = [twitter, facebook, linkedin];

  it("returns posts from either platform when two are selected", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      selectedFilters: new Set(["platform:Twitter", "platform:Facebook"]),
    });
    expect(result).toContain(twitter);
    expect(result).toContain(facebook);
    expect(result).not.toContain(linkedin);
  });

  it("returns all three when all three platforms are selected", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      selectedFilters: new Set([
        "platform:Twitter",
        "platform:Facebook",
        "platform:LinkedIn",
      ]),
    });
    expect(result).toHaveLength(3);
  });

  it("returns only the matching platform when one is selected", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      selectedFilters: new Set(["platform:LinkedIn"]),
    });
    expect(result).toEqual([linkedin]);
  });
});

// ---------------------------------------------------------------------------
// 2. AND logic between platform filter and caption search
// ---------------------------------------------------------------------------
describe("platform filter + caption search — AND logic", () => {
  const twSale = makePost({ platforms: ["Twitter"], caption: "Big sale today" });
  const twOther = makePost({ platforms: ["Twitter"], caption: "Just a photo" });
  const fbSale = makePost({ platforms: ["Facebook"], caption: "Big sale event" });
  const posts = [twSale, twOther, fbSale];

  it("returns only Twitter posts that contain the caption keyword", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      selectedFilters: new Set(["platform:Twitter"]),
      search: "sale",
    });
    expect(result).toEqual([twSale]);
  });

  it("returns nothing when platform matches but caption does not", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      selectedFilters: new Set(["platform:Twitter"]),
      search: "event",
    });
    expect(result).toHaveLength(0);
  });

  it("is case-insensitive for caption search", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      selectedFilters: new Set(["platform:Twitter"]),
      search: "SALE",
    });
    expect(result).toContain(twSale);
  });
});

// ---------------------------------------------------------------------------
// 3. One-sided date bounds
// ---------------------------------------------------------------------------
describe("date range — one-sided lower bound (dateFrom only)", () => {
  const old = makePost({ scheduledAt: "2025-08-01T10:00:00.000Z" });
  const exact = makePost({ scheduledAt: "2025-09-01T10:00:00.000Z" });
  const future = makePost({ scheduledAt: "2025-10-15T10:00:00.000Z" });
  const posts = [old, exact, future];

  it("excludes posts before dateFrom", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      dateFrom: "2025-09-01",
    });
    expect(result).not.toContain(old);
  });

  it("includes posts on or after dateFrom", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      dateFrom: "2025-09-01",
    });
    expect(result).toContain(exact);
    expect(result).toContain(future);
  });

  it("an empty dateTo does not further restrict results", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      dateFrom: "2025-09-01",
      dateTo: "",
    });
    expect(result).toHaveLength(2);
  });
});

describe("date range — one-sided upper bound (dateTo only)", () => {
  const old = makePost({ scheduledAt: "2025-08-01T10:00:00.000Z" });
  const exact = makePost({ scheduledAt: "2025-09-01T10:00:00.000Z" });
  const future = makePost({ scheduledAt: "2025-10-15T10:00:00.000Z" });
  const posts = [old, exact, future];

  it("excludes posts after dateTo", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      dateTo: "2025-09-01",
    });
    expect(result).not.toContain(future);
  });

  it("includes posts on or before dateTo", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      dateTo: "2025-09-01",
    });
    expect(result).toContain(old);
    expect(result).toContain(exact);
  });

  it("an empty dateFrom does not further restrict results", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      dateFrom: "",
      dateTo: "2025-09-01",
    });
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 4. Both bounds active
// ---------------------------------------------------------------------------
describe("date range — both bounds active", () => {
  const before = makePost({ scheduledAt: "2025-07-31T23:59:00.000Z" });
  const inside = makePost({ scheduledAt: "2025-08-15T12:00:00.000Z" });
  const after = makePost({ scheduledAt: "2025-09-01T00:01:00.000Z" });
  const posts = [before, inside, after];

  it("includes only posts inside the window", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      dateFrom: "2025-08-01",
      dateTo: "2025-08-31",
    });
    expect(result).toEqual([inside]);
  });

  it("excludes posts outside the window", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      dateFrom: "2025-08-01",
      dateTo: "2025-08-31",
    });
    expect(result).not.toContain(before);
    expect(result).not.toContain(after);
  });
});

// ---------------------------------------------------------------------------
// 5. Empty selection → all posts returned
// ---------------------------------------------------------------------------
describe("empty selection", () => {
  const posts = [
    makePost({ platforms: ["Twitter"] }),
    makePost({ platforms: ["Facebook"] }),
    makePost({ platforms: ["Instagram"] }),
  ];

  it("returns all posts when no filters are set", () => {
    const result = filterScheduledPosts(posts, noFilters());
    expect(result).toHaveLength(3);
  });

  it("returns all posts when selectedFilters is empty even if other state is default", () => {
    const result = filterScheduledPosts(posts, {
      selectedFilters: new Set(),
      search: "",
      dateFrom: "",
      dateTo: "",
    });
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 6. Account-id filter, and OR with platform filter
// ---------------------------------------------------------------------------
describe("account-id filter", () => {
  const postA = makePost({ platforms: ["Twitter"], socialAccountIds: [1, 2] });
  const postB = makePost({ platforms: ["Facebook"], socialAccountIds: [3] });
  const postC = makePost({ platforms: ["LinkedIn"], socialAccountIds: [4] });
  const posts = [postA, postB, postC];

  it("matches posts by account id", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      selectedFilters: new Set(["account:3"]),
    });
    expect(result).toEqual([postB]);
  });

  it("OR-combines an account filter with a platform filter", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      selectedFilters: new Set(["account:3", "platform:LinkedIn"]),
    });
    expect(result).toContain(postB);
    expect(result).toContain(postC);
    expect(result).not.toContain(postA);
  });

  it("matches posts that share one of multiple selected account ids", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      selectedFilters: new Set(["account:1", "account:4"]),
    });
    expect(result).toContain(postA);
    expect(result).toContain(postC);
    expect(result).not.toContain(postB);
  });
});

// ---------------------------------------------------------------------------
// 7 & 8. Posts with no caption
// ---------------------------------------------------------------------------
describe("posts with no caption", () => {
  const noCaption = makePost({ platforms: ["Twitter"], caption: null });
  const withCaption = makePost({ platforms: ["Twitter"], caption: "Hello world" });
  const posts = [noCaption, withCaption];

  it("includes caption-less posts when no caption search is active", () => {
    const result = filterScheduledPosts(posts, noFilters());
    expect(result).toContain(noCaption);
  });

  it("excludes caption-less posts when a caption search is active", () => {
    const result = filterScheduledPosts(posts, {
      ...noFilters(),
      search: "Hello",
    });
    expect(result).not.toContain(noCaption);
    expect(result).toContain(withCaption);
  });
});

// ---------------------------------------------------------------------------
// 9. Overlapping platform + account on the same post
// ---------------------------------------------------------------------------
describe("overlapping platform and account on the same post", () => {
  // A post that matches BOTH a platform filter and an account filter.
  const post = makePost({
    platforms: ["Twitter"],
    socialAccountIds: [10],
    caption: "Overlap test",
  });

  it("includes the post exactly once when it matches both platform and account keys", () => {
    const result = filterScheduledPosts([post], {
      ...noFilters(),
      selectedFilters: new Set(["platform:Twitter", "account:10"]),
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(post);
  });
});

// ---------------------------------------------------------------------------
// 10. A post on a platform that appears in NEITHER selected key is excluded
// ---------------------------------------------------------------------------
describe("exclusion when platform not in selection", () => {
  const insta = makePost({ platforms: ["Instagram"], socialAccountIds: [99] });
  const twitter = makePost({ platforms: ["Twitter"], socialAccountIds: [1] });

  it("excludes a post whose platform is not in the selection", () => {
    const result = filterScheduledPosts([insta, twitter], {
      ...noFilters(),
      selectedFilters: new Set(["platform:Twitter"]),
    });
    expect(result).toEqual([twitter]);
  });
});
