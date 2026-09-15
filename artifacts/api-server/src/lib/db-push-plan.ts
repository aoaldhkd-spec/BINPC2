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

export type PushSubscribeReject = {
  status: number;
  body: { error: string };
};

export type PushSubscribeOk = {
  ok: true;
  userId: string;
  endpoint: string;
  auth: string;
  p256dh: string;
};

export type PushSubscribeResult = PushSubscribeOk | { ok: false; reject: PushSubscribeReject };

export function validatePushSubscribeBody(body: unknown): PushSubscribeResult {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reject: { status: 400, body: { error: 'Invalid request body' } } };
  }
  const rawBody = body as Record<string, unknown>;
  const userId = typeof rawBody.userId === 'string' ? rawBody.userId : null;
  const sub = rawBody.subscription;
  const endpoint = sub != null && typeof (sub as Record<string, unknown>).endpoint === 'string'
    ? (sub as Record<string, unknown>).endpoint as string : null;
  const keys = sub != null ? (sub as Record<string, unknown>).keys : null;
  const auth = keys != null && typeof (keys as Record<string, unknown>).auth === 'string'
    ? (keys as Record<string, unknown>).auth as string : null;
  const p256dh = keys != null && typeof (keys as Record<string, unknown>).p256dh === 'string'
    ? (keys as Record<string, unknown>).p256dh as string : null;

  if (!userId || userId.length > 128) {
    return { ok: false, reject: { status: 400, body: { error: 'Missing or invalid userId' } } };
  }
  if (!endpoint || endpoint.length > 2048) {
    return { ok: false, reject: { status: 400, body: { error: 'Missing or invalid endpoint' } } };
  }
  if (!auth || auth.length > 512) {
    return { ok: false, reject: { status: 400, body: { error: 'Missing or invalid auth key' } } };
  }
  if (!p256dh || p256dh.length > 512) {
    return { ok: false, reject: { status: 400, body: { error: 'Missing or invalid p256dh key' } } };
  }
  return { ok: true, userId, endpoint, auth, p256dh };
}

export function pushSubscribeUnauthorizedReject(): PushSubscribeReject {
  return { status: 401, body: { error: 'Unauthorized: invalid SSE token' } };
}


export const USER_MAX_PUSH_SUBS = 5;

export type PushSubscribeStorePlan =
  | { kind: 'update'; index: number; row: Record<string, unknown> }
  | { kind: 'insert'; row: Record<string, unknown>; evictIndex: number | null };

/**
 * Plan push_subscriptions memory mutation for /push/subscribe.
 * Evicts oldest user sub when at USER_MAX_PUSH_SUBS (sliding window).
 */
export function planPushSubscribeStore(input: {
  subs: Record<string, unknown>[];
  userId: string;
  endpoint: string;
  auth: string;
  p256dh: string;
  now: string;
  newId: string;
  maxSubs?: number;
}): PushSubscribeStorePlan {
  const max = input.maxSubs ?? USER_MAX_PUSH_SUBS;
  const idx = input.subs.findIndex(
    s => s.user_id === input.userId && s.endpoint === input.endpoint,
  );
  if (idx >= 0) {
    return {
      kind: 'update',
      index: idx,
      row: {
        ...input.subs[idx],
        auth: input.auth,
        p256dh: input.p256dh,
        updated_at: input.now,
      },
    };
  }
  type SubWithIdx = Record<string, unknown> & { _idx: number };
  const userSubs = (input.subs as Array<Record<string, unknown>>)
    .map((s, i) => ({ ...s, _idx: i } as SubWithIdx))
    .filter(s => s['user_id'] === input.userId)
    .sort((a, b) => String(a['created_at']).localeCompare(String(b['created_at'])));
  let evictIndex: number | null = null;
  if (userSubs.length >= max) {
    const oldestIdx = input.subs.findIndex(s => s['id'] === userSubs[0]['id']);
    if (oldestIdx >= 0) evictIndex = oldestIdx;
  }
  return {
    kind: 'insert',
    evictIndex,
    row: {
      id: input.newId,
      user_id: input.userId,
      endpoint: input.endpoint,
      auth: input.auth,
      p256dh: input.p256dh,
      created_at: input.now,
    },
  };
}

