import { describe, expect, it } from 'vitest';
import type { Profile } from '../types/app';
import {
  planSessionInitAfterProfiles,
  planSessionInitMissingRetry,
  shouldForceMainOnExistingComplete,
  shouldForceMainOnMissingRetry,
  shouldProcessPendingShare,
  shouldRefreshMissingPin,
} from './session-init';

function profile(partial: Partial<Profile> & { id: string }): Profile {
  return {
    nickname: '닉',
    pin_code: '1234',
    ...partial,
  } as Profile;
}

describe('session-init planners', () => {
  it('planSessionInitAfterProfiles covers empty / new-reg / missing / existing', () => {
    expect(planSessionInitAfterProfiles({
      allProfiles: [],
      currentUserId: 'u1',
      isNewRegistration: false,
    }).kind).toBe('empty');

    expect(planSessionInitAfterProfiles({
      allProfiles: [profile({ id: 'u1' })],
      currentUserId: 'u1',
      isNewRegistration: true,
    }).kind).toBe('new-reg-complete');

    expect(planSessionInitAfterProfiles({
      allProfiles: [profile({ id: 'u1', pin_code: '' })],
      currentUserId: 'u1',
      isNewRegistration: true,
    }).kind).toBe('new-reg-incomplete');

    expect(planSessionInitAfterProfiles({
      allProfiles: [profile({ id: 'other' })],
      currentUserId: 'u1',
      isNewRegistration: false,
    }).kind).toBe('missing');

    const complete = planSessionInitAfterProfiles({
      allProfiles: [profile({ id: 'u1' })],
      currentUserId: 'u1',
      isNewRegistration: false,
    });
    expect(complete.kind).toBe('existing-complete');

    const incomplete = planSessionInitAfterProfiles({
      allProfiles: [profile({ id: 'u1', nickname: '' })],
      currentUserId: 'u1',
      isNewRegistration: false,
    });
    expect(incomplete.kind).toBe('existing-incomplete');
  });

  it('view force-main gates match prior App effect', () => {
    expect(shouldForceMainOnExistingComplete('main')).toBe(true);
    expect(shouldForceMainOnExistingComplete('loading-main')).toBe(false);
    expect(shouldForceMainOnExistingComplete('chat')).toBe(false);
    expect(shouldForceMainOnMissingRetry('loading-main')).toBe(true);
    expect(shouldForceMainOnMissingRetry('chat')).toBe(false);
  });

  it('planSessionInitMissingRetry enter / recover / noop', () => {
    expect(planSessionInitMissingRetry({
      retryProfiles: [profile({ id: 'u1' })],
      me: profile({ id: 'u1' }),
    }).kind).toBe('enter-main');

    expect(planSessionInitMissingRetry({
      retryProfiles: [profile({ id: 'other' })],
      me: undefined,
    }).kind).toBe('recover-cleared');

    expect(planSessionInitMissingRetry({
      retryProfiles: [],
      me: undefined,
    }).kind).toBe('noop');
  });

  it('pin refresh + pending share gates', () => {
    expect(shouldRefreshMissingPin(profile({ id: 'u1', pin_code: '' }))).toBe(true);
    expect(shouldRefreshMissingPin(profile({ id: 'u1' }))).toBe(false);
    expect(shouldProcessPendingShare('share1', 'u1')).toBe(true);
    expect(shouldProcessPendingShare('u1', 'u1')).toBe(false);
    expect(shouldProcessPendingShare(null, 'u1')).toBe(false);
  });
});
