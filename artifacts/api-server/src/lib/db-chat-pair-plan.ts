/**
 * 1:1 chat pair / dedupe / message-merge pure planners — extracted from routes/db.ts.
 * Store mutate, PG merge I/O, and SSE stay in db.ts (thin wrappers + I/O).
 */
import { chatPairKey } from './db-chat-ids.js';

/** Whether userId is user1 or user2 on the chat row (after optional merge redirect). */
export function isChatParticipant(
  chatId: unknown,
  userId: string,
  findChatById: (id: string) => Record<string, unknown> | undefined,
  resolveMergedChatId: (id: string) => string = (id) => id,
): boolean {
  if (chatId == null || chatId === '' || !userId) return false;
  const resolved = resolveMergedChatId(String(chatId));
  const chat = findChatById(resolved) ?? findChatById(String(chatId));
  if (!chat) return false;
  return String(chat.user1_id) === String(userId) || String(chat.user2_id) === String(userId);
}

export function countMessagesForChat(
  chatId: string,
  messages: Record<string, unknown>[],
): number {
  return messages.filter(m => String(m.chat_id) === String(chatId)).length;
}

/** 동일 user 쌍의 모든 chat id (메시지 조회·병합용) */
export function chatIdsForPair(
  u1: string,
  u2: string,
  chats: Record<string, unknown>[],
): string[] {
  const key = chatPairKey(u1, u2);
  return chats
    .filter(c => chatPairKey(String(c.user1_id), String(c.user2_id)) === key)
    .map(c => String(c.id));
}

/**
 * Prefer the room with the most messages; tie-break by earliest created_at/id.
 * countMessages is injected so callers can use live store counts.
 */
export function pickCanonicalChatRow(
  group: Record<string, unknown>[],
  countMessages: (chatId: string) => number,
): Record<string, unknown> {
  return [...group].sort((a, b) => {
    const diff = countMessages(String(b.id)) - countMessages(String(a.id));
    if (diff !== 0) return diff;
    return String(a.created_at ?? a.id).localeCompare(String(b.created_at ?? b.id));
  })[0];
}

/** Group 1:1 chats by chatPairKey; skips incomplete / self pairs. */
export function groupChatsByPair(
  chats: Record<string, unknown>[],
): Map<string, Record<string, unknown>[]> {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const c of chats) {
    const u1 = String(c.user1_id ?? '');
    const u2 = String(c.user2_id ?? '');
    if (!u1 || !u2 || u1 === u2) continue;
    const key = chatPairKey(u1, u2);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  return groups;
}

export type MessageMergeAction = 'insert' | 'replace' | 'keep';

/** PG vs memory message row: insert if missing; replace when db ts >= mem ts. */
export function messageMergeAction(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
): MessageMergeAction {
  if (!existing) return 'insert';
  const dbTs = String(incoming.updated_at ?? incoming.created_at ?? '');
  const memTs = String(existing.updated_at ?? existing.created_at ?? '');
  if (dbTs >= memTs) return 'replace';
  return 'keep';
}
