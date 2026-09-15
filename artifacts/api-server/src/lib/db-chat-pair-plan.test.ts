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


import {
  planChatDedupeMergeSteps,
  planChatReadsForDedupe,
  messagesToRemapOnDedupe,
  applyIncomingMessageRows,
  pickCanonicalChatRow,
} from './db-chat-pair-plan.js';

describe('chat dedupe / message-merge planners (71)', () => {
  it('planChatDedupeMergeSteps picks canonical by message count', () => {
    const chats = [
      { id: 'a', user1_id: 'u1', user2_id: 'u2', created_at: '1' },
      { id: 'b', user1_id: 'u1', user2_id: 'u2', created_at: '2' },
    ];
    const steps = planChatDedupeMergeSteps(chats, (id) => (id === 'b' ? 3 : 0));
    expect(steps).toEqual([{ canonicalId: 'b', dupId: 'a' }]);
  });

  it('planChatReadsForDedupe absorb vs remap', () => {
    const reads = [
      { id: 'r1', chat_id: 'dup', reader_id: 'u1', read_at: '2024-02-01' },
      { id: 'r2', chat_id: 'canon', reader_id: 'u1', read_at: '2024-01-01' },
      { id: 'r3', chat_id: 'dup', reader_id: 'u2', read_at: 't' },
    ];
    const actions = planChatReadsForDedupe(reads, 'dup', 'canon');
    expect(actions).toContainEqual({
      kind: 'absorb', deleteId: 'r1', readerId: 'u1', bumpReadAt: '2024-02-01',
    });
    expect(actions).toContainEqual({
      kind: 'remap', rowId: 'r3', readerId: 'u2', newChatId: 'canon', newId: 'canon__u2',
    });
  });

  it('messagesToRemapOnDedupe + applyIncomingMessageRows', () => {
    const msgs = [
      { id: 'm1', chat_id: 'dup' },
      { id: 'm2', chat_id: 'other' },
    ];
    expect(messagesToRemapOnDedupe(msgs, 'dup').map(m => m.id)).toEqual(['m1']);
    const mem: Record<string, unknown>[] = [{ id: 'm1', chat_id: 'x', updated_at: '1' }];
    applyIncomingMessageRows(mem, [
      { id: 'm1', chat_id: 'x', updated_at: '2' },
      { id: 'm3', chat_id: 'y', created_at: '1' },
    ]);
    expect(mem.find(m => m.id === 'm1')!.updated_at).toBe('2');
    expect(mem.some(m => m.id === 'm3')).toBe(true);
    expect(pickCanonicalChatRow(
      [{ id: 'a', created_at: '2' }, { id: 'b', created_at: '1' }],
      () => 0,
    ).id).toBe('b');
  });
});
