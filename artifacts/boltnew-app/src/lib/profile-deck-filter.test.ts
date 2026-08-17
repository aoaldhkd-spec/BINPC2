import { describe, expect, it } from 'vitest';
import type { Profile } from '../types/app';
import { filterProfilesForDeck } from './profile-deck-filter';

const profile = (id: string, nickname: string, score: number, mbti: string): Profile => ({
  id,
  nickname,
  personality_score: score,
  mbti,
} as Profile);

const profiles = [
  profile('other-bottom', '바다', 20, 'INFP'),
  profile('me', '나', 50, 'ENTJ'),
  profile('other-top', '산', 80, 'ENTJ'),
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
});
