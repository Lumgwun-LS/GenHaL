/**
 * Tests for PostProcessingPublications and its companion
 * computePostProcessingRefetchInterval helper.
 *
 * Behaviour under test:
 *  1. computePostProcessingRefetchInterval returns 15 000 when at least one
 *     row is still "processing" and false when all rows have resolved.
 *  2. The component renders a "Processing…" badge for every row whose status
 *     is "processing".
 *  3. The badge disappears (component returns null) once every row has
 *     resolved to "success" or "failed".
 *  4. A mix of processing and resolved rows shows only the processing ones.
 *  5. When no publications are returned (undefined / empty), nothing renders.
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { PostPublication } from "@workspace/api-client-react";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the import of the component
// ---------------------------------------------------------------------------

// We only need to control useListPostPublications for these tests; everything
// else from the api client can be a no-op stub.
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useListPostPublications: vi.fn(),
    getListPostPublicationsQueryKey: vi.fn(() => ["postPublications", "mock"]),
  };
});

// Clerk is used in other parts of index.tsx; stub it out so jsdom doesn't
// need a real Clerk environment.
vi.mock("@clerk/react", () => ({
  useUser: vi.fn(() => ({ user: null, isLoaded: true })),
  useAuth: vi.fn(() => ({ isSignedIn: false, getToken: vi.fn() })),
  SignIn: () => null,
  SignUp: () => null,
}));

// sonner toast — not needed for render assertions
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

// wouter Link — renders as a plain anchor in tests
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: vi.fn(() => ["/"]),
  useRoute: vi.fn(() => [false, {}]),
}));

// ---------------------------------------------------------------------------
// Imports under test (after vi.mock hoisting)
// ---------------------------------------------------------------------------

import {
  PostProcessingPublications,
  computePostProcessingRefetchInterval,
} from "../index";
import { useListPostPublications } from "@workspace/api-client-react";

// Typed alias so tests can call mockReturnValue without TS complaints.
const mockUseListPostPublications = useListPostPublications as ReturnType<
  typeof vi.fn
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePublication(
  overrides: Partial<PostPublication> & { status: PostPublication["status"] }
): PostPublication {
  return {
    id: Math.floor(Math.random() * 10_000),
    postId: 1,
    platform: "Facebook",
    status: overrides.status,
    externalPostId: null,
    externalUrl: null,
    errorMessage: null,
    publishedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as PostPublication;
}

// ---------------------------------------------------------------------------
// 1. computePostProcessingRefetchInterval — pure-logic tests (no React)
// ---------------------------------------------------------------------------

describe("computePostProcessingRefetchInterval", () => {
  it("returns 15 000 when at least one row is processing", () => {
    const rows: PostPublication[] = [
      makePublication({ status: "processing" }),
      makePublication({ status: "success" }),
    ];
    expect(computePostProcessingRefetchInterval(rows)).toBe(15_000);
  });

  it("returns false when all rows are in a terminal state (success)", () => {
    const rows: PostPublication[] = [
      makePublication({ status: "success" }),
      makePublication({ status: "success" }),
    ];
    expect(computePostProcessingRefetchInterval(rows)).toBe(false);
  });

  it("returns false when all rows are in a terminal state (failed)", () => {
    const rows: PostPublication[] = [
      makePublication({ status: "failed" }),
    ];
    expect(computePostProcessingRefetchInterval(rows)).toBe(false);
  });

  it("returns false for an empty array (nothing to poll)", () => {
    expect(computePostProcessingRefetchInterval([])).toBe(false);
  });

  it("returns false for undefined (query not yet loaded)", () => {
    expect(computePostProcessingRefetchInterval(undefined)).toBe(false);
  });

  it("returns 15 000 when every row is processing", () => {
    const rows: PostPublication[] = [
      makePublication({ status: "processing" }),
      makePublication({ status: "processing" }),
    ];
    expect(computePostProcessingRefetchInterval(rows)).toBe(15_000);
  });
});

// ---------------------------------------------------------------------------
// 2–5. Component rendering tests
// ---------------------------------------------------------------------------

describe("PostProcessingPublications — rendering", () => {
  beforeEach(() => {
    mockUseListPostPublications.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 2. Processing rows → badge visible
  // -----------------------------------------------------------------------
  it("renders a Processing… badge for each processing publication", () => {
    mockUseListPostPublications.mockReturnValue({
      data: [
        makePublication({ status: "processing", platform: "Facebook" }),
      ],
    });

    render(<PostProcessingPublications postId={1} />);

    expect(screen.getByText("Processing…")).toBeTruthy();
    expect(screen.getByText(/Video is being processed by Facebook/)).toBeTruthy();
  });

  it("renders one badge per processing row when multiple rows are processing", () => {
    mockUseListPostPublications.mockReturnValue({
      data: [
        makePublication({ id: 1, status: "processing", platform: "Facebook" }),
        makePublication({ id: 2, status: "processing", platform: "Instagram" }),
      ],
    });

    render(<PostProcessingPublications postId={1} />);

    const badges = screen.getAllByText("Processing…");
    expect(badges).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // 3. Resolved rows → badge disappears (component returns null)
  // -----------------------------------------------------------------------
  it("renders nothing when all publications have resolved to success", () => {
    mockUseListPostPublications.mockReturnValue({
      data: [
        makePublication({ status: "success", platform: "Facebook" }),
      ],
    });

    const { container } = render(<PostProcessingPublications postId={1} />);

    // Component should return null → container is empty
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("Processing…")).toBeNull();
  });

  it("renders nothing when all publications have resolved to failed", () => {
    mockUseListPostPublications.mockReturnValue({
      data: [
        makePublication({ status: "failed", platform: "Facebook", errorMessage: "Upload failed" }),
      ],
    });

    const { container } = render(<PostProcessingPublications postId={1} />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("Processing…")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 4. Mixed rows → only processing ones shown
  // -----------------------------------------------------------------------
  it("shows only the processing badge when publications mix processing and success", () => {
    mockUseListPostPublications.mockReturnValue({
      data: [
        makePublication({ id: 10, status: "processing", platform: "Facebook" }),
        makePublication({ id: 11, status: "success",    platform: "Instagram" }),
      ],
    });

    render(<PostProcessingPublications postId={1} />);

    // One badge for the processing row
    expect(screen.getAllByText("Processing…")).toHaveLength(1);
    // The platform label for the processing row is visible
    expect(screen.getByText(/Facebook:/)).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 5. No publications → nothing renders
  // -----------------------------------------------------------------------
  it("renders nothing when no publications data is returned (undefined)", () => {
    mockUseListPostPublications.mockReturnValue({ data: undefined });

    const { container } = render(<PostProcessingPublications postId={1} />);

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when publications is an empty array", () => {
    mockUseListPostPublications.mockReturnValue({ data: [] });

    const { container } = render(<PostProcessingPublications postId={1} />);

    expect(container.firstChild).toBeNull();
  });
});
