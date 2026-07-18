/**
 * Pure helpers for manipulating the vendor selection set in the admin panel.
 *
 * Keeping these as standalone functions makes them easy to unit-test without
 * mounting any React components.
 */

/**
 * Add the given vendor IDs to an existing selection, deduplicating the result.
 */
export function applyAddToSelection(current: number[], toAdd: number[]): number[] {
  return Array.from(new Set([...current, ...toAdd]));
}

/**
 * Remove the given vendor IDs from the current selection.
 *
 * Only IDs that are already in `current` are affected. IDs in `toRemove` that
 * are NOT present in `current` are silently ignored — the selection is never
 * corrupted by unrelated filter matches.
 */
export function applyRemoveFromSelection(current: number[], toRemove: number[]): number[] {
  const removeSet = new Set(toRemove);
  return current.filter((id) => !removeSet.has(id));
}
