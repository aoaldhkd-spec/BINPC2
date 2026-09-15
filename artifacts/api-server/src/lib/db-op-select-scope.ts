/**
 * /op SELECT IDOR row-scope + field-redaction planners — extracted from routes/db.ts.
 * Pure given snapshots / filters; auth 403 + Express stay in db.ts.
 */
import { chatPairKey } from './db-chat-ids.js';
import type { FilterSpec } from './db-op-filters.js';

/** signal_sends: own sends (any action) + incoming action=send only. */
export function scopeSignalSendsRows(
  rows: Record<string, unknown>[],
  requesterId: string,
): Record<string, unknown>[] {
  return rows.filter(r => {
    if (String(r.sender_id) === String(requesterId)) return true;
    return String(r.receiver_id) === String(requesterId) && r.action === 'send';
  });
}

/** profile_views: viewer or viewed party only. */
export function scopeProfileViewsRows(
  rows: Record<string, unknown>[],
  requesterId: string,
): Record<string, unknown>[] {
  return rows.filter(
    r =>
      String(r.viewer_id) === String(requesterId)
      || String(r.viewed_id) === String(requesterId),
  );
}

/** blocked_users: user_id or target_id party. */
export function scopeBlockedUsersRows(
  rows: Record<string, unknown>[],
  requesterId: string,
): Record<string, unknown>[] {
  return rows.filter(
    r =>
      String(r.user_id) === String(requesterId)
      || String(r.target_id) === String(requesterId),
  );
}

/** contact_share_events: from/to party. */
export function scopeContactShareEventsRows(
  rows: Record<string, unknown>[],
  requesterId: string,
): Record<string, unknown>[] {
  return rows.filter(
    r =>
      String(r.from_user_id) === String(requesterId)
      || String(r.to_user_id) === String(requesterId),
  );
}

/**
 * contact_shares SELECT source rows:
 * - party filter present → own liker/liked rows (full fields)
 * - else → anonymous { created_at } only for stats
 */
export function contactSharesSelectSource(
  rows: Record<string, unknown>[],
  requesterId: string,
  filters: FilterSpec[],
): Record<string, unknown>[] {
  const hasPartyFilter = filters.some(
    f =>
      (f.type === 'eq' || f.type === 'in')
      && (f.col === 'liker_id' || f.col === 'liked_id'),
  );
  if (hasPartyFilter) {
    return rows.filter(
      r =>
        String(r.liker_id) === String(requesterId)
        || String(r.liked_id) === String(requesterId),
    );
  }
  return rows.map(r => ({ created_at: r.created_at }));
}

/**
 * Participant chats: filter to requester's rooms, then one canonical row per pair.
 * pickCanonical is injected (db.ts wraps countMessagesForChat).
 */
export function dedupeParticipantChatRows(
  rows: Record<string, unknown>[],
  requesterId: string,
  pickCanonical: (siblings: Record<string, unknown>[]) => Record<string, unknown>,
): Record<string, unknown>[] {
  const chatScope = rows.filter(
    c =>
      String(c.user1_id) === String(requesterId)
      || String(c.user2_id) === String(requesterId),
  );
  const dedupedScope: Record<string, unknown>[] = [];
  const seenPairs = new Set<string>();
  for (const c of chatScope) {
    const pk = chatPairKey(String(c.user1_id), String(c.user2_id));
    if (seenPairs.has(pk)) continue;
    const siblings = chatScope.filter(
      x => chatPairKey(String(x.user1_id), String(x.user2_id)) === pk,
    );
    dedupedScope.push(pickCanonical(siblings));
    seenPairs.add(pk);
  }
  return dedupedScope;
}

/** True when likes SELECT should keep liker_id (own sent or own inbox filter). */
export function likesSelectKeepsLikerId(
  filters: FilterSpec[],
  requesterId: string | null | undefined,
): boolean {
  if (!requesterId) return false;
  const ownSentOnly = filters.some(
    f =>
      f.type === 'eq'
      && f.col === 'liker_id'
      && String(f.val) === String(requesterId),
  );
  const ownInboxOnly = filters.some(
    f =>
      f.type === 'eq'
      && f.col === 'liked_id'
      && String(f.val) === String(requesterId),
  );
  return ownSentOnly || ownInboxOnly;
}

export function redactLikerId(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(r => {
    const s = { ...r };
    delete s['liker_id'];
    return s;
  });
}

/** True when profile_views SELECT should keep viewer_id. */
export function profileViewsSelectKeepsViewerId(
  filters: FilterSpec[],
  requesterId: string | null | undefined,
): boolean {
  if (!requesterId) return false;
  const ownViewedOnly = filters.some(
    f =>
      f.type === 'eq'
      && f.col === 'viewed_id'
      && String(f.val) === String(requesterId),
  );
  const ownViewerOnly = filters.some(
    f =>
      f.type === 'eq'
      && f.col === 'viewer_id'
      && String(f.val) === String(requesterId),
  );
  return ownViewedOnly || ownViewerOnly;
}

export function redactViewerId(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(r => {
    const s = { ...r };
    delete s['viewer_id'];
    return s;
  });
}

/** Count participants per group_id for catalog memberCount. */
export function groupMemberCountMap(
  participants: Record<string, unknown>[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of participants) {
    const gid = String(p.group_id ?? '');
    if (!gid) continue;
    counts.set(gid, (counts.get(gid) ?? 0) + 1);
  }
  return counts;
}

export function attachGroupMemberCounts(
  groups: Record<string, unknown>[],
  participants: Record<string, unknown>[],
): Record<string, unknown>[] {
  const counts = groupMemberCountMap(participants);
  return groups.map(r => ({ ...r, memberCount: counts.get(String(r.id)) ?? 0 }));
}

/** Deduplicate group_chats (or similar) by id — last write wins. */
export function collapseRowsById(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const g of rows) {
    const id = String(g.id ?? '');
    if (!id) continue;
    byId.set(id, g);
  }
  if (byId.size === rows.length) return rows;
  return [...byId.values()];
}
