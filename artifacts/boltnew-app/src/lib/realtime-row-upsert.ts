/**
 * Tiny idempotent list upserts used by App SSE channel applies.
 */

export function upsertById<T extends { id: string }>(
  prev: readonly T[],
  row: T,
): T[] {
  if (prev.some(x => x.id === row.id)) return prev as T[];
  return [...prev, row];
}

export function upsertReceivedContactShare<T extends { liked_id: string }>(
  prev: readonly T[],
  share: T,
): T[] {
  const idx = prev.findIndex(s => s.liked_id === share.liked_id);
  if (idx >= 0) {
    const next = [...prev];
    next[idx] = share;
    return next;
  }
  return [share, ...prev];
}

export function upsertReceivedLikerFront<T extends { id: string }>(
  prev: readonly T[],
  profile: T,
): T[] {
  if (prev.some(p => p.id === profile.id)) return prev as T[];
  return [profile, ...prev];
}

export function filterBlockedUsersForMe<T extends { user_id: string; target_id: string }>(
  rows: readonly T[],
  uid: string,
): T[] {
  return rows.filter(b => b.user_id === uid || b.target_id === uid);
}

export function isBlockedRowForMe(
  row: { user_id: string; target_id: string },
  uid: string,
): boolean {
  return row.user_id === uid || row.target_id === uid;
}
