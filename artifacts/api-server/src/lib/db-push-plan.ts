/**
 * Web-push recipient + payload planner — extracted from routes/db.ts.
 * Pure given row lookups; sendPush / subscription prune stay in db.ts.
 */

export type PushPlanPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
};

export type PushPlan =
  | { recipientId: string; payload: PushPlanPayload }
  | null;

/**
 * Plan who gets a push and what it says for messages/likes/signal_sends/chats.
 * Nickname fallbacks and Korean body strings match prior db.ts behavior.
 */
export function planPushForEvent(
  table: string,
  row: Record<string, unknown>,
  actorId: string | null | undefined,
  findChat: (chatId: string) => Record<string, unknown> | undefined,
  findProfile: (userId: string) => Record<string, unknown> | undefined,
): PushPlan {
  if (table === 'messages') {
    const chat = findChat(String(row.chat_id));
    if (!chat) return null;
    const recipientId = (
      String(chat.user1_id) === String(row.sender_id) ? chat.user2_id : chat.user1_id
    ) as string;
    const sender = findProfile(String(row.sender_id));
    const nick = (sender?.nickname as string) ?? '누군가';
    let body = (row.content as string) ?? '';
    if (row.image_url) body = '[이미지]';
    else if (body.startsWith('__sticker__')) body = '[스티커]';
    else if (body.length > 60) body = body.slice(0, 60) + '…';
    return {
      recipientId,
      payload: { title: `💬 ${nick}`, body, tag: `chat-${chat.id as string}`, url: '/' },
    };
  }
  if (table === 'likes') {
    const recipientId = row.liked_id as string;
    const sender = findProfile(String(row.liker_id));
    const nick = (sender?.nickname as string) ?? '누군가';
    const heartEmoji =
      row.heart_type === 'red' ? '❤️' :
      row.heart_type === 'blue' ? '💙' :
      row.heart_type === 'pink' ? '💗' : '💚';
    return {
      recipientId,
      payload: {
        title: `${heartEmoji} ${nick}님`,
        body: '하트를 보냈어요!',
        tag: `like-${row.liker_id as string}`,
        url: '/',
      },
    };
  }
  if (table === 'signal_sends' && row.action === 'send') {
    const recipientId = row.receiver_id as string;
    const sender = findProfile(String(row.sender_id));
    const nick = (sender?.nickname as string) ?? '누군가';
    return {
      recipientId,
      payload: {
        title: `📡 ${nick}님`,
        body: '시그널을 보냈어요!',
        tag: `signal-${row.sender_id as string}`,
        url: '/',
      },
    };
  }
  if (table === 'chats' && actorId) {
    const u1 = String(row.user1_id ?? '');
    const u2 = String(row.user2_id ?? '');
    const recipientId = u1 === String(actorId) ? u2 : u1;
    if (!recipientId || recipientId === String(actorId)) return null;
    const opener = findProfile(String(actorId));
    const nick = (opener?.nickname as string) ?? '누군가';
    return {
      recipientId,
      payload: {
        title: `💬 ${nick}님`,
        body: '채팅방을 열었어요',
        tag: `chat-open-${String(row.id ?? '')}`,
        url: '/',
      },
    };
  }
  return null;
}
