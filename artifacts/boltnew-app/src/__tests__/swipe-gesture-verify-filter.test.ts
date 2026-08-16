import { describe, expect, it } from 'vitest';
import {
  excludeSwipeGestureVerifyProfiles,
  isExactSwipeGestureVerifyFixture,
  isSwipeGestureVerifyProfile,
  SWIPE_GESTURE_VERIFY_MARKER,
} from '../lib/profile';

describe('swipe-gesture-verify deck filter', () => {
  it('detects leftover Playwright fixtures by bio / interests / nickname / display name', () => {
    expect(isSwipeGestureVerifyProfile({ bio: SWIPE_GESTURE_VERIFY_MARKER })).toBe(true);
    expect(isSwipeGestureVerifyProfile({ bio: `#${SWIPE_GESTURE_VERIFY_MARKER}` })).toBe(true);
    expect(isSwipeGestureVerifyProfile({ interests: `#${SWIPE_GESTURE_VERIFY_MARKER}` })).toBe(true);
    expect(isSwipeGestureVerifyProfile({ nickname: SWIPE_GESTURE_VERIFY_MARKER })).toBe(true);
    expect(isSwipeGestureVerifyProfile({ display_name: `#${SWIPE_GESTURE_VERIFY_MARKER}` })).toBe(true);
    expect(isSwipeGestureVerifyProfile({ nickname: '민수', bio: '카페' })).toBe(false);
  });

  it('treats only exact bio/nickname/interests as deletable fixtures', () => {
    expect(isExactSwipeGestureVerifyFixture({ bio: SWIPE_GESTURE_VERIFY_MARKER })).toBe(true);
    expect(isExactSwipeGestureVerifyFixture({ bio: `#${SWIPE_GESTURE_VERIFY_MARKER}` })).toBe(true);
    expect(isExactSwipeGestureVerifyFixture({ nickname: SWIPE_GESTURE_VERIFY_MARKER })).toBe(true);
    expect(isExactSwipeGestureVerifyFixture({ bio: `hello ${SWIPE_GESTURE_VERIFY_MARKER}` })).toBe(false);
    expect(isExactSwipeGestureVerifyFixture({ nickname: '민수', bio: '카페' })).toBe(false);
  });

  it('drops fixtures from the live list but keeps the current smoke-test user', () => {
    const keep = { id: 'me', nickname: 'sg_a_me', bio: SWIPE_GESTURE_VERIFY_MARKER };
    const other = { id: 'other', nickname: 'sg_b_xx', bio: SWIPE_GESTURE_VERIFY_MARKER };
    const hashed = { id: 'hash', nickname: 'sg_c_xx', bio: `#${SWIPE_GESTURE_VERIFY_MARKER}` };
    const real = { id: 'real', nickname: '민수', bio: '카페' };
    expect(excludeSwipeGestureVerifyProfiles([keep, other, hashed, real], 'me').map((p) => p.id))
      .toEqual(['me', 'real']);
  });
});
