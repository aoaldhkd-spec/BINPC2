import { describe, it, expect } from 'vitest';
import { hasProfileFortuneCompatData } from './profile';

describe('hasProfileFortuneCompatData', () => {
  it('accepts birth year alone (12지신·오행)', () => {
    expect(hasProfileFortuneCompatData({ birth_year: 1998, birth_month: null, birth_day: null })).toBe(true);
  });

  it('accepts full birthday', () => {
    expect(hasProfileFortuneCompatData({ birth_year: 1998, birth_month: 3, birth_day: 15 })).toBe(true);
  });

  it('accepts MBTI without birth year', () => {
    expect(hasProfileFortuneCompatData({ birth_year: null, mbti: 'ENFP' })).toBe(true);
  });

  it('rejects empty profile', () => {
    expect(hasProfileFortuneCompatData(null)).toBe(false);
    expect(hasProfileFortuneCompatData({ birth_year: null, mbti: null })).toBe(false);
    expect(hasProfileFortuneCompatData({ birth_year: 0 })).toBe(false);
  });
});
