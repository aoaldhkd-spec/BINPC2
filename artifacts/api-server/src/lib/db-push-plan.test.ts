import { describe, expect, it } from 'vitest';
import {
  planPushForEvent,
  validatePushSubscribeBody,
  pushSubscribeUnauthorizedReject,
  planPushSubscribeStore,
  USER_MAX_PUSH_SUBS,
  validatePushNotifyRequest,
  pushNotifyForbiddenReject,
} from './db-push-plan.js';

describe('db-push-plan', () => {
  const chat = { id: 'c1', user1_id: 'u1', user2_id: 'u2' };
  const profiles: Record<string, Record<string, unknown>> = {
    u1: { id: 'u1', nickname: 'Alice' },
    u2: { id: 'u2', nickname: 'Bob' },
  };
  const findChat = (id: string) => (id === 'c1' ? chat : undefined);
  const findProfile = (id: string) => profiles[id];

  it('sends a 1:1 message only to the peer and deep-links to that chat', () => {
    const plan = planPushForEvent(
      'messages',
      { id: 'm1', chat_id: 'c1', sender_id: 'u1', content: 'x'.repeat(80) },
      'u1', findChat, findProfile,
    );
    expect(plan?.recipientId).toBe('u2');
    expect(plan?.payload.title).toBe('💬 Alice');
    expect(plan?.payload.body.endsWith('…')).toBe(true);
    expect(plan?.payload.url).toBe('/?push=chat&peer=u1&chat=c1');
  });

  it('shows selected heart type even when it came from rainbow', () => {
    expect(planPushForEvent(
      'likes',
      { id: 'l1', liked_id: 'u2', liker_id: 'u1', heart_type: 'blue', like_source: 'rainbow' },
      'u1', findChat, findProfile,
    )).toEqual({
      recipientId: 'u2',
      payload: {
        title: '💙 Alice님',
        body: '💙 하트가 도착했어요',
        tag: 'like-l1',
        url: '/?push=heart&from=u1',
      },
    });
  });

  it('never pushes to self and excludes group/signal/chat-open events', () => {
    expect(planPushForEvent(
      'likes',
      { id: 'l1', liked_id: 'u1', liker_id: 'u1', heart_type: 'red' },
      'u1', findChat, findProfile,
    )).toBeNull();
    expect(planPushForEvent('signal_sends', { action: 'send' }, 'u1', findChat, findProfile)).toBeNull();
    expect(planPushForEvent('chats', chat, 'u1', findChat, findProfile)).toBeNull();
    expect(planPushForEvent('group_messages', { id: 'g1' }, 'u1', findChat, findProfile)).toBeNull();
  });
});

describe('db-push-subscribe', () => {
  it('accepts valid subscription', () => {
    const r = validatePushSubscribeBody({
      userId: 'u1',
      subscription: { endpoint: 'https://example.com/ep', keys: { auth: 'a', p256dh: 'b' } },
    });
    expect(r).toEqual({ ok: true, userId: 'u1', endpoint: 'https://example.com/ep', auth: 'a', p256dh: 'b' });
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
  });

  it('evicts oldest when at max', () => {
    const subs = Array.from({ length: USER_MAX_PUSH_SUBS }, (_, i) => ({
      id: String(i), user_id: 'u', endpoint: `e${i}`, auth: 'a', p256dh: 'p', created_at: `2020-01-0${i + 1}`,
    }));
    const plan = planPushSubscribeStore({
      subs, userId: 'u', endpoint: 'new', auth: 'a', p256dh: 'p', now: 'now', newId: 'n',
    });
    expect(plan.kind).toBe('insert');
    if (plan.kind === 'insert') expect(plan.evictIndex).toBe(0);
  });
});

describe('push notify validate', () => {
  it('validates secret/body', () => {
    expect(validatePushNotifyRequest({ secretOk: false, body: {} }).ok).toBe(false);
    expect(pushNotifyForbiddenReject().status).toBe(403);
  });
});
