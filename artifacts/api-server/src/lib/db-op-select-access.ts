/**
 * /op SELECT IDOR access planners for messages / chat_reads / group_* —
 * extracted from routes/db.ts. Pure given snapshots + injected lookups;
 * Express / logger / merge I/O stay in db.ts.
 */

import type { FilterSpec } from './db-op-filters.js';

export type OpSelectReject = {
  status: number;
  body: { data: null; error: { message: string; code: string } };
  logMsg: string;
};

const FORBIDDEN_AUTH = {
  message: 'Forbidden: authentication required',
  code: 'FORBIDDEN',
} as const;

export function selectAuthRequiredReject(logMsg: string): OpSelectReject {
  return {
    status: 403,
    body: { data: null, error: { ...FORBIDDEN_AUTH } },
    logMsg,
  };
}

export function findChatIdEqFilter(
  filters: FilterSpec[],
): Extract<FilterSpec, { type: 'eq' }> | undefined {
  return filters.find(f => f.type === 'eq' && f.col === 'chat_id') as
    | Extract<FilterSpec, { type: 'eq' }>
    | undefined;
}

export function findChatIdInFilter(
  filters: FilterSpec[],
): Extract<FilterSpec, { type: 'in' }> | undefined {
  return filters.find(f => f.type === 'in' && f.col === 'chat_id') as
    | Extract<FilterSpec, { type: 'in' }>
    | undefined;
}

export function messagesSelectMissingChatIdFilterReject(): OpSelectReject {
  return {
    status: 403,
    body: { data: null, error: { message: 'Forbidden: chat_id filter required', code: 'FORBIDDEN' } },
    logMsg: '[SECURITY] IDOR: messages SELECT without chat_id filter blocked',
  };
}

export function messagesSelectNonParticipantReject(): OpSelectReject {
  return {
    status: 403,
    body: { data: null, error: { message: 'Forbidden: not a chat participant', code: 'FORBIDDEN' } },
    logMsg: '[SECURITY] IDOR: messages SELECT by non-participant blocked',
  };
}

export function messagesSelectInNonParticipantReject(): OpSelectReject {
  return {
    status: 403,
    body: { data: null, error: { message: 'Forbidden: not a chat participant', code: 'FORBIDDEN' } },
    logMsg: '[SECURITY] IDOR: messages SELECT (in) includes non-participant chat blocked',
  };
}

export function isChatRowParticipant(
  chat: Record<string, unknown>,
  requesterId: string,
): boolean {
  return (
    String(chat.user1_id) === String(requesterId)
    || String(chat.user2_id) === String(requesterId)
  );
}

/** Map sibling-room messages onto the requested canonical chat_id. */
export function mapMessagesOntoCanonicalChatId(
  messages: Record<string, unknown>[],
  wantId: string,
  lookupIds: string[],
): Record<string, unknown>[] {
  return messages
    .filter(m => lookupIds.includes(String(m.chat_id)))
    .map(m => (String(m.chat_id) === wantId ? m : { ...m, chat_id: wantId }));
}

/** First chat_id in an `in` filter the requester does not participate in (missing chats ignored). */
export function findIllegalMessagesInChatId(
  chats: Record<string, unknown>[],
  chatIds: unknown[],
  requesterId: string,
): string | undefined {
  return (chatIds as string[]).find(cid => {
    const chat = chats.find(c => String(c.id) === String(cid));
    if (!chat) return false;
    return !isChatRowParticipant(chat, requesterId);
  });
}

/** Expand `in` chat_id vals with sibling room ids for the same pair. */
export function expandMessagesChatIdInVals(
  chats: Record<string, unknown>[],
  vals: unknown[],
  chatIdsForPair: (u1: string, u2: string) => string[],
): string[] {
  const expanded = new Set(vals.map(v => String(v)));
  for (const cid of [...expanded]) {
    const chat = chats.find(c => String(c.id) === cid);
    if (!chat) continue;
    for (const id of chatIdsForPair(String(chat.user1_id), String(chat.user2_id))) {
      expanded.add(id);
    }
  }
  return [...expanded];
}

/**
 * chat_reads rows the requester may see: own reader_id, or peer read_at in a
 * 1:1 room they participate in.
 */
export function scopeChatReadsForRequester(
  rows: Record<string, unknown>[],
  requesterId: string,
  findChat: (chatId: string, resolved: string) => Record<string, unknown> | undefined,
  resolveMergedChatId: (id: string) => string,
): Record<string, unknown>[] {
  return rows.filter(r => {
    if (String(r.reader_id) === String(requesterId)) return true;
    const resolved = resolveMergedChatId(String(r.chat_id ?? ''));
    const chat = findChat(String(r.chat_id ?? ''), resolved);
    if (!chat) return false;
    return isChatRowParticipant(chat, requesterId);
  });
}

/** Sibling chat ids for an optional chat_id eq filter (merged + pair siblings). */
export function chatReadsSiblingIdsForEqFilter(
  filters: FilterSpec[],
  resolveMergedChatId: (id: string) => string,
  findChatByIds: (ids: Set<string>) => Record<string, unknown> | undefined,
  chatIdsForPair: (u1: string, u2: string) => string[],
): { chatIdEq: Extract<FilterSpec, { type: 'eq' }> | undefined; siblingIds: Set<string> } {
  const chatIdEq = findChatIdEqFilter(filters);
  const siblingIds = new Set<string>();
  if (chatIdEq) {
    const want = String(chatIdEq.val);
    siblingIds.add(want);
    siblingIds.add(resolveMergedChatId(want));
    const chat = findChatByIds(siblingIds);
    if (chat) {
      for (const id of chatIdsForPair(String(chat.user1_id), String(chat.user2_id))) {
        siblingIds.add(id);
      }
    }
  }
  return { chatIdEq, siblingIds };
}

export function applyChatReadsSiblingScope(
  crScope: Record<string, unknown>[],
  filters: FilterSpec[],
  chatIdEq: Extract<FilterSpec, { type: 'eq' }> | undefined,
  siblingIds: Set<string>,
): { rows: Record<string, unknown>[]; filters: FilterSpec[] } {
  const nextFilters = chatIdEq
    ? filters.filter(f => !(f.type === 'eq' && f.col === 'chat_id'))
    : filters;
  const rows = chatIdEq
    ? crScope.filter(r => siblingIds.has(String(r.chat_id)))
    : crScope;
  return { rows, filters: nextFilters };
}

/** Membership group ids including raw+merged aliases. */
export function collectMyGroupIds(
  participants: Record<string, unknown>[],
  requesterId: string,
  resolveMergedGroupId: (id: string) => string,
): Set<string> {
  return new Set(
    participants
      .filter(p => String(p.user_id) === String(requesterId))
      .flatMap(p => {
        const raw = String(p.group_id);
        const resolved = resolveMergedGroupId(raw);
        return raw === resolved ? [raw] : [raw, resolved];
      }),
  );
}

export function scopeGroupParticipantRows(
  rows: Record<string, unknown>[],
  myGroupIds: Set<string>,
): Record<string, unknown>[] {
  return rows.filter(r => myGroupIds.has(String(r.group_id)));
}

export function scopeGroupMessageRows(
  rows: Record<string, unknown>[],
  myGroupIds: Set<string>,
  resolveMergedGroupId: (id: string) => string,
): Record<string, unknown>[] {
  return rows.filter(r => {
    const gid = String(r.group_id);
    return myGroupIds.has(gid) || myGroupIds.has(resolveMergedGroupId(gid));
  });
}

/** Remap group_id eq/in filters through merge map. */
export function remapGroupIdFilters(
  filters: FilterSpec[],
  resolveMergedGroupId: (id: string) => string,
): FilterSpec[] {
  return filters.map(f => {
    if (f.type === 'eq' && f.col === 'group_id') {
      return { ...f, val: resolveMergedGroupId(String(f.val)) };
    }
    if (f.type === 'in' && f.col === 'group_id') {
      const vals = [...new Set((f.vals as unknown[]).map(v => resolveMergedGroupId(String(v))))];
      return { ...f, vals };
    }
    return f;
  });
}
