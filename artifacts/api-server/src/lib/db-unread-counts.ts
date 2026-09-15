/**
 * 1:1 unread message counts — extracted from routes/db.ts.
 * Pure given chats/messages/reads + merge redirect; HTTP cache/SSE auth stay in db.ts.
 */
import { chatPairKey } from './db-chat-ids.js';
import { pickCanonicalChatRow } from './db-chat-pair-plan.js';

/**
 * Per-canonical-chat unread counts for userId (excludes own sends; merges sibling rooms).
 */
export function computeUnreadCountsForUser(
  userId: string,
  chatsAll: Record<string, unknown>[],
  messages: Record<string, unknown>[],
  chatReads: Record<string, unknown>[],
  resolveMergedChatId: (id: string) => string,
  countMessages: (chatId: string) => number,
): Record<string, number> {
  const chats = chatsAll.filter(
    c => String(c.user1_id) === String(userId) || String(c.user2_id) === String(userId),
  );

  const readAtByChat = new Map<string, string>();
  for (const r of chatReads) {
    if (String(r.reader_id) === String(userId) && r.chat_id && r.read_at) {
      const cid = resolveMergedChatId(String(r.chat_id));
      const prev = readAtByChat.get(cid);
      if (!prev || String(r.read_at) > prev) readAtByChat.set(cid, r.read_at as string);
    }
  }

  const msgsByChatId = new Map<string, Record<string, unknown>[]>();
  for (const m of messages) {
    const cid = resolveMergedChatId(String(m.chat_id ?? ''));
    if (!msgsByChatId.has(cid)) msgsByChatId.set(cid, []);
    msgsByChatId.get(cid)!.push(m);
  }

  const counts: Record<string, number> = {};
  const seenPairs = new Set<string>();
  for (const chat of chats) {
    const pk = chatPairKey(String(chat.user1_id), String(chat.user2_id));
    if (seenPairs.has(pk)) continue;
    seenPairs.add(pk);
    const siblings = chats.filter(
      c => chatPairKey(String(c.user1_id), String(c.user2_id)) === pk,
    );
    const canonical = pickCanonicalChatRow(siblings, countMessages);
    const chatId = String(canonical.id);
    const siblingIds = siblings.map(c => String(c.id));
    let readAt: string | undefined;
    for (const sid of siblingIds) {
      const ra = readAtByChat.get(sid) ?? readAtByChat.get(resolveMergedChatId(sid));
      if (ra && (!readAt || ra > readAt)) readAt = ra;
    }
    let unreadCount = 0;
    const seenMsg = new Set<string>();
    for (const sid of [...new Set([...siblingIds, chatId])]) {
      for (const m of msgsByChatId.get(sid) ?? []) {
        const mid = String(m.id ?? '');
        if (mid && seenMsg.has(mid)) continue;
        if (mid) seenMsg.add(mid);
        if (String(m.sender_id) === String(userId)) continue;
        if (!readAt || (m.created_at as string) > readAt) unreadCount++;
      }
    }
    if (unreadCount > 0) counts[chatId] = unreadCount;
  }
  return counts;
}

export type UnreadCountsReject = {
  status: number;
  body: { data: null; error: { message: string; code?: string } };
};

export function unreadCountsUserIdRequiredReject(): UnreadCountsReject {
  return { status: 400, body: { data: null, error: { message: 'userId required' } } };
}

export function unreadCountsUnauthorizedReject(): UnreadCountsReject {
  return {
    status: 401,
    body: {
      data: null,
      error: { message: 'Unauthorized: valid SSE token required', code: 'UNAUTHORIZED' },
    },
  };
}

export function unreadCountsInternalReject(): UnreadCountsReject {
  return {
    status: 500,
    body: { data: null, error: { message: '안읽은 메시지 수 조회 중 오류가 발생했습니다.' } },
  };
}

export type UnreadCountsCacheEntry = { ts: number; data: Record<string, number> };

/** Hit when entry exists and is within TTL. */
export function readUnreadCountsCache(
  cache: Map<string, UnreadCountsCacheEntry>,
  userId: string,
  now: number,
  ttlMs: number,
): Record<string, number> | null {
  const cached = cache.get(userId);
  if (cached && (now - cached.ts) < ttlMs) return cached.data;
  return null;
}

/** LRU-ish: Map insertion order — evict oldest key when at maxSize. */
export function writeUnreadCountsCache(
  cache: Map<string, UnreadCountsCacheEntry>,
  userId: string,
  data: Record<string, number>,
  now: number,
  maxSize = 200,
): void {
  if (cache.size >= maxSize && !cache.has(userId)) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(userId, { ts: now, data });
}

export function pruneUnreadCountsCache(
  cache: Map<string, UnreadCountsCacheEntry>,
  cutoff: number,
): void {
  for (const [k, v] of cache) if (v.ts < cutoff) cache.delete(k);
}

