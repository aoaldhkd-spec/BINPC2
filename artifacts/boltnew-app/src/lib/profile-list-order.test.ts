import { describe, expect, it } from 'vitest';
import type { Profile } from '../types/app';
import { filterProfilesForDeck } from './profile-deck-filter';
import {
  mergeProfilesPreserveOrder,
  patchProfileInPlace,
  profileRowEqual,
  sortProfilesStable,
} from './profile-list-order';

const p = (
  id: string,
  nickname: string,
  created_at: string,
  extra: Partial<Profile> = {},
): Profile => ({ id, nickname, created_at, ...extra } as Profile);

describe('profile list stable order', () => {
  it('sorts by created_at DESC then id, with self first', () => {
    const input = [
      p('b', '비', '2026-01-01T00:00:00.000Z'),
      p('me', '나', '2026-01-02T00:00:00.000Z'),
      p('a', '에이', '2026-01-03T00:00:00.000Z'),
      p('c', '씨', '2026-01-03T00:00:00.000Z'),
    ];
    expect(sortProfilesStable(input, 'me').map(x => x.id)).toEqual(['me', 'a', 'c', 'b']);
  });

  it('patchProfileInPlace does not reorder on profile field updates', () => {
    const prev = [
      p('a', '에이', '2026-01-03T00:00:00.000Z'),
      p('b', '비', '2026-01-02T00:00:00.000Z'),
      p('c', '씨', '2026-01-01T00:00:00.000Z'),
    ];
    const patched = patchProfileInPlace(prev, {
      ...prev[1],
      photo_url: 'https://example.com/new.jpg',
      nickname: '비2',
    });
    expect(patched.map(x => x.id)).toEqual(['a', 'b', 'c']);
    expect(patched[1].nickname).toBe('비2');
  });

  it('mergeProfilesPreserveOrder keeps relative order across reshuffled fetches', () => {
    const prev = [
      p('a', '에이', '2026-01-01T00:00:00.000Z'),
      p('b', '비', '2026-01-02T00:00:00.000Z'),
      p('c', '씨', '2026-01-03T00:00:00.000Z'),
    ];
    const fetched = [
      p('c', '씨', '2026-01-03T00:00:00.000Z', { mbti: 'ENTJ' }),
      p('a', '에이', '2026-01-01T00:00:00.000Z', { mbti: 'INFP' }),
      p('new', '뉴', '2026-01-04T00:00:00.000Z'),
      p('b', '비', '2026-01-02T00:00:00.000Z'),
    ];
    const merged = mergeProfilesPreserveOrder(prev, fetched);
    expect(merged.map(x => x.id)).toEqual(['new', 'a', 'b', 'c']);
    expect(merged.find(x => x.id === 'a')?.mbti).toBe('INFP');
  });

  it('mergeProfilesPreserveOrder keeps object refs when row unchanged', () => {
    const prev = [
      p('a', '에이', '2026-01-01T00:00:00.000Z', { mbti: 'INFP' }),
      p('b', '비', '2026-01-02T00:00:00.000Z'),
    ];
    const fetched = [
      p('a', '에이', '2026-01-01T00:00:00.000Z', { mbti: 'INFP' }),
      p('b', '비', '2026-01-02T00:00:00.000Z', { mbti: 'ENTJ' }),
    ];
    const merged = mergeProfilesPreserveOrder(prev, fetched);
    expect(merged[0]).toBe(prev[0]);
    expect(merged[1].mbti).toBe('ENTJ');
    expect(merged[1]).not.toBe(prev[1]);
  });

  it('profileRowEqual compares all row fields', () => {
    const one = p('a', '에이', '2026-01-01T00:00:00.000Z', { mbti: 'INFP' });
    const same = { ...one };
    const diff = { ...one, mbti: 'ENTJ' };
    expect(profileRowEqual(one, same)).toBe(true);
    expect(profileRowEqual(one, diff)).toBe(false);
  });

  it('filterProfilesForDeck order is invariant to input shuffle', () => {
    const base = [
      p('z', '제트', '2026-01-01T00:00:00.000Z', { personality_score: 80, mbti: 'ENTJ' }),
      p('me', '나', '2026-01-02T00:00:00.000Z', { personality_score: 50, mbti: 'ENTJ' }),
      p('a', '에이', '2026-01-03T00:00:00.000Z', { personality_score: 80, mbti: 'ENTJ' }),
    ];
    const filters = {
      currentUserId: 'me' as string | null,
      search: '',
      personality: null as string | null,
      mbti: null as string | null,
      blockedUserIds: new Set<string>(),
      hiddenByIds: new Set<string>(),
    };
    const forward = filterProfilesForDeck(base, filters).map(x => x.id);
    const reverse = filterProfilesForDeck([...base].reverse(), filters).map(x => x.id);
    expect(forward).toEqual(['me', 'a', 'z']);
    expect(reverse).toEqual(forward);
  });
});