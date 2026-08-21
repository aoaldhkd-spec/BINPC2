import { describe, expect, it } from 'vitest';
import { getCompatibility, getZodiac, zodiacBaseScore } from './fortune';

describe('getZodiac', () => {
  it('maps birth year to 12지 animal', () => {
    expect(getZodiac(1996).name).toBe('쥐');
    expect(getZodiac(1990).name).toBe('말');
    expect(getZodiac(2000).name).toBe('용');
  });
});

describe('zodiacBaseScore', () => {
  it('scores 삼합 (최고) for compatible zodiac triplets', () => {
    // 쥐(1996) + 용(2000) — SAMHAP group [4, 8, 0]
    const { score, rel } = zodiacBaseScore(1996, 2000);
    expect(score).toBe(92);
    expect(rel).toContain('삼합');
  });

  it('scores 상충 (충돌) for opposing zodiac pairs', () => {
    // 쥐(1996) + 말(1990) — SANGCHUNG pair [4, 10]
    const { score, rel } = zodiacBaseScore(1996, 1990);
    expect(score).toBe(32);
    expect(rel).toContain('상충');
  });

  it('scores 동갑 for same zodiac year', () => {
    const { score, rel } = zodiacBaseScore(1996, 2008);
    expect(score).toBe(72);
    expect(rel).toContain('동갑');
  });
});

describe('getCompatibility', () => {
  it('returns structured compat result for full birth dates', () => {
    const result = getCompatibility(1996, 3, 15, 2000, 7, 20);
    expect(result.score).toBeGreaterThanOrEqual(10);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.grade).toMatch(/^[SABCD]$/);
    expect(result.relation).toBeTruthy();
    expect(result.summary).toBeTruthy();
    expect(result.advice).toBeTruthy();
  });

  it('reflects 삼합 base score in final compat', () => {
    const result = getCompatibility(1996, 1, 1, 2000, 1, 1);
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.relation).toContain('삼합');
  });
});
