import { describe, expect, it } from 'vitest';
import type { GroupChat } from '../types/app';
import {
  MAX_GROUPS_PER_USER,
  catalogGroupRooms,
  countUnreadGroupMessages,
  groupLimitMessage,
  isLegacyInterestAutoRoom,
  sumUnreadCounts,
  unreadForGroup,
} from './group-rooms';

function room(partial: Partial<GroupChat> & Pick<GroupChat, 'id' | 'name'>): GroupChat {
  return {
    interest_tag: '',
    age_group: null,
    max_members: 999999,
    created_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('group-rooms catalog', () => {
  it('caps a user at 4 rooms', () => {
    expect(MAX_GROUPS_PER_USER).toBe(4);
    expect(groupLimitMessage()).toMatch(/최대 4개/);
  });

  it('keeps exactly one 2차 술 and one 2차 클럽', () => {
    const list = catalogGroupRooms([
      room({ id: 'dup-drink', name: '2차 술 갈 분', interest_tag: '2차술', room_kind: 'afterparty_drink' }),
      room({ id: 'group_afterparty_drink', name: '2차 술 갈 분', interest_tag: '2차술', room_kind: 'afterparty_drink' }),
      room({ id: 'dup-club', name: '2차 클럽 갈 분', interest_tag: '2차클럽', room_kind: 'afterparty_club' }),
      room({ id: 'group_afterparty_club', name: '2차 클럽 갈 분', interest_tag: '2차클럽', room_kind: 'afterparty_club' }),
    ]);
    const names = list.map(g => g.name);
    expect(names.filter(n => n.includes('2차 술'))).toHaveLength(1);
    expect(names.filter(n => n.includes('2차 클럽'))).toHaveLength(1);
    expect(list.find(g => g.name.includes('2차 술'))?.id).toBe('group_afterparty_drink');
    expect(list.find(g => g.name.includes('2차 클럽'))?.id).toBe('group_afterparty_club');
  });

  it('hides leftover interest auto rooms and keeps year + decade names', () => {
    const list = catalogGroupRooms([
      room({ id: 'y', name: '1995년생 모임', room_kind: 'birth_year', interest_tag: '1995년생' }),
      room({ id: 'a', name: '30대 모임', room_kind: 'age_decade', age_group: '30대', interest_tag: '30대' }),
      room({ id: 'legacy', name: '30대 사진찍기 모임', room_kind: 'interest_age', age_group: '30대', interest_tag: '사진찍기' }),
      room({ id: 'junk', name: '기타 기타 모임 모임', room_kind: 'interest_age', age_group: '기타', interest_tag: '기타' }),
    ], { myBirthYear: 1995, joinedIds: ['y', 'a'] });
    expect(list.map(g => g.name).sort()).toEqual(['1995년생 모임', '30대 모임']);
    expect(list.every(g => !g.name.includes('사진') && !g.name.includes('기타'))).toBe(true);
  });

  it('flags interest+age leftovers', () => {
    expect(isLegacyInterestAutoRoom(room({ id: '1', name: '20대 뜨밤 모임', room_kind: 'interest_age' }))).toBe(true);
    expect(isLegacyInterestAutoRoom(room({ id: '2', name: '30대 모임', room_kind: 'age_decade' }))).toBe(false);
    expect(isLegacyInterestAutoRoom(room({ id: '3', name: '1995년생 모임', room_kind: 'birth_year' }))).toBe(false);
  });

  it('sums unread counts as a number', () => {
    expect(sumUnreadCounts({ a: 2, b: 3, c: 0 })).toBe(5);
    expect(sumUnreadCounts({})).toBe(0);
  });

  it('counts group unread after last-read and ignores my own sends', () => {
    const msgs = [
      { sender_id: 'A', created_at: '2026-08-16T01:00:00.000Z' },
      { sender_id: 'B', created_at: '2026-08-16T02:00:00.000Z' },
      { sender_id: 'B', created_at: '2026-08-16T03:00:00.000Z' },
    ];
    expect(countUnreadGroupMessages(msgs, { myId: 'A', lastReadAt: '2026-08-16T01:30:00.000Z' })).toBe(2);
    expect(countUnreadGroupMessages(msgs, { myId: 'B', lastReadAt: null })).toBe(1);
  });

  it('folds duplicate 2차 room unread onto the catalog id', () => {
    const raw = [
      room({ id: 'dup-drink', name: '2차 술 갈 분', interest_tag: '2차술', room_kind: 'afterparty_drink' }),
      room({ id: 'group_afterparty_drink', name: '2차 술 갈 분', interest_tag: '2차술', room_kind: 'afterparty_drink' }),
    ];
    expect(unreadForGroup({ 'dup-drink': 4 }, 'group_afterparty_drink', raw)).toBe(4);
  });
});
