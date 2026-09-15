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
