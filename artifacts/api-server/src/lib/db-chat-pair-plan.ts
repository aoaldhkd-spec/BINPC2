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

/**
 * When inserting a message, collapse onto canonical chat id if sibling rooms exist.
 */
export function planCanonicalMessageChatId(
  chatId: string,
  chats: Record<string, unknown>[],
  pairKey: (u1: string, u2: string) => string,
  pickCanonical: (group: Record<string, unknown>[]) => Record<string, unknown>,
): string {
  const msgChat = chats.find(c => String(c.id) === String(chatId));
  if (!msgChat) return chatId;
  const pk = pairKey(String(msgChat.user1_id), String(msgChat.user2_id));
  const siblings = chats.filter(
    c => pairKey(String(c.user1_id), String(c.user2_id)) === pk,
  );
  if (siblings.length > 1) {
    return String(pickCanonical(siblings).id);
  }
  return chatId;
}


/** Ordered dup→canonical merge steps for 1:1 chat dedupe. */
export type ChatDedupeMergeStep = {
  canonicalId: string;
  dupId: string;
};

export function planChatDedupeMergeSteps(
  chats: Record<string, unknown>[],
  countMessages: (chatId: string) => number,
): ChatDedupeMergeStep[] {
  const groups = groupChatsByPair(chats);
  const steps: ChatDedupeMergeStep[] = [];
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const canonical = pickCanonicalChatRow(group, countMessages);
    const canonicalId = String(canonical.id);
    for (const dup of group) {
      const dupId = String(dup.id);
      if (dupId === canonicalId) continue;
      steps.push({ canonicalId, dupId });
    }
  }
  return steps;
}

export type ChatReadDedupeAction =
  | {
      kind: 'absorb';
      /** chat_reads row id on the dup room (deleted after absorb). */
      deleteId: string;
      readerId: string;
      /** When set, write onto the surviving canonical read's read_at. */
      bumpReadAt?: unknown;
    }
  | {
      kind: 'remap';
      rowId: string;
      readerId: string;
      newChatId: string;
      newId: string;
    };

/**
 * Pure chat_reads plan for one dup→canonical merge.
 * Iteration order matches the historical reverse scan in db.ts.
 */
export function planChatReadsForDedupe(
  reads: Record<string, unknown>[],
  dupId: string,
  canonicalId: string,
): ChatReadDedupeAction[] {
  const actions: ChatReadDedupeAction[] = [];
  for (let i = reads.length - 1; i >= 0; i--) {
    const cr = reads[i];
    if (String(cr.chat_id) !== dupId) continue;
    const readerId = String(cr.reader_id ?? '');
    const existing = reads.find(
      r => String(r.chat_id) === canonicalId && String(r.reader_id) === readerId,
    );
    if (existing) {
      const crTs = String(cr.read_at ?? '');
      const exTs = String(existing.read_at ?? '');
      actions.push(
        crTs > exTs
          ? { kind: 'absorb', deleteId: String(cr.id), readerId, bumpReadAt: cr.read_at }
          : { kind: 'absorb', deleteId: String(cr.id), readerId },
      );
    } else {
      actions.push({
        kind: 'remap',
        rowId: String(cr.id),
        readerId,
        newChatId: canonicalId,
        newId: `${canonicalId}__${readerId}`,
      });
    }
  }
  return actions;
}

/** Messages whose chat_id should move onto canonical during dedupe. */
export function messagesToRemapOnDedupe(
  messages: Record<string, unknown>[],
  dupId: string,
): Record<string, unknown>[] {
  return messages.filter(m => String(m.chat_id) === dupId);
}

/**
 * Apply PG-fetched message rows into an in-memory messages table
 * using messageMergeAction (insert/replace/keep).
 */
export function applyIncomingMessageRows(
  memRows: Record<string, unknown>[],
  incoming: Record<string, unknown>[],
): void {
  const byId = new Map(memRows.map(r => [String(r['id']), r]));
  for (const data of incoming) {
    const id = String(data['id'] ?? '');
    if (!id) continue;
    const existing = byId.get(id);
    const action = messageMergeAction(existing, data);
    if (action === 'insert') {
      memRows.push(data);
      byId.set(id, data);
    } else if (action === 'replace') {
      const idx = memRows.findIndex(r => String(r['id']) === id);
      if (idx >= 0) memRows[idx] = data;
      byId.set(id, data);
    }
  }
}
