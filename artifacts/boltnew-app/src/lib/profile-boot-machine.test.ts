import { describe, it, expect } from 'vitest';
import {
  planProfileBootCacheHit,
  planProfileBootFetchResult,
  profileBootRetryDelayMs,
  PROFILE_BOOT_MAX_ATTEMPTS,
  PROFILE_BOOT_BASE_DELAY_MS,
} from './profile-boot-machine';
import type { Profile } from '../types/app';

function profile(partial: Partial<Profile> & { id: string }): Profile {
  return {
    nickname: '',
    pin_code: '',
    ...partial,
  } as Profile;
}

describe('profileBootRetryDelayMs', () => {
  it('exponential with cap at 2^4', () => {
    expect(profileBootRetryDelayMs(1)).toBe(PROFILE_BOOT_BASE_DELAY_MS * 2);
    expect(profileBootRetryDelayMs(4)).toBe(PROFILE_BOOT_BASE_DELAY_MS * 16);
    expect(profileBootRetryDelayMs(7)).toBe(PROFILE_BOOT_BASE_DELAY_MS * 16);
  });
});

describe('planProfileBootCacheHit', () => {
  it('enters main only for complete profile', () => {
    expect(planProfileBootCacheHit(undefined).kind).toBe('await-profile');
    expect(planProfileBootCacheHit(profile({ id: 'u1', nickname: 'a' })).kind).toBe('await-profile');
    expect(
      planProfileBootCacheHit(profile({ id: 'u1', nickname: '민수', pin_code: '1234' })).kind,
    ).toBe('enter-main');
  });
});

describe('planProfileBootFetchResult', () => {
  it('register when no uid', () => {
    expect(planProfileBootFetchResult({
      uid: null,
      me: undefined,
      allProfilesCount: 3,
      attempt: 1,
    })).toEqual({ kind: 'register' });
  });

  it('enter-main when complete', () => {
    expect(planProfileBootFetchResult({
      uid: 'u1',
      me: profile({ id: 'u1', nickname: '민수', pin_code: '99' }),
      allProfilesCount: 1,
      attempt: 1,
    }).kind).toBe('enter-main');
  });

  it('recover-cleared when others exist but me missing (wipe / device change)', () => {
    expect(planProfileBootFetchResult({
      uid: 'u1',
      me: undefined,
      allProfilesCount: 5,
      attempt: 2,
    })).toEqual({ kind: 'recover-cleared' });
  });

  it('keeps retrying on empty list (preserve 7d session storage)', () => {
    const mid = planProfileBootFetchResult({
      uid: 'u1',
      me: undefined,
      allProfilesCount: 0,
      attempt: 3,
    });
    expect(mid).toEqual({
      kind: 'continue-retry',
      delayMs: profileBootRetryDelayMs(3),
    });
  });

  it('recover-exhausted after max without clearing path', () => {
    expect(planProfileBootFetchResult({
      uid: 'u1',
      me: undefined,
      allProfilesCount: 0,
      attempt: PROFILE_BOOT_MAX_ATTEMPTS,
    })).toEqual({ kind: 'recover-exhausted' });
  });

  it('incomplete me retries instead of recover-cleared', () => {
    const d = planProfileBootFetchResult({
      uid: 'u1',
      me: profile({ id: 'u1', nickname: '민수', pin_code: '' }),
      allProfilesCount: 4,
      attempt: 1,
    });
    expect(d.kind).toBe('continue-retry');
  });
});
