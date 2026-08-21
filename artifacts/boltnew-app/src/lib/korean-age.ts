/** 성인 전용 앱 — 한국식 나이(연도 차 + 1) 최소 20세 */
export const MIN_ADULT_KOREAN_AGE = 20;

/** 행사 통계·더미·가입 피커 — 한국식 나이 상한 (40+는 30대 버킷) */
export const MAX_EVENT_KOREAN_AGE = 39;

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

export function formatKoreanAge(birthYear: number | null): string {
  if (!birthYear) return '나이 미입력';
  const age = koreanAgeFromBirthYear(birthYear);
  if (age == null) return '나이 미입력';
  return `${age}세`;
}

/** 가입·더미 허용 최대 출생연도 (한국식 나이 MIN_ADULT_KOREAN_AGE 이상) */
export function maxAdultBirthYear(now: Date = new Date()): number {
  return seoulCalendarYear(now) - MIN_ADULT_KOREAN_AGE + 1;
}

/** 행사용 최소 출생연도 — 한국식 나이 MAX_EVENT_KOREAN_AGE(39세) 이하만 */
export function minBirthYearForEventMaxAge(now: Date = new Date()): number {
  return seoulCalendarYear(now) - MAX_EVENT_KOREAN_AGE + 1;
}

export function isAdultBirthYear(birthYear: unknown, now: Date = new Date()): boolean {
  const age = koreanAgeFromBirthYear(Number(birthYear), now);
  return age != null && age >= MIN_ADULT_KOREAN_AGE;
}

/** 40대·50대… → 30대 (행사 통계·단톡 공통) */
export function capAgeBandForEvent(band: string | null | undefined): string | null {
  if (!band) return null;
  const m = /^(\d+)대$/.exec(String(band).trim());
  if (!m) return null;
  const decade = parseInt(m[1], 10);
  if (decade < MIN_ADULT_KOREAN_AGE) return null;
  if (decade >= 40) return '30대';
  return `${decade}대`;
}

/** 통계·랭킹용 N대 — 20·30대만, 40+ → 30대, 미성년 null */
export function ageBandFromKoreanAge(age: number): string | null {
  if (age < MIN_ADULT_KOREAN_AGE || age > 120) return null;
  if (age < 30) return '20대';
  return '30대';
}

export function ageBandFromBirthYear(
  birthYear: number | null | undefined,
  now: Date = new Date(),
): string | null {
  const age = koreanAgeFromBirthYear(birthYear, now);
  if (age == null) return null;
  return ageBandFromKoreanAge(age);
}

/** 단톡 catalog: 20·30대만, 40+ → 30대, 미성년 null */
export function groupAgeDecadeBand(
  birthYear: unknown,
  now: Date = new Date(),
): string | null {
  const age = koreanAgeFromBirthYear(Number(birthYear), now);
  if (age == null || age < 20) return null;
  if (age < 30) return '20대';
  return '30대';
}
