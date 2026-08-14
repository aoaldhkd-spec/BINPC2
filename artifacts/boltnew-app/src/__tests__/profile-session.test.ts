import { describe, it, expect } from 'vitest';
import { isCompleteProfile, findProfileById } from '../lib/profile-session';
import type { Profile } from '../types/app';

const sample = (over: Partial<Profile> = {}): Profile => ({
  id: 'u1',
  nickname: '민수',
  pin_code: '1234',
  bio: '',
  photo_url: null,
  personality_score: 50,
  dom_sub_score: null,
  mbti: null,
  birth_year: 1995,
  birth_month: 1,
  birth_day: 1,
  location: '',
  interests: '',
  contact_private: false,
  kakao_id: null,
  instagram_id: null,
  phone_number: null,
  ...over,
});

describe('profile-session', () => {
  it('isCompleteProfile: 닉네임+pin_code 필요', () => {
    expect(isCompleteProfile(sample())).toBe(true);
    expect(isCompleteProfile(sample({ pin_code: null }))).toBe(false);
    expect(isCompleteProfile(sample({ nickname: '' }))).toBe(false);
    expect(isCompleteProfile(undefined)).toBe(false);
  });

  it('findProfileById', () => {
    const list = [sample(), sample({ id: 'u2', nickname: '지훈' })];
    expect(findProfileById(list, 'u2')?.nickname).toBe('지훈');
    expect(findProfileById(list, null)).toBeUndefined();
  });
});
