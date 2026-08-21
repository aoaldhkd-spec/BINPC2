/** 성인 전용 앱 — 한국식 나이(연도 차 + 1) 최소 20세 */
export const MIN_ADULT_KOREAN_AGE = 20;

/** KST calendar year — 한국식 나이(연도 차 + 1)의 기준 연도 */
export function seoulCalendarYear(now: Date = new Date()): number {
  const y = Number(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }));
  return Number.isFinite(y) ? y : now.getFullYear();
}

/** 출생연도 → 한국식 나이(만 나이 아님: 기준연도 − 출생연도 + 1) */
export function koreanAgeFromBirthYear(
  birthYear: number | null | undefined,
  now: Date = new Date(),
): number | null {
  const y = Number(birthYear);
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null;
  const age = seoulCalendarYear(now) - y + 1;
  if (age < 0 || age > 120) return null;
  return age;
}

/** 가입·더미 허용 최대 출생연도 (한국식 나이 MIN_ADULT_KOREAN_AGE 이상) */
export function maxAdultBirthYear(now: Date = new Date()): number {
  return seoulCalendarYear(now) - MIN_ADULT_KOREAN_AGE + 1;
}

export function isAdultBirthYear(birthYear: unknown, now: Date = new Date()): boolean {
  const age = koreanAgeFromBirthYear(Number(birthYear), now);
  return age != null && age >= MIN_ADULT_KOREAN_AGE;
}

/** 단톡 auto-join: 20·30대만, 40+ → 30대, 미성년 null */
export function groupAgeDecadeBand(
  birthYear: unknown,
  now: Date = new Date(),
): string | null {
  const age = koreanAgeFromBirthYear(Number(birthYear), now);
  if (age == null || age < 20) return null;
  if (age < 30) return '20대';
  return '30대';
}
