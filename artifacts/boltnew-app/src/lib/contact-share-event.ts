/**
 * Pure helpers for contact_share_events SSE INSERT (acceptance/rejection toasts).
 */

export type ContactShareEventRow = {
  id?: string;
  from_user_id?: string;
  to_user_id?: string;
  event_type?: string;
  created_at?: string;
};

/** Live events older than this are treated as ring-buffer replay (toast skip). */
export const CONTACT_SHARE_EVENT_STALE_MS = 120_000;

export function contactShareEventKey(row: ContactShareEventRow): string {
  return row.id ?? `${row.from_user_id ?? ''}:${row.event_type ?? ''}:${row.created_at ?? ''}`;
}

/**
 * Phone clock skew: negative age (phone slow) stays live.
 * Only ages above threshold are ring replays.
 */
export function isContactShareEventStaleReplay(
  createdAt: string | undefined,
  nowMs: number = Date.now(),
  staleMs: number = CONTACT_SHARE_EVENT_STALE_MS,
): boolean {
  if (!createdAt) return false;
  const eventAgeMs = nowMs - new Date(createdAt).getTime();
  return eventAgeMs > staleMs;
}

/** Cap seen-id set growth; keep newest `keep` when over `max`. */
export function pruneSeenIdSet(
  seen: Set<string>,
  max = 500,
  keep = 300,
): Set<string> {
  if (seen.size <= max) return seen;
  const arr = [...seen];
  return new Set(arr.slice(-keep));
}

export type ContactShareEventPlan = {
  ignore: boolean;
  reason?: 'not-for-me' | 'duplicate' | 'unknown-type';
  /** Always reload durable contact_shares on accepted (even if toast skipped). */
  loadContactShares: boolean;
  notif: { type: 'accepted' | 'rejected'; fromUserId: string } | null;
  eventKey: string;
};

export function planContactShareEvent(
  row: ContactShareEventRow | null | undefined,
  myId: string | null | undefined,
  opts: {
    seenIds: ReadonlySet<string>;
    nowMs?: number;
  },
): ContactShareEventPlan {
  const eventKey = contactShareEventKey(row ?? {});
  if (!myId || !row?.to_user_id || row.to_user_id !== myId) {
    return {
      ignore: true,
      reason: 'not-for-me',
      loadContactShares: false,
      notif: null,
      eventKey,
    };
  }
  if (opts.seenIds.has(eventKey)) {
    return {
      ignore: true,
      reason: 'duplicate',
      loadContactShares: false,
      notif: null,
      eventKey,
    };
  }
  const stale = isContactShareEventStaleReplay(row.created_at, opts.nowMs);
  const fromUserId = row.from_user_id ?? '';
  if (row.event_type === 'accepted') {
    return {
      ignore: false,
      loadContactShares: true,
      notif: stale || !fromUserId ? null : { type: 'accepted', fromUserId },
      eventKey,
    };
  }
  if (row.event_type === 'rejected') {
    return {
      ignore: false,
      loadContactShares: false,
      notif: stale || !fromUserId ? null : { type: 'rejected', fromUserId },
      eventKey,
    };
  }
  return {
    ignore: true,
    reason: 'unknown-type',
    loadContactShares: false,
    notif: null,
    eventKey,
  };
}
