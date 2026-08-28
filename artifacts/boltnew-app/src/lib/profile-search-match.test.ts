import { describe, expect, it } from 'vitest';
import type { Profile } from '../types/app';
import { matchesAgeOrBirthYear, profileMatchesSearch } from './profile-search-match';

const kst2026 = new Date('2026-08-17T12:00:00+09:00');

const profile = (overrides: Partial<Profile> & Pick<Profile, 'id' | 'nickname'>): Profile => ({
  personality_score: 50,
  mbti: 'INFP',
  birth_year: null,
  ...overrides,
} as Profile);

describe('matchesAgeOrBirthYear', () => {
  it('matches full birth year', () => {
    expect(matchesAgeOrBirthYear(1995, '1995', kst2026)).toBe(true);
    expect(matchesAgeOrBirthYear(1995, '1996', kst2026)).toBe(false);
  });

  it('matches 2-digit birth year shorthand (95 → 1995)', () => {
    expect(matchesAgeOrBirthYear(1995, '95', kst2026)).toBe(true);
    expect(matchesAgeOrBirthYear(1998, '95', kst2026)).toBe(false);
  });

  it('matches Korean age (29 → 1998년생 29세)', () => {
    expect(matchesAgeOrBirthYear(1998, '29', kst2026)).toBe(true);
    expect(matchesAgeOrBirthYear(1998, '29세', kst2026)).toBe(true);
    expect(matchesAgeOrBirthYear(1995, '29', kst2026)).toBe(false);
  });

  it('matches 3-digit birth year prefix', () => {
    expect(matchesAgeOrBirthYear(1995, '199', kst2026)).toBe(true);
    expect(matchesAgeOrBirthYear(2001, '199', kst2026)).toBe(false);
  });

  it('matches age prefix for single digit', () => {
    expect(matchesAgeOrBirthYear(1998, '2', kst2026)).toBe(true);
    expect(matchesAgeOrBirthYear(1995, '3', kst2026)).toBe(true);
  });

  it('ignores non-numeric queries', () => {
    expect(matchesAgeOrBirthYear(1995, '바다', kst2026)).toBe(false);
    expect(matchesAgeOrBirthYear(null, '29', kst2026)).toBe(false);
  });
});

describe('profileMatchesSearch', () => {
  const p = profile({ id: 'a', nickname: '바다', birth_year: 1998, mbti: 'INFP', personality_score: 20 });

  it('still matches nickname, MBTI, and position', () => {
    expect(profileMatchesSearch(p, '바다', kst2026)).toBe(true);
    expect(profileMatchesSearch(p, 'INFP', kst2026)).toBe(true);
    expect(profileMatchesSearch(p, '바텀', kst2026)).toBe(true);
  });

  it('matches by age and birth year', () => {
    expect(profileMatchesSearch(p, '29', kst2026)).toBe(true);
    expect(profileMatchesSearch(p, '98', kst2026)).toBe(true);
    expect(profileMatchesSearch(p, '1998', kst2026)).toBe(true);
  });
});
