/**
 * Pure reducer functions for useChat's setMessages logic.
 * Extracted so they can be unit-tested without React or Supabase.
 *
 * 안전 장치:
 * - applySseInsert: DB id 중복 체크(1) → client_id 정확 매칭(2) → fuzzy 매칭(3, 창 2초) → 새 메시지 append(4)
 * - applyLoadMessages: DB 행이 정원 — optimistic 중 DB에 없는 것만 보존 → created_at 정렬
 */

import type { Message } from '../types/app';

/**
 * Applied when an SSE INSERT event arrives for the currently-open chat.
 *
 * Rules:
 * 1. Ignore if the exact DB id is already in the list (idempotent).
 * 2. If the incoming message has a client_id, find the matching optimistic
 *    placeholder (`__opt_<client_id>`) and replace it in-place.
 * 3. Fallback fuzzy match (2-second window): find an optimistic from the same
 *    sender with the same content. Window is intentionally tight (2 s) to avoid
 *    false-positive matches when a user sends the same text twice quickly.
 * 4. Otherwise append as a new message.
 */
export function applySseInsert(prev: Message[], newMsg: Message): Message[] {
  // 1. Already present by DB id — skip (idempotent guard)
  if (prev.some((m) => m.id === newMsg.id)) return prev;

  // 2. Exact client_id match — replace optimistic placeholder
  if (newMsg.client_id) {
    const optIdx = prev.findIndex((m) => m.id === `__opt_${newMsg.client_id}`);
    if (optIdx !== -1) {
      const next = [...prev];
      next[optIdx] = newMsg;
      return next;
    }
  }

  // 3. Fuzzy fallback: same sender + same content within 2 seconds
  //    (handles cases where Supabase realtime drops client_id from the payload)
  const msgTime = new Date(newMsg.created_at).getTime();
  const fuzzyIdx = prev.findIndex(
    (m) =>
      m.id.startsWith('__opt_') &&
      m.sender_id === newMsg.sender_id &&
      m.content === newMsg.content &&
      !m.image_url && // 이미지 메시지는 fuzzy 매칭 제외 (content가 '' 이므로 오매칭 위험)
      Math.abs(new Date(m.created_at).getTime() - msgTime) < 2_000,
  );

  if (fuzzyIdx !== -1) {
    const next = [...prev];
    next[fuzzyIdx] = newMsg;
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
 *    DB — identified by neither their id nor their client_id appearing in DB.
 * 3. Strip optimistic messages whose client_id IS in the DB (insert succeeded).
 * 4. Sort merged list by created_at so optimistic messages land in the right place.
 */
export function applyLoadMessages(prev: Message[], data: Message[]): Message[] {
  const dbIds = new Set(data.map((m) => m.id));
  const dbClientIds = new Set<string>(
    data.flatMap((m) => (m.client_id != null ? [m.client_id] : [])),
  );

  // 아직 DB에 반영되지 않은 optimistic 메시지만 보존
  const optimistic = prev.filter(
    (m) =>
      m.id.startsWith('__opt_') &&
      !dbIds.has(m.id) &&
      !dbClientIds.has(m.id.replace('__opt_', '')),
  );

  // DB rows + 미반영 optimistic을 created_at 기준으로 정렬
  const merged = [...data, ...optimistic];
  merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return merged;
}
