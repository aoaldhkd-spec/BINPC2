import { describe, expect, it, vi, afterEach } from 'vitest';
import type { GroupChat } from '../types/app';
import {
  MAX_GROUPS_PER_USER,
  ageBandFromYear,
  catalogGroupRooms,
  countUnreadGroupMessages,
  groupLimitMessage,
  isLegacyInterestAutoRoom,
  siblingGroupIds,
  sumUnreadCounts,
  unreadForGroup,
  unreadMemberCount,
  countJoinedCatalogRooms,
  isJoinedGroupId,
  groupRoomVisual,
  AFTERPARTY_CLUB_ID,
  clearAllGroupLastReads,
  writeGroupLastRead,
  groupLastReadStorageKey,
  adminGroupRoomCounts,
  formatAdminGroupRoomCounts,
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

  it('shows the matching N대 room even when the user is not joined', () => {
    const list = catalogGroupRooms([
      room({ id: 'group_age_20', name: '20대 모임', room_kind: 'age_decade', age_group: '20대', interest_tag: '20대' }),
      room({ id: 'group_age_30', name: '30대 모임', room_kind: 'age_decade', age_group: '30대', interest_tag: '30대' }),
      room({ id: 'legacy', name: '30대 사진찍기 모임', room_kind: 'interest_age', age_group: '30대', interest_tag: '사진찍기' }),
      room({ id: 'y', name: '1995년생 모임', room_kind: 'birth_year', interest_tag: '1995년생' }),
    ], { myBirthYear: 1995, joinedIds: [] });
    expect(list.map(g => g.name).sort()).toEqual(['1995년생 모임', '30대 모임']);
    expect(list.find(g => g.name === '30대 모임')?.joined).toBe(false);
    expect(list.some(g => g.name.includes('사진'))).toBe(false);
  });

  it('shows 20대 모임 for a 1998 birth year and hides other decades', () => {
    const list = catalogGroupRooms([
      room({ id: 'group_age_20', name: '20대 모임', room_kind: 'age_decade', age_group: '20대' }),
      room({ id: 'group_age_30', name: '30대 모임', room_kind: 'age_decade', age_group: '30대' }),
      room({ id: 'legacy', name: '20대 뜨밤 모임', room_kind: 'interest_age', age_group: '20대' }),
    ], { myBirthYear: 1998, joinedIds: [] });
    expect(list.map(g => g.name)).toEqual(['20대 모임']);
  });

  it('maps birth year to decade band without 기타', () => {
    expect(ageBandFromYear(1998)).toBe('20대');
    expect(ageBandFromYear(1995)).toBe('30대');
    expect(ageBandFromYear(1986)).toBe('30대');
    expect(ageBandFromYear(1976)).toBe('30대');
    expect(ageBandFromYear(2007)).toBeNull();
    expect(ageBandFromYear(null)).toBeNull();
    expect(ageBandFromYear('기타')).toBeNull();
  });

  it('maps 40+ into 30대 모임 and does not show leftover 10대/50대 rooms', () => {
    const list = catalogGroupRooms([
      room({ id: 'group_age_10', name: '10대 모임', room_kind: 'age_decade', age_group: '10대' }),
      room({ id: 'group_age_20', name: '20대 모임', room_kind: 'age_decade', age_group: '20대' }),
      room({ id: 'group_age_30', name: '30대 모임', room_kind: 'age_decade', age_group: '30대' }),
      room({ id: 'group_age_40', name: '40대 모임', room_kind: 'age_decade', age_group: '40대' }),
      room({ id: 'group_age_50', name: '50대 모임', room_kind: 'age_decade', age_group: '50대' }),
      room({ id: 'y', name: '1980년생 모임', room_kind: 'birth_year', interest_tag: '1980년생' }),
    ], { myBirthYear: 1980, joinedIds: ['group_age_40', 'y'] });
    expect(list.map(g => g.name).sort()).toEqual(['1980년생 모임', '30대 모임']);
    expect(list.some(g => /^(10|40|50|60|70)대 모임$/.test(g.name))).toBe(false);
  });

  it('does not put under-20 into 20대 모임', () => {
    const list = catalogGroupRooms([
      room({ id: 'group_age_20', name: '20대 모임', room_kind: 'age_decade', age_group: '20대' }),
      room({ id: 'group_age_30', name: '30대 모임', room_kind: 'age_decade', age_group: '30대' }),
      room({ id: 'y', name: '2007년생 모임', room_kind: 'birth_year', interest_tag: '2007년생' }),
    ], { myBirthYear: 2007, joinedIds: ['y'] });
    expect(list.map(g => g.name)).toEqual(['2007년생 모임']);
  });

  it('flags interest+age leftovers', () => {
    expect(isLegacyInterestAutoRoom(room({ id: '1', name: '20대 뜨밤 모임', room_kind: 'interest_age' }))).toBe(true);
    expect(isLegacyInterestAutoRoom(room({ id: '2', name: '30대 모임', room_kind: 'age_decade' }))).toBe(false);
    expect(isLegacyInterestAutoRoom(room({ id: '3', name: '1995년생 모임', room_kind: 'birth_year' }))).toBe(false);
    expect(isLegacyInterestAutoRoom(room({ id: '4', name: '30대 모임', room_kind: 'interest_age' }))).toBe(false);
    expect(isLegacyInterestAutoRoom(room({ id: '5', name: '30대 사진찍기 모임', room_kind: 'age_decade', age_group: '30대' }))).toBe(true);
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

  it('counts unread members one-by-one and excludes self / later joiners', () => {
    const msg = { sender_id: 'me', created_at: '2026-08-16T02:00:00.000Z' };
    const parts = [
      { user_id: 'me', last_read_at: '2026-08-16T02:01:00.000Z', joined_at: '2026-08-16T00:00:00.000Z' },
      { user_id: 'a', last_read_at: null, joined_at: '2026-08-16T00:00:00.000Z' },
      { user_id: 'b', last_read_at: '2026-08-16T01:59:00.000Z', joined_at: '2026-08-16T00:00:00.000Z' },
      { user_id: 'c', last_read_at: '2026-08-16T02:00:00.000Z', joined_at: '2026-08-16T00:00:00.000Z' },
      { user_id: 'd', last_read_at: null, joined_at: '2026-08-16T03:00:00.000Z' },
    ];
    expect(unreadMemberCount(msg, parts, 'me')).toBe(2);
    const afterA = parts.map(p => p.user_id === 'a' ? { ...p, last_read_at: '2026-08-16T02:05:00.000Z' } : p);
    expect(unreadMemberCount(msg, afterA, 'me')).toBe(1);
    const afterB = afterA.map(p => p.user_id === 'b' ? { ...p, last_read_at: '2026-08-16T02:06:00.000Z' } : p);
    expect(unreadMemberCount(msg, afterB, 'me')).toBe(0);
  });

  it('collects 2차 sibling ids so leave removes every copy', () => {
    const raw = [
      room({ id: 'dup-drink', name: '2차 술 갈 분', interest_tag: '2차술', room_kind: 'afterparty_drink' }),
      room({ id: 'group_afterparty_drink', name: '2차 술 갈 분', interest_tag: '2차술', room_kind: 'afterparty_drink' }),
    ];
    expect(siblingGroupIds(raw, 'group_afterparty_drink').sort()).toEqual(['dup-drink', 'group_afterparty_drink']);
    expect(siblingGroupIds(raw, 'y')).toEqual(['y']);
  });

  it('collects year-room duplicate ids so leave sticks', () => {
    const raw = [
      room({ id: 'y-old', name: '1995년생 모임', room_kind: 'birth_year', interest_tag: '1995년생' }),
      room({ id: 'group_birth_1995', name: '1995년생 모임', room_kind: 'birth_year', interest_tag: '1995년생' }),
    ];
    expect(siblingGroupIds(raw, 'group_birth_1995').sort()).toEqual(['group_birth_1995', 'y-old']);
  });

  it('club glyph is a club mark, not the Win10-missing disco ball', () => {
    const v = groupRoomVisual(room({
      id: AFTERPARTY_CLUB_ID,
      name: '2차 클럽 갈 분',
      interest_tag: '2차클럽',
      room_kind: 'afterparty_club',
    }));
    expect(v.glyph).toBe('club');
    expect(v.emoji).not.toBe('🪩');
    expect(v.label).toBe('2차 클럽');
    const drink = groupRoomVisual(room({
      id: 'group_afterparty_drink',
      name: '2차 술 갈 분',
      interest_tag: '2차술',
      room_kind: 'afterparty_drink',
    }));
    expect(drink.glyph).toBe('drink');
    expect(drink.emoji).toBe('🍻');
  });

  it('folds duplicate 2차 room unread onto the catalog id', () => {
    const raw = [
      room({ id: 'dup-drink', name: '2차 술 갈 분', interest_tag: '2차술', room_kind: 'afterparty_drink' }),
      room({ id: 'group_afterparty_drink', name: '2차 술 갈 분', interest_tag: '2차술', room_kind: 'afterparty_drink' }),
    ];
    expect(unreadForGroup({ 'dup-drink': 4 }, 'group_afterparty_drink', raw)).toBe(4);
  });

  it('duplicate 2차 rooms count as one slot so the other 2차 still fits under cap 4', () => {
    const raw = [
      room({ id: 'y', name: '1998년생 모임', room_kind: 'birth_year' }),
      room({ id: 'a', name: '20대 모임', room_kind: 'age_decade', age_group: '20대' }),
      room({ id: 'dup-drink', name: '2차 술 갈 분', interest_tag: '2차술', room_kind: 'afterparty_drink' }),
      room({ id: 'group_afterparty_drink', name: '2차 술 갈 분', interest_tag: '2차술', room_kind: 'afterparty_drink' }),
      room({ id: 'group_afterparty_club', name: '2차 클럽 갈 분', interest_tag: '2차클럽', room_kind: 'afterparty_club' }),
    ];
    expect(countJoinedCatalogRooms(raw, ['y', 'a', 'dup-drink'], { myBirthYear: 1998 })).toBe(3);
    expect(isJoinedGroupId(raw, ['dup-drink'], 'group_afterparty_drink')).toBe(true);
  });
});

describe('admin group room counts', () => {
  it('splits catalog, birth-year, and leftover instead of one fake total', () => {
    const groups = [
      room({ id: 'group_afterparty_club', name: '2차 클럽 갈 분', room_kind: 'afterparty_club' }),
      room({ id: 'group_afterparty_drink', name: '2차 술 갈 분', room_kind: 'afterparty_drink' }),
      room({ id: 'group_age_20', name: '20대 모임', room_kind: 'age_decade', age_group: '20대' }),
      room({ id: 'group_age_30', name: '30대 모임', room_kind: 'age_decade', age_group: '30대' }),
      room({ id: 'group_birth_1995', name: '1995년생 모임', room_kind: 'birth_year' }),
      room({ id: 'group_birth_1998', name: '1998년생 모임', room_kind: 'birth_year' }),
      room({ id: 'legacy', name: '30대 사진찍기 모임', room_kind: 'interest_age', age_group: '30대' }),
    ];
    expect(adminGroupRoomCounts(groups)).toEqual({
      total: 7, catalog: 4, birthYear: 2, other: 1,
    });
    expect(formatAdminGroupRoomCounts(groups)).toBe(
      '전체 7개 방 · 목록 방 4 · 년생 방 2 · 기타 1',
    );
  });

  it('counts birth-year rooms even when hidden, and skips merged catalog dupes', () => {
    const groups = [
      room({ id: 'group_afterparty_club', name: '2차 클럽 갈 분', room_kind: 'afterparty_club' }),
      room({ id: 'dup-club', name: '2차 클럽 갈 분', room_kind: 'afterparty_club', hidden: true, merged_into: 'group_afterparty_club' }),
      room({ id: 'group_birth_1995', name: '1995년생 모임', room_kind: 'birth_year', hidden: true }),
    ];
    expect(adminGroupRoomCounts(groups)).toEqual({
      total: 2, catalog: 1, birthYear: 1, other: 0,
    });
    expect(formatAdminGroupRoomCounts(groups)).toBe('전체 2개 방 · 목록 방 1 · 년생 방 1');
  });
});

describe('group last-read leftover cleanup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears group_last_read_v1_* keys and leaves other storage alone', () => {
    const mem: Record<string, string> = {};
    const ls = {
      get length() { return Object.keys(mem).length; },
      key(i: number) { return Object.keys(mem)[i] ?? null; },
      getItem(k: string) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem(k: string, v: string) { mem[k] = String(v); },
      removeItem(k: string) { delete mem[k]; },
    };
    vi.stubGlobal('localStorage', ls);
    writeGroupLastRead('u1', 'g1', '2026-01-01T00:00:00.000Z');
    mem[groupLastReadStorageKey('u2')] = '{"g2":"t"}';
    mem.matching_app_user_id = 'keep-me';
    clearAllGroupLastReads();
    expect(mem.matching_app_user_id).toBe('keep-me');
    expect(mem[groupLastReadStorageKey('u1')]).toBeUndefined();
    expect(mem[groupLastReadStorageKey('u2')]).toBeUndefined();
  });
});
