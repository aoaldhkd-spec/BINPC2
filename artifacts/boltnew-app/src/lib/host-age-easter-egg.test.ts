import { describe, expect, it } from 'vitest';
import { hostBirthYearFromProfiles } from './host-age-easter-egg';

describe('hostBirthYearFromProfiles', () => {
  it('returns 범일NPC birth_year, not a participant profile', () => {
    const profiles = [
      { nickname: '손님A', birth_year: 1998 },
      { nickname: '범일NPC', birth_year: 1997 },
    ];
    expect(hostBirthYearFromProfiles(profiles)).toBe(1997);
  });

  it('returns null when host profile is missing', () => {
    expect(hostBirthYearFromProfiles([{ nickname: '손님A', birth_year: 1998 }])).toBeNull();
  });
});
