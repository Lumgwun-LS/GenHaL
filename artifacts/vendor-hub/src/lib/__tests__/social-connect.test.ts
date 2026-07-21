/**
 * Tests for handleAddTikTokAccount — the core logic behind the inline TikTok
 * "add account" form that lives inside the schedule dialog's
 * ConnectionWarningsNotice.
 *
 * The critical behaviour being exercised is:
 *  1. On success the connection-warnings query for the post is invalidated so
 *     the warning row disappears immediately without the vendor reopening the
 *     dialog.
 *  2. The invalidation uses the exact query key that was passed in (i.e. the
 *     key produced by `getGetPostConnectionWarningsQueryKey(postId)` in the
 *     component), not a different postId's key.
 *  3. On mutation failure the invalidation is never triggered.
 *  4. On blank input a validation error is returned before any network call.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAddTikTokAccount } from "../social-connect";

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

/** Mirrors the key shape returned by getGetPostConnectionWarningsQueryKey(postId). */
const warningsKey = (postId: number) =>
  [`/api/posts/${postId}/connection-warnings`] as const;

function makeDeps(overrides?: {
  mutateAsync?: () => Promise<unknown>;
  postId?: number;
}) {
  const postId = overrides?.postId ?? 42;
  const mutateAsync = vi.fn(
    overrides?.mutateAsync ?? (() => Promise.resolve({ id: 99 })),
  );
  const onInvalidateConnectionWarnings = vi.fn();
  const onInvalidateSocialAccounts = vi.fn();
  return {
    postId,
    vendorId: 1,
    mutateAsync,
    onInvalidateConnectionWarnings,
    onInvalidateSocialAccounts,
    connectionWarningsQueryKey: warningsKey(postId),
  } as const;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("handleAddTikTokAccount – blank account name", () => {
  it("returns a validation error for an empty string", async () => {
    const deps = makeDeps();
    const result = await handleAddTikTokAccount({ ...deps, accountName: "" });
    expect(result).toEqual({ ok: false, validationError: "Enter the account name" });
  });

  it("returns a validation error for a whitespace-only name", async () => {
    const deps = makeDeps();
    const result = await handleAddTikTokAccount({ ...deps, accountName: "   " });
    expect(result).toEqual({ ok: false, validationError: "Enter the account name" });
  });

  it("does not call mutateAsync on blank input", async () => {
    const deps = makeDeps();
    await handleAddTikTokAccount({ ...deps, accountName: "" });
    expect(deps.mutateAsync).not.toHaveBeenCalled();
  });

  it("does not invalidate the warnings query on blank input", async () => {
    const deps = makeDeps();
    await handleAddTikTokAccount({ ...deps, accountName: "" });
    expect(deps.onInvalidateConnectionWarnings).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Successful path — this is the scenario the task is testing
// ---------------------------------------------------------------------------

describe("handleAddTikTokAccount – successful account creation", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("returns { ok: true } when the mutation resolves", async () => {
    const result = await handleAddTikTokAccount({ ...deps, accountName: "@my_tiktok" });
    expect(result).toEqual({ ok: true });
  });

  it("calls mutateAsync with the correct platform and trimmed account name", async () => {
    await handleAddTikTokAccount({ ...deps, accountName: "  @my_tiktok  " });
    expect(deps.mutateAsync).toHaveBeenCalledOnce();
    expect(deps.mutateAsync).toHaveBeenCalledWith({
      data: { vendorId: deps.vendorId, platform: "TikTok", accountName: "@my_tiktok" },
    });
  });

  it("invalidates the connection-warnings query after success — warning row disappears", async () => {
    await handleAddTikTokAccount({ ...deps, accountName: "@my_tiktok" });
    expect(deps.onInvalidateConnectionWarnings).toHaveBeenCalledOnce();
  });

  it("passes the exact connectionWarningsQueryKey to the invalidation callback", async () => {
    await handleAddTikTokAccount({ ...deps, accountName: "@my_tiktok" });
    expect(deps.onInvalidateConnectionWarnings).toHaveBeenCalledWith(
      deps.connectionWarningsQueryKey,
    );
  });

  it("also invalidates the social-accounts list after success", async () => {
    await handleAddTikTokAccount({ ...deps, accountName: "@my_tiktok" });
    expect(deps.onInvalidateSocialAccounts).toHaveBeenCalledOnce();
  });

  it("invalidates warnings BEFORE social-accounts list so the dialog updates first", async () => {
    const callOrder: string[] = [];
    deps.onInvalidateConnectionWarnings.mockImplementation(() => callOrder.push("warnings"));
    deps.onInvalidateSocialAccounts.mockImplementation(() => callOrder.push("accounts"));

    await handleAddTikTokAccount({ ...deps, accountName: "@my_tiktok" });
    expect(callOrder).toEqual(["warnings", "accounts"]);
  });
});

// ---------------------------------------------------------------------------
// Query-key scoping — a different postId must not clear the wrong warning row
// ---------------------------------------------------------------------------

describe("handleAddTikTokAccount – query key is scoped to the correct postId", () => {
  it("uses the key for postId=10, not postId=99", async () => {
    const deps = makeDeps({ postId: 10 });
    await handleAddTikTokAccount({ ...deps, accountName: "@tiktok_user" });

    const [capturedKey] = deps.onInvalidateConnectionWarnings.mock.calls[0]!;
    expect(capturedKey).toEqual(warningsKey(10));
    expect(capturedKey).not.toEqual(warningsKey(99));
  });

  it("uses a different key for postId=42 vs postId=7", async () => {
    const depsA = makeDeps({ postId: 42 });
    const depsB = makeDeps({ postId: 7 });

    await handleAddTikTokAccount({ ...depsA, accountName: "@tiktok_a" });
    await handleAddTikTokAccount({ ...depsB, accountName: "@tiktok_b" });

    const keyA = depsA.onInvalidateConnectionWarnings.mock.calls[0]![0];
    const keyB = depsB.onInvalidateConnectionWarnings.mock.calls[0]![0];
    expect(keyA).not.toEqual(keyB);
  });
});

// ---------------------------------------------------------------------------
// Mutation failure — warning must stay visible if the account wasn't saved
// ---------------------------------------------------------------------------

describe("handleAddTikTokAccount – mutation failure", () => {
  it("returns a mutationError result when mutateAsync rejects", async () => {
    const deps = makeDeps({ mutateAsync: () => Promise.reject(new Error("500")) });
    const result = await handleAddTikTokAccount({ ...deps, accountName: "@my_tiktok" });
    expect(result).toEqual({ ok: false, mutationError: true });
  });

  it("does NOT invalidate the connection-warnings query on failure", async () => {
    const deps = makeDeps({ mutateAsync: () => Promise.reject(new Error("500")) });
    await handleAddTikTokAccount({ ...deps, accountName: "@my_tiktok" });
    expect(deps.onInvalidateConnectionWarnings).not.toHaveBeenCalled();
  });

  it("does NOT invalidate the social-accounts list on failure", async () => {
    const deps = makeDeps({ mutateAsync: () => Promise.reject(new Error("500")) });
    await handleAddTikTokAccount({ ...deps, accountName: "@my_tiktok" });
    expect(deps.onInvalidateSocialAccounts).not.toHaveBeenCalled();
  });
});
