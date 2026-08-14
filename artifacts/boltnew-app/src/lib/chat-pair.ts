/** 1:1 채팅 user 쌍 정규화 키 */
export function chatPairKey(u1: string, u2: string): string {
  const [a, b] = [String(u1), String(u2)].sort();
  return `${a}:${b}`;
}

export type ChatRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at?: string;
  lastMessage?: string;
};

/** 메시지 많은 방 우선, 동률이면 먼저 만든 방 */
export function pickCanonicalChat<T extends ChatRow>(
  chats: T[],
  messageCountByChatId?: ReadonlyMap<string, number>,
): T | null {
  if (!chats.length) return null;
  if (chats.length === 1) return chats[0];
  return [...chats].sort((a, b) => {
    const ma = messageCountByChatId?.get(a.id) ?? 0;
    const mb = messageCountByChatId?.get(b.id) ?? 0;
    if (mb !== ma) return mb - ma;
    return String(a.created_at ?? a.id).localeCompare(String(b.created_at ?? b.id));
  })[0];
}

/** 동일 상대와 중복 채팅방 목록 → 1개만 유지 */
export function dedupeChatList<T extends ChatRow>(
  chats: T[],
  messageCountByChatId?: ReadonlyMap<string, number>,
): T[] {
  const groups = new Map<string, T[]>();
  for (const c of chats) {
    const key = chatPairKey(c.user1_id, c.user2_id);
    const g = groups.get(key);
    if (g) g.push(c);
    else groups.set(key, [c]);
  }
  const out: T[] = [];
  for (const group of groups.values()) {
    const best = pickCanonicalChat(group, messageCountByChatId);
    if (best) out.push(best);
  }
  return out.sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
  );
}
