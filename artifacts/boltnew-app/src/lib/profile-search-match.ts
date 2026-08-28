import type { Profile } from '../types/app';
import { koreanAgeFromBirthYear } from './korean-age';
import { getPositionLabel } from './profile';
import { koreanMatch } from './utils';

/** 검색어에서 숫자 부분 추출 — "29세", " 95 " 등 */
function normalizeNumericQuery(query: string): string | null {
  const trimmed = query.trim();
  const withoutSuffix = trimmed.replace(/세$/u, '').trim();
  if (!/^\d+$/.test(withoutSuffix)) return null;
  return withoutSuffix;
}

/**
 * 나이(한국식) 또는 출생연도 부분 일치.
 * - 4자리: 출생연도 정확히 (1995)
 * - 2자리: 년생 축약(95→1995) 또는 나이 정확히 (29→29세)
 * - 1~3자리(4자리 제외): 나이 정확·접두 일치 (2→29세 등)
 * - 3자리: 출생연도 접두 (199→1995)
 */
export function matchesAgeOrBirthYear(
  birthYear: number | null | undefined,
  query: string,
  now: Date = new Date(),
): boolean {
  const digits = normalizeNumericQuery(query);
  if (!digits) return false;

  const y = Number(birthYear);
  if (!Number.isFinite(y)) return false;

  const age = koreanAgeFromBirthYear(y, now);
  const yearStr = String(y);

  if (digits.length === 4) {
    return y === parseInt(digits, 10);
  }

  const n = parseInt(digits, 10);

  if (digits.length === 2) {
    if (y % 100 === n) return true;
    if (age != null && age === n) return true;
    return false;
  }

  if (digits.length === 3 && yearStr.startsWith(digits)) {
    return true;
  }

  if (age != null) {
    const ageStr = String(age);
    if (ageStr === digits) return true;
    if (digits.length < ageStr.length && ageStr.startsWith(digits)) return true;
  }

  return false;
}

export function profileMatchesSearch(
  profile: Profile,
  query: string,
  now: Date = new Date(),
): boolean {
  const q = query.trim();
  if (!q) return true;

  return (
    koreanMatch(profile.nickname, q)
    || Boolean(profile.mbti && koreanMatch(profile.mbti, q))
    || koreanMatch(getPositionLabel(profile.personality_score ?? 50), q)
    || matchesAgeOrBirthYear(profile.birth_year, q, now)
  );
}
