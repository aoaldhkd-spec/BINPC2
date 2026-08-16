import { describe, it, expect } from 'vitest';
import { chatPairKey, dedupeChatList, pickCanonicalChat } from './chat-pair';

describe('chatPairKey', () => {
  it('sorts user ids so A-B and B-A are the same pair', () => {
    expect(chatPairKey('aaa', 'bbb')).toBe(chatPairKey('bbb', 'aaa'));
  });
});

describe('dedupeChatList', () => {
  it('keeps one room per pair and prefers the one with more messages', () => {
    const chats = [
      { id: 'old-empty', user1_id: 'u1', user2_id: 'u2', created_at: '2026-08-01T00:00:00.000Z' },
      { id: 'canonical', user1_id: 'u2', user2_id: 'u1', created_at: '2026-08-02T00:00:00.000Z' },
      { id: 'other', user1_id: 'u1', user2_id: 'u3', created_at: '2026-08-03T00:00:00.000Z' },
    ];
    const counts = new Map([['old-empty', 0], ['canonical', 4], ['other', 1]]);
    const out = dedupeChatList(chats, counts);
    expect(out).toHaveLength(2);
    expect(out.find(c => chatPairKey(c.user1_id, c.user2_id) === chatPairKey('u1', 'u2'))?.id).toBe('canonical');
    expect(out.some(c => c.id === 'old-empty')).toBe(false);
  });

  it('pickCanonicalChat prefers more messages, then earlier created_at', () => {
    const a = { id: 'a', user1_id: 'u1', user2_id: 'u2', created_at: '2026-08-01T00:00:00.000Z' };
    const b = { id: 'b', user1_id: 'u1', user2_id: 'u2', created_at: '2026-08-02T00:00:00.000Z' };
    expect(pickCanonicalChat([a, b], new Map([['a', 2], ['b', 2]]))?.id).toBe('a');
    expect(pickCanonicalChat([a, b], new Map([['a', 1], ['b', 3]]))?.id).toBe('b');
  });
});
