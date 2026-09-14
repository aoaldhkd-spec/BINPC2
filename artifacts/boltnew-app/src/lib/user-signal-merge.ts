/**
 * Idempotent merge for user_signals SSE / local updates.
 */

export function recordsShallowEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export type UserSignalRow = { user_id: string };

/**
 * @param mode upsert — INSERT / local update (append if missing)
 * @param mode update-only — SSE UPDATE (ignore unknown user_id)
 */
export function mergeUserSignalRow<T extends UserSignalRow>(
  prev: readonly T[],
  row: T,
  mode: 'upsert' | 'update-only' = 'upsert',
): T[] {
  const idx = prev.findIndex(s => s.user_id === row.user_id);
  if (idx >= 0) {
    if (recordsShallowEqual(prev[idx] as unknown as Record<string, unknown>, row as unknown as Record<string, unknown>)) {
      return prev as T[];
    }
    const next = [...prev];
    next[idx] = row;
    return next;
  }
  if (mode === 'update-only') return prev as T[];
  return [...prev, row];
}
