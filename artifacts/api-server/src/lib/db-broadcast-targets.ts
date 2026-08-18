/**
 * SSE 프라이빗 이벤트 타겟 수집 — store/SSE 클라이언트와 독립.
 * db.ts 가 findChat / groupParticipants 조회를 주입한다.
 */

export function collectBroadcastTargets(
  table: string,
  row: Record<string, unknown> | null,
  findChat: (chatId: string) => Record<string, unknown> | undefined = () => undefined,
  groupParticipantsFor: (groupId: unknown) => Record<string, unknown>[] = () => [],
): string[] {
  if (!row) return [];
  const targets: string[] = [];
  const push = (v: unknown) => {
    if (v != null && v !== '') targets.push(String(v));
  };

  if (table === 'messages') {
    const chat = findChat(String(row['chat_id'] ?? ''));
    if (chat) {
      push(chat['user1_id']);
      push(chat['user2_id']);
    }
    // 채팅방이 아직 메모리에 없어도 메시지에 스탬프된 참가자로 전달
    push(row['chat_user1_id']);
    push(row['chat_user2_id']);
  } else if (table === 'likes') {
    push(row['liker_id']);
    push(row['liked_id']);
  } else if (table === 'signal_sends') {
    push(row['sender_id']);
    if (row['action'] === 'send') push(row['receiver_id']);
  } else if (table === 'chats') {
    push(row['user1_id']);
    push(row['user2_id']);
  } else if (table === 'contact_shares') {
    // 실제 스키마: liker_id / liked_id (구 필드명도 호환)
    push(row['liker_id']);
    push(row['liked_id']);
    push(row['sharer_id']);
    push(row['receiver_id']);
  } else if (table === 'contact_share_events') {
    push(row['from_user_id']);
    push(row['to_user_id']);
    push(row['sender_id']);
    push(row['recipient_id']);
  } else if (table === 'group_messages') {
    const gParts = groupParticipantsFor(row['group_id']);
    for (const gp of gParts) push(gp.user_id);
  } else if (table === 'group_participants') {
    push(row['user_id']);
    const gParts = groupParticipantsFor(row['group_id']);
    for (const gp of gParts) push(gp.user_id);
  } else if (table === 'chat_reads') {
    push(row['user_id']);
    push(row['reader_id']);
    if (row['chat_id'] && row['reader_id']) {
      const chat = findChat(String(row['chat_id']));
      if (chat) {
        const otherId = chat['user1_id'] === row['reader_id'] ? chat['user2_id'] : chat['user1_id'];
        push(otherId);
      }
    }
  } else if (table === 'blocked_users') {
    push(row['user_id']);
    push(row['target_id']);
  } else if (table === 'profile_views') {
    push(row['viewed_id']);
  }

  return [...new Set(targets)];
}
