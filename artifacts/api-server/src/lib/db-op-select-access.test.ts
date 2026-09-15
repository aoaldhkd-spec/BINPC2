import { describe, expect, it } from 'vitest';
import type { FilterSpec } from './db-op-filters.js';
import {
  applyChatReadsSiblingScope,
  chatReadsSiblingIdsForEqFilter,
  collectMyGroupIds,
  expandMessagesChatIdInVals,
  findChatIdEqFilter,
  findChatIdInFilter,
  findIllegalMessagesInChatId,
  isChatRowParticipant,
  mapMessagesOntoCanonicalChatId,
  messagesSelectMissingChatIdFilterReject,
  messagesSelectNonParticipantReject,
  remapGroupIdFilters,
  scopeChatReadsForRequester,
  scopeGroupMessageRows,
  scopeGroupParticipantRows,
  selectAuthRequiredReject,
} from './db-op-select-access.js';

describe('db-op-select-access', () => {
  it('findChatId filters + missing/non-participant rejects', () => {
    const filters: FilterSpec[] = [
      { type: 'eq', col: 'chat_id', val: 'c1' },
      { type: 'in', col: 'chat_id', vals: ['a', 'b'] },
    ];
    expect(findChatIdEqFilter(filters)?.val).toBe('c1');
    expect(findChatIdInFilter(filters)?.vals).toEqual(['a', 'b']);
    expect(messagesSelectMissingChatIdFilterReject().body.error.code).toBe('FORBIDDEN');
    expect(messagesSelectNonParticipantReject().body.error.message).toContain('participant');
    expect(selectAuthRequiredReject('x').status).toBe(403);
  });

  it('isChatRowParticipant + mapMessagesOntoCanonicalChatId', () => {
    const chat = { id: 'c1', user1_id: 'a', user2_id: 'b' };
    expect(isChatRowParticipant(chat, 'a')).toBe(true);
    expect(isChatRowParticipant(chat, 'c')).toBe(false);
    const msgs = [
      { id: 'm1', chat_id: 'c1', body: 'x' },
      { id: 'm2', chat_id: 'c2', body: 'y' },
      { id: 'm3', chat_id: 'other', body: 'z' },
    ];
    const mapped = mapMessagesOntoCanonicalChatId(msgs, 'c1', ['c1', 'c2']);
    expect(mapped).toHaveLength(2);
    expect(mapped.find(m => m.id === 'm2')?.chat_id).toBe('c1');
  });

  it('findIllegalMessagesInChatId + expandMessagesChatIdInVals', () => {
    const chats = [
      { id: 'c1', user1_id: 'me', user2_id: 'a' },
      { id: 'c2', user1_id: 'x', user2_id: 'y' },
    ];
    expect(findIllegalMessagesInChatId(chats, ['c1', 'c2'], 'me')).toBe('c2');
    expect(findIllegalMessagesInChatId(chats, ['c1', 'missing'], 'me')).toBeUndefined();
    const expanded = expandMessagesChatIdInVals(chats, ['c1'], (u1, u2) =>
      u1 === 'me' && u2 === 'a' ? ['c1', 'c1b'] : [],
    );
    expect(expanded.sort()).toEqual(['c1', 'c1b']);
  });

  it('scopeChatReadsForRequester + sibling scope', () => {
    const chats = [
      { id: 'c1', user1_id: 'me', user2_id: 'peer' },
      { id: 'c2', user1_id: 'x', user2_id: 'y' },
    ];
    const findChat = (raw: string, resolved: string) =>
      chats.find(c => String(c.id) === resolved || String(c.id) === raw);
    const rows = [
      { id: 'r1', reader_id: 'me', chat_id: 'c1' },
      { id: 'r2', reader_id: 'peer', chat_id: 'c1' },
      { id: 'r3', reader_id: 'x', chat_id: 'c2' },
    ];
    const scoped = scopeChatReadsForRequester(rows, 'me', findChat, id => id);
    expect(scoped.map(r => r.id).sort()).toEqual(['r1', 'r2']);

    const filters: FilterSpec[] = [{ type: 'eq', col: 'chat_id', val: 'c1' }];
    const { chatIdEq, siblingIds } = chatReadsSiblingIdsForEqFilter(
      filters,
      id => id,
      ids => chats.find(c => ids.has(String(c.id))),
      () => ['c1', 'c1b'],
    );
    expect(chatIdEq?.val).toBe('c1');
    expect(siblingIds.has('c1b')).toBe(true);
    const applied = applyChatReadsSiblingScope(
      [
        { chat_id: 'c1' },
        { chat_id: 'c1b' },
        { chat_id: 'other' },
      ],
      filters,
      chatIdEq,
      siblingIds,
    );
    expect(applied.rows).toHaveLength(2);
    expect(applied.filters).toEqual([]);
  });

  it('group id collect / scope / remap', () => {
    const parts = [
      { user_id: 'me', group_id: 'g1' },
      { user_id: 'me', group_id: 'g-old' },
      { user_id: 'other', group_id: 'g2' },
    ];
    const ids = collectMyGroupIds(parts, 'me', id => (id === 'g-old' ? 'g1' : id));
    expect(ids.has('g1')).toBe(true);
    expect(ids.has('g-old')).toBe(true);
    expect(ids.has('g2')).toBe(false);

    expect(
      scopeGroupParticipantRows(
        [{ group_id: 'g1' }, { group_id: 'g2' }],
        ids,
      ),
    ).toHaveLength(1);

    expect(
      scopeGroupMessageRows(
        [{ group_id: 'g-old' }, { group_id: 'g2' }],
        ids,
        id => (id === 'g-old' ? 'g1' : id),
      ),
    ).toHaveLength(1);

    const remapped = remapGroupIdFilters(
      [
        { type: 'eq', col: 'group_id', val: 'g-old' },
        { type: 'in', col: 'group_id', vals: ['g-old', 'g1'] },
        { type: 'eq', col: 'other', val: 'x' },
      ],
      id => (id === 'g-old' ? 'g1' : id),
    );
    expect(remapped[0]).toEqual({ type: 'eq', col: 'group_id', val: 'g1' });
    expect((remapped[1] as Extract<FilterSpec, { type: 'in' }>).vals.sort()).toEqual([
      'g1',
    ]);
    expect(remapped[2]).toEqual({ type: 'eq', col: 'other', val: 'x' });
  });
});
