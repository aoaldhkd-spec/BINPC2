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
  afterparty: boolean;
  label: string;
} {
  const ap = afterpartyKind(group);
  if (ap === 'club') return { emoji: '🪩', afterparty: true, label: '2차 클럽' };
  if (ap === 'drink') return { emoji: '🍻', afterparty: true, label: '2차 술' };
  const name = group.name ?? '';
  if (/^\d{4}년생 모임$/.test(name) || group.room_kind === 'birth_year') {
    return { emoji: '🎂', afterparty: false, label: '년생' };
  }
  if (/^\d+대 모임$/.test(name) || group.room_kind === 'age_decade') {
    return { emoji: '👥', afterparty: false, label: '나이대' };
  }
  return { emoji: '👥', afterparty: false, label: '단톡' };
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
