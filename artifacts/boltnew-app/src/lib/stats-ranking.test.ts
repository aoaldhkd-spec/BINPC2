import { describe, expect, it } from 'vitest';
import {
  ageBand,
  canonicalInterestTags,
  collectProfileBreakdowns,
  countTodayContactExchanges,
  countTodayHeartStats,
  extractCityLevel,
  isLikeOnSeoulDay,
  normalizeBirthYearForStats,
  normalizeLocationForStats,
  normalizeMbti,
  rankByReceivedHearts,
} from './stats-ranking';
import { seoulDateKey } from './signal-match';
import { parseProfileInterests } from './interests';

const kstNow = new Date('2026-08-17T12:00:00+09:00');
const today = seoulDateKey(kstNow);
const todayIso = `${today}T03:00:00.000Z`;
const yesterdayIso = '2026-08-15T15:30:00.000Z';
const justBeforeKstMidnight = '2026-08-16T14:59:59.000Z';
const kstMidnight = '2026-08-16T15:00:00.000Z';

describe('isLikeOnSeoulDay', () => {
  it('keeps likes created today in KST', () => {
    expect(isLikeOnSeoulDay({ liked_id: 'a', created_at: todayIso }, kstNow)).toBe(true);
    expect(isLikeOnSeoulDay({ liked_id: 'a', created_at: kstMidnight }, kstNow)).toBe(true);
  });

  it('drops likes from the previous KST day, including just before midnight', () => {
    expect(isLikeOnSeoulDay({ liked_id: 'a', created_at: yesterdayIso }, kstNow)).toBe(false);
    expect(isLikeOnSeoulDay({ liked_id: 'a', created_at: justBeforeKstMidnight }, kstNow)).toBe(false);
  });

  it('treats missing created_at as today and rejects invalid dates', () => {
    expect(isLikeOnSeoulDay({ liked_id: 'a' }, kstNow)).toBe(true);
    expect(isLikeOnSeoulDay({ liked_id: 'a', created_at: 'not-a-date' }, kstNow)).toBe(false);
  });
});

describe('countTodayHeartStats', () => {
  it('counts only today KST hearts', () => {
    const stats = countTodayHeartStats([
      { liked_id: 'a', heart_type: 'red', status: 'pending', created_at: todayIso },
      { liked_id: 'b', heart_type: 'blue', status: 'accepted', created_at: todayIso },
      { liked_id: 'c', heart_type: 'green', status: 'accepted', created_at: yesterdayIso },
      { liked_id: 'd', heart_type: 'pink', status: 'rejected', created_at: todayIso },
    ], kstNow);
    expect(stats.totalHearts).toBe(3);
    expect(stats.heart).toEqual({ red: 1, blue: 1, pink: 1, green: 0 });
  });

  it('ignores unknown heart types so chart totals stay at 100%', () => {
    const stats = countTodayHeartStats([
      { liked_id: 'a', heart_type: 'romantic', status: 'pending', created_at: todayIso },
      { liked_id: 'b', heart_type: 'red', status: 'pending', created_at: todayIso },
    ], kstNow);
    expect(stats.totalHearts).toBe(1);
    expect(stats.heart.red).toBe(1);
  });

  it('returns zeros when empty (no division-by-zero in callers)', () => {
    expect(countTodayHeartStats([], kstNow)).toEqual({
      heart: { red: 0, blue: 0, pink: 0, green: 0 },
      totalHearts: 0,
    });
  });
});

describe('countTodayContactExchanges', () => {
  it('counts only today KST contact shares', () => {
    expect(countTodayContactExchanges([
      { created_at: todayIso },
      { created_at: yesterdayIso },
      { created_at: todayIso },
    ], kstNow)).toBe(2);
  });

  it('returns zero when empty', () => {
    expect(countTodayContactExchanges([], kstNow)).toBe(0);
  });
});

describe('rankByReceivedHearts', () => {
  it('ranks by received count and fills TOP 10 after skipping unknown profiles', () => {
    const likes = [
      { liked_id: 'gone', heart_type: 'red', created_at: todayIso },
      { liked_id: 'gone', heart_type: 'blue', created_at: todayIso },
      { liked_id: 'alice', heart_type: 'red', created_at: todayIso },
      { liked_id: 'bob', heart_type: 'green', created_at: yesterdayIso },
    ];
    const ranked = rankByReceivedHearts(likes, { knownIds: new Set(['alice', 'bob']), limit: 10 });
    expect(ranked.map((r) => r.id)).toEqual(['alice', 'bob']);
    expect(ranked[0].total).toBe(1);
    expect(ranked.find((r) => r.id === 'gone')).toBeUndefined();
  });

  it('gives tied totals the same rank (1,1,3)', () => {
    const ranked = rankByReceivedHearts([
      { liked_id: 'a', heart_type: 'red' },
      { liked_id: 'b', heart_type: 'blue' },
      { liked_id: 'c', heart_type: 'green' },
      { liked_id: 'c', heart_type: 'pink' },
    ], { knownIds: new Set(['a', 'b', 'c']) });
    expect(ranked.find((r) => r.id === 'c')?.rank).toBe(1);
    expect(ranked.find((r) => r.id === 'a')?.rank).toBe(2);
    expect(ranked.find((r) => r.id === 'b')?.rank).toBe(2);
  });

  it('includes self if they received hearts (public ranking)', () => {
    const ranked = rankByReceivedHearts(
      [{ liked_id: 'me', heart_type: 'pink', created_at: todayIso }],
      { knownIds: new Set(['me']) },
    );
    expect(ranked[0]?.id).toBe('me');
    expect(ranked[0]?.hearts.pink).toBe(1);
  });
});

describe('extractCityLevel', () => {
  it('keeps metro cities and 기타 as a single token', () => {
    expect(extractCityLevel('부산')).toBe('부산');
    expect(extractCityLevel('서울')).toBe('서울');
    expect(extractCityLevel('제주')).toBe('제주');
    expect(extractCityLevel('해외')).toBe('해외');
    expect(extractCityLevel('  ')).toBe('');
  });

  it('keeps 도 + 도시 from signup format (경기 수원), not province-only', () => {
    expect(extractCityLevel('경기 수원')).toBe('경기 수원');
    expect(extractCityLevel('전남 여수')).toBe('전남 여수');
    expect(extractCityLevel('강원 춘천')).toBe('강원 춘천');
  });

  it('does not split 구 off 광역시/특별시, but keeps 도+시', () => {
    expect(extractCityLevel('서울특별시 강남구')).toBe('서울특별시');
    expect(extractCityLevel('인천광역시 연수구')).toBe('인천광역시');
    expect(extractCityLevel('강원특별자치도 춘천시')).toBe('강원특별자치도 춘천시');
    expect(extractCityLevel('경기도 성남시 분당구')).toBe('경기도 성남시');
  });
});

describe('canonicalInterestTags / MBTI / age', () => {
  it('drops bio prose and maps old BIO_LIST names', () => {
    expect(canonicalInterestTags(['운동', '안녕하세요', '영화', '패션'])).toEqual(['운동', '영화/드라마']);
  });

  it('normalizes MBTI and rejects junk', () => {
    expect(normalizeMbti(' enfp ')).toBe('ENFP');
    expect(normalizeMbti('XXX')).toBeNull();
    expect(normalizeMbti('')).toBeNull();
  });

  it('bands Korean age with KST year', () => {
    expect(ageBand(1995, kstNow)).toBe('30대'); // 2026-1995+1=32
    expect(ageBand(1997, kstNow)).toBe('30대'); // 30세
    expect(ageBand(1998, kstNow)).toBe('20대'); // 29세
    expect(ageBand(2008, kstNow)).toBe('10대');
    expect(ageBand(null, kstNow)).toBeNull();
  });
});

describe('normalizeBirthYearForStats / location', () => {
  it('coerces string birth years and rejects junk', () => {
    expect(normalizeBirthYearForStats('1995')).toBe(1995);
    expect(normalizeBirthYearForStats(' 2001 ')).toBe(2001);
    expect(normalizeBirthYearForStats('')).toBeNull();
    expect(normalizeBirthYearForStats(null)).toBeNull();
    expect(normalizeBirthYearForStats('abc')).toBeNull();
    expect(normalizeBirthYearForStats(1800)).toBeNull();
  });

  it('trims location and drops non-strings', () => {
    expect(normalizeLocationForStats('  부산  ')).toBe('부산');
    expect(normalizeLocationForStats('')).toBe('');
    expect(normalizeLocationForStats(null)).toBe('');
    expect(normalizeLocationForStats(42)).toBe('');
  });
});

describe('collectProfileBreakdowns', () => {
  it('counts age/location from string birth_year and trimmed location', () => {
    const rows = collectProfileBreakdowns([
      { location: '  경기 수원 ', birth_year: '1995', mbti: 'ENFP', personality_score: 50 },
      { location: '부산', birth_year: 2001, mbti: 'ISTJ', personality_score: 20 },
    ], parseProfileInterests, kstNow);
    expect(rows.location.map(([k]) => k).sort()).toEqual(['경기 수원', '부산']);
    expect(rows.age.map(([k, c]) => [k, c])).toEqual([['20대', 1], ['30대', 1]]);
  });

  it('does not lump 경기 cities and ignores malformed interests', () => {
    const rows = collectProfileBreakdowns([
      { mbti: 'enfp', personality_score: 80, interests: '운동, 안녕하세요', location: '경기 수원', birth_year: 1995 },
      { mbti: 'ENFP', personality_score: 80, interests: '카페', location: '경기 성남', birth_year: 1998 },
      { mbti: 'ISTJ', personality_score: 20, interests: '영화', location: '부산', birth_year: 1990 },
    ], parseProfileInterests, kstNow);
    expect(rows.location.map(([k]) => k).sort()).toEqual(['경기 성남', '경기 수원', '부산']);
    expect(rows.mbti).toEqual([['ENFP', 2], ['ISTJ', 1]]);
    expect(rows.interest.find(([k]) => k === '안녕하세요')).toBeUndefined();
    expect(rows.interest.find(([k]) => k === '영화/드라마')?.[1]).toBe(1);
    expect(rows.age.map(([k]) => k)).toEqual(['20대', '30대']);
  });
});
