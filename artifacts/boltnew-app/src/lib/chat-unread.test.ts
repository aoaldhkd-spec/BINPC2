import { describe, expect, it } from 'vitest';
import {
  buildChatIdAliasMap,
  incrementUnreadForIncoming,
  isIncomingChatToastTarget,
  remapUnreadToCanonical,
  unreadForChat,
} from './chat-unread';

const pair = [
  { id: 'old-sibling', user1_id: 'A', user2_id: 'B', created_at: '2026-08-01T00:00:00.000Z' },
  { id: 'canonical', user1_id: 'B', user2_id: 'A', created_at: '2026-08-02T00:00:00.000Z' },
];

describe('A↔B unread counts vs sibling chat_id', () => {
  it('maps both A-B and B-A rooms onto one canonical id', () => {
    const alias = buildChatIdAliasMap(pair);
    expect(alias.get('old-sibling')).toBe(alias.get('canonical'));
    expect(unreadForChat({ 'old-sibling': 3 }, 'canonical', alias)).toBe(3);
    expect(unreadForChat({ canonical: 2, 'old-sibling': 1 }, 'old-sibling', alias)).toBe(3);
  });

  it('SSE increment on sibling id shows on the list row', () => {
    const alias = buildChatIdAliasMap(pair);
    const next = incrementUnreadForIncoming({}, 'old-sibling', alias);
    expect(unreadForChat(next, 'canonical', alias)).toBe(1);
    expect(unreadForChat(next, 'old-sibling', alias)).toBe(1);
    expect(Object.keys(next)).toHaveLength(1);
  });

  it('remaps mixed keys so tab badge is the real total', () => {
    const alias = buildChatIdAliasMap(pair);
    const remapped = remapUnreadToCanonical({ 'old-sibling': 2, canonical: 1, other: 4 }, alias);
    expect(unreadForChat(remapped, 'canonical', alias)).toBe(3);
    expect(remapped.other).toBe(4);
    expect(Object.values(remapped).reduce((a, b) => a + b, 0)).toBe(7);
  });
});

describe('incoming chat toast is recipient-only', () => {
  it('toasts B when A sends and B is not in the room', () => {
    expect(isIncomingChatToastTarget('B', 'A', false)).toBe(true);
    expect(isIncomingChatToastTarget('A', 'A', false)).toBe(false);
    expect(isIncomingChatToastTarget('B', 'A', true)).toBe(false);
    expect(isIncomingChatToastTarget(null, 'A', false)).toBe(false);
  });
});
