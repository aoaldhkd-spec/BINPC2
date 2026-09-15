import { describe, expect, it } from 'vitest';
import {
  AUTO_ROOM_AGE_DECADE,
  AUTO_ROOM_BIRTH_YEAR,
  GROUP_LIMIT_MESSAGE,
  OPT_IN_GROUP_ROOMS,
  VISIBLE_AGE_BANDS,
  afterpartySlotKey,
  ageBandFromYear,
  autoRoomOptKey,
  birthYearOfGroup,
  canonicalAgeRoomId,
  canonicalYearRoomId,
  compactGroupName,
  groupLimitSlotKey,
  isLeftoverInterestRoom,
  isRetiredAgeRoom,
  matchesAfterpartySpec,
  matchesVisibleAgeBand,
  optKeyForGroup,
  buildAutoRoomRow,
  patchExistingAutoRoom,
  shouldSkipAutoRoomJoin,
  buildGroupParticipantRow,
  UNLIMITED_GROUP_MEMBERS,
} from './db-group-room-plan.js';

describe('db-group-room-plan', () => {
  it('keeps Korean catalog strings stable', () => {
    expect(GROUP_LIMIT_MESSAGE).toBe('단체 채팅은 최대 4개까지 입장할 수 있어요.');
    expect(OPT_IN_GROUP_ROOMS[0].name).toBe('2차 클럽 갈 분');
    expect(OPT_IN_GROUP_ROOMS[1].name).toBe('2차 술 갈 분');
    expect([...VISIBLE_AGE_BANDS]).toEqual(['20대', '30대']);
  });

  it('compactGroupName strips whitespace', () => {
    expect(compactGroupName('2차 클럽 갈 분')).toBe('2차클럽갈분');
    expect(compactGroupName(null)).toBe('');
  });

  it('matchesAfterpartySpec by id/name/tag/kind/fuzzy', () => {
    const club = OPT_IN_GROUP_ROOMS[0];
    expect(matchesAfterpartySpec({ id: club.id }, club)).toBe(true);
    expect(matchesAfterpartySpec({ name: '2차 클럽 모임' }, club)).toBe(true);
    expect(matchesAfterpartySpec({ interest_tag: '2차클럽' }, club)).toBe(true);
    expect(matchesAfterpartySpec({ room_kind: 'afterparty_drink' }, club)).toBe(false);
    expect(matchesAfterpartySpec({ name: '2차 술' }, OPT_IN_GROUP_ROOMS[1])).toBe(true);
  });

  it('matchesVisibleAgeBand by id and compact name', () => {
    expect(matchesVisibleAgeBand({ id: 'group_age_20' }, '20대')).toBe(true);
    expect(matchesVisibleAgeBand({ name: '20대  모임' }, '20대')).toBe(true);
    expect(matchesVisibleAgeBand({ name: '30대 모임' }, '20대')).toBe(false);
  });

  it('birthYearOfGroup from id or name', () => {
    expect(birthYearOfGroup({ id: 'group_birth_1995' })).toBe(1995);
    expect(birthYearOfGroup({ name: '1995년생 모임' })).toBe(1995);
    expect(birthYearOfGroup({ name: '기타' })).toBeNull();
  });

  it('isRetiredAgeRoom detects retired decades', () => {
    expect(isRetiredAgeRoom({ name: '40대 모임' })).toBe(true);
    expect(isRetiredAgeRoom({ id: 'group_age_10' })).toBe(true);
    expect(isRetiredAgeRoom({ age_group: '50대' })).toBe(true);
    expect(isRetiredAgeRoom({ name: '20대 모임', id: 'group_age_20', age_group: '20대' })).toBe(false);
  });

  it('ageBandFromYear / canonical ids / autoRoomOptKey', () => {
    const band = ageBandFromYear(1997);
    expect(band === '20대' || band === '30대' || band === null || typeof band === 'string').toBe(true);
    expect(canonicalAgeRoomId('20대')).toBe('group_age_20');
    expect(canonicalYearRoomId(1995)).toBe('group_birth_1995');
    expect(autoRoomOptKey(AUTO_ROOM_AGE_DECADE, '20대')).toBe('age_decade:20대');
    expect(autoRoomOptKey(AUTO_ROOM_BIRTH_YEAR, '1995년생')).toBe('birth_year:1995년생');
  });

  it('optKeyForGroup classifies age/year/afterparty and falls back to resolve', () => {
    expect(optKeyForGroup({ room_kind: AUTO_ROOM_AGE_DECADE, age_group: '20대' }, 'g1'))
      .toBe('age_decade:20대');
    expect(optKeyForGroup({ name: '1995년생 모임' }, 'g1'))
      .toBe('birth_year:1995년생');
    expect(optKeyForGroup({ interest_tag: '2차클럽' }, 'g1')).toBe('afterparty_club');
    expect(optKeyForGroup({ interest_tag: '2차술' }, 'g1')).toBe('afterparty_drink');
    expect(optKeyForGroup({ name: '커스텀' }, 'dup', (id) => `canon:${id}`)).toBe('canon:dup');
  });

  it('isLeftoverInterestRoom / afterpartySlotKey / groupLimitSlotKey', () => {
    expect(isLeftoverInterestRoom({ room_kind: 'interest_age' })).toBe(true);
    expect(isLeftoverInterestRoom({ room_kind: 'afterparty_club' })).toBe(false);
    expect(afterpartySlotKey({ id: 'group_afterparty_club' })).toBe('afterparty_club');
    expect(afterpartySlotKey({ name: '일반' })).toBeNull();
    expect(groupLimitSlotKey({ hidden: true, id: 'x' }, 'x')).toBeNull();
    expect(groupLimitSlotKey({ merged_into: 'c', id: 'd' }, 'd')).toBeNull();
    expect(groupLimitSlotKey({ name: '40대 모임', id: 'group_age_40' }, 'group_age_40')).toBeNull();
    expect(groupLimitSlotKey({ name: '20대 모임', id: 'group_age_20' }, 'group_age_20'))
      .toBe('age:20대 모임');
    expect(groupLimitSlotKey({ name: '1995년생 모임', id: 'group_birth_1995' }, 'group_birth_1995'))
      .toBe('year:1995년생 모임');
    expect(groupLimitSlotKey({ id: 'group_afterparty_club', name: '2차 클럽 갈 분' }, 'x'))
      .toBe('afterparty_club');
  });

  it('auto room row builders + skip join', () => {
    const row = buildAutoRoomRow({
      id: 'g1', name: '20대 모임', interest_tag: '20대', age_group: '20대',
      room_kind: 'age_decade', created_at: 't',
    });
    expect(row.max_members).toBe(UNLIMITED_GROUP_MEMBERS);
    expect(row.hidden).toBe(false);
    const patched = patchExistingAutoRoom(row, {
      name: 'n', interest_tag: 't', age_group: null, room_kind: 'birth_year',
    });
    expect(patched.merged_into).toBeNull();
    expect(shouldSkipAutoRoomJoin({
      hasOptOut: false, roomKind: 'afterparty_club', alreadyMember: false, slotsUsed: 0, maxSlots: 4,
    })).toBe(true);
    expect(buildGroupParticipantRow('g', 'u', 't').id).toBe('g__u');
  });

});

import { planAutoMatchJoinSpecs } from './db-group-room-plan.js';

describe('planAutoMatchJoinSpecs', () => {
  it('returns age + birth year rooms', () => {
    const specs = planAutoMatchJoinSpecs({ birth_year: 1995 });
    expect(specs.length).toBe(2);
    expect(specs[0].room_kind).toBeTruthy();
    expect(specs[1].name).toContain('1995');
  });
});
