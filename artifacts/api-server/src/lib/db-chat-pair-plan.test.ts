import { describe, expect, it } from 'vitest';
import {
  chatIdsForPair,
  countMessagesForChat,
  groupChatsByPair,
  isChatParticipant,
  messageMergeAction,
  pickCanonicalChatRow,
} from './db-chat-pair-plan.js';
import { chatPairKey } from './db-chat-ids.js';

describe('db-chat-pair-plan', () => {
  const chats = [
    { id: 'c1', user1_id: 'uA', user2_id: 'uB', created_at: '2024-01-02' },
    { id: 'c2', user1_id: 'uB', user2_id: 'uA', created_at: '2024-01-01' },
    { id: 'c3', user1_id: 'uA', user2_id: 'uC', created_at: '2024-01-03' },
    { id: 'self', user1_id: 'uA', user2_id: 'uA', created_at: '2024-01-04' },
    { id: 'bad', user1_id: '', user2_id: 'uB', created_at: '2024-01-05' },
  ];

  const messages = [
    { id: 'm1', chat_id: 'c1' },
    { id: 'm2', chat_id: 'c1' },
    { id: 'm3', chat_id: 'c2' },
  ];

  it('isChatParticipant resolves merge + membership', () => {
    const byId = new Map(chats.map(c => [c.id, c as Record<string, unknown>]));
    const find = (id: string) => byId.get(id);
    expect(isChatParticipant('c1', 'uA', find)).toBe(true);
    expect(isChatParticipant('c1', 'uC', find)).toBe(false);
    expect(isChatParticipant('', 'uA', find)).toBe(false);
    expect(isChatParticipant('old', 'uA', find, (id) => (id === 'old' ? 'c1' : id))).toBe(true);
    expect(isChatParticipant('missing', 'uA', find)).toBe(false);
  });

  it('countMessagesForChat / chatIdsForPair', () => {
    expect(countMessagesForChat('c1', messages)).toBe(2);
    expect(countMessagesForChat('c2', messages)).toBe(1);
    expect(countMessagesForChat('c3', messages)).toBe(0);
    const ids = chatIdsForPair('uA', 'uB', chats);
    expect(ids.sort()).toEqual(['c1', 'c2']);
    expect(chatIdsForPair('uA', 'uC', chats)).toEqual(['c3']);
  });

  it('pickCanonicalChatRow prefers more messages then earlier created_at', () => {
    const pair = chats.filter(c => c.id === 'c1' || c.id === 'c2') as Record<string, unknown>[];
    const counts = (id: string) => countMessagesForChat(id, messages);
    expect(String(pickCanonicalChatRow(pair, counts).id)).toBe('c1');
    const tie = [
      { id: 'a', created_at: '2024-02-01' },
      { id: 'b', created_at: '2024-01-01' },
    ];
    expect(String(pickCanonicalChatRow(tie, () => 0).id)).toBe('b');
  });

  it('groupChatsByPair skips self/incomplete and keys by chatPairKey', () => {
    const groups = groupChatsByPair(chats as Record<string, unknown>[]);
    expect(groups.size).toBe(2);
    const ab = groups.get(chatPairKey('uA', 'uB'))!;
    expect(ab.map(c => String(c.id)).sort()).toEqual(['c1', 'c2']);
    expect(groups.get(chatPairKey('uA', 'uC'))!.map(c => String(c.id))).toEqual(['c3']);
    expect(groups.has(chatPairKey('uA', 'uA'))).toBe(false);
  });

  it('messageMergeAction insert/replace/keep by timestamps', () => {
    expect(messageMergeAction(undefined, { id: 'm', created_at: 't1' })).toBe('insert');
    expect(messageMergeAction(
      { id: 'm', updated_at: '2024-01-01' },
      { id: 'm', updated_at: '2024-01-02' },
    )).toBe('replace');
    expect(messageMergeAction(
      { id: 'm', updated_at: '2024-01-02' },
      { id: 'm', updated_at: '2024-01-02' },
    )).toBe('replace');
    expect(messageMergeAction(
      { id: 'm', updated_at: '2024-01-03' },
      { id: 'm', updated_at: '2024-01-02' },
    )).toBe('keep');
  });
});

import { planCanonicalMessageChatId, pickCanonicalChatRow } from './db-chat-pair-plan.js';
import { chatPairKey } from './db-chat-ids.js';

describe('planCanonicalMessageChatId (70)', () => {
  it('collapses siblings', () => {
    const chats = [
      { id: 'old', user1_id: 'a', user2_id: 'b', created_at: '1' },
      { id: 'new', user1_id: 'a', user2_id: 'b', created_at: '2' },
    ];
    const id = planCanonicalMessageChatId('old', chats, chatPairKey, (g) =>
      pickCanonicalChatRow(g, (cid) => (cid === 'new' ? 5 : 1)),
    );
    expect(id).toBe('new');
    expect(planCanonicalMessageChatId('solo', [{ id: 'solo', user1_id: 'x', user2_id: 'y' }], chatPairKey, pickCanonicalChatRow)).toBe('solo');
  });
});

