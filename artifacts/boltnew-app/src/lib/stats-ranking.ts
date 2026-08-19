import { seoulDateKey, isAnyHeart } from './signal-match';
import { ALL_BIO_TAGS } from './interests';
import { MBTI_LIST, type HeartType } from './constants';
import { getPositionLabel } from './profile';
import { ageBandFromBirthYear } from './korean-age';

export type PublicLikeRow = {
  id?: string;
  liked_id?: string | null;
  heart_type?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export type HeartCounts = Record<HeartType, number>;

export type CountEntry = [string, number];

/** 가입 픽커 이전 BIO_LIST → 현재 관심사 태그 */
export const STATS_INTEREST_ALIASES: Record<string, string> = {
  영화: '영화/드라마',
  음악: '음악감상',
  사진: '사진찍기',
};

const MBTI_SET = new Set<string>(MBTI_LIST);
const CANONICAL_INTERESTS = new Set<string>(ALL_BIO_TAGS);

export function emptyHeartCounts(): HeartCounts {
  return { red: 0, blue: 0, pink: 0, green: 0 };
}

/** created_at 없으면 오늘로 본다 — 미션 집계와 동일. 잘못된 날짜는 제외. */
export function isLikeOnSeoulDay(row: PublicLikeRow, now: Date = new Date()): boolean {
  if (!row.created_at) return true;
  const created = new Date(row.created_at);
  if (Number.isNaN(created.getTime())) return false;
  return seoulDateKey(created) === seoulDateKey(now);
}

function knownHeartType(raw: string | null | undefined): HeartType | null {
  const t = raw ?? 'red';
  return isAnyHeart(t) ? (t as HeartType) : null;
}

/** 오늘의 통계 — 하트 수·종류만. */
export function countTodayHeartStats(likes: readonly PublicLikeRow[], now: Date = new Date()): {
  heart: HeartCounts;
  totalHearts: number;
} {
  const heart = emptyHeartCounts();
  let totalHearts = 0;
  for (const row of likes) {
    if (!isLikeOnSeoulDay(row, now)) continue;
    const t = knownHeartType(row.heart_type);
    if (!t) continue;
    heart[t] += 1;
    totalHearts += 1;
  }
  return { heart, totalHearts };
}

export type PublicContactShareRow = {
  created_at?: string | null;
};

/** contact_shares 행 수 — 오늘(KST) 생성분만. */
export function countTodayContactExchanges(
  shares: readonly PublicContactShareRow[],
  now: Date = new Date(),
): number {
  let count = 0;
  for (const row of shares) {
    if (!isLikeOnSeoulDay(row, now)) continue;
    count += 1;
  }
  return count;
}

export type RankedHeartEntry = {
  id: string;
  hearts: HeartCounts;
  total: number;
  rank: number;
};

/**
 * 받은 하트 수 TOP N. knownIds가 있으면 그 프로필만 (삭제 유저가 슬롯 차지 방지).
 * 동점은 같은 순위(1,1,3). 어제 하트도 포함 — 랭킹은 행사 누적.
 */
export function rankByReceivedHearts(
  likes: readonly PublicLikeRow[],
  opts?: { knownIds?: ReadonlySet<string>; limit?: number },
): RankedHeartEntry[] {
  const counts = new Map<string, HeartCounts>();
  const knownIds = opts?.knownIds;
  for (const row of likes) {
    const id = row.liked_id;
    if (!id) continue;
    if (knownIds && !knownIds.has(id)) continue;
    const t = knownHeartType(row.heart_type);
    if (!t) continue;
    const cur = counts.get(id) ?? emptyHeartCounts();
    cur[t] += 1;
    counts.set(id, cur);
  }
  const limit = opts?.limit ?? 10;
  const sorted = [...counts.entries()]
    .map(([id, hearts]) => ({
      id,
      hearts,
      total: hearts.red + hearts.blue + hearts.pink + hearts.green,
    }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));

  const ranked: RankedHeartEntry[] = [];
  let lastTotal = Number.NaN;
  let lastRank = 0;
  for (let i = 0; i < sorted.length && ranked.length < limit; i++) {
    const row = sorted[i];
    const rank = row.total === lastTotal ? lastRank : i + 1;
    lastTotal = row.total;
    lastRank = rank;
    ranked.push({ ...row, rank });
  }
  return ranked;
}

/**
 * 가입 저장값: "부산" | "경기 수원" | "제주".
 * 예전 로직은 두 번째 단어가 시/군으로 끝나야 도시를 남겨, "경기 수원"이 전부 "경기"로 합쳐졌다.
 */
export function extractCityLevel(location: string): string {
  const parts = location.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0];
  if (first.endsWith('특별시') || first.endsWith('광역시') || first.endsWith('특별자치시')) {
    return first;
  }
  if (parts.length >= 2) return `${first} ${parts[1]}`;
  return first;
}


export function ageBand(birthYear: number | null | undefined, now: Date = new Date()): string | null {
  return ageBandFromBirthYear(birthYear, now);
}

export function normalizeMbti(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase();
  return MBTI_SET.has(t) ? t : null;
}

export function canonicalInterestTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const mapped = STATS_INTEREST_ALIASES[raw] ?? raw;
    if (!CANONICAL_INTERESTS.has(mapped)) continue;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

function sortCountDesc(entries: CountEntry[]): CountEntry[] {
  return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export type ProfileForStats = {
  mbti?: string | null;
  personality_score?: number | null;
  interests?: string | string[] | null;
  bio?: string | null;
  location?: string | null;
  birth_year?: number | null;
};

export function collectProfileBreakdowns(
  profiles: readonly ProfileForStats[],
  parseInterests: (p: ProfileForStats) => string[],
  now: Date = new Date(),
): {
  mbti: CountEntry[];
  position: CountEntry[];
  interest: CountEntry[];
  location: CountEntry[];
  age: CountEntry[];
} {
  const mbtiCounts = new Map<string, number>();
  const positionCounts = new Map<string, number>();
  const interestCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();
  const ageCounts = new Map<string, number>();

  for (const p of profiles) {
    const mbti = normalizeMbti(p.mbti);
    if (mbti) mbtiCounts.set(mbti, (mbtiCounts.get(mbti) ?? 0) + 1);

    const pos = getPositionLabel(p.personality_score ?? 50);
    positionCounts.set(pos, (positionCounts.get(pos) ?? 0) + 1);

    for (const tag of canonicalInterestTags(parseInterests(p))) {
      interestCounts.set(tag, (interestCounts.get(tag) ?? 0) + 1);
    }

    const loc = extractCityLevel(p.location ?? '');
    if (loc) locationCounts.set(loc, (locationCounts.get(loc) ?? 0) + 1);

    const band = ageBand(p.birth_year, now);
    if (band) ageCounts.set(band, (ageCounts.get(band) ?? 0) + 1);
  }

  return {
    mbti: sortCountDesc([...mbtiCounts.entries()]),
    position: sortCountDesc([...positionCounts.entries()]),
    interest: sortCountDesc([...interestCounts.entries()]).slice(0, 10),
    location: sortCountDesc([...locationCounts.entries()]).slice(0, 8),
    age: [...ageCounts.entries()].sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10)),
  };
}
