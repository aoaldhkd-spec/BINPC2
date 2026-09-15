import { describe, expect, it } from 'vitest';
import {
  planPushForEvent,
  validatePushSubscribeBody,
  pushSubscribeUnauthorizedReject,
  planPushSubscribeStore,
  USER_MAX_PUSH_SUBS,
} from './db-push-plan.js';

describe('db-push-plan', () => {
  const chat = { id: 'c1', user1_id: 'u1', user2_id: 'u2' };
  const profiles: Record<string, Record<string, unknown>> = {
    u1: { id: 'u1', nickname: 'Alice' },
    u2: { id: 'u2', nickname: 'Bob' },
  };
  const findChat = (id: string) => (id === 'c1' ? chat : undefined);
  const findProfile = (id: string) => profiles[id];

  it('plans message push to peer with truncated body', () => {
    const plan = planPushForEvent(
      'messages',
      { chat_id: 'c1', sender_id: 'u1', content: 'x'.repeat(80) },
      null,
      findChat,
      findProfile,
    );
    expect(plan?.recipientId).toBe('u2');
    expect(plan?.payload.title).toBe('💬 Alice');
    expect(plan?.payload.body.endsWith('…')).toBe(true);
    expect(plan?.payload.body.length).toBe(61);
  });

  it('uses sticker/image body markers', () => {
    expect(
      planPushForEvent('messages', { chat_id: 'c1', sender_id: 'u1', image_url: 'x' }, null, findChat, findProfile)
        ?.payload.body,
    ).toBe('[이미지]');
    expect(
      planPushForEvent(
        'messages',
        { chat_id: 'c1', sender_id: 'u1', content: '__sticker__foo' },
        null,
        findChat,
        findProfile,
      )?.payload.body,
    ).toBe('[스티커]');
  });

  it('plans likes / signal / chat-open with Korean copy', () => {
    expect(
      planPushForEvent('likes', { liked_id: 'u2', liker_id: 'u1', heart_type: 'red' }, null, findChat, findProfile),
    ).toEqual({
      recipientId: 'u2',
      payload: { title: '❤️ Alice님', body: '하트를 보냈어요!', tag: 'like-u1', url: '/' },
    });
    expect(
      planPushForEvent(
        'signal_sends',
        { action: 'send', receiver_id: 'u2', sender_id: 'u1' },
        null,
        findChat,
        findProfile,
      )?.payload.body,
    ).toBe('시그널을 보냈어요!');
    expect(
      planPushForEvent('chats', { id: 'c1', user1_id: 'u1', user2_id: 'u2' }, 'u1', findChat, findProfile),
    ).toEqual({
      recipientId: 'u2',
      payload: { title: '💬 Alice님', body: '채팅방을 열었어요', tag: 'chat-open-c1', url: '/' },
    });
  });

  it('returns null when chat missing or chat actor is self', () => {
    expect(
      planPushForEvent('messages', { chat_id: 'missing', sender_id: 'u1' }, null, findChat, findProfile),
    ).toBeNull();
    expect(
      planPushForEvent('chats', { id: 'c1', user1_id: 'u1', user2_id: 'u1' }, 'u1', findChat, findProfile),
    ).toBeNull();
  });
});

describe('db-push-subscribe (via push-plan)', () => {
  it('accepts valid subscription', () => {
    const r = validatePushSubscribeBody({
      userId: 'u1',
      subscription: {
        endpoint: 'https://example.com/ep',
        keys: { auth: 'a', p256dh: 'b' },
      },
    });
    expect(r).toEqual({
      ok: true,
      userId: 'u1',
      endpoint: 'https://example.com/ep',
      auth: 'a',
      p256dh: 'b',
    });
  });

  it('rejects bad shapes', () => {
    expect(validatePushSubscribeBody(null).ok).toBe(false);
    expect(validatePushSubscribeBody({ userId: 'u' }).ok).toBe(false);
    expect(pushSubscribeUnauthorizedReject().status).toBe(401);
  });
});

describe('planPushSubscribeStore', () => {
  it('updates existing endpoint', () => {
    const subs = [{ id: '1', user_id: 'u', endpoint: 'e', auth: 'a', p256dh: 'p', created_at: '2020' }];
    const plan = planPushSubscribeStore({
      subs, userId: 'u', endpoint: 'e', auth: 'a2', p256dh: 'p2', now: 'now', newId: 'x',
    });
    expect(plan.kind).toBe('update');
    if (plan.kind === 'update') expect(plan.row.auth).toBe('a2');
  });

  it('evicts oldest when at max', () => {
    const subs = Array.from({ length: USER_MAX_PUSH_SUBS }, (_, i) => ({
      id: String(i), user_id: 'u', endpoint: `e${i}`, auth: 'a', p256dh: 'p',
      created_at: `2020-01-0${i + 1}`,
    }));
    const plan = planPushSubscribeStore({
      subs, userId: 'u', endpoint: 'new', auth: 'a', p256dh: 'p', now: 'now', newId: 'n',
    });
    expect(plan.kind).toBe('insert');
    if (plan.kind === 'insert') expect(plan.evictIndex).toBe(0);
  });
});
