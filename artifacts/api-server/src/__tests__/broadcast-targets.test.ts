/**
 * SSE 프라이빗 이벤트 타겟 수집 — 연락처/메시지 유실 재발 방지
 */
import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SESSION_SECRET = 'test-sse-secret-for-unit-tests';
});

vi.mock('pg', () => {
  class MockPool {
    connect = () => Promise.resolve({ query: () => Promise.resolve({ rows: [] }), release: () => {}, on: () => {} });
    query = () => Promise.resolve({ rows: [{ h: 1 }] });
    on = () => {};
    end = () => Promise.resolve();
  }
  class MockClient {
    connect = () => Promise.resolve();
    query = () => Promise.resolve({ rows: [] });
    on = () => {};
    end = () => Promise.resolve();
  }
  return { default: { Pool: MockPool, Client: MockClient } };
});

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
}));

import { collectBroadcastTargets } from '../routes/db.js';

describe('collectBroadcastTargets', () => {
  it('contact_shares uses liker_id/liked_id (not legacy sharer_id)', () => {
    const targets = collectBroadcastTargets('contact_shares', {
      id: '1',
      liker_id: 'user-a',
      liked_id: 'user-b',
    }, () => undefined);
    expect(targets.sort()).toEqual(['user-a', 'user-b']);
  });

  it('contact_share_events uses from_user_id/to_user_id', () => {
    const targets = collectBroadcastTargets('contact_share_events', {
      id: '1',
      from_user_id: 'from',
      to_user_id: 'to',
      event_type: 'accepted',
    }, () => undefined);
    expect(targets.sort()).toEqual(['from', 'to']);
  });

  it('messages fall back to stamped chat_user*_id when chat missing', () => {
    const targets = collectBroadcastTargets('messages', {
      id: 'm1',
      chat_id: 'missing-chat',
      sender_id: 'user-a',
      chat_user1_id: 'user-a',
      chat_user2_id: 'user-b',
    }, () => undefined);
    expect(targets.sort()).toEqual(['user-a', 'user-b']);
  });

  it('messages use chat participants when chat exists', () => {
    const targets = collectBroadcastTargets(
      'messages',
      { id: 'm1', chat_id: 'c1', sender_id: 'user-a' },
      () => ({ id: 'c1', user1_id: 'user-a', user2_id: 'user-b' }),
    );
    expect(targets.sort()).toEqual(['user-a', 'user-b']);
  });

  it('profile_views targets the viewed person so their 방문자 list updates', () => {
    const targets = collectBroadcastTargets('profile_views', {
      id: 'v1',
      viewer_id: 'visitor',
      viewed_id: 'host',
    }, () => undefined);
    expect(targets).toEqual(['host']);
  });

  it('likes targets both parties', () => {
    const targets = collectBroadcastTargets('likes', {
      liker_id: 'L',
      liked_id: 'D',
      heart_type: 'red',
    }, () => undefined);
    expect(targets.sort()).toEqual(['D', 'L']);
  });

  it('chat_reads targets the other participant in the same chat', () => {
    const targets = collectBroadcastTargets(
      'chat_reads',
      { id: 'r1', chat_id: 'c1', reader_id: 'user-b', read_at: '2026-08-16T00:00:00.000Z' },
      () => ({ id: 'c1', user1_id: 'user-a', user2_id: 'user-b' }),
    );
    expect(targets.sort()).toEqual(['user-a', 'user-b']);
  });
});
