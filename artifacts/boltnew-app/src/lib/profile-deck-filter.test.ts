import { describe, expect, it } from 'vitest';
import type { Profile } from '../types/app';
import { seoulCalendarYear } from './korean-age';
import { filterProfilesForDeck } from './profile-deck-filter';

const refYear = seoulCalendarYear();
const birthYearForAge = (age: number) => refYear - age + 1;

const profile = (id: string, nickname: string, score: number, mbti: string, birth_year?: number | null): Profile => ({
  id,
  nickname,
  personality_score: score,
  mbti,
  birth_year: birth_year ?? null,
} as Profile);

const profiles = [
  profile('other-bottom', '바다', 20, 'INFP', birthYearForAge(29)),
  profile('me', '나', 50, 'ENTJ', 1995),
  profile('other-top', '산', 80, 'ENTJ', 1992),
];

describe('profile deck filtering', () => {
  it('filters privacy, search, personality, and MBTI without mutating input order', () => {
    const originalOrder = profiles.map(item => item.id);
    const result = filterProfilesForDeck(profiles, {
      currentUserId: 'me',
      search: 'ENTJ',
      personality: '탑계열',
      mbti: 'ENTJ',
      blockedUserIds: new Set(),
      hiddenByIds: new Set(),
    });

    expect(result.map(item => item.id)).toEqual(['other-top']);
    expect(profiles.map(item => item.id)).toEqual(originalOrder);
  });

  it('puts the current user first and excludes blocked or hidden profiles', () => {
    const result = filterProfilesForDeck(profiles, {
      currentUserId: 'me',
      search: '',
      personality: null,
      mbti: null,
      blockedUserIds: new Set(['other-top']),
      hiddenByIds: new Set(['other-bottom']),
    });

    expect(result.map(item => item.id)).toEqual(['me']);
  });

  it('filters by Korean age and birth year shorthand', () => {
    const byAge = filterProfilesForDeck(profiles, {
      currentUserId: 'me',
      search: '29',
      personality: null,
      mbti: null,
      blockedUserIds: new Set(),
      hiddenByIds: new Set(),
    });
    expect(byAge.map(item => item.id)).toEqual(['other-bottom']);

    const byYear = filterProfilesForDeck(profiles, {
      currentUserId: 'me',
      search: '95',
      personality: null,
      mbti: null,
      blockedUserIds: new Set(),
      hiddenByIds: new Set(),
    });
    expect(byYear.map(item => item.id)).toEqual(['me']);
  });
});
