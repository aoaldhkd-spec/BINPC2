import type { GroupChat } from '../types/app';

/** 사람당 입장 가능한 단톡 수. 방 정원(인원) 제한이 아님. */
export const MAX_GROUPS_PER_USER = 4;

const GROUP_LIMIT_MSG = '단체 채팅은 최대 4개까지 입장할 수 있어요.';

export const AFTERPARTY_CLUB_ID = 'group_afterparty_club';
export const AFTERPARTY_DRINK_ID = 'group_afterparty_drink';

export function groupLimitMessage(): string {
  return GROUP_LIMIT_MSG;
}

export function sumUnreadCounts(counts: Record<string, number> | undefined | null): number {
  if (!counts) return 0;
  let n = 0;
  for (const v of Object.values(counts)) {
    const x = Number(v);
    if (Number.isFinite(x) && x > 0) n += Math.floor(x);
  }
  return n;
}

export function groupLastReadStorageKey(userId: string): string {
  return `group_last_read_v1_${userId}`;
}

export function readGroupLastReads(userId: string): Record<string, string> {
  if (!userId || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(groupLastReadStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeGroupLastRead(userId: string, groupId: string, at: string = new Date().toISOString()): Record<string, string> {
  const next = { ...readGroupLastReads(userId), [groupId]: at };
  try {
    localStorage.setItem(groupLastReadStorageKey(userId), JSON.stringify(next));
  } catch { /* quota */ }
  return next;
}

/** 전체 초기화 시 유저별 단톡 읽음 시각 leftover 제거 */
export function clearAllGroupLastReads(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('group_last_read_v1_')) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch { /* private mode */ }
}

export function countUnreadGroupMessages(
  messages: ReadonlyArray<{ sender_id?: string; created_at?: string; group_id?: string }>,
  opts: { myId: string; lastReadAt?: string | null },
): number {
  const last = opts.lastReadAt ?? '';
  let n = 0;
  for (const m of messages) {
    if (!m.created_at) continue;
    if (m.sender_id && String(m.sender_id) === String(opts.myId)) continue;
    if (!last || m.created_at > last) n += 1;
  }
  return n;
}

/** 내 메시지 기준, 아직 읽지 않은 다른 멤버 수 (본인 제외). 0이면 숨김. */
export function unreadMemberCount(
  msg: { sender_id?: string; created_at?: string },
  participants: ReadonlyArray<{ user_id: string; last_read_at?: string | null; joined_at?: string | null }>,
  myId: string,
): number {
  if (!msg.created_at || !myId) return 0;
  let n = 0;
  for (const p of participants) {
    if (String(p.user_id) === String(myId)) continue;
    if (p.joined_at && p.joined_at > msg.created_at) continue;
    if (!p.last_read_at || p.last_read_at < msg.created_at) n += 1;
  }
  return n;
}

export function siblingGroupIds(groups: GroupChat[] | undefined | null, groupId: string): string[] {
  if (!groupId) return [];
  const ids = new Set<string>([groupId]);
  if (!groups?.length) return [...ids];
  const target = groups.find(g => g.id === groupId) ?? { id: groupId, name: '', interest_tag: '' };
  const kind = afterpartyKind(target);
  if (kind) {
    for (const g of groups) {
      if (afterpartyKind(g) === kind) ids.add(g.id);
    }
    return [...ids];
  }
  const name = String(target.name ?? '');
  if (/^\d{4}년생 모임$/.test(name) || /^\d+대 모임$/.test(name)) {
    for (const g of groups) {
      if (g.name === name) ids.add(g.id);
    }
  }
  return [...ids];
}

export function unreadForGroup(
  counts: Record<string, number> | undefined | null,
  groupId: string,
  groups?: GroupChat[],
): number {
  if (!counts) return 0;
  const key = groups?.length ? resolveCatalogGroupId(groups, groupId) : groupId;
  let n = Number(counts[key] ?? 0);
  if (groups?.length) {
    for (const [id, raw] of Object.entries(counts)) {
      if (id === key) continue;
      if (resolveCatalogGroupId(groups, id) === key) n += Number(raw) || 0;
    }
  }
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

type GroupLike = Pick<GroupChat, 'id' | 'name' | 'interest_tag'> & {
  room_kind?: string | null;
  age_group?: string | null;
  hidden?: boolean | null;
  merged_into?: string | null;
  joined?: boolean;
  created_at?: string;
};

export function afterpartyKind(group: GroupLike): 'club' | 'drink' | null {
  const kind = group.room_kind ?? '';
  const tag = group.interest_tag ?? '';
  const name = group.name ?? '';
  if (kind === 'afterparty_club' || tag === '2차클럽' || group.id === AFTERPARTY_CLUB_ID || name.includes('2차 클럽')) {
    return 'club';
  }
  if (kind === 'afterparty_drink' || tag === '2차술' || group.id === AFTERPARTY_DRINK_ID || name.includes('2차 술')) {
    return 'drink';
  }
  return null;
}

export function groupRoomVisual(group: GroupLike): {
  emoji: string;
  glyph: 'club' | 'drink' | 'year' | 'age' | 'group';
  afterparty: boolean;
  label: string;
} {
  const ap = afterpartyKind(group);
  if (ap === 'club') return { emoji: '🎧', glyph: 'club', afterparty: true, label: '2차 클럽' };
  if (ap === 'drink') return { emoji: '🍻', glyph: 'drink', afterparty: true, label: '2차 술' };
  const name = group.name ?? '';
  if (/^\d{4}년생 모임$/.test(name) || group.room_kind === 'birth_year') {
    return { emoji: '🎂', glyph: 'year', afterparty: false, label: '년생' };
  }
  if (/^\d+대 모임$/.test(name) || group.room_kind === 'age_decade') {
    return { emoji: '👥', glyph: 'age', afterparty: false, label: '나이대' };
  }
  return { emoji: '👥', glyph: 'group', afterparty: false, label: '단톡' };
}

export function isLegacyInterestAutoRoom(group: GroupLike): boolean {
  if (afterpartyKind(group)) return false;
  const name = String(group.name ?? '');
  if (/^\d{4}년생 모임$/.test(name) || /^\d+대 모임$/.test(name)) return false;
  const kind = group.room_kind ?? '';
  if (kind === 'interest_age') return true;
  if (kind === 'birth_year' || kind === 'age_decade') {
    return /대\s+.+\s*모임/.test(name) || /모임\s*모임/.test(name);
  }
  return /대\s+.+\s*모임/.test(name) || /모임\s*모임/.test(name);
}

function isYearRoom(group: GroupLike): boolean {
  return /^\d{4}년생 모임$/.test(String(group.name ?? ''));
}

function isDecadeRoom(group: GroupLike): boolean {
  return /^\d+대 모임$/.test(String(group.name ?? ''));
}

const VISIBLE_AGE_ROOM_NAMES = new Set(['20대 모임', '30대 모임']);

export type AdminGroupRoomBucket = 'catalog' | 'birth_year' | 'other';

/** ○○년생 모임 — 출생연도마다 1개. 관리자 집계에서 빼지 않는다. */
export function isAdminBirthYearRoom(group: GroupLike): boolean {
  if (group.room_kind === 'birth_year') return true;
  if (isYearRoom(group)) return true;
  return /^group_birth_\d{4}$/.test(group.id);
}

/** 유저 목록에 항상 보이는 4방: 2차 클럽·2차 술·20대·30대 */
export function isAdminCatalogListingRoom(group: GroupLike): boolean {
  if (isAdminBirthYearRoom(group)) return false;
  if (afterpartyKind(group)) return true;
  if (VISIBLE_AGE_ROOM_NAMES.has(String(group.name ?? ''))) return true;
  const band = String(group.age_group ?? '');
  return group.room_kind === 'age_decade' && (band === '20대' || band === '30대');
}

/**
 * 관리자 집계용. 년생은 hidden이어도 센다.
 * hidden/merged 중복 행은 null (카탈로그 복제본).
 */
export function adminGroupRoomBucket(group: GroupLike): AdminGroupRoomBucket | null {
  if (isAdminBirthYearRoom(group)) return 'birth_year';
  if (group.hidden || group.merged_into) return null;
  if (isAdminCatalogListingRoom(group)) return 'catalog';
  return 'other';
}

export function adminGroupRoomCounts(groups: readonly GroupLike[]): {
  total: number;
  catalog: number;
  birthYear: number;
  other: number;
} {
  let catalog = 0;
  let birthYear = 0;
  let other = 0;
  for (const group of groups) {
    const bucket = adminGroupRoomBucket(group);
    if (bucket === 'catalog') catalog += 1;
    else if (bucket === 'birth_year') birthYear += 1;
    else if (bucket === 'other') other += 1;
  }
  return { total: catalog + birthYear + other, catalog, birthYear, other };
}

export function adminGroupRoomsByBucket(groups: readonly GroupLike[]): {
  catalog: GroupLike[];
  birthYear: GroupLike[];
  other: GroupLike[];
} {
  const catalog: GroupLike[] = [];
  const birthYear: GroupLike[] = [];
  const other: GroupLike[] = [];
  for (const group of groups) {
    const bucket = adminGroupRoomBucket(group);
    if (bucket === 'catalog') catalog.push(group);
    else if (bucket === 'birth_year') birthYear.push(group);
    else if (bucket === 'other') other.push(group);
  }
  return { catalog, birthYear, other };
}

/** 예: 전체 6개 방 · 목록 방 4 · 년생 방 2 */
export function formatAdminGroupRoomCounts(groups: readonly GroupLike[]): string {
  const counts = adminGroupRoomCounts(groups);
  const parts = [`목록 방 ${counts.catalog}`, `년생 방 ${counts.birthYear}`];
  if (counts.other > 0) parts.push(`기타 ${counts.other}`);
  return `전체 ${counts.total}개 방 · ${parts.join(' · ')}`;
}

export function ageBandFromYear(year: unknown): string | null {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null;
  const age = 2026 - y;
  if (age < 20) return null;
  if (age < 30) return '20대';
  return '30대';
}

export function isVisibleCatalogRoom(
  group: GroupLike,
  opts?: { myBirthYear?: number | null; joinedIds?: string[] },
): boolean {
  if (group.hidden || group.merged_into) return false;
  if (afterpartyKind(group)) return true;
  if (isLegacyInterestAutoRoom(group)) return false;
  if (!isYearRoom(group) && !isDecadeRoom(group)) return false;
  if (isDecadeRoom(group) && !VISIBLE_AGE_ROOM_NAMES.has(String(group.name))) return false;
  const joined = opts?.joinedIds?.includes(group.id);
  if (joined) return true;
  const year = opts?.myBirthYear;
  if (year && isYearRoom(group) && String(group.name) === `${year}년생 모임`) return true;
  const band = year ? ageBandFromYear(year) : null;
  if (band && isDecadeRoom(group) && String(group.name) === `${band} 모임`) {
    return true;
  }
  return false;
}

function pickCanonicalAfterparty(rooms: GroupChat[], kind: 'club' | 'drink'): GroupChat {
  const preferId = kind === 'club' ? AFTERPARTY_CLUB_ID : AFTERPARTY_DRINK_ID;
  const hit = rooms.find(g => g.id === preferId);
  if (hit) return hit;
  return [...rooms].sort((a, b) =>
    String(a.created_at ?? a.id).localeCompare(String(b.created_at ?? b.id)),
  )[0];
}

export function countJoinedCatalogRooms(
  groups: GroupChat[],
  joinedIds: string[],
  opts?: { myBirthYear?: number | null },
): number {
  return catalogGroupRooms(groups, { ...opts, joinedIds }).filter(g => g.joined).length;
}

export function isJoinedGroupId(groups: GroupChat[] | undefined | null, joinedIds: string[], groupId: string): boolean {
  if (!groupId) return false;
  if (joinedIds.includes(groupId)) return true;
  return siblingGroupIds(groups, groupId).some(id => joinedIds.includes(id));
}

export function catalogGroupRooms(
  groups: GroupChat[],
  opts?: { myBirthYear?: number | null; joinedIds?: string[] },
): GroupChat[] {
  const joinedIds = new Set(opts?.joinedIds ?? groups.filter(g => g.joined).map(g => g.id));
  const out: GroupChat[] = [];

  for (const kind of ['club', 'drink'] as const) {
    const matches = groups.filter(g => afterpartyKind(g) === kind);
    if (!matches.length) continue;
    const canonical = pickCanonicalAfterparty(matches, kind);
    const joined = matches.some(g => joinedIds.has(g.id) || g.joined);
    out.push({ ...canonical, hidden: false, merged_into: null, joined });
  }

  const rest = groups.filter(g => !afterpartyKind(g) && isVisibleCatalogRoom(g, opts));
  const seen = new Set<string>();
  for (const g of rest) {
    const key = isYearRoom(g) ? `y:${g.name}` : `a:${g.age_group || g.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...g, joined: !!(g.joined || joinedIds.has(g.id)) });
  }

  out.sort(sortGroupRooms);
  return out;
}

export function resolveCatalogGroupId(groups: GroupChat[], groupId: string): string {
  const kind = afterpartyKind(groups.find(g => g.id === groupId) ?? { id: groupId, name: '', interest_tag: '' });
  if (kind) {
    const canonical = catalogGroupRooms(groups).find(g => afterpartyKind(g) === kind);
    return canonical?.id ?? groupId;
  }
  return groupId;
}

export function sortGroupRooms(a: GroupChat, b: GroupChat): number {
  const va = groupRoomVisual(a).afterparty ? 0 : 1;
  const vb = groupRoomVisual(b).afterparty ? 0 : 1;
  if (va !== vb) return va - vb;
  if (!!a.joined !== !!b.joined) return a.joined ? -1 : 1;
  return (a.name ?? '').localeCompare(b.name ?? '', 'ko');
}
