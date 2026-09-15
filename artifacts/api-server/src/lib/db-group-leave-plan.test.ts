import { describe, expect, it } from 'vitest';
import {
  countUserGroupSlots,
  groupIdsInSameLeaveSlot,
  hasGroupOptOut,
  participantRowsToLeave,
} from './db-group-leave-plan.js';

describe('db-group-leave-plan', () => {
  it('hasGroupOptOut matches user_id + opt_key', () => {
    const rows = [
      { user_id: 'u1', opt_key: 'afterparty_club' },
      { user_id: 'u2', opt_key: 'afterparty_club' },
      { user_id: 'u1', opt_key: 'age_decade:20대' },
    ];
    expect(hasGroupOptOut(rows, 'u1', 'afterparty_club')).toBe(true);
    expect(hasGroupOptOut(rows, 'u1', 'afterparty_drink')).toBe(false);
    expect(hasGroupOptOut(rows, 'u2', 'age_decade:20대')).toBe(false);
  });

  it('groupIdsInSameLeaveSlot includes self, merged, and afterparty peers', () => {
    const chats = [
      { id: 'club-a', name: '2차 클럽 갈 분', room_kind: 'afterparty_club', interest_tag: '2차클럽' },
      { id: 'club-b', name: '2차 클럽 모임', room_kind: 'afterparty_club', interest_tag: '2차클럽' },
      { id: 'drink', name: '2차 술 갈 분', room_kind: 'afterparty_drink', interest_tag: '2차술' },
      { id: 'age20', name: '20대 모임' },
      { id: 'age20b', name: '20대 모임' },
      { id: 'year95', name: '1995년생 모임' },
      { id: 'year95b', name: '1995년생 모임' },
      { id: 'other', name: '기타' },
    ];
    const resolve = (id: string) => (id === 'club-alias' ? 'club-a' : id);

    const clubIds = groupIdsInSameLeaveSlot('club-alias', chats, resolve);
    expect(clubIds.has('club-alias')).toBe(true);
    expect(clubIds.has('club-a')).toBe(true);
    expect(clubIds.has('club-b')).toBe(true);
    expect(clubIds.has('drink')).toBe(false);

    const ageIds = groupIdsInSameLeaveSlot('age20', chats);
    expect(ageIds.has('age20')).toBe(true);
    expect(ageIds.has('age20b')).toBe(true);
    expect(ageIds.has('year95')).toBe(false);

    const yearIds = groupIdsInSameLeaveSlot('year95', chats);
    expect(yearIds.has('year95b')).toBe(true);
    expect(yearIds.has('other')).toBe(false);

    const missing = groupIdsInSameLeaveSlot('gone', chats);
    expect([...missing].sort()).toEqual(['gone']);
  });

  it('participantRowsToLeave filters by user and leave-slot ids', () => {
    const chats = [
      { id: 'age20', name: '20대 모임' },
      { id: 'age20b', name: '20대 모임' },
      { id: 'other', name: '기타' },
    ];
    const parts = [
      { id: 'p1', user_id: 'u1', group_id: 'age20' },
      { id: 'p2', user_id: 'u1', group_id: 'age20b' },
      { id: 'p3', user_id: 'u1', group_id: 'other' },
      { id: 'p4', user_id: 'u2', group_id: 'age20' },
    ];
    const rows = participantRowsToLeave('u1', 'age20', parts, chats);
    expect(rows.map(r => String(r.id)).sort()).toEqual(['p1', 'p2']);
    expect(participantRowsToLeave('', 'age20', parts, chats)).toEqual([]);
    expect(participantRowsToLeave('u1', '', parts, chats)).toEqual([]);
  });

  it('countUserGroupSlots counts distinct catalog slots only', () => {
    const chats = [
      { id: 'age20', name: '20대 모임' },
      { id: 'age20b', name: '20대 모임' },
      { id: 'year95', name: '1995년생 모임' },
      { id: 'club', name: '2차 클럽 갈 분', room_kind: 'afterparty_club', interest_tag: '2차클럽' },
      { id: 'hidden', name: '숨김', hidden: true },
      { id: 'merged', name: '중복', merged_into: 'age20' },
      { id: 'group_age_40', name: '40대 모임' },
    ];
    const parts = [
      { user_id: 'u1', group_id: 'age20' },
      { user_id: 'u1', group_id: 'age20b' }, // same age slot
      { user_id: 'u1', group_id: 'year95' },
      { user_id: 'u1', group_id: 'club' },
      { user_id: 'u1', group_id: 'hidden' },
      { user_id: 'u1', group_id: 'merged' },
      { user_id: 'u1', group_id: 'group_age_40' },
      { user_id: 'u2', group_id: 'year95' },
    ];
    expect(countUserGroupSlots('u1', parts, chats)).toBe(3); // age + year + club
    expect(countUserGroupSlots('u2', parts, chats)).toBe(1);
    expect(countUserGroupSlots('u3', parts, chats)).toBe(0);
  });
});
