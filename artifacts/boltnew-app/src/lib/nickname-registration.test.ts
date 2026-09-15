import { describe, expect, it } from 'vitest';
import {
  buildRegistrationProfileInsert,
  buildRegistrationSignalRow,
  mapRegistrationErrorMessage,
} from './nickname-registration';

describe('nickname-registration planners', () => {
  const base = {
    birthYear: 1995,
    birthMonth: 3,
    birthDay: 12,
    location: '서울',
    mbti: 'INFP',
    interests: ['음악', '영화'],
    personalityScore: 50,
    nickname: '테스트',
    kakaoId: 'k',
    instagramId: '',
    phoneNumber: '010',
    contactPrivate: true,
    idealMsg: '이상형',
    featureMsg: null as string | null,
  };

  it('buildRegistrationProfileInsert stamps id/secret and joins interests', () => {
    const row = buildRegistrationProfileInsert('pid', 'sec', base);
    expect(row.id).toBe('pid');
    expect(row._device_secret).toBe('sec');
    expect(row.nickname).toBe('테스트');
    expect(row.bio).toBe('음악, 영화');
    expect(row.interests).toBe('음악, 영화');
    expect(row.instagram_id).toBeNull();
    expect(row.kakao_id).toBe('k');
  });

  it('mapRegistrationErrorMessage covers nick collision and pin pool', () => {
    expect(mapRegistrationErrorMessage('23505', 'x')).toContain('닉네임');
    expect(mapRegistrationErrorMessage('PIN_EXHAUSTED', 'x')).toContain('정원');
    expect(mapRegistrationErrorMessage('OTHER', 'boom')).toContain('boom');
    expect(mapRegistrationErrorMessage(undefined, undefined)).toContain('잠시 후');
  });

  it('buildRegistrationSignalRow skips when both msgs empty', () => {
    expect(buildRegistrationSignalRow('u', null, null)).toBeNull();
    const row = buildRegistrationSignalRow('u', '이상형', null, '2026-01-01T00:00:00.000Z', 'sid');
    expect(row).toEqual({
      id: 'sid',
      user_id: 'u',
      status_msg: null,
      ideal_msg: '이상형',
      feature_msg: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });
});
