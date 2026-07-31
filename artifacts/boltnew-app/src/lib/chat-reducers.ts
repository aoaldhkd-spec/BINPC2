/**
 * Pure reducer functions for useChat's setMessages logic.
 * Extracted so they can be unit-tested without React or Supabase.
 */

import type { Message } from '../types/app';

/**
 * Applied when an SSE INSERT event arrives for the currently-open chat.
 *
 * Rules:
 * 1. Ignore if the exact DB id is already in the list (idempotent).
 * 2. If the incoming message has a client_id, find the matching optimistic
 *    placeholder (`__opt_<client_id>`) and replace it in-place.
 * 3. Fallback (no client_id / legacy): find an optimistic message from the
 *    same sender with the same content within 5 seconds and replace it.
 * 4. Otherwise append as a new message.
 */
export function applySseInsert(prev: Message[], newMsg: Message): Message[] {
  // 1. Already present — skip
  if (prev.some((m) => m.id === newMsg.id)) return prev;

  // 2 & 3. Find the optimistic placeholder to replace
  const optIdx = newMsg.client_id
    ? prev.findIndex((m) => m.id === `__opt_${newMsg.client_id}`)
    : (() => {
        const msgTime = new Date(newMsg.created_at).getTime();
        return prev.findIndex(
          (m) =>
            m.id.startsWith('__opt_') &&
            m.sender_id === newMsg.sender_id &&
            m.content === newMsg.content &&
            Math.abs(new Date(m.created_at).getTime() - msgTime) < 5000,
        );
      })();

  if (optIdx !== -1) {
    const next = [...prev];
    next[optIdx] = newMsg;
    return next;
  }

  // 4. New message from another source — append
  return [...prev, newMsg];
}

/**
 * Applied when loadMessages returns DB rows for the active chat.
 *
 * Rules:
 * 1. Accept all DB rows as the authoritative list.
 * 2. Keep optimistic messages (`__opt_*`) that are NOT yet reflected in the
 *    DB — identified by neither their id nor their client_id appearing in the
 *    DB result.
 * 3. Strip optimistic messages whose client_id IS in the DB (the retry
 *    succeeded — the real row is now in `data`).
 */
export function applyLoadMessages(prev: Message[], data: Message[]): Message[] {
  const dbIds = new Set(data.map((m) => m.id));
  const dbClientIds = new Set<string>(
    data.flatMap((m) => (m.client_id != null ? [m.client_id] : [])),
  );

  const optimistic = prev.filter(
    (m) =>
      m.id.startsWith('__opt_') &&
      !dbIds.has(m.id) &&
      !dbClientIds.has(m.id.replace('__opt_', '')),
  );

  return [...data, ...optimistic];
}
