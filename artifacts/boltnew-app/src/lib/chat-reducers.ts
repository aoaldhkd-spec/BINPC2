/**
 * Pure reducer functions for useChat's setMessages logic.
 * Extracted so they can be unit-tested without React or Supabase.
 *
 * 안전 장치:
 * - applySseInsert: DB id 중복 체크(1) → client_id 정확 매칭(2) → fuzzy 매칭(3, 창 2초) → 새 메시지 append(4)
 * - applyLoadMessages: fetch 시작 뒤 도착한 realtime 행과 optimistic을 보존 → created_at 정렬
 */

import type { Message } from '../types/app';

function sortMessages(messages: Message[]): Message[] {
  return messages.sort((a, b) => {
    const at = new Date(a.created_at).getTime();
    const bt = new Date(b.created_at).getTime();
    if (!Number.isFinite(at) && !Number.isFinite(bt)) return 0;
    if (!Number.isFinite(at)) return -1;
    if (!Number.isFinite(bt)) return 1;
    return at - bt;
  });
}

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
export function messageBelongsToChat(
  msg: Message,
  chatId: string | null | undefined,
  allowedChatIds?: Iterable<string> | null,
): boolean {
  if (!chatId) return false;
  const allowed = new Set<string>([chatId]);
  if (allowedChatIds) {
    for (const id of allowedChatIds) {
      if (id) allowed.add(id);
    }
  }
  if (msg.id.startsWith('__opt_')) return !msg.chat_id || allowed.has(msg.chat_id);
  return !!msg.chat_id && allowed.has(msg.chat_id);
}

/**
 * 상대가 내 1:1 방을 열어 DB chat_reads.read_at 이 갱신된 뒤에만
 * 내가 보낸 메시지의 미읽음('1')을 지운다.
 * - 내 자신의 read 이벤트는 무시
 * - partnerId가 있으면 그 사람만 인정
 * - read_at 없는 이벤트는 절대 지우지 않음 (조기 소거 방지)
 * - 메시지별로 created_at <= read_at 인 것만 지움 (옛 read_at으로 새 메시지 '1' 제거 방지)
 */
export function applyPartnerReadReceipt(
  unreadIds: ReadonlySet<string>,
  messages: readonly Message[],
  currentUserId: string,
  readerId: string | undefined,
  readAt: string | undefined,
  partnerId?: string | null,
): Set<string> {
  const next = new Set(unreadIds);
  if (!readerId || readerId === currentUserId) return next;
  if (partnerId && readerId !== partnerId) return next;
  if (!readAt) return next;
  const readTime = new Date(readAt).getTime();
  if (!Number.isFinite(readTime)) return next;
  for (const m of messages) {
    if (!next.has(m.id)) continue;
    if (m.sender_id !== currentUserId) continue;
    if (m.id.startsWith('__opt_')) continue;
    const t = new Date(m.created_at).getTime();
    if (Number.isFinite(t) && t <= readTime) next.delete(m.id);
  }
  return next;
}

/**
 * 내 말풍선 '1' — 상대 read_at 기준으로 매번 다시 계산.
 * 세션 입장 시각만 쓰면 재입장 때 '1'이 사라지고, 낙관적→실 id 교체 때 다시 붙는다.
 * partnerReadAt === undefined 이면 아직 미조회: 이번 방문에서 보낸 것만 표시 (깜빡임 방지).
 */
export function computeMyUnreadIds(
  messages: readonly Message[],
  currentUserId: string,
  partnerReadAt: string | null | undefined,
  openedAtMs: number,
): Set<string> {
  const next = new Set<string>();
  const known = partnerReadAt !== undefined;
  const readTime = typeof partnerReadAt === 'string' ? new Date(partnerReadAt).getTime() : NaN;
  const visitFloor = openedAtMs - 2_000;
  for (const m of messages) {
    if (m.sender_id !== currentUserId) continue;
    if (m.id.startsWith('__opt_')) {
      next.add(m.id);
      continue;
    }
    const t = new Date(m.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    if (known) {
      if (!partnerReadAt || !Number.isFinite(readTime) || t > readTime) next.add(m.id);
    } else if (t >= visitFloor) {
      next.add(m.id);
    }
  }
  return next;
}

export function applySseInsert(
  prev: Message[],
  newMsg: Message,
  expectedChatId?: string | null,
  allowedChatIds?: Iterable<string> | null,
): Message[] {
  if (expectedChatId) {
    if (!messageBelongsToChat(newMsg, expectedChatId, allowedChatIds)) return prev;
  }
  // 1. Already present by DB id — idempotent. A matching optimistic ghost may
  // still coexist after an HTTP/SSE race, so remove that ghost while keeping
  // the confirmed row.
  if (prev.some((m) => m.id === newMsg.id)) {
    if (!newMsg.client_id) return prev;
    const optimisticId = `__opt_${newMsg.client_id}`;
    const withoutGhost = prev.filter(m => m.id !== optimisticId);
    return withoutGhost.length === prev.length ? prev : sortMessages(withoutGhost);
  }

  // 2. Exact client_id match — replace optimistic placeholder
  if (newMsg.client_id) {
    const optIdx = prev.findIndex((m) => m.id === `__opt_${newMsg.client_id}`);
    if (optIdx !== -1) {
      const next = [...prev];
      next[optIdx] = newMsg;
      return sortMessages(next);
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
    return sortMessages(next);
  }

  // 4. New message from another source — append then sort by created_at
  // SSE 이벤트가 네트워크 지연으로 순서가 뒤바뀌어 도착해도 시간 순서 보장
  return sortMessages([...prev, newMsg]);
}

/** Apply one realtime message to every cache key that can open its room. */
export function applySseToRoomCaches(
  cache: ReadonlyMap<string, Message[]>,
  message: Message,
  roomIds: Iterable<string>,
): Map<string, Message[]> {
  const next = new Map(cache);
  for (const roomId of new Set(roomIds)) {
    if (!roomId) continue;
    next.set(
      roomId,
      applySseInsert(next.get(roomId) ?? [], message, roomId, [message.chat_id]),
    );
  }
  return next;
}

/**
 * Applied when loadMessages returns DB rows for the active chat.
 *
 * `idsAtRequestStart` is the message snapshot captured immediately before the
 * fetch. Confirmed rows that appear in current state but not in that snapshot
 * arrived while the request was in flight (usually via SSE), so a stale fetch
 * must preserve them. Rows already present at request start remain
 * authoritative to the DB result, allowing genuine deletions to disappear.
 */
export function applyLoadMessages(
  prev: Message[],
  data: Message[],
  options?: {
    idsAtRequestStart?: ReadonlySet<string>;
    deletedIds?: ReadonlySet<string>;
  },
): Message[] {
  const deletedIds = options?.deletedIds ?? new Set<string>();
  const idsAtRequestStart = options?.idsAtRequestStart ?? new Set(prev.map(m => m.id));
  const uniqueData = [...new Map(
    data.filter(m => !deletedIds.has(m.id)).map(m => [m.id, m]),
  ).values()];
  const dbIds = new Set(uniqueData.map((m) => m.id));
  const dbClientIds = new Set<string>(
    uniqueData.flatMap((m) => (m.client_id != null ? [m.client_id] : [])),
  );

  // 아직 DB에 반영되지 않은 optimistic 메시지 보존
  const optimistic = prev.filter(
    (m) =>
      m.id.startsWith('__opt_') &&
      !deletedIds.has(m.id) &&
      !dbIds.has(m.id) &&
      !dbClientIds.has(m.id.replace('__opt_', '')),
  );

  // fetch 시작 후 realtime/HTTP 확정으로 추가된 DB 행 보존
  const concurrentConfirmed = prev.filter(m =>
    !m.id.startsWith('__opt_')
    && !idsAtRequestStart.has(m.id)
    && !dbIds.has(m.id)
    && !deletedIds.has(m.id)
    && (!m.client_id || !dbClientIds.has(m.client_id)),
  );

  return sortMessages([...uniqueData, ...concurrentConfirmed, ...optimistic]);
}
