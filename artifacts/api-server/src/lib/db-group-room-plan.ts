/**
 * Group room match / merge / opt-in pure planners — extracted from routes/db.ts.
 * Persist, store mutate, and SSE stay in db.ts (thin wrappers + I/O).
 */
import { groupAgeDecadeBand } from './korean-age.js';

export const MAX_GROUPS_PER_USER = 4;
/** 방 인원 상한 없음. 정원 초과로 방을 나누지 않음. */
export const UNLIMITED_GROUP_MEMBERS = 999999;
export const GROUP_LIMIT_MESSAGE = '단체 채팅은 최대 4개까지 입장할 수 있어요.';

export type OptInGroupRoomSpec = {
  id: string;
  name: string;
  interest_tag: string;
  room_kind: string;
};

export const OPT_IN_GROUP_ROOMS: OptInGroupRoomSpec[] = [
  { id: 'group_afterparty_club', name: '2차 클럽 갈 분', interest_tag: '2차클럽', room_kind: 'afterparty_club' },
  { id: 'group_afterparty_drink', name: '2차 술 갈 분', interest_tag: '2차술', room_kind: 'afterparty_drink' },
];

export const AUTO_ROOM_AGE_DECADE = 'age_decade';
export const AUTO_ROOM_BIRTH_YEAR = 'birth_year';
export const VISIBLE_AGE_BANDS = ['20대', '30대'] as const;
export const RETIRED_AGE_ROOM_RE = /^(10|40|50|60|70)대 모임$/;

export function compactGroupName(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '');
}

export function matchesAfterpartySpec(
  g: Record<string, unknown>,
  spec: OptInGroupRoomSpec,
): boolean {
  const name = String(g.name ?? '');
  const compact = compactGroupName(name);
  return String(g.id) === spec.id
    || name === spec.name
    || compact === compactGroupName(spec.name)
    || String(g.interest_tag) === spec.interest_tag
    || String(g.room_kind ?? '') === spec.room_kind
    || (spec.room_kind === 'afterparty_club' && (name.includes('2차 클럽') || compact.includes('2차클럽')))
    || (spec.room_kind === 'afterparty_drink' && (name.includes('2차 술') || compact.includes('2차술')));
}

export function matchesVisibleAgeBand(g: Record<string, unknown>, band: string): boolean {
  if (String(g.id) === `group_age_${band.replace(/대$/, '')}`) return true;
  const compact = compactGroupName(g.name);
  return compact === compactGroupName(`${band} 모임`);
}

export function birthYearOfGroup(g: Record<string, unknown>): number | null {
  const idm = String(g.id ?? '').match(/^group_birth_(\d{4})$/);
  if (idm) return Number(idm[1]);
  const namem = String(g.name ?? '').match(/^(\d{4})년생\s*모임$/);
  if (namem) return Number(namem[1]);
  return null;
}

export function isRetiredAgeRoom(g: Record<string, unknown>): boolean {
  const name = String(g.name ?? '');
  const id = String(g.id ?? '');
  const band = String(g.age_group ?? '');
  return RETIRED_AGE_ROOM_RE.test(name)
    || /^group_age_(10|40|50|60|70)$/.test(id)
    || /^(10|40|50|60|70)대$/.test(band);
}

export function ageBandFromYear(year: unknown): string | null {
  return groupAgeDecadeBand(year);
}

export function canonicalAgeRoomId(ageBand: string): string {
  return `group_age_${ageBand.replace(/대$/, '')}`;
}

export function canonicalYearRoomId(year: number): string {
  return `group_birth_${year}`;
}

export function autoRoomOptKey(kind: string, extra: string): string {
  return `${kind}:${extra}`;
}

/**
 * Opt-out / leave slot key for a group.
 * `resolveMergedId` defaults to identity; db.ts passes resolveMergedGroupId.
 */
export function optKeyForGroup(
  group: Record<string, unknown> | undefined,
  groupId: string,
  resolveMergedId: (id: string) => string = (id) => id,
): string {
  const kind = String(group?.room_kind ?? '');
  const name = String(group?.name ?? '');
  const tag = String(group?.interest_tag ?? '');
  const age = String(group?.age_group ?? '');
  if (kind === AUTO_ROOM_AGE_DECADE || /^\d+대 모임$/.test(name)) {
    const band = age || name.match(/^(\d+대)/)?.[1] || tag;
    return autoRoomOptKey(AUTO_ROOM_AGE_DECADE, String(band));
  }
  if (kind === AUTO_ROOM_BIRTH_YEAR || /^\d{4}년생 모임$/.test(name)) {
    const yearTag = /^\d{4}년생$/.test(tag)
      ? tag
      : (name.match(/^(\d{4}년생)/)?.[1] || tag);
    return autoRoomOptKey(AUTO_ROOM_BIRTH_YEAR, String(yearTag));
  }
  if (kind === 'afterparty_club' || tag === '2차클럽' || name.includes('2차 클럽')) return 'afterparty_club';
  if (kind === 'afterparty_drink' || tag === '2차술' || name.includes('2차 술')) return 'afterparty_drink';
  return resolveMergedId(groupId);
}

export function isLeftoverInterestRoom(g: Record<string, unknown>): boolean {
  const kind = String(g.room_kind ?? '');
  const name = String(g.name ?? '');
  if (kind === 'afterparty_club' || kind === 'afterparty_drink') return false;
  if (kind === AUTO_ROOM_BIRTH_YEAR || /^\d{4}년생 모임$/.test(name)) return false;
  if (kind === AUTO_ROOM_AGE_DECADE || /^\d+대 모임$/.test(name)) return false;
  return kind === 'interest_age' || /대\s+.+\s*모임/.test(name) || /모임\s*모임/.test(name);
}

export function afterpartySlotKey(g: Record<string, unknown>): 'afterparty_club' | 'afterparty_drink' | null {
  if (matchesAfterpartySpec(g, OPT_IN_GROUP_ROOMS[0])) return 'afterparty_club';
  if (matchesAfterpartySpec(g, OPT_IN_GROUP_ROOMS[1])) return 'afterparty_drink';
  return null;
}

/** 한도 계산용. 숨긴 중복 2차·레거시 관심사/은퇴 N대는 칸을 차지하지 않음. */
export function groupLimitSlotKey(g: Record<string, unknown> | undefined, groupId: string): string | null {
  if (!g) return null;
  if (g.hidden === true) return null;
  const into = String(g.merged_into ?? '');
  if (into && into !== String(g.id)) return null;
  if (isLeftoverInterestRoom(g) || isRetiredAgeRoom(g)) return null;
  const ap = afterpartySlotKey(g);
  if (ap) return ap;
  const name = String(g.name ?? '');
  if (/^\d{4}년생 모임$/.test(name)) return `year:${name}`;
  if (/^\d+대 모임$/.test(name)) return `age:${name}`;
  return String(g.id || groupId);
}
