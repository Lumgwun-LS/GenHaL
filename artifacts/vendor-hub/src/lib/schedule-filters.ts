/**
 * Pure filter logic for the Upcoming Schedule view.
 *
 * Extracted so the behaviour can be unit-tested independently of the React
 * component and its API hooks.
 *
 * Filter semantics:
 *  - Platform/account selection: OR across every checked platform or account,
 *    AND with the other filter types. An empty selection means "show all".
 *  - Caption search: case-insensitive substring match (AND with other filters).
 *  - Date range: one-sided or two-sided bound against the post's local
 *    scheduled date (YYYY-MM-DD string comparison). (AND with other filters.)
 */

/** Minimal shape of a scheduled post required by the filter. */
export type FilterablePost = {
  platforms: string[];
  socialAccountIds?: (number | null)[] | null;
  caption?: string | null;
  scheduledAt?: string | null;
};

export type ScheduleFilterState = {
  /** Set of "platform:<Platform>" | "account:<id>" strings. Empty = no filter. */
  selectedFilters: Set<string>;
  /** Free-text caption search. Empty string = no filter. */
  search: string;
  /** ISO date string lower bound (YYYY-MM-DD). Empty string = no lower bound. */
  dateFrom: string;
  /** ISO date string upper bound (YYYY-MM-DD). Empty string = no upper bound. */
  dateTo: string;
};

/**
 * Returns the subset of `posts` that satisfy all active filters.
 *
 * Internally:
 *  1. Platform + account keys are OR'd — a post passes if it matches ANY
 *     selected platform OR ANY selected account.
 *  2. Caption search AND date range are applied on top (AND logic).
 */
export function filterScheduledPosts<T extends FilterablePost>(
  posts: T[],
  { selectedFilters, search, dateFrom, dateTo }: ScheduleFilterState,
): T[] {
  return posts.filter((post) => {
    // --- Platform / account multi-select (OR logic) ---
    if (selectedFilters.size > 0) {
      const platformKeys = Array.from(selectedFilters).filter((f) =>
        f.startsWith("platform:"),
      );
      const accountKeys = Array.from(selectedFilters).filter((f) =>
        f.startsWith("account:"),
      );
      const matchesPlatform = platformKeys.some((f) =>
        post.platforms.includes(f.slice("platform:".length)),
      );
      const matchesAccount = accountKeys.some((f) =>
        (post.socialAccountIds ?? []).includes(
          Number(f.slice("account:".length)),
        ),
      );
      if (!matchesPlatform && !matchesAccount) return false;
    }

    // --- Caption text search (AND) ---
    if (search.trim() !== "") {
      if (
        !(post.caption ?? "")
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      )
        return false;
    }

    // --- Date range (AND) ---
    if (post.scheduledAt) {
      const postDate = new Date(post.scheduledAt);
      const postDateStr = `${postDate.getFullYear()}-${String(postDate.getMonth() + 1).padStart(2, "0")}-${String(postDate.getDate()).padStart(2, "0")}`;
      if (dateFrom !== "" && postDateStr < dateFrom) return false;
      if (dateTo !== "" && postDateStr > dateTo) return false;
    }

    return true;
  });
}
