import { describe, expect, it } from 'vitest';
import {
  ageBandFromBirthYear,
  capAgeBandForEvent,
  formatKoreanAge,
  groupAgeDecadeBand,
  isAdultBirthYear,
  koreanAgeFromBirthYear,
  maxAdultBirthYear,
  minBirthYearForEventMaxAge,
  seoulCalendarYear,
} from './korean-age';

const kst2026 = new Date('2026-08-17T12:00:00+09:00');

describe('korean age (연도 차 + 1)', () => {
  it('uses KST calendar year as reference', () => {
    expect(seoulCalendarYear(kst2026)).toBe(2026);
  });

  it('97년생 → 30세, 98년생 → 29세 (2026 기준)', () => {
    expect(koreanAgeFromBirthYear(1997, kst2026)).toBe(30);
    expect(koreanAgeFromBirthYear(1998, kst2026)).toBe(29);
    expect(formatKoreanAge(1997)).toMatch(/^\d+세$/);
    expect(formatKoreanAge(1997)).toBe(`${koreanAgeFromBirthYear(1997)}세`);
  });

  it('decade boundaries for group chat (20·30대 only)', () => {
    expect(groupAgeDecadeBand(1996, kst2026)).toBe('30대'); // 31세
    expect(groupAgeDecadeBand(1997, kst2026)).toBe('30대'); // 30세
    expect(groupAgeDecadeBand(1998, kst2026)).toBe('20대'); // 29세
    expect(groupAgeDecadeBand(2000, kst2026)).toBe('20대'); // 27세
    expect(groupAgeDecadeBand(2008, kst2026)).toBeNull(); // 19세
    expect(groupAgeDecadeBand(1980, kst2026)).toBe('30대'); // 47세 → 30대 cap
  });

  it('full decade bands for stats ranking (20·30대 only — 40+ → 30대)', () => {
    expect(ageBandFromBirthYear(1995, kst2026)).toBe('30대');
    expect(ageBandFromBirthYear(1998, kst2026)).toBe('20대');
    expect(ageBandFromBirthYear(1980, kst2026)).toBe('30대'); // 47세 → capped
    expect(ageBandFromBirthYear(2008, kst2026)).toBeNull();
    expect(ageBandFromBirthYear(null, kst2026)).toBeNull();
  });

  it('capAgeBandForEvent maps 40+ to 30대', () => {
    expect(capAgeBandForEvent('40대')).toBe('30대');
    expect(capAgeBandForEvent('50대')).toBe('30대');
    expect(capAgeBandForEvent('30대')).toBe('30대');
    expect(capAgeBandForEvent('20대')).toBe('20대');
    expect(capAgeBandForEvent('10대')).toBeNull();
  });

  it('minBirthYearForEventMaxAge caps picker at 39 Korean age', () => {
    expect(minBirthYearForEventMaxAge(kst2026)).toBe(1988); // 2026-39+1
  });

  it('maxAdultBirthYear and isAdultBirthYear enforce 20+ Korean age', () => {
    expect(maxAdultBirthYear(kst2026)).toBe(2007);
    expect(isAdultBirthYear(2007, kst2026)).toBe(true);
    expect(isAdultBirthYear(2008, kst2026)).toBe(false);
  });

  it('rejects invalid birth years', () => {
    expect(koreanAgeFromBirthYear(null, kst2026)).toBeNull();
    expect(koreanAgeFromBirthYear(NaN, kst2026)).toBeNull();
    expect(groupAgeDecadeBand('기타', kst2026)).toBeNull();
    expect(formatKoreanAge(null)).toBe('나이 미입력');
  });
});
