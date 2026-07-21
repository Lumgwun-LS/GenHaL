/**
 * Pure helpers for the "add social account" flows inside the schedule dialog's
 * ConnectionWarningsNotice.  Extracted from the component so they can be
 * unit-tested without React or TanStack context.
 */

/** Minimal shape of the create-social-account mutateAsync argument. */
export interface CreateSocialAccountArgs {
  data: { vendorId: number; platform: string; accountName: string };
}

export type AddTikTokResult =
  | { ok: true }
  | { ok: false; validationError: string }
  | { ok: false; mutationError: true };

export interface HandleAddTikTokOptions {
  accountName: string;
  vendorId: number;
  postId: number;
  /** Calls the create-social-account API mutation. */
  mutateAsync: (args: CreateSocialAccountArgs) => Promise<unknown>;
  /**
   * Called on success with the connection-warnings query key for `postId`.
   * The component wires this to `queryClient.invalidateQueries({ queryKey })`;
   * tests pass a spy to assert the exact key used.
   *
   * Invalidating this key causes the ConnectionWarningsNotice to immediately
   * refetch and hide the TikTok warning row without the vendor having to reopen
   * the schedule dialog.
   */
  onInvalidateConnectionWarnings: (queryKey: readonly unknown[]) => void;
  /**
   * Called on success to refresh the Connected Accounts panel.
   */
  onInvalidateSocialAccounts: () => void;
  /**
   * The query key for the connection-warnings endpoint of this post.  In
   * production this is `getGetPostConnectionWarningsQueryKey(postId)` from the
   * generated API client; pass it in so the helper never hard-codes the key
   * shape and stays aligned with whatever the client generates.
   */
  connectionWarningsQueryKey: readonly unknown[];
}

/**
 * Core logic for the inline TikTok "add account" form inside
 * ConnectionWarningsNotice.
 *
 * On success it:
 *  1. Sends the create-social-account mutation.
 *  2. Calls `onInvalidateConnectionWarnings` with the post's connection-warnings
 *     query key → the warning row disappears immediately inside the open dialog.
 *  3. Calls `onInvalidateSocialAccounts` → Connected Accounts panel refreshes.
 *
 * On validation failure (blank name) or mutation failure it returns an error
 * result and performs no invalidation, so the dialog stays open for the vendor
 * to correct the problem.
 */
export async function handleAddTikTokAccount(
  opts: HandleAddTikTokOptions,
): Promise<AddTikTokResult> {
  const {
    accountName,
    vendorId,
    postId: _postId,
    mutateAsync,
    onInvalidateConnectionWarnings,
    onInvalidateSocialAccounts,
    connectionWarningsQueryKey,
  } = opts;

  if (!accountName.trim()) {
    return { ok: false, validationError: "Enter the account name" };
  }

  try {
    await mutateAsync({
      data: { vendorId, platform: "TikTok", accountName: accountName.trim() },
    });
    onInvalidateConnectionWarnings(connectionWarningsQueryKey);
    onInvalidateSocialAccounts();
    return { ok: true };
  } catch {
    return { ok: false, mutationError: true };
  }
}
