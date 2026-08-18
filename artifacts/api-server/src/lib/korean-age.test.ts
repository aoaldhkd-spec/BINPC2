import { describe, expect, it } from 'vitest';
import { groupAgeDecadeBand, koreanAgeFromBirthYear } from '../lib/korean-age.js';

const kst2026 = new Date('2026-08-17T12:00:00+09:00');

describe('korean-age (server)', () => {
  it('97년생 → 30세, 98년생 → 29세; group bands match client', () => {
    expect(koreanAgeFromBirthYear(1997, kst2026)).toBe(30);
    expect(koreanAgeFromBirthYear(1998, kst2026)).toBe(29);
    expect(groupAgeDecadeBand(1997, kst2026)).toBe('30대');
    expect(groupAgeDecadeBand(1998, kst2026)).toBe('20대');
  });
});
