/**
 * 1:1 미읽음 숫자 — (1) 읽음 표시와 별개.
 * sibling chat_id 로 온 SSE 카운트를 목록의 canonical id 로 모아
 * 탭/리스트 배지가 사라지지 않게 한다.
 */
import { chatPairKey, pickCanonicalChat, type ChatRow } from './chat-pair';

export function buildChatIdAliasMap(chats: readonly ChatRow[]): Map<string, string> {
  const groups = new Map<string, ChatRow[]>();
  for (const c of chats) {
    const key = chatPairKey(c.user1_id, c.user2_id);
    const g = groups.get(key);
    if (g) g.push(c);
    else groups.set(key, [c]);
  }
  const alias = new Map<string, string>();
  for (const group of groups.values()) {
    const canonical = pickCanonicalChat(group);
    if (!canonical) continue;
    for (const row of group) alias.set(row.id, canonical.id);
  }
  return alias;
}

export function canonicalChatId(
  chatId: string,
  alias: ReadonlyMap<string, string> | undefined | null,
): string {
  return alias?.get(chatId) ?? chatId;
}

export function remapUnreadToCanonical(
  counts: Record<string, number> | undefined | null,
  alias: ReadonlyMap<string, string> | undefined | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!counts) return out;
  for (const [id, raw] of Object.entries(counts)) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    const key = canonicalChatId(id, alias);
    out[key] = (out[key] ?? 0) + Math.floor(n);
  }
  return out;
}

export function unreadForChat(
  counts: Record<string, number> | undefined | null,
  chatId: string,
  alias?: ReadonlyMap<string, string> | null,
): number {
  if (!counts) return 0;
  const key = canonicalChatId(chatId, alias);
  let n = 0;
  for (const [id, raw] of Object.entries(counts)) {
    if (canonicalChatId(id, alias) !== key) continue;
    const x = Number(raw);
    if (Number.isFinite(x) && x > 0) n += Math.floor(x);
  }
  return n;
}

export function incrementUnreadForIncoming(
  counts: Record<string, number>,
  incomingChatId: string,
  alias?: ReadonlyMap<string, string> | null,
): Record<string, number> {
  const key = canonicalChatId(incomingChatId, alias);
  return { ...counts, [key]: (counts[key] ?? 0) + 1 };
}

/** 열린 방(sibling 별칭 포함)의 미읽음 키를 전부 지운다. */
export function clearUnreadForChat(
  counts: Record<string, number> | undefined | null,
  chatId: string,
  alias?: ReadonlyMap<string, string> | null,
): Record<string, number> {
  const next: Record<string, number> = { ...(counts ?? {}) };
  const key = canonicalChatId(chatId, alias);
  for (const id of Object.keys(next)) {
    if (id === chatId || id === key || canonicalChatId(id, alias) === key) delete next[id];
  }
  return next;
}

/** 1:1 메시지 토스트는 수신자만. 보낸 사람·열린 방·제3자는 없음. */
export function isIncomingChatToastTarget(
  currentUserId: string | null | undefined,
  senderId: string | null | undefined,
  isActiveRoom: boolean,
): boolean {
  if (!currentUserId || !senderId) return false;
  if (String(senderId) === String(currentUserId)) return false;
  if (isActiveRoom) return false;
  return true;
}
