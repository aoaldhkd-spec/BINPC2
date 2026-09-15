import { describe, expect, it } from 'vitest';
import {
  ADMIN_ONLY_PRIVATE_TABLES,
  PRIVATE_TABLES,
  planSmartBroadcastLocal,
  stripInternalBroadcastFields,
} from './db-sse-fanout-policy.js';

const sanitize = {
  sanitizeProfile: (r: Record<string, unknown>) => ({ ...r, sanitized: 'profile' }),
  sanitizeSettings: (r: Record<string, unknown>) => ({ ...r, sanitized: 'settings' }),
  collectTargets: (table: string, row: Record<string, unknown>) => {
    if (table === 'likes') return [String(row.liker_id), String(row.liked_id)];
    return [];
  },
};

describe('db-sse-fanout-policy', () => {
  it('marks messages/likes private and anonymous_reports admin-only', () => {
    expect(PRIVATE_TABLES.has('messages')).toBe(true);
    expect(PRIVATE_TABLES.has('profiles')).toBe(false);
    expect(ADMIN_ONLY_PRIVATE_TABLES.has('anonymous_reports')).toBe(true);
  });

  it('strips internal chat participant stamps from messages events', () => {
    const out = stripInternalBroadcastFields('messages', {
      newRow: { id: 'm1', chat_user1_id: 'a', chat_user2_id: 'b', content: 'hi' },
      oldRow: null,
    });
    expect((out.newRow as Record<string, unknown>).chat_user1_id).toBeUndefined();
    expect((out.newRow as Record<string, unknown>).content).toBe('hi');
  });

  it('plans users fanout when targets exist', () => {
    const plan = planSmartBroadcastLocal(
      'likes',
      { id: 'l1', liker_id: 'u1', liked_id: 'u2' },
      { type: 'change', table: 'likes' },
      sanitize,
    );
    expect(plan.kind).toBe('users');
    if (plan.kind === 'users') expect(plan.targets).toEqual(['u1', 'u2']);
  });

  it('sanitizes profiles on public all-broadcast', () => {
    const plan = planSmartBroadcastLocal(
      'profiles',
      { id: 'p1', nickname: 'n' },
      { type: 'change', newRow: { id: 'p1', kakao_id: 'x' }, oldRow: null },
      sanitize,
    );
    expect(plan.kind).toBe('all');
    if (plan.kind === 'all') {
      expect((plan.event.newRow as Record<string, unknown>).sanitized).toBe('profile');
    }
  });

  it('drops private events with no targets', () => {
    const plan = planSmartBroadcastLocal(
      'messages',
      { id: 'm1', chat_id: 'c1' },
      { type: 'change' },
      sanitize,
    );
    expect(plan.kind).toBe('drop');
  });
});
