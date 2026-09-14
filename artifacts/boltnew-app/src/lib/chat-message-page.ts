/**
 * Bounded open-room message paging helpers.
 * Initial SELECT is newest-N (desc + limit), reversed to chronological for UI.
 * Optional older cursor uses created_at lt — load-more skeleton for ChatScreen.
 */
export const MESSAGE_PAGE_SIZE = 500;
/** Hard ceiling when user explicitly loads older (initial stays at MESSAGE_PAGE_SIZE). */
export const MESSAGE_OLDER_HARD_CAP = MESSAGE_PAGE_SIZE * 2;

export type MessagePageRow = {
  id: string;
  created_at: string;
};

export type NormalizedMessagePage<T extends MessagePageRow> = {
  /** Chronological (oldest → newest) for UI / reducers */
  messages: T[];
  hasMoreOlder: boolean;
  /** Oldest created_at in this page (cursor for next older fetch); null if empty */
  oldestCreatedAt: string | null;
};

/** Server returns newest-first when ordered desc; flip for chat UI. */
export function normalizeDescMessagePage<T extends MessagePageRow>(
  rows: readonly T[],
  pageSize: number = MESSAGE_PAGE_SIZE,
): NormalizedMessagePage<T> {
  const newestFirst = [...rows];
  const chronological = [...newestFirst].reverse();
  const oldest = chronological[0]?.created_at ?? null;
  return {
    messages: chronological,
    hasMoreOlder: newestFirst.length >= pageSize,
    oldestCreatedAt: oldest ?? null,
  };
}

/** Cursor for the next older page — oldest confirmed row (skip optimistic). */
export function olderMessagesCursor(
  messages: readonly MessagePageRow[],
): string | null {
  let oldest: string | null = null;
  let oldestTs = Infinity;
  for (const m of messages) {
    if (!m?.id || m.id.startsWith('__opt_')) continue;
    if (typeof m.created_at !== 'string' || !m.created_at) continue;
    const t = new Date(m.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    if (t < oldestTs) {
      oldestTs = t;
      oldest = m.created_at;
    }
  }
  return oldest;
}

/**
 * Prepend an older page (already chronological) onto current messages.
 * Dedupes by id; sorts by created_at; caps at hardCap (keeps newest when over).
 */
export function mergeOlderMessagePage<T extends MessagePageRow>(
  current: readonly T[],
  olderChronological: readonly T[],
  hardCap: number = MESSAGE_OLDER_HARD_CAP,
): T[] {
  const byId = new Map<string, T>();
  for (const m of olderChronological) {
    if (m?.id) byId.set(m.id, m);
  }
  for (const m of current) {
    if (m?.id) byId.set(m.id, m);
  }
  const merged = [...byId.values()].sort((a, b) => {
    const at = new Date(a.created_at).getTime();
    const bt = new Date(b.created_at).getTime();
    if (!Number.isFinite(at) && !Number.isFinite(bt)) return 0;
    if (!Number.isFinite(at)) return -1;
    if (!Number.isFinite(bt)) return 1;
    return at - bt;
  });
  if (merged.length <= hardCap) return merged;
  return merged.slice(-hardCap);
}

export function pageHasMoreOlder(
  fetchedCount: number,
  pageSize: number = MESSAGE_PAGE_SIZE,
): boolean {
  return fetchedCount >= pageSize;
}
